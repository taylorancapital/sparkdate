// tests/meta-ads-two-for-one-delivery.test.js
//
// Covers the one gender rule playbook_v2 keeps after 2026-09-10 (report
// section 8.3, rewritten on Taylor's decision): the 2-for-1 creative runs ONLY
// in a women-locked ad set with Advantage+ gender expansion off. Everything
// else is broad. scripts/meta-ads-review.js asserts it over every ad the
// account has run and exits 3 when it fails.
//
// Why a check and not just a rule: the account already had the rule in
// brand.json (caption_rules.banned_outside_female_ad_set) when Good Good's
// "Sales Object-Women" ad set -- women-targeted, carrying "Bring your girl --
// 2-for-1" -- delivered $39.60 of $61.76 to men through
// targeting_automation.individual_setting.gender = 1. Nobody was reading the
// ad set. The words were in the right place; the money was not.
//
// The numbers below are the real ones from the 2026-09-10 pull.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  carriesTwoForOne, twoForOneDelivery, genderExpansionOn,
  TWO_FOR_ONE_PHRASES, TWO_FOR_ONE_WOMEN_SHARE,
} = require('../scripts/meta-ads-review.js');

const gender = (spend) => ({ spend, impressions: 0, lpv: 0 });

// A review record, shaped as main() builds them. Only the fields the checks
// read are filled in.
const record = (over) => ({
  id: 'ad1',
  name: 'an ad',
  delivered: true,
  lifetime: { spend: 10 },
  adset: { id: 'set1', name: 'a set', status: 'ACTIVE', targeting: { gender: 'women', gender_expansion: undefined } },
  creative: { primary_text: 'A room of people who decided to show up.', headline: 'Lancaster', description: null },
  by_gender: { female: gender(10) },
  ...over,
});

describe('the phrase list has one owner', () => {
  it('reads the banned phrases from brand.json rather than retyping them', () => {
    expect(TWO_FOR_ONE_PHRASES).toEqual(expect.arrayContaining(['2-for-1', '2 for 1', 'two-for-one']));
  });

  it('holds the threshold at 97% -- a locked set delivers 100.0%, and 97 leaves room only for the unknown bucket', () => {
    expect(TWO_FOR_ONE_WOMEN_SHARE).toBe(0.97);
  });
});

describe('carriesTwoForOne', () => {
  it('sees the offer in the headline of the Good Good ad', () => {
    expect(carriesTwoForOne({
      primary_text: 'Thinking about it, but not alone? Bring your girl — one ticket gets you both in.',
      headline: 'Bring your girl — 2-for-1',
      description: 'Good Good Night · Aug 31',
    })).toBe(true);
  });

  it('sees it in the primary text, case-insensitively, in the spaced spelling', () => {
    expect(carriesTwoForOne({ primary_text: 'Loxleys. Bring a friend - 2 FOR 1 on tickets.', headline: null })).toBe(true);
  });

  it('sees it on a carousel card', () => {
    expect(carriesTwoForOne({ primary_text: 'Two of you.', cards: [{ headline: 'Two-for-one this week', description: null }] })).toBe(true);
  });

  it('does not see it in social-proof copy', () => {
    expect(carriesTwoForOne({
      primary_text: '28 people came to our first mixer. Two months later, multiple matches are still talking.',
      headline: 'Lancaster · Sep 22',
      description: 'Doors 6:30 PM',
    })).toBe(false);
  });

  it('handles a creative with no text at all', () => {
    expect(carriesTwoForOne({ kind: 'none' })).toBe(false);
    expect(carriesTwoForOne(null)).toBe(false);
  });
});

describe('twoForOneDelivery', () => {
  const twoForOne = { primary_text: 'Bring your girl — one ticket gets you both in.', headline: 'Bring your girl — 2-for-1' };

  it('flags the Good Good cell: women $20.96, men $39.60, share 34.6%', () => {
    const out = twoForOneDelivery([record({
      name: 'Campaign 1 Event 4  Good Good Campaign-Sales Object-Women',
      lifetime: { spend: 61.76 },
      creative: twoForOne,
      by_gender: { female: gender(20.96), male: gender(39.60), unknown: gender(1.20) },
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].ok).toBe(false);
    expect(out[0].women_share).toBeCloseTo(0.346, 3);
    expect(out[0].men_spend).toBe(39.60);
  });

  it('passes a women-locked cell: Marion Court close 2for1, $41.74 to women, nothing to men', () => {
    const out = twoForOneDelivery([record({
      name: 'Marion Court | female | close 2for1',
      lifetime: { spend: 41.74 },
      creative: twoForOne,
      by_gender: { female: gender(41.74) },
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].ok).toBe(true);
    expect(out[0].women_share).toBe(1);
  });

  it('does not let the unknown-gender bucket count against a locked set', () => {
    // 98% women, 2% unknown, 0 men: the share is computed over KNOWN genders.
    const out = twoForOneDelivery([record({ creative: twoForOne, by_gender: { female: gender(9.8), unknown: gender(0.2) } })]);
    expect(out[0].women_share).toBe(1);
    expect(out[0].ok).toBe(true);
  });

  it('flags the Event 3 landing-page cell even though most of it went to women (76%)', () => {
    const out = twoForOneDelivery([record({
      creative: { primary_text: 'You + a friend, one night, zero pressure. Good Good Night is 2-for-1 this week only.' },
      by_gender: { female: gender(19.20), male: gender(6.01), unknown: gender(0.15) },
    })]);
    expect(out[0].ok).toBe(false);
    expect(out[0].women_share).toBeCloseTo(0.762, 3);
  });

  it('ignores ads without the offer, undelivered ads, and ads with no gendered spend yet', () => {
    const out = twoForOneDelivery([
      record({ by_gender: { female: gender(5), male: gender(5) } }),               // social-proof copy, broad -- fine
      record({ creative: twoForOne, delivered: false, lifetime: null, by_gender: null }), // never ran
      record({ creative: twoForOne, by_gender: { unknown: gender(0.5) } }),        // nothing attributable yet
    ]);
    expect(out).toEqual([]);
  });

  it('marks a leak live when the ad is ACTIVE or spent in the last 7 days, and not when it is archived', () => {
    const leak = { creative: twoForOne, by_gender: { female: gender(2), male: gender(8) } };
    const [archived] = twoForOneDelivery([record({ ...leak, effective_status: 'ARCHIVED', spend_last_7d: 0 })]);
    const [active] = twoForOneDelivery([record({ ...leak, effective_status: 'ACTIVE', spend_last_7d: 0 })]);
    const [paused] = twoForOneDelivery([record({ ...leak, effective_status: 'CAMPAIGN_PAUSED', spend_last_7d: 3.25 })]);
    expect(archived).toMatchObject({ ok: false, live: false }); // Good Good, 2026-08: on the record, not a live fault
    expect(active).toMatchObject({ ok: false, live: true });
    expect(paused).toMatchObject({ ok: false, live: true });    // money moved this week; the status label lags
  });

  it('honours a caller-supplied threshold', () => {
    const rec = record({ creative: twoForOne, by_gender: { female: gender(9), male: gender(1) } });
    expect(twoForOneDelivery([rec])[0].ok).toBe(false);
    expect(twoForOneDelivery([rec], { threshold: 0.9 })[0].ok).toBe(true);
  });
});

describe('genderExpansionOn', () => {
  it('lists an ACTIVE ad set with the flag on, once, however many ads it carries', () => {
    const set = { id: 'gg', name: 'Good Good Campaign-Retargeting', status: 'ACTIVE', targeting: { gender: 'women', gender_expansion: 1 } };
    const out = genderExpansionOn([record({ id: 'a', adset: set }), record({ id: 'b', adset: set })]);
    expect(out).toEqual([{ adset_id: 'gg', adset: 'Good Good Campaign-Retargeting', targets: 'women' }]);
  });

  it('ignores paused and archived ad sets -- the flag only matters where money is moving', () => {
    const out = genderExpansionOn([
      record({ adset: { id: 'p', name: 'paused', status: 'CAMPAIGN_PAUSED', targeting: { gender: 'women', gender_expansion: 1 } } }),
      record({ adset: { id: 'r', name: 'archived', status: 'ARCHIVED', targeting: { gender: 'women', gender_expansion: 1 } } }),
    ]);
    expect(out).toEqual([]);
  });

  it('treats 0 and unset as off, and an ad with no ad set as nothing to check', () => {
    const out = genderExpansionOn([
      record({ adset: { id: 'z', name: 'off', status: 'ACTIVE', targeting: { gender: 'women', gender_expansion: 0 } } }),
      record({ adset: { id: 'u', name: 'unset', status: 'ACTIVE', targeting: { gender: 'women' } } }),
      record({ adset: null }),
    ]);
    expect(out).toEqual([]);
  });
});
