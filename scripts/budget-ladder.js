#!/usr/bin/env node
/**
 * scripts/budget-ladder.js — the ladder's ARITHMETIC, with no network in it.
 *
 * scripts/meta-budget-ladder.js used to hold both the maths and the Marketing
 * API calls, which meant the maths could only be exercised with a live token
 * against a live campaign. It also held the campaign list as a hardcoded array,
 * so a second campaign was a code edit and a third was a code edit, and the one
 * that never got made was invisible: the ladder simply skipped it.
 *
 * This file is the half that can be tested offline (tests/budget-ladder.test.js)
 * and the half that reads content/paid-campaigns.json, so adding October's
 * events is a data change. meta-budget-ladder.js keeps the writes.
 *
 * WHAT IS DERIVED AND WHAT IS TYPED
 *
 *   derived from content/brand.json  phases, their windows, their spend shares,
 *                                    the event date, the runway floor
 *   typed in content/paid-campaigns.json  campaign id, run total, runway start
 *
 * That split is the reason the ladder cannot drift from the plan
 * scripts/build-paid-campaign.js prints. Money and Meta ids are the only facts
 * brand.json does not hold, so they are the only facts the registry holds.
 */

'use strict';

const path = require('node:path');

const brandDefault = require('../content/brand.json');
const registryDefault = require('../content/paid-campaigns.json');

/**
 * Meta's own floor for a campaign daily budget, discovered on 2026-09-05:
 * setting $1.80 returns code 100, "Your budget must be at least $2.00."
 *
 * It is not a rounding detail. prime is 15% of the total spread over ~15 days,
 * i.e. total/100 per day, so ANY run budget under $200 produces a prime rate
 * Meta will refuse. The ladder floors to $2.00 and says so, which means a
 * sub-$200 run spends MORE than its plan during prime. validate() warns.
 */
const META_MIN_DAILY_CENTS = 200;

const DAY = 86400000;
/** Noon Eastern, so a date string is a day and never an off-by-one timezone. */
const at = (d) => new Date(`${d}T12:00:00-04:00`).getTime();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;
const daysBetween = (a, b) => Math.round((at(b) - at(a)) / DAY);

/**
 * Resolve brand.json's phase table to concrete date windows for one event.
 * Phases carrying a 0% share (build, step) move no money and are dropped —
 * but see phaseGap() for why their absence is not the same as being outside
 * the run.
 */
function phaseWindows(eventDate, runwayStart, brand = brandDefault) {
  const T = (n) => iso(at(eventDate) - n * DAY);
  const rows = [];
  for (const p of brand.paid_template.phases) {
    if (p.spend_share === 0) continue;
    const from = p.at === 'T-0' ? eventDate
      : p.from === 'runway_start' ? runwayStart
        : T(Number(String(p.from).replace('T-', '')));
    const to = p.at === 'T-0' ? eventDate
      : T(Number(String(p.to).replace('T-', '')));
    const days = Math.max(1, Math.round((at(to) - at(from)) / DAY) + 1);
    rows.push({ key: p.key, from, to, days, share: p.spend_share });
  }
  return rows;
}

/** The daily rate a phase row implies, floored to what Meta will accept. */
function rowRate(row, totalDollars, share = 1) {
  const raw = Math.round((totalDollars * share * row.share * 100) / row.days);
  return { raw, cents: Math.max(raw, META_MIN_DAILY_CENTS), floored: raw < META_MIN_DAILY_CENTS };
}

/**
 * playbook_v2 (reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md §8): two
 * campaigns per event (cold, retargeting), fixed PER-DAY rates rather than a
 * percentage of a total to distribute, and a cold:retarget split that VARIES
 * by phase (80/20 -> 60/40 -> 35/65) -- which is exactly what the legacy
 * `share` field cannot express, since share is one flat fraction applied to
 * every phase alike. A registry entry opts in with `playbook: 'v2'` and a
 * `role` of 'cold' or 'retargeting'; anything else, including no `playbook`
 * field at all, keeps reading the legacy phases above unchanged -- Loxleys'
 * live campaign must not move.
 */

/**
 * v2's phase windows for one event, honoring the cold-start rule: a phase
 * whose nominal window would already be over before the runway even starts
 * is dropped entirely, and whatever phase survives first absorbs the actual
 * runway_start as its own start date rather than inventing a partial phase
 * to fill the gap. See brand.json paid_template.playbook_v2._lead_time.
 */
function phaseWindowsV2(eventDate, runwayStart, playbook) {
  const T = (n) => (n === 0 ? eventDate : iso(at(eventDate) - n * DAY));
  const nominal = playbook.phases.map((p) => ({
    key: p.key,
    from: T(p.from_t),
    to: T(p.to_t),
    threshold: p.from_t,
    daily_cents: p.daily_cents,
    cold_share: p.cold_share,
    retarget_share: p.retarget_share,
  }));
  const remaining = daysBetween(runwayStart, eventDate);
  let startIdx = nominal.length - 1;
  for (let i = 0; i < nominal.length; i += 1) {
    if (remaining >= nominal[i].threshold) { startIdx = i; break; }
  }
  const rows = nominal.slice(startIdx);
  if (rows.length) rows[0] = { ...rows[0], from: runwayStart };
  return rows;
}

/**
 * Split one v2 phase's scaled daily total between cold and retargeting,
 * applying Meta's $2.00/day floor. If the honest split would put either side
 * under the floor, that side is set to exactly the floor and the other
 * absorbs the remainder -- except when the phase total itself is too small
 * to clear the floor on both sides (under $4.00/day), where retargeting is
 * `null`: the caller holds that campaign at whatever it is already running
 * rather than fund it below the floor at all.
 */
function roleRates(phase, scale) {
  const total = Math.round(phase.daily_cents * scale);
  if (total < META_MIN_DAILY_CENTS * 2) {
    return { cold: { cents: total, raw: total, floored: false }, retarget: null };
  }
  const rawRetarget = Math.round(total * phase.retarget_share);
  if (rawRetarget < META_MIN_DAILY_CENTS) {
    return {
      cold: { cents: total - META_MIN_DAILY_CENTS, raw: total - rawRetarget, floored: false },
      retarget: { cents: META_MIN_DAILY_CENTS, raw: rawRetarget, floored: true },
    };
  }
  const rawCold = total - rawRetarget;
  return {
    cold: { cents: rawCold, raw: rawCold, floored: false },
    retarget: { cents: rawRetarget, raw: rawRetarget, floored: false },
  };
}

/** rateFor()'s v2 branch -- see the block comment above phaseWindowsV2(). */
function rateForV2(entry, ev, today, brand) {
  const PB = brand.paid_template.playbook_v2;
  const rows = phaseWindowsV2(ev.date, entry.runway_start, PB);
  const hit = rows.find((r) => today >= r.from && today <= r.to);
  if (!hit) {
    const inside = rows.length > 0 && today >= rows[0].from && today <= ev.date;
    return {
      state: inside ? 'gap' : 'outside',
      rows,
      eventDate: ev.date,
      reason: inside
        ? `${today} falls between v2 phases, which should not happen -- check playbook_v2.phases for a gap.`
        : today > ev.date
          ? `${today} is after the event (${ev.date}). This campaign is retired.`
          : `${today} is before the runway starts (${rows[0] ? rows[0].from : entry.runway_start}).`,
    };
  }
  const scale = (entry.total === undefined ? PB.reference_total_dollars : Number(entry.total)) / PB.reference_total_dollars;
  const { cold, retarget } = roleRates(hit, scale);
  const mine = entry.role === 'cold' ? cold : retarget;
  if (!mine) {
    return {
      state: 'hold',
      phase: hit.key,
      rows,
      eventDate: ev.date,
      reason: `${hit.key}'s scaled total is too small to fund both roles past the $2.00 floor -- `
        + 'retargeting holds its existing budget this phase (playbook_v2._floor_priority_rule).',
    };
  }
  return { state: 'set', phase: hit.key, cents: mine.cents, raw: mine.raw, floored: mine.floored, rows, eventDate: ev.date };
}

/**
 * What should this campaign be spending on `today`?
 *
 * Returns one of four shapes, and the difference between the last two matters:
 * `gap` is a day INSIDE the run that carries no spend share (T-15, the early
 * bird step) where the budget correctly holds at yesterday's rate, while
 * `outside` means the run has not started or the event has passed. Conflating
 * them sends someone hunting a bug that is not there.
 */
function rateFor(entry, today, brand = brandDefault) {
  const ev = brand.events[entry.event];
  if (!ev) return { state: 'unknown-event', reason: `${entry.event} is not in brand.json events` };

  if (entry.playbook === 'v2') return rateForV2(entry, ev, today, brand);

  const rows = phaseWindows(ev.date, entry.runway_start, brand);
  const share = entry.share === undefined ? 1 : entry.share;
  const hit = rows.find((r) => today >= r.from && today <= r.to);
  if (hit) {
    const { raw, cents, floored } = rowRate(hit, entry.total, share);
    return { state: 'set', phase: hit.key, cents, raw, floored, rows, eventDate: ev.date };
  }
  const inside = today >= rows[0].from && today <= ev.date;
  return {
    state: inside ? 'gap' : 'outside',
    rows,
    eventDate: ev.date,
    reason: inside
      ? `${today} falls between phases (the T-15 step day carries no spend share). Budget holds.`
      : today > ev.date
        ? `${today} is after the event (${ev.date}). This campaign is retired.`
        : `${today} is before the runway starts (${rows[0].from}).`,
  };
}

/**
 * Every managed campaign's rate for one day, plus the account-wide total.
 *
 * The total is the number that matters once more than one event is live. Each
 * ladder is individually sane at $11.57/day; four of them at once is the thing
 * nobody is watching. reports/OCTOBER_SLATE_FEASIBILITY_2026-09-03.md models
 * the October slate peaking at $27.50-$32.50/day across four campaigns.
 */
function planDay(today, registry = registryDefault, brand = brandDefault) {
  const plans = registry.campaigns
    .filter((c) => c.managed !== false)
    .map((c) => ({ entry: c, ...rateFor(c, today, brand) }));
  const accountCents = plans.reduce((s, p) => s + (p.state === 'set' ? p.cents : 0), 0);
  return { today, plans, accountCents };
}

/**
 * A day-by-day projection of the whole account's ladder spend.
 *
 * This is the view that does not exist anywhere else: build-paid-campaign.js
 * prints one event's ladder, and Ads Manager shows today. Neither answers
 * "what does the account spend on October 12 when three runs overlap?"
 */
function forecast(from, days, registry = registryDefault, brand = brandDefault) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const day = iso(at(from) + i * DAY);
    const { plans, accountCents } = planDay(day, registry, brand);
    out.push({
      date: day,
      total: accountCents,
      live: plans
        .filter((p) => p.state === 'set')
        .map((p) => ({ event: p.entry.event, name: p.entry.name, phase: p.phase, cents: p.cents })),
    });
  }
  return out;
}

/**
 * Refuse to run on a registry that cannot be right, rather than writing a
 * budget derived from it. Errors block; warnings print and continue.
 */
function validate(registry = registryDefault, brand = brandDefault) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const shareByEvent = new Map();
  const floorDays = 18; // brand.paid_template.runway._floor
  const minDays = brand.paid_template.runway.minimum_days;
  const v2RolesByEvent = new Map();
  const v2SharedFactsByEvent = new Map();

  for (const c of registry.campaigns) {
    const label = c.name || c.campaign_id || c.event;

    if (!c.campaign_id || !/^\d+$/.test(String(c.campaign_id))) {
      errors.push(`${label}: campaign_id must be the numeric Meta id`);
    } else if (seen.has(c.campaign_id)) {
      errors.push(`campaign_id ${c.campaign_id} appears twice (${seen.get(c.campaign_id)} and ${label})`);
    } else {
      seen.set(c.campaign_id, label);
    }

    const ev = brand.events[c.event];
    if (!ev) {
      errors.push(`${label}: event key "${c.event}" is not in content/brand.json events — `
        + 'add the event there first; the ladder reads its date from brand.json on purpose');
      continue;
    }
    if (c.managed === false) continue;

    if (!(Number(c.total) > 0)) errors.push(`${label}: total must be the run budget in dollars`);

    if (!c.runway_start) {
      errors.push(`${label}: runway_start is required`);
      continue;
    }

    if (c.playbook === 'v2') {
      const runway = daysBetween(c.runway_start, ev.date);
      if (runway <= 0) errors.push(`${label}: runway_start ${c.runway_start} is not before the event ${ev.date}`);

      if (c.role !== 'cold' && c.role !== 'retargeting') {
        errors.push(`${label}: playbook v2 requires role "cold" or "retargeting", got ${JSON.stringify(c.role)}`);
      } else {
        const roles = v2RolesByEvent.get(c.event) || new Set();
        if (roles.has(c.role)) errors.push(`${label}: event ${c.event} already has a v2 "${c.role}" entry — one per role`);
        roles.add(c.role);
        v2RolesByEvent.set(c.event, roles);
      }

      const prior = v2SharedFactsByEvent.get(c.event);
      if (prior && (Number(prior.total) !== Number(c.total) || prior.runway_start !== c.runway_start)) {
        warnings.push(`${label}: event ${c.event}'s cold and retargeting entries disagree on total/runway_start — `
          + 'they describe one shared run and should match');
      }
      v2SharedFactsByEvent.set(c.event, c);
      continue; // v2 has its own floor/split logic (roleRates); the legacy checks below don't apply
    }

    const share = c.share === undefined ? 1 : Number(c.share);
    if (!(share > 0 && share <= 1)) errors.push(`${label}: share must be between 0 and 1`);
    shareByEvent.set(c.event, (shareByEvent.get(c.event) || 0) + share);

    const runway = daysBetween(c.runway_start, ev.date);
    if (runway <= 0) errors.push(`${label}: runway_start ${c.runway_start} is not before the event ${ev.date}`);
    else if (runway < floorDays) {
      errors.push(`${label}: a ${runway}-day runway is under the ${floorDays}-day floor — `
        + 'prime disappears and retargeting launches with no audience pool');
    } else if (runway < minDays) {
      warnings.push(`${label}: ${runway}-day runway is under the stated ${minDays}-day minimum`);
    }

    if (Number(c.total) * share < 200) {
      warnings.push(`${label}: $${Number(c.total) * share} over the run puts prime under Meta's `
        + `${money(META_MIN_DAILY_CENTS)} floor, so prime will spend more than the plan says`);
    }
  }

  for (const [event, total] of shareByEvent) {
    if (total > 1.0001) errors.push(`event ${event}: campaign shares sum to ${total} — more than the run budget`);
    else if (total < 0.999) warnings.push(`event ${event}: campaign shares sum to ${total}, leaving ${((1 - total) * 100).toFixed(0)}% of the run budget unallocated`);
  }

  for (const [event, roles] of v2RolesByEvent) {
    if (roles.size === 1) {
      warnings.push(`event ${event}: only a "${[...roles][0]}" v2 entry is registered — `
        + 'the other role is unmanaged until it is added or explicitly acknowledged');
    }
  }

  return { errors, warnings };
}

/**
 * Which live campaigns is nobody laddering?
 *
 * `live` is what the account returns. A campaign that is ACTIVE and appears in
 * neither the registry's `campaigns` nor its `acknowledged` list is spending
 * money that no schedule governs and that nobody has said is deliberate. That
 * is the exact failure this whole file exists to prevent, so it is surfaced
 * rather than silently skipped.
 */
function ungoverned(live, today, registry = registryDefault) {
  const managed = new Set(registry.campaigns.map((c) => String(c.campaign_id)));
  const ack = new Map((registry.acknowledged || []).map((a) => [String(a.campaign_id), a]));
  const out = { ungoverned: [], acknowledged: [], stale: [] };
  for (const c of live) {
    const id = String(c.id);
    if (managed.has(id)) continue;
    const a = ack.get(id);
    if (!a) { out.ungoverned.push(c); continue; }
    out.acknowledged.push({ ...c, ...a });
    // An acknowledgement is a decision with a shelf life, not a permanent mute:
    // "leave Marion Court alone, it ends Tuesday" stops being true on Wednesday.
    if (a.review_after && today > a.review_after) out.stale.push({ ...c, ...a });
  }
  return out;
}

module.exports = {
  META_MIN_DAILY_CENTS,
  phaseWindows,
  rowRate,
  phaseWindowsV2,
  roleRates,
  rateFor,
  planDay,
  forecast,
  validate,
  ungoverned,
  money,
  iso,
  at,
  daysBetween,
  REGISTRY_PATH: path.join('content', 'paid-campaigns.json'),
};
