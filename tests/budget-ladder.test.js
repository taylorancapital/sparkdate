// tests/budget-ladder.test.js
//
// Covers scripts/budget-ladder.js — the arithmetic the 03:00 `SparkDate Budget
// Ladder` task runs unattended against live money.
//
// This suite exists because the ladder's only previous test was running it.
// It needed META_ADS_ACCESS_TOKEN, it read a live campaign, and it therefore
// could not run in CI at all — so the one code path that writes a daily budget
// with nobody watching was the one path nothing checked. These cases run
// offline with no token, which is the whole point.
//
// The Loxleys numbers below are not invented for the test: $2.00 / $9.00 /
// $11.57 / $9.00 are what memory `lx-campaign-live` records Taylor choosing and
// what the live campaign has been set to. If they drift, the ladder has
// silently changed what it spends.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../scripts/budget-ladder.js');
const brand = require('../content/brand.json');
const registry = require('../content/paid-campaigns.json');

const LX = { event: 'LX', campaign_id: '120251304238920542', name: 'Loxleys | Sales', total: 180, runway_start: '2026-08-23' };
const rate = (today, entry = LX, b = brand) => L.rateFor(entry, today, b);

describe('it reproduces the ladder the live Loxleys campaign is running', () => {
  it('floors prime to Meta\'s $2.00 — $180 over the run puts it at $1.80', () => {
    const r = rate('2026-09-01');
    expect(r.phase).toBe('prime');
    expect(r.raw).toBe(180);
    expect(r.cents).toBe(200);
    expect(r.floored).toBe(true);
  });

  it('steps to $9.00 on the first convert day, T-14', () => {
    const r = rate('2026-09-08');
    expect(r.phase).toBe('convert');
    expect(r.cents).toBe(900);
  });

  it('steps to $11.57 on the first close day, T-7', () => {
    const r = rate('2026-09-15');
    expect(r.phase).toBe('close');
    expect(r.cents).toBe(1157);
  });

  it('spends $9.00 on the day itself', () => {
    const r = rate('2026-09-22');
    expect(r.phase).toBe('day_of');
    expect(r.cents).toBe(900);
  });

  it('never floors a phase that clears $2.00 on its own', () => {
    expect(rate('2026-09-15').floored).toBe(false);
  });
});

describe('the four states are distinguishable, which is the point of them', () => {
  // Conflating a gap day with being outside the run sends someone hunting a
  // bug that is not there: T-15 is the early-bird step and carries no spend
  // share, so the budget correctly HOLDS at yesterday's rate.
  it('calls T-15 a gap inside the run, not the end of it', () => {
    const r = rate('2026-09-07');
    expect(r.state).toBe('gap');
    expect(r.reason).toMatch(/step day/);
  });

  it('is outside before the runway starts', () => {
    const r = rate('2026-08-22');
    expect(r.state).toBe('outside');
    expect(r.reason).toMatch(/before the runway/);
  });

  it('retires itself after the event rather than setting anything', () => {
    const r = rate('2026-09-23');
    expect(r.state).toBe('outside');
    expect(r.reason).toMatch(/retired/);
  });

  it('refuses an event brand.json does not have instead of guessing a date', () => {
    expect(rate('2026-09-15', { ...LX, event: 'NOPE' }).state).toBe('unknown-event');
  });
});

describe('one event split across more than one campaign', () => {
  // A separate retargeting campaign is a real shape on this account (Marion
  // Court runs one), so a campaign can carry a FRACTION of the event's run
  // budget rather than all of it.
  it('scales every phase by the campaign share', () => {
    const full = rate('2026-09-15');
    const quarter = rate('2026-09-15', { ...LX, share: 0.25 });
    expect(quarter.cents).toBe(Math.round(full.cents * 0.25));
  });

  it('still floors a small share to Meta\'s minimum', () => {
    expect(rate('2026-09-15', { ...LX, share: 0.05 }).cents).toBe(L.META_MIN_DAILY_CENTS);
  });
});

describe('the account-wide view, which is the thing nobody was watching', () => {
  // Each ladder is individually sane. Four at once is the number that empties
  // an account, and no per-campaign guard can see it.
  const brand2 = { ...brand, events: { ...brand.events, TL2: { ...brand.events.TL, date: '2026-10-06' } } };
  const reg2 = {
    guards: registry.guards,
    campaigns: [
      LX,
      { event: 'TL2', campaign_id: '999', name: 'Tellus | Sales', total: 200, runway_start: '2026-09-06' },
    ],
  };

  it('sums concurrent campaigns into one daily figure', () => {
    // 2026-09-15 is Loxleys close ($11.57) and Tellus prime ($200/15 days,
    // floored: $2.00 raw is exactly the floor).
    const day = L.planDay('2026-09-15', reg2, brand2);
    const byEvent = Object.fromEntries(day.plans.map((p) => [p.entry.event, p.cents]));
    expect(byEvent.LX).toBe(1157);
    expect(byEvent.TL2).toBe(200);
    expect(day.accountCents).toBe(1357);
  });

  it('counts nothing for a campaign that is out of its run window', () => {
    const day = L.planDay('2026-10-01', reg2, brand2);
    expect(day.accountCents).toBe(L.rateFor(reg2.campaigns[1], '2026-10-01', brand2).cents);
  });

  it('forecasts the peak day of an overlapping slate', () => {
    const rows = L.forecast('2026-09-06', 40, reg2, brand2);
    const peak = rows.reduce((a, b) => (b.total > a.total ? b : a));
    // Loxleys close and Tellus convert overlap Sep 22 — the day both are heaviest.
    expect(peak.total).toBeGreaterThan(1357);
    expect(peak.live.length).toBe(2);
  });
});

describe('it refuses a registry that cannot be right', () => {
  const base = { guards: registry.guards, campaigns: [LX] };
  const bad = (campaigns) => L.validate({ ...base, campaigns }, brand);

  it('accepts the registry that actually ships', () => {
    expect(L.validate(registry, brand).errors).toEqual([]);
  });

  it('rejects an event key brand.json does not hold, naming the fix', () => {
    const { errors } = bad([{ ...LX, event: 'TL2' }]);
    expect(errors.join(' ')).toMatch(/not in content\/brand\.json/);
  });

  it('rejects the same campaign id registered twice', () => {
    const { errors } = bad([LX, { ...LX, name: 'copy' }]);
    expect(errors.join(' ')).toMatch(/appears twice/);
  });

  it('rejects shares that sum above the run budget', () => {
    const { errors } = bad([{ ...LX, share: 0.7 }, { ...LX, campaign_id: '2', share: 0.7 }]);
    expect(errors.join(' ')).toMatch(/sum to 1\.4/);
  });

  it('warns when part of an event\'s budget is unallocated', () => {
    const { warnings } = bad([{ ...LX, share: 0.6 }]);
    expect(warnings.join(' ')).toMatch(/40% of the run budget unallocated/);
  });

  it('rejects a runway under the 18-day floor, where prime disappears', () => {
    const { errors } = bad([{ ...LX, runway_start: '2026-09-10' }]);
    expect(errors.join(' ')).toMatch(/under the 18-day floor/);
  });

  it('warns on a runway between the floor and the stated 21-day minimum', () => {
    const { errors, warnings } = bad([{ ...LX, runway_start: '2026-09-03' }]);
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/under the stated 21-day minimum/);
  });

  it('warns that a sub-$200 run will overspend its own prime', () => {
    const { warnings } = bad([{ ...LX, total: 150 }]);
    expect(warnings.join(' ')).toMatch(/floor, so prime will spend more/);
  });

  it('rejects a campaign id that is not a Meta id', () => {
    expect(bad([{ ...LX, campaign_id: 'Loxleys' }]).errors.join(' ')).toMatch(/numeric Meta id/);
  });
});

describe('the ungoverned audit — the failure mode that used to be silence', () => {
  const live = [
    { id: '120251304238920542', name: 'Loxleys | Sales' },
    { id: '120251305428200542', name: 'Marion Court | Sales' },
    { id: '777', name: 'Somebody Built This In Ads Manager' },
  ];

  it('says nothing about a campaign the ladder drives', () => {
    const a = L.ungoverned(live, '2026-09-06', registry);
    expect(a.ungoverned.map((c) => c.id)).not.toContain('120251304238920542');
  });

  it('flags an ACTIVE campaign in neither list', () => {
    const a = L.ungoverned(live, '2026-09-06', registry);
    expect(a.ungoverned.map((c) => c.id)).toEqual(['777']);
  });

  it('lists a deliberate exclusion as acknowledged, with its reason', () => {
    const a = L.ungoverned(live, '2026-09-06', registry);
    expect(a.acknowledged.map((c) => c.name)).toContain('Marion Court | Sales');
    expect(a.acknowledged.find((c) => c.id === '120251305428200542').why).toMatch(/hail mary|Hand-set/i);
  });

  it('expires an acknowledgement rather than muting a campaign forever', () => {
    // Marion Court's exclusions are reviewed after its event on 2026-09-08.
    expect(L.ungoverned(live, '2026-09-08', registry).stale).toEqual([]);
    expect(L.ungoverned(live, '2026-09-09', registry).stale.map((c) => c.id))
      .toContain('120251305428200542');
  });

  it('does not expire an acknowledgement for a campaign that has stopped', () => {
    expect(L.ungoverned([], '2026-12-01', registry).stale).toEqual([]);
  });
});
