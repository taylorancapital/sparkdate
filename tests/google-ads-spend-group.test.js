// tests/google-ads-spend-group.test.js
//
// Covers the grouping in scripts/sync-google-ads-spend.js — the step that turns
// GA4's (date x campaign) cost rows into one Firestore document per day.
//
// Three things here are load-bearing and none is obvious from reading the call
// site:
//
//   1. The GA4 query returns EVERY campaign in the property, not just the ones
//      that cost money. Meta's campaigns and the "(not set)" bucket that holds
//      all organic sessions come back with advertiserAdCost 0. Writing those
//      would create roughly a hundred empty documents a day, each claiming a
//      day of zero Google spend that in fact had none to report.
//
//   2. Money is rounded ONCE per day. An earlier version rounded on every
//      addition, which double-rounds any day with two campaigns.
//
//   3. byEvent is `_unattributed` deliberately. The Meta sync maps campaigns to
//      events by reading each ad's destination URL for an eventId; no such
//      mapping exists for these, and inventing one would file money against an
//      event on no evidence. The dashboard already skips `_unattributed` when
//      building per-event spend while still counting it in the day's total.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { group, dashed } = require('../scripts/sync-google-ads-spend.js');

// Shape of a GA4 runReport row for [date, sessionCampaignName] x
// [advertiserAdCost, advertiserAdClicks, advertiserAdImpressions].
const row = (date, campaign, cost, clicks = 0, impressions = 0) => ({
  dimensionValues: [{ value: date }, { value: campaign }],
  metricValues: [{ value: String(cost) }, { value: String(clicks) }, { value: String(impressions) }],
});

describe('dashed', () => {
  it('converts GA4 YYYYMMDD to the YYYY-MM-DD the dashboard and doc ids use', () => {
    expect(dashed('20260724')).toBe('2026-07-24');
  });
});

describe('group', () => {
  it('drops zero-cost rows rather than writing empty documents', () => {
    const out = group([
      row('20260710', 'Website traffic-Search-1', 3.66, 4, 21),
      row('20260710', 'Campaign 1 Event 3 Tellus AfterDark', 0, 0, 0),
      row('20260710', '(not set)', 0, 0, 0),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].byCampaign).toHaveLength(1);
    expect(out[0].byCampaign[0].name).toBe('Website traffic-Search-1');
  });

  it('writes nothing at all for a day whose every row is zero', () => {
    expect(group([row('20260801', 'Some Meta campaign', 0, 0, 0)])).toEqual([]);
  });

  it('sums a multi-campaign day and rounds once, not per addition', () => {
    // 0.005 + 0.005 rounds to 0.01 as a single sum. Rounding each addend first
    // would give 0.01 + 0.01 = 0.02.
    const out = group([
      row('20260615', 'Campaign #1', 0.005),
      row('20260615', 'Website traffic-Search-1', 0.005),
    ]);
    expect(out[0].total).toBe(0.01);
  });

  it('files all spend as unattributed, with the day total', () => {
    const out = group([row('20260721', 'Website traffic-Search-1', 7.0, 16, 49)]);
    expect(out[0].byEvent).toEqual({ _unattributed: 7 });
    expect(out[0].total).toBe(7);
  });

  it('returns days in ascending date order, ready to batch', () => {
    const out = group([
      row('20260724', 'Website traffic-Search-1', 4.12),
      row('20260615', 'Campaign #1', 0.16),
      row('20260710', 'Website traffic-Search-1', 3.66),
    ]);
    expect(out.map((d) => d.date)).toEqual(['2026-06-15', '2026-07-10', '2026-07-24']);
  });

  it('orders each day\'s campaigns by spend, biggest first', () => {
    const out = group([
      row('20260710', 'cheap', 1.0),
      row('20260710', 'expensive', 9.0),
    ]);
    expect(out[0].byCampaign.map((c) => c.name)).toEqual(['expensive', 'cheap']);
  });

  it('carries clicks and impressions through as integers', () => {
    const out = group([row('20260722', 'Website traffic-Search-1', 5.185051, 22, 72)]);
    expect(out[0].byCampaign[0]).toMatchObject({ clicks: 22, impressions: 72 });
    expect(out[0].total).toBe(5.19);
  });

  it('reproduces the real 16-day window: $37.92 over 16 documents', () => {
    // The measured series, 2026-06-15 .. 2026-07-24. Its per-day rounded sum is
    // $37.92 where GA4's own grand total is 37.912513 — that one-cent gap is
    // inherent to a per-day ledger and is documented in the script.
    const real = [
      ['20260615', 0.16], ['20260618', 0.92], ['20260624', 1.48],
      ['20260710', 3.66], ['20260711', 3.98], ['20260712', 2.88],
      ['20260713', 2.36], ['20260716', 0.12], ['20260717', 0.20],
      ['20260718', 0.59], ['20260719', 0.56], ['20260720', 0.81],
      ['20260721', 7.00], ['20260722', 5.19], ['20260723', 3.89],
      ['20260724', 4.12],
    ];
    const out = group(real.map(([d, c]) => row(d, 'x', c)));
    expect(out).toHaveLength(16);
    const total = out.reduce((s, d) => s + d.total, 0);
    expect(Math.round(total * 100) / 100).toBe(37.92);
  });
});
