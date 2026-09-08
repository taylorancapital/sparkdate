// tests/ad-utm.test.js
//
// Covers scripts/ad-utm.js — the thing that builds an ad creative's url_tags
// before it is POSTed, rather than after.
//
// This is the gate. scripts/lint-ad-copy.js already raises `utm-content-shared`
// as an ERROR, but it reads LIVE ads and needs META_ADS_ACCESS_TOKEN, so it
// cannot run in CI and it only ever speaks once the creative exists. url_tags
// is settable only at creation (subcode 1815573), so by then the value is
// frozen and fixing it costs a new dark post. These cases run offline with no
// token, which is the whole point.
//
// Measured, not theorised: on 2026-09-02 `utm_content=proof_rsa1` was on
// THIRTEEN delivered ads holding $554.39 — 46% of everything the account had
// ever spent — and only 14% of lifetime spend carried a utm_content unique to
// one ad. reports/AD_ACCOUNT_AUDIT_2026-09-02.md.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { utmCampaign, utmContent, urlTags, assertCleanLink, assertUniqueContent } = require('../scripts/ad-utm.js');
const brand = require('../content/brand.json');

describe('it reproduces the tags the live Loxleys ads already carry', () => {
  // If any of these drift, the ads built next split from the two running now
  // in the one field meant to join them.
  it('builds the female prime tag exactly', () => {
    expect(urlTags({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'showup' }))
      .toBe('utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=LX_202609&utm_content=lx_prime_female_showup');
  });

  it('builds the male prime tag exactly', () => {
    expect(urlTags({ event: 'LX', phase: 'prime', adSet: 'male', creative: 'noplan' }))
      .toBe('utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=LX_202609&utm_content=lx_prime_male_noplan');
  });

  it('keeps the event key uppercase in the campaign and lowercase in the content', () => {
    expect(utmCampaign('LX')).toBe('LX_202609');
    expect(utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'showup' })).toMatch(/^lx_/);
  });

  it('derives the campaign month from the event date, not from today', () => {
    expect(utmCampaign('MC')).toBe('MC_202609'); // Marion Court, 2026-09-08
  });
});

describe('the retargeting segment collapses', () => {
  // brand.json's content_format says four segments, but two of its own
  // examples are three. For retargeting the phase and the audience are the
  // same fact, so it is written once as `rt`.
  it('reproduces the Marion Court retargeting tags', () => {
    expect(utmContent({ event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'quang' })).toBe('mc_rt_quang');
    expect(utmContent({ event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'scorecards' })).toBe('mc_rt_scorecards');
  });

  it('does not repeat the audience as a phase', () => {
    expect(utmContent({ event: 'MC', phase: 'close', adSet: 'retargeting', creative: 'quang' }))
      .not.toContain('retargeting');
  });

  it('ignores the phase for retargeting, so the same ad keeps its tag across phases', () => {
    const convert = utmContent({ event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'quang' });
    const close = utmContent({ event: 'MC', phase: 'close', adSet: 'retargeting', creative: 'quang' });
    expect(convert).toBe(close);
  });
});

describe('playbook_v2 tags by ROLE, and carry no phase', () => {
  // Under playbook_v2 the budget moves between Seed/Build/Close while the ad
  // stays put. A phase segment would split one creative's clicks across three
  // GA4 rows -- the exact loss utm_content exists to prevent.
  it('builds a cold tag as event_role_creative', () => {
    expect(utmContent({ event: 'TL2', role: 'cold', creative: 'helesha' })).toBe('tl2_cold_helesha');
  });

  it('collapses retargeting to rt, exactly as the legacy shape does', () => {
    expect(utmContent({ event: 'TL2', role: 'retargeting', creative: 'helesha' })).toBe('tl2_rt_helesha');
  });

  // The reason the two shapes can coexist: a v2 retargeting tag IS the legacy
  // retargeting tag. Nothing built under the new playbook splits from the ads
  // running now, in the one field meant to join them.
  it('produces a byte-identical tag to the legacy retargeting form for the same ad', () => {
    const v2 = utmContent({ event: 'MC', role: 'retargeting', creative: 'quang' });
    const legacy = utmContent({
      event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'quang',
    });
    expect(v2).toBe(legacy);
    expect(v2).toBe('mc_rt_quang');
  });

  it('ignores a phase entirely when a role is given, so the tag survives Seed -> Build -> Close', () => {
    const seed = utmContent({
      event: 'TL2', role: 'cold', creative: 'helesha', phase: 'seed',
    });
    const close = utmContent({
      event: 'TL2', role: 'cold', creative: 'helesha', phase: 'close',
    });
    expect(seed).toBe(close);
    expect(seed).not.toContain('seed');
  });

  it('builds the whole url_tags string for a v2 ad', () => {
    expect(urlTags({ event: 'MC', role: 'cold', creative: 'helesha' }))
      .toBe('utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=MC_202609&utm_content=mc_cold_helesha');
  });

  it('rejects a role playbook_v2 does not define, rather than inventing a campaign', () => {
    expect(() => utmContent({ event: 'TL2', role: 'female', creative: 'helesha' })).toThrow(/unknown role/);
    expect(() => utmContent({ event: 'TL2', role: 'warm', creative: 'helesha' })).toThrow(/unknown role/);
  });

  it('applies the same one-segment slug rule on the v2 path', () => {
    expect(() => utmContent({ event: 'TL2', role: 'cold', creative: 'wing_girl' })).toThrow(/one segment/);
    expect(() => utmContent({ event: 'TL2', role: 'cold', creative: 'WingGirl' })).toThrow();
    expect(() => utmContent({ event: 'TL2', role: 'cold', creative: '' })).toThrow();
  });

  it('takes its role vocabulary from brand.json, not from a literal here', () => {
    const roles = brand.paid_template.playbook_v2.roles.map((r) => r.key);
    expect(roles).toContain('cold');
    expect(roles).toContain('retargeting');
    for (const role of roles) {
      expect(() => utmContent({ event: 'TL2', role, creative: 'helesha' })).not.toThrow();
    }
  });

  // REGRESSION. brand.json's roles are DATA; ROLE_TAG is CODE. The first
  // version of the v2 path validated `role` against the data and then indexed
  // the map, so a role added to brand.json passed validation and tagged
  // nothing: join() rendered undefined as '' and the segment guard's regex
  // coerced it to the string "undefined", which matches. The result was
  // `tl2__helesha` -- an empty middle segment, no throw, in the one field that
  // is frozen at AdCreative creation and can never be corrected afterwards.
  it('throws when brand.json defines a role this module has no tag for', () => {
    const patched = JSON.parse(JSON.stringify(brand));
    patched.paid_template.playbook_v2.roles.push({ key: 'warm', name_suffix: 'Warm' });

    expect(() => utmContent({ event: 'TL2', role: 'warm', creative: 'helesha' }, patched))
      .toThrow(/has no tag segment/);
    // The error has to say what to actually do, or the next person adds the
    // role to brand.json again and gets the same silence.
    expect(() => utmContent({ event: 'TL2', role: 'warm', creative: 'helesha' }, patched))
      .toThrow(/ROLE_TAG/);
  });

  it('never emits an empty segment for such a role', () => {
    const patched = JSON.parse(JSON.stringify(brand));
    patched.paid_template.playbook_v2.roles.push({ key: 'warm', name_suffix: 'Warm' });

    let emitted = null;
    try { emitted = utmContent({ event: 'TL2', role: 'warm', creative: 'helesha' }, patched); } catch { /* expected */ }
    expect(emitted).toBeNull();
    expect(emitted).not.toBe('tl2__helesha');
  });

  it('does not let a patched brand leak into the real one', () => {
    // The suite requires content/brand.json once and shares the object; the two
    // cases above must not mutate it or every later assertion is against a
    // brand.json that does not exist on disk.
    expect(brand.paid_template.playbook_v2.roles.map((r) => r.key)).toEqual(['cold', 'retargeting']);
  });

  it('leaves the legacy path untouched when no role is passed', () => {
    expect(utmContent({
      event: 'LX', phase: 'prime', adSet: 'female', creative: 'showup',
    })).toBe('lx_prime_female_showup');
  });
});

describe('every documented example is buildable', () => {
  it('covers all four in brand.json', () => {
    const examples = brand.paid_template.caption_rules.utm._examples;
    expect(examples).toContain('lx_prime_female_showup');
    const built = [
      utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'showup' }),
      utmContent({ event: 'LX', phase: 'prime', adSet: 'male', creative: 'noplan' }),
      utmContent({ event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'quang' }),
      utmContent({ event: 'MC', phase: 'convert', adSet: 'retargeting', creative: 'scorecards' }),
    ];
    expect(built.sort()).toEqual([...examples].sort());
  });
});

describe('it refuses what GA4 cannot split', () => {
  it('rejects an unknown event rather than inventing a key', () => {
    expect(() => utmContent({ event: 'ZZ', phase: 'prime', adSet: 'female', creative: 'showup' }))
      .toThrow(/unknown event/);
  });

  it('rejects an unknown ad set', () => {
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'everyone', creative: 'showup' }))
      .toThrow(/unknown ad set/);
  });

  it('rejects a phase that carries no creative', () => {
    expect(() => utmContent({ event: 'LX', phase: 'build', adSet: 'female', creative: 'showup' }))
      .toThrow(/carries no creative/);
    expect(() => utmContent({ event: 'LX', phase: 'step', adSet: 'female', creative: 'showup' }))
      .toThrow(/carries no creative/);
  });

  it('rejects an underscore inside a creative slug, which would invent a field', () => {
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'show_up' }))
      .toThrow(/one segment/);
  });

  it('rejects uppercase and spaces in a creative slug', () => {
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'ShowUp' })).toThrow();
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'show up' })).toThrow();
  });

  it('rejects a missing creative slug — the ad-set-key-only shape that caused this', () => {
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'female', creative: '' })).toThrow();
    expect(() => utmContent({ event: 'LX', phase: 'prime', adSet: 'female' })).toThrow();
  });
});

describe('assertUniqueContent — the proof_rsa1 defect itself', () => {
  it('throws when two ads in one batch share a value', () => {
    expect(() => assertUniqueContent([
      { utm_content: 'lx_prime_female_showup' },
      { utm_content: 'lx_prime_female_showup' },
    ])).toThrow(/more than one ad/);
  });

  it('catches the historical shape: one value on many ads', () => {
    const thirteen = Array.from({ length: 13 }, () => 'proof_rsa1');
    expect(() => assertUniqueContent(thirteen)).toThrow(/proof_rsa1/);
  });

  it('passes a batch whose values differ', () => {
    expect(() => assertUniqueContent([
      { utm_content: 'lx_prime_female_showup' },
      { utm_content: 'lx_prime_male_noplan' },
    ])).not.toThrow();
  });
});

describe('assertCleanLink — the _never_both rule', () => {
  it('rejects a destination that already carries UTMs', () => {
    expect(() => assertCleanLink('https://sparkdate.date/lp?eventId=abc&utm_source=Facebook'))
      .toThrow(/never both/);
  });

  it('names every offending parameter so the fix is one edit', () => {
    expect(() => assertCleanLink('https://sparkdate.date/lp?utm_source=Facebook&utm_campaign=x&utm_content=proof_rsa1'))
      .toThrow(/utm_source, utm_campaign, utm_content/);
  });

  it('accepts the clean shape the Loxleys ads use', () => {
    expect(() => assertCleanLink('https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ')).not.toThrow();
    expect(() => assertCleanLink(null)).not.toThrow();
  });

  it('does not trip on a word that merely contains utm', () => {
    expect(() => assertCleanLink('https://sparkdate.date/lp?autumn=1')).not.toThrow();
  });
});

describe('it stays tied to brand.json rather than to literals here', () => {
  it('takes the source macro and medium from the file', () => {
    const rules = brand.paid_template.caption_rules.utm;
    const tags = urlTags({ event: 'LX', phase: 'prime', adSet: 'female', creative: 'showup' });
    expect(tags).toContain(`utm_source=${rules.source}`);
    expect(tags).toContain(`utm_medium=${rules.medium}`);
  });

  it('never hardcodes a placement — that is what split Facebook into two GA4 rows', () => {
    const tags = urlTags({ event: 'MC', phase: 'prime', adSet: 'male', creative: 'proof' });
    expect(tags).not.toMatch(/utm_source=(Facebook|facebook|Instagram|instagram)/);
    expect(tags).toContain('{{site_source_name}}');
  });
});
