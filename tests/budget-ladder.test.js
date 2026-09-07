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
    const { errors } = bad([{ ...LX, event: 'ZZ' }]);
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

// playbook_v2: reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md §8 -- two
// campaigns per event (cold, retargeting), fixed per-day rates, and a
// cold:retarget split that VARIES by phase. brand.json's real events (MC,
// TL, GG, LX) all predate this and stay on the legacy path tested above;
// V2E below is a synthetic event that exists only in this file, the same
// pattern the account-wide describe block already uses for TL2.
describe('playbook_v2 — two campaigns, a per-day rate, a split that varies by phase', () => {
  // Event date chosen to overlap Loxleys' real Aug23-Sep22 window (so the
  // account-wide test below can sum a genuine legacy + v2 concurrent day),
  // with every T-boundary landing on a plain date by hand:
  // T-21=08-30, T-15=09-05, T-14=09-06, T-8=09-12, T-7=09-13, T-0=09-20.
  const brandV2 = { ...brand, events: { ...brand.events, V2E: { ...brand.events.LX, date: '2026-09-20' } } };
  const cold = (overrides = {}) => ({ event: 'V2E', campaign_id: '1', name: 'V2E | Cold', playbook: 'v2', role: 'cold', total: 296, runway_start: '2026-08-30', ...overrides });
  const retarget = (overrides = {}) => ({ event: 'V2E', campaign_id: '2', name: 'V2E | Retargeting', playbook: 'v2', role: 'retargeting', total: 296, runway_start: '2026-08-30', ...overrides });
  const rate = (entry, today) => L.rateFor(entry, today, brandV2);

  describe('the reference event ($296, scale 1.0) reproduces the report\'s own quick-reference table exactly', () => {
    it('seed: cold $8.00, retarget $2.00 -- naturally at the floor, not forced', () => {
      const c = rate(cold(), '2026-09-01');
      const r = rate(retarget(), '2026-09-01');
      expect(c.phase).toBe('seed');
      expect(c.cents).toBe(800);
      expect(r.cents).toBe(200);
      expect(r.floored).toBe(false);
    });

    it('build: cold $8.40, retarget $5.60', () => {
      expect(rate(cold(), '2026-09-09').cents).toBe(840);
      expect(rate(retarget(), '2026-09-09').cents).toBe(560);
    });

    it('close: cold $5.60, retarget $10.40', () => {
      expect(rate(cold(), '2026-09-18').cents).toBe(560);
      expect(rate(retarget(), '2026-09-18').cents).toBe(1040);
    });

    it('phases are contiguous -- no gap day the way legacy has one at T-15', () => {
      expect(rate(cold(), '2026-09-05').phase).toBe('seed');
      expect(rate(cold(), '2026-09-06').phase).toBe('build');
      expect(rate(cold(), '2026-09-12').phase).toBe('build');
      expect(rate(cold(), '2026-09-13').phase).toBe('close');
    });

    it('is outside before the runway and after the event, same as legacy', () => {
      expect(rate(cold(), '2026-08-29').state).toBe('outside');
      expect(rate(cold(), '2026-09-21').state).toBe('outside');
    });
  });

  describe('the cold-start rule: how many days remain decides where the run starts, never a partial phase', () => {
    it('18 days remaining skips seed and starts build early, at build\'s own rate', () => {
      const e = cold({ runway_start: '2026-09-02' }); // 18 days before 09-20
      expect(rate(e, '2026-09-02').phase).toBe('build');
      expect(rate(e, '2026-09-02').cents).toBe(840); // still 60% of $14, not a different number
      expect(rate(e, '2026-08-30').state).toBe('outside'); // seed's nominal start no longer applies
    });

    it('12 days remaining skips straight to close, at close\'s own rate', () => {
      const e = cold({ runway_start: '2026-09-08' }); // 12 days before 09-20
      const r = rate(e, '2026-09-08');
      expect(r.phase).toBe('close');
      expect(r.cents).toBe(560);
    });

    it('never invents a compressed rate for close -- it runs longer at the same $ figure', () => {
      const normal = rate(cold(), '2026-09-18'); // full 21-day runway
      const compressed = rate(cold({ runway_start: '2026-09-08' }), '2026-09-18');
      expect(compressed.cents).toBe(normal.cents);
    });

    it('a longer-than-21-day runway extends seed rather than erroring', () => {
      const e = cold({ runway_start: '2026-08-22' }); // 29 days before 09-20
      expect(rate(e, '2026-08-25').phase).toBe('seed');
      expect(rate(e, '2026-08-25').cents).toBe(800);
    });
  });

  describe('the $2.00 floor-priority rule', () => {
    it('forces retarget to exactly the floor and lets cold absorb the rest, when the honest split would not clear it', () => {
      // Seed at scale 0.9 ($9.00/day total): naive 20% retarget = $1.80, under the floor.
      const e90 = { total: 296 * 0.9 };
      const c = rate(cold(e90), '2026-09-01');
      const r = rate(retarget(e90), '2026-09-01');
      expect(r.cents).toBe(200);
      expect(r.floored).toBe(true);
      expect(c.cents).toBe(700); // $9.00 - $2.00, not the naive 80% of $9.00 ($7.20)
      expect(c.cents + r.cents).toBe(900); // the phase total is preserved exactly
    });

    it('holds retargeting rather than funding it below the floor, when the phase total itself is too small', () => {
      // Seed at scale 0.3 ($3.00/day total) -- under $4.00, too small to clear the floor on both sides.
      const e30 = { total: 296 * 0.3 };
      const c = rate(cold(e30), '2026-09-01');
      const r = rate(retarget(e30), '2026-09-01');
      expect(c.state).toBe('set');
      expect(c.cents).toBe(300); // cold gets the whole phase, not 80% of it
      expect(r.state).toBe('hold');
      expect(r.reason).toMatch(/floor/);
    });
  });

  describe('scaling by `total`', () => {
    it('doubles every phase\'s rate at total=592', () => {
      const e = { total: 592 };
      expect(rate(cold(e), '2026-09-01').cents).toBe(1600); // 2x $8.00
      expect(rate(retarget(e), '2026-09-18').cents).toBe(2080); // 2x $10.40
    });

    it('an entry with no `total` at all falls back to the $296 reference, in rateFor itself', () => {
      // Distinct from the tests above, which all set total:296 explicitly via
      // the cold()/retarget() helpers -- this checks rateFor()'s own fallback,
      // not the test helper's default.
      const noTotal = { event: 'V2E', campaign_id: '1', role: 'cold', playbook: 'v2', runway_start: '2026-08-30' };
      expect(rate(noTotal, '2026-09-01').cents).toBe(800);
    });
  });

  describe('validate() on a v2 registry', () => {
    const base = { guards: registry.guards, campaigns: [cold(), retarget()] };
    const bad = (campaigns) => L.validate({ ...base, campaigns }, brandV2);

    it('accepts a complete, matching cold+retargeting pair', () => {
      expect(bad([cold(), retarget()]).errors).toEqual([]);
    });

    it('rejects a missing or invalid role', () => {
      const noRole = { ...cold() };
      delete noRole.role;
      expect(bad([noRole]).errors.join(' ')).toMatch(/requires role/);
      expect(bad([cold({ role: 'everyone' })]).errors.join(' ')).toMatch(/requires role/);
    });

    it('rejects the same role registered twice for one event', () => {
      expect(bad([cold(), cold({ campaign_id: '3' })]).errors.join(' ')).toMatch(/already has a v2 "cold" entry/);
    });

    it('warns when the cold and retargeting entries disagree on total or runway_start', () => {
      const { warnings } = bad([cold(), retarget({ total: 250 })]);
      expect(warnings.join(' ')).toMatch(/disagree on total\/runway_start/);
    });

    it('warns when only one role is registered', () => {
      expect(bad([cold()]).warnings.join(' ')).toMatch(/other role is unmanaged/);
    });

    it('does not apply legacy\'s 18-day runway floor -- v2 degrades gracefully instead', () => {
      const short = cold({ runway_start: '2026-09-16' }); // 4 days before the event
      const { errors, warnings } = bad([short, retarget({ runway_start: '2026-09-16' })]);
      expect(errors.join(' ')).not.toMatch(/18-day floor/);
      expect(warnings.join(' ')).not.toMatch(/21-day minimum/);
    });

    it('still refuses a runway_start on or after the event, same message as legacy', () => {
      expect(bad([cold({ runway_start: '2026-09-20' })]).errors.join(' ')).toMatch(/not before the event/);
    });

    it('still refuses an event key brand.json does not hold', () => {
      expect(bad([cold({ event: 'ZZ' })]).errors.join(' ')).toMatch(/not in content\/brand\.json/);
    });
  });

  describe('the account-wide view mixes v2 and legacy campaigns without either knowing about the other', () => {
    it('sums a legacy campaign and a v2 pair into one account total', () => {
      const reg = { guards: registry.guards, campaigns: [LX, cold(), retarget()] };
      // 2026-09-18 is Loxleys close ($11.57, legacy) and V2E close ($5.60 + $10.40).
      const day = L.planDay('2026-09-18', reg, brandV2);
      const byId = Object.fromEntries(day.plans.map((p) => [p.entry.campaign_id, p.cents]));
      expect(byId['120251304238920542']).toBe(1157);
      expect(byId['1']).toBe(560);
      expect(byId['2']).toBe(1040);
      expect(day.accountCents).toBe(1157 + 560 + 1040);
    });
  });
});
