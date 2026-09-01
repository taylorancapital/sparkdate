// tests/ga4-funnel-cohort.test.js
//
// Covers the two request/response shapes added when the nightly stopped
// pretending Explorations were unreachable — scripts/fetch-ga4-tables.js.
//
// Both exist because the API surprised us:
//
//   - runFunnelReport returns MORE metricHeaders than each row has
//     metricValues. Hardcoding the column list, or trusting the header count,
//     silently shifts the header off the data — a CSV that looks right and
//     means something else, which is the exact failure the file's docblock
//     warns about.
//   - cohortSpec 400s unless every cohort carries dimension:"firstSessionDate",
//     and its week boundaries are computed here rather than by GA4, so an
//     off-by-one lands real users in the wrong cohort.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cohortSpec, toCsvFunnel } = require('../scripts/fetch-ga4-tables.js');

describe('cohortSpec', () => {
  it('requires firstSessionDate on every cohort, or GA4 rejects the call', () => {
    for (const c of cohortSpec('2026-08-31').cohorts) {
      expect(c.dimension).toBe('firstSessionDate');
    }
  });

  it('anchors weeks to Monday and runs oldest first', () => {
    // 2026-08-31 is itself a Monday.
    const names = cohortSpec('2026-08-31', 6).cohorts.map((c) => c.dateRange.startDate);
    expect(names).toEqual([
      '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
    ]);
  });

  it('snaps back to Monday when end falls mid-week', () => {
    // 2026-08-26 is a Wednesday; its week began Monday 08-24.
    const c = cohortSpec('2026-08-26', 2).cohorts;
    expect(c.map((x) => x.dateRange.startDate)).toEqual(['2026-08-17', '2026-08-24']);
  });

  it('gives each cohort a Monday-to-Sunday seven-day range', () => {
    for (const c of cohortSpec('2026-08-31', 4).cohorts) {
      const s = new Date(`${c.dateRange.startDate}T00:00:00Z`);
      const e = new Date(`${c.dateRange.endDate}T00:00:00Z`);
      expect((e - s) / 86400000).toBe(6);
      expect(s.getUTCDay()).toBe(1); // Monday
    }
  });

  it('asks for as many weeks of follow-up as there are cohorts', () => {
    const spec = cohortSpec('2026-08-31', 6);
    expect(spec.cohorts).toHaveLength(6);
    expect(spec.cohortsRange).toEqual({ granularity: 'WEEKLY', startOffset: 0, endOffset: 5 });
  });
});

describe('toCsvFunnel', () => {
  // The real response shape: 3 metric headers announced, 2 values per row.
  const report = {
    funnelTable: {
      dimensionHeaders: [{ name: 'funnelStepName' }, { name: 'segment' }],
      metricHeaders: [
        { name: 'activeUsers' },
        { name: 'funnelStepCompletionRate' },
        { name: 'funnelStepAbandonments' },
      ],
      rows: [
        {
          dimensionValues: [{ value: '1. session_start' }, { value: 'A - webview' }],
          metricValues: [{ value: '687' }, { value: '0.0407' }],
        },
        {
          dimensionValues: [{ value: '1. session_start' }, { value: 'B - normal' }],
          metricValues: [{ value: '236' }, { value: '0.4110' }],
        },
      ],
    },
  };
  const spec = {
    file: 'f', title: 'Funnel', steps: [
      { name: '1', filterExpression: { funnelEventFilter: { eventName: 'session_start' } } },
    ],
  };
  const lines = (csv) => csv.split('\n').filter((l) => l && !l.startsWith('#'));

  it('takes only as many metric names as a row actually carries', () => {
    const [hdr, ...rows] = lines(toCsvFunnel(spec, report, '2026-08-01', '2026-08-31', 'now'));
    expect(hdr).toBe('funnelStepName,segment,activeUsers,funnelStepCompletionRate');
    expect(hdr.split(',')).toHaveLength(rows[0].split(',').length);
  });

  it('keeps every row aligned to that header', () => {
    const rows = lines(toCsvFunnel(spec, report, '2026-08-01', '2026-08-31', 'now')).slice(1);
    expect(rows).toEqual([
      '1. session_start,A - webview,687,0.0407',
      '1. session_start,B - normal,236,0.4110',
    ]);
  });

  it('never appends a Grand total ROW, because a funnel has no meaningful sum', () => {
    // Checked against the data lines, not the whole file: the header carries a
    // comment that explains the absence and names it.
    const rows = lines(toCsvFunnel(spec, report, '2026-08-01', '2026-08-31', 'now'));
    expect(rows.some((l) => l.includes('Grand total'))).toBe(false);
  });

  it('warns about the begin_checkout redefinition only when that step is present', () => {
    expect(toCsvFunnel(spec, report, '2026-08-01', '2026-08-31', 'now')).not.toContain('REDEFINED');

    const withCheckout = {
      ...spec,
      steps: [...spec.steps, {
        name: '2', filterExpression: { funnelEventFilter: { eventName: 'begin_checkout' } },
      }],
    };
    expect(toCsvFunnel(withCheckout, report, '2026-08-01', '2026-08-31', 'now'))
      .toContain('begin_checkout was REDEFINED on 2026-08-21');
  });

  it('survives an empty funnel without throwing', () => {
    const empty = { funnelTable: { ...report.funnelTable, rows: [] } };
    expect(() => toCsvFunnel(spec, empty, '2026-08-01', '2026-08-31', 'now')).not.toThrow();
  });

  it('warns that the last step is a chain count, not conversions', () => {
    const csv = toCsvFunnel(spec, report, '2026-05-19', '2026-09-01', 'now');
    expect(csv).toContain('CHAIN COUNT, NOT A CONVERSION COUNT');
    // and points at where the real number lives
    expect(csv).toContain('ga4-api-events-');
  });
});

// ---------------------------------------------------------------------------
// The funnel's SHAPE, not its plumbing.
//
// add_to_cart was a mandatory step for exactly one night and it cost the bottom
// of every funnel table. A closed funnel counts users who completed every step
// IN ORDER, so one off-path step discards everyone who skipped it. Measured
// 2026-09-01 over 20260519-20260901, adding a step at a time:
//
//     session_start -> purchase          34   <- GA4's own purchasing-user count
//             + view_item                24
//             + begin_checkout           12
//             + add_to_cart               5
//
// GA4_ANALYSIS_2026-09-01 read those chain counts as purchases and reported
// Email as producing none. Email produced one.
// ---------------------------------------------------------------------------
describe('purchase funnel shape', () => {
  const { FUNNELS } = require('../scripts/fetch-ga4-tables.js');
  // The waitlist funnel is a deliberate two-step sequence, not a purchase path.
  const purchaseFunnels = FUNNELS.filter((f) => f.file !== 'funnel-waitlist-sequence');
  const eventsOf = (f) => f.steps.map((s) => s.filterExpression.funnelEventFilter.eventName);

  it('never makes add_to_cart a mandatory step', () => {
    for (const f of purchaseFunnels) {
      expect(eventsOf(f), `${f.file} must not gate on add_to_cart`).not.toContain('add_to_cart');
    }
  });

  it('still ends on purchase, or it measures nothing worth having', () => {
    for (const f of purchaseFunnels) {
      expect(eventsOf(f).at(-1)).toBe('purchase');
    }
  });

  // There are exactly TWO purchase-funnel shapes, and the split is deliberate.
  //
  // This assertion used to demand a single shape, which was right when written
  // and wrong within the hour: funnel-checkout-by-landing-page landed with a
  // second shape on purpose, and turned main red. The rule being protected was
  // never "one shape" -- it was "shapes do not drift by accident". So the two
  // intended shapes are named, and anything else fails.
  //
  // Why two. ANALYTICS_METHOD section 4: /lp does not fire view_item, so a
  // funnel starting there cannot see 2,566 of 3,485 sessions. The view_item
  // shape measures the browse-then-buy path; the checkout shape measures
  // everyone who reached checkout, including the landing-page traffic. They
  // capture 12 and 21 of GA4's 34 purchasing users respectively, and neither
  // number is wrong -- they answer different questions.
  const SHAPES = {
    'funnel-checkout-by-landing-page': 'session_start > begin_checkout > purchase',
    _default: 'session_start > view_item > begin_checkout > purchase',
  };

  it('uses only the two intended step lists, so shapes cannot drift unnoticed', () => {
    for (const f of purchaseFunnels) {
      expect(eventsOf(f).join(' > '), `${f.file} has an unrecognised funnel shape`)
        .toBe(SHAPES[f.file] || SHAPES._default);
    }
  });

  it('keeps the view_item funnels comparable with each other', () => {
    const viewItemFunnels = purchaseFunnels.filter((f) => !SHAPES[f.file]);
    expect(viewItemFunnels.length).toBeGreaterThan(1);
    const shapes = new Set(viewItemFunnels.map((f) => eventsOf(f).join(' > ')));
    expect(shapes.size).toBe(1);
  });

  it('has exactly one funnel that deliberately skips view_item', () => {
    const skippers = purchaseFunnels.filter((f) => !eventsOf(f).includes('view_item'));
    expect(skippers.map((f) => f.file)).toEqual(['funnel-checkout-by-landing-page']);
  });
});
