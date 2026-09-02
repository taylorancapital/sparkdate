// tests/meta-ads-gender-reconcile.test.js
//
// Covers reconcileGender in scripts/meta-ads-review.js — the check that says
// when Meta disagrees with itself about the same window.
//
// Measured, not theorised: the review script asks the insights edge twice for
// `date_preset: maximum`, once plain and once with `breakdowns=gender`. On
// 2026-09-02 those two answers differed. `Loxleys | female | prime video`
// returned 42 landing-page views in the female row against 40 in the unbroken
// total, on identical spend, impressions, reach and clicks — so the summary
// table printed "women share of LPV 105.00%" and nobody caught it for a day.
//
// It matters because the two bases get mixed: every women's cost-per-X divides
// a breakdown figure, while the $/LPV column divides the total. Nothing is
// corrected and no share is rescaled — there is no third source to arbitrate —
// so the whole job of this function is to make the disagreement visible.
//
// The second group of cases is the trap that makes such a check useless:
// summing floats leaves sub-cent residue ($20.96 + $39.60 + $1.20 is
// 61.760000000000005, not 61.76), and reporting that as a Meta disagreement
// would cry wolf on nearly every ad. Spend is quantised to the cent first.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reconcileGender, RECONCILE_TOLERANCE } = require('../scripts/meta-ads-review.js');

// Every metric reconcileGender looks at, so a case differs in one place only.
const flat = {
  spend: 0, impressions: 0, clicks: 0, link_clicks: 0, lpv: 0,
  add_to_cart: 0, checkout: 0, purchases: 0, leads: 0,
};
const row = (over) => ({ ...flat, ...over });

describe('reconcileGender', () => {
  it('flags the Loxleys ad that reported 42 women\'s LPV against a 40 total', () => {
    const drift = reconcileGender(
      row({ spend: 4.76, impressions: 599, clicks: 46, link_clicks: 46, lpv: 40 }),
      { female: row({ spend: 4.76, impressions: 599, clicks: 46, link_clicks: 46, lpv: 42 }) },
    );
    expect(drift).toHaveLength(1);
    expect(drift[0].metric).toBe('lpv');
    expect(drift[0].summed).toBe(42);
    expect(drift[0].total).toBe(40);
    expect(drift[0].drift).toBeCloseTo(0.048, 3);
  });

  it('catches a conversion that exists only in the split — the >100% shape', () => {
    const drift = reconcileGender(
      row({ spend: 5, lpv: 0 }),
      { female: row({ spend: 5, lpv: 3 }) },
    );
    expect(drift.map((d) => d.metric)).toEqual(['lpv']);
    expect(drift[0].total).toBe(0);
  });

  it('reports every disagreeing metric, not just the first', () => {
    const drift = reconcileGender(
      row({ spend: 100, lpv: 40, purchases: 2 }),
      { female: row({ spend: 130, lpv: 55, purchases: 2 }) },
    );
    expect(drift.map((d) => d.metric).sort()).toEqual(['lpv', 'spend']);
  });

  it('says nothing about an ad whose rows sum to its total', () => {
    expect(reconcileGender(
      row({ spend: 60, impressions: 2000, lpv: 36 }),
      { female: row({ spend: 20, impressions: 700, lpv: 14 }), male: row({ spend: 40, impressions: 1300, lpv: 22 }) },
    )).toBeNull();
  });
});

describe('float residue is not a Meta disagreement', () => {
  // $20.96 + $39.60 + $1.20 does not equal $61.76 in IEEE-754. Without
  // quantising, this ad is reported at any tolerance near zero.
  const total = row({ spend: 61.76, impressions: 2190, lpv: 36, purchases: 1 });
  const split = {
    female: row({ spend: 20.96, impressions: 851, lpv: 14 }),
    male: row({ spend: 39.60, impressions: 1287, lpv: 22, purchases: 1 }),
    unknown: row({ spend: 1.20, impressions: 52 }),
  };

  it('really is a float that does not sum cleanly', () => {
    expect(20.96 + 39.60 + 1.20).not.toBe(61.76);
  });

  it('is still not reported at a zero tolerance', () => {
    expect(reconcileGender(total, split, 0)).toBeNull();
  });

  it('but a genuine one-cent split is', () => {
    const drift = reconcileGender({ ...total, spend: 61.75 }, split, 0);
    expect(drift.map((d) => d.metric)).toEqual(['spend']);
  });
});

describe('guards', () => {
  const any = row({ spend: 1, lpv: 1 });

  it('returns null when the ad never delivered', () => {
    expect(reconcileGender(null, { female: any })).toBeNull();
  });

  it('returns null when there are no gender rows', () => {
    expect(reconcileGender(any, null)).toBeNull();
    expect(reconcileGender(any, {})).toBeNull();
  });

  it('does not divide by zero on an ad that spent nothing', () => {
    expect(reconcileGender(row({}), { female: row({}) })).toBeNull();
  });

  it('defaults to a tolerance that ignores rounding but not a 5% gap', () => {
    expect(RECONCILE_TOLERANCE).toBeGreaterThan(0);
    expect(RECONCILE_TOLERANCE).toBeLessThan(0.048);
  });
});
