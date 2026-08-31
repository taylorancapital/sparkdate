// tests/ga4-fetch-dates.test.js
//
// Covers the date the nightly GA4 pull asks for — scripts/fetch-ga4-tables.js.
//
// GA4 buckets events into calendar days using the PROPERTY's timezone (US
// Eastern here). The script used to resolve "today" with
// `new Date().toISOString().slice(0,10)`, which is UTC, so for the four hours
// between 20:00 Eastern and midnight UTC the two disagreed by a day.
//
// Measured, not theorised: at 2026-08-31T03:26Z the Data API returned no row
// at all for 20260831, because in the property it was still 23:26 on 08-30.
// A hand-run in that window wrote `ga4-api-daily-trend-2026-08-31.csv`
// containing nothing about 08-31 — a file named for a day it did not cover.
//
// The 02:00 nightly never tripped over it (02:00 Eastern is 06:00 UTC, same
// date), which is exactly why it survived unnoticed. These cases pin the
// boundary from both sides so it cannot come back.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isoIn, TZ } = require('../scripts/fetch-ga4-tables.js');

describe('isoIn', () => {
  it('formats as YYYY-MM-DD, the shape the Data API wants', () => {
    expect(isoIn('UTC', new Date('2026-08-31T03:26:00Z'))).toBe('2026-08-31');
  });

  it('is still the previous day in the property zone late in the evening', () => {
    // The exact instant that exposed the bug.
    expect(isoIn('America/New_York', new Date('2026-08-31T03:26:00Z'))).toBe('2026-08-30');
  });

  it('agrees with UTC at the hour the nightly actually runs', () => {
    // 02:00 Eastern == 06:00 UTC. Both say 08-30, which is why the scheduled
    // job was never affected.
    const nightly = new Date('2026-08-30T06:00:00Z');
    expect(isoIn('America/New_York', nightly)).toBe('2026-08-30');
    expect(isoIn('UTC', nightly)).toBe('2026-08-30');
  });

  it('rolls over at Eastern midnight, not UTC midnight', () => {
    expect(isoIn('America/New_York', new Date('2026-08-31T03:59:59Z'))).toBe('2026-08-30');
    expect(isoIn('America/New_York', new Date('2026-08-31T04:00:00Z'))).toBe('2026-08-31');
  });

  it('handles standard time, where the offset is -05:00', () => {
    // January: EST. Midnight Eastern is 05:00 UTC, an hour later than in EDT.
    expect(isoIn('America/New_York', new Date('2027-01-15T04:59:59Z'))).toBe('2027-01-14');
    expect(isoIn('America/New_York', new Date('2027-01-15T05:00:00Z'))).toBe('2027-01-15');
  });

  it('pads single-digit months and days', () => {
    expect(isoIn('America/New_York', new Date('2026-01-05T17:00:00Z'))).toBe('2026-01-05');
  });

  it('defaults to the property zone', () => {
    expect(TZ).toBe('America/New_York');
  });
});
