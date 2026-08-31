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
});
