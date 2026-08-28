// tests/lp-carry.test.js
//
// The /lp "Get Tickets" button hands the visitor to /events, and it carries
// campaign attribution across that hop. It used to carry it by appending the
// ENTIRE inbound query string whenever that string contained `utm_` anywhere,
// which meant two passengers rode along:
//
//   fbclid   — unique per ad click, so the destination became a distinct URL
//              for every visitor. Measured over the 100 days to 2026-08-27:
//              1,521 of 1,533 paid landing-page rows carried it, 93.6% of them
//              with exactly one session.
//   eventId  — /lp's spelling of an id that /events already receives as
//              `event`, so the same id arrived twice under two names.
//
// This project has no shared bundle (the 12-function Vercel Hobby cap is why),
// so the logic lives inline in public/lp.html and cannot be imported. Rather
// than testing a copy of it — which would pass forever while the real page
// drifted — these tests EXTRACT the actual block from lp.html and evaluate it
// in a VM with `location` and `refOf` stubbed. What runs here is what ships.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const LP = path.join(process.cwd(), 'public', 'lp.html');
const src = fs.readFileSync(LP, 'utf8');

// Non-greedy to the first `})();` — the inner forEach closes with `});`, so the
// IIFE terminator is unambiguous.
const carrySrc = (src.match(/var carry = \(function \(\) \{[\s\S]*?\}\)\(\);/) || [])[0];

/** Run the real carry block with a stubbed URL and referral. */
function carryFor(search, refValue = null) {
  const context = {
    location: { search },
    refOf: () => refValue,
    URLSearchParams,
    encodeURIComponent,
  };
  vm.createContext(context);
  return vm.runInContext(`${carrySrc}\ncarry`, context);
}

/** The href the button actually gets, so duplication is testable end to end. */
const hrefFor = (search, ref) =>
  '/events?event=' + encodeURIComponent('EVT123') + '&checkout=1' + carryFor(search, ref);

const AD_URL =
  '?eventId=EVT123&utm_source=Instagram&utm_medium=paid_social'
  + '&utm_campaign=Augweek3_lancaster&utm_content=proof_rsa1'
  + '&fbclid=IwcGRvZgVleHRuA2FlbQEwAGFkaWQBqzeAHv18HnNydGMGYXBwX2lk';

describe('lp.html carry block', () => {
  it('was found in the source', () => {
    // A guard on the guard: if the regex stops matching, every test below runs
    // against `undefined` and the suite proves nothing.
    expect(carrySrc, 'could not extract the carry block from public/lp.html').toBeTruthy();
  });

  it('carries every utm_ parameter', () => {
    const out = carryFor(AD_URL);
    expect(out).toContain('utm_source=Instagram');
    expect(out).toContain('utm_medium=paid_social');
    expect(out).toContain('utm_campaign=Augweek3_lancaster');
    expect(out).toContain('utm_content=proof_rsa1');
  });

  it('drops fbclid — the whole point of this change', () => {
    expect(carryFor(AD_URL)).not.toContain('fbclid');
  });

  it('drops eventId, which /events receives as `event`', () => {
    expect(carryFor(AD_URL)).not.toContain('eventId');
  });

  it('never puts the event id on the URL twice', () => {
    const href = hrefFor(AD_URL);
    expect(href.match(/EVT123/g)).toHaveLength(1);
  });

  it('drops unknown passengers rather than allow-listing known ones', () => {
    // The failure mode was structural, not a missing fbclid rule: anything in
    // the inbound URL rode along. A future `gclid`/`ttclid`/`msclkid` must not
    // require another patch here.
    const out = carryFor('?utm_source=x&gclid=AAA&ttclid=BBB&msclkid=CCC&ai=1&ct=2');
    for (const junk of ['gclid', 'ttclid', 'msclkid', 'ai=', 'ct=']) {
      expect(out, `${junk} should not be carried`).not.toContain(junk);
    }
    expect(out).toContain('utm_source=x');
  });

  it('carries ref from the URL', () => {
    expect(carryFor('?utm_source=x&ref=abc123', 'abc123')).toContain('ref=abc123');
  });

  it('carries ref when it came from storage and the URL has no utm at all', () => {
    // The old version produced '' unless `utm_` appeared somewhere, then
    // appended ref separately. A stored referral with a bare URL must survive.
    expect(carryFor('', 'stored_ref')).toBe('&ref=stored_ref');
  });

  it('does not mistake a parameter ending in ref= for the referral', () => {
    // The old guard was `s.indexOf('ref=') === -1`, which matched `pref=` and
    // `xref=` and silently dropped a real referral.
    expect(carryFor('?utm_source=x&pref=nope', 'real_ref')).toContain('ref=real_ref');
  });

  it('returns empty when there is nothing to carry', () => {
    expect(carryFor('?eventId=EVT123&fbclid=zzz', null)).toBe('');
  });

  it('produces a well-formed query fragment', () => {
    const out = carryFor(AD_URL, 'r1');
    expect(out.startsWith('&')).toBe(true);
    expect(out).not.toContain('&&');
    expect(out).not.toContain('?');
  });

  it('percent-encodes values rather than passing them through raw', () => {
    const out = carryFor('?utm_campaign=' + encodeURIComponent('a b&c=d'));
    expect(out).toContain('utm_campaign=a%20b%26c%3Dd');
    // The stray & and = must not escape into the query structure.
    expect(out.split('&').filter(Boolean)).toHaveLength(1);
  });

  it('no longer concatenates location.search wholesale', () => {
    // Structural backstop: the behavioural tests above all pass if someone
    // reintroduces the old line behind a filter, but this is the shape that
    // caused the bug and it should not come back.
    expect(carrySrc).not.toMatch(/\+\s*qs\.replace/);
    expect(carrySrc).toContain("indexOf('utm_') === 0");
  });
});
