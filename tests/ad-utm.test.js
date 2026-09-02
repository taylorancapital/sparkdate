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
