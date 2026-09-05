#!/usr/bin/env node
/**
 * scripts/meta-budget-ladder.js
 *
 * Sets a campaign's daily budget to whatever the budget ladder says it should be
 * TODAY, and is safe to run every day.
 *
 * WHY THIS EXISTS
 *
 * Taylor, 2026-09-05: "keep the budget ladder convention which I could have
 * sworn was automatic." It was not. Checked that day: the only two scheduled
 * tasks on this machine are "Meta Ads Results Pull" and "SparkDate Nightly
 * Report Review", neither touches daily_budget, and no script in the repo set a
 * budget on a schedule. scripts/build-paid-campaign.js PRINTS the ladder and
 * says so outright -- "Meta has no 'raise this on that date' -- every row below
 * is a manual edit." Every step was a diary entry nobody was keeping, and the
 * Loxleys campaign sat at the convert rate at T-17 because of it.
 *
 * This is the missing piece. Run it daily and the ladder is automatic.
 *
 * THE LADDER IS DERIVED, NEVER TYPED
 *
 * Phases and their spend shares come from content/brand.json paid_template, and
 * the event date from brand.json events[KEY].date, so this file cannot drift
 * from the plan build-paid-campaign.js prints. Only the campaign id and the
 * total run budget live here, because those are per-campaign facts the template
 * does not know.
 *
 *     prime    runway_start..T-16   15% of budget
 *     step     T-15                  0%   (early bird ends; the inflection)
 *     convert  T-14..T-8            35%
 *     close    T-7..T-1             45%
 *     day_of   T-0                   5%
 *
 * SAFETY
 *
 * Dry run is the DEFAULT, matching every other writer in scripts/. It GETs live
 * state and prints; it never POSTs without --execute. Every write is read back
 * and compared. Idempotent: a campaign already at today's rate prints SKIP, so
 * running it hourly would be harmless.
 *
 * It REFUSES rather than guesses when anything looks wrong:
 *   - unknown event key or campaign id
 *   - the campaign is not CBO (no campaign-level daily_budget to set)
 *   - today is outside the run (before runway_start, or after the event)
 *   - the computed rate exceeds --max-daily (default $25.00), the guard against
 *     a fat-fingered total or a wrong event date emptying the account
 *
 * It does NOT unpause anything. A paused campaign stays paused with a corrected
 * budget, so this can never start spend on its own.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *
 * Usage:
 *   node scripts/meta-budget-ladder.js --event=LX               # DRY RUN
 *   node scripts/meta-budget-ladder.js --event=LX --execute
 *   node scripts/meta-budget-ladder.js --all --execute          # every live event
 *   node scripts/meta-budget-ladder.js --event=LX --today=2026-09-15
 */

'use strict';

const brand = require('../content/brand.json');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

const arg = (n, d) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (hit === undefined) return d;
  if (!hit.includes('=')) return true;
  return hit.split('=').slice(1).join('=');
};
const EXECUTE = process.argv.includes('--execute');
const ALL = process.argv.includes('--all');
// The guard is a CEILING, not a jump limit. A jump limit is the wrong shape:
// the ladder's own prime -> convert step is 4.5x ($2.00 -> $9.00) by design, so
// any jump guard tight enough to catch a typo also blocks the real steps. What
// actually needs catching is a fat-fingered `total` or a wrong event date, and
// both of those show up as an absurd DAILY figure. --max-jump is kept for the
// rare manual correction but defaults to off.
const MAX_DAILY_CENTS = Number(arg('max-daily', 2500));
const MAX_JUMP = Number(arg('max-jump', Infinity));

/**
 * Meta's own floor for a campaign daily budget, discovered the hard way on
 * 2026-09-05: setting $1.80 returns code 100, "Your budget must be at least
 * $2.00. This minimum amount is required to account for any spending that
 * occurs while your budget is updated, which may take up to 15 minutes."
 *
 * This matters for the ladder generally, not just once. prime is 15% of the
 * total spread over ~15 days, i.e. total/100 per day, so ANY run budget under
 * $200 produces a prime rate Meta will refuse. build-paid-campaign.js will
 * happily print $1.80/day and there is no way to set it.
 */
const META_MIN_DAILY_CENTS = 200;

/**
 * The only per-campaign facts brand.json does not hold. `total` is the whole
 * run's budget in DOLLARS -- the same number you would pass to
 * build-paid-campaign.js --budget=.
 */
const CAMPAIGNS = [
  {
    key: 'LX',
    campaign: '120251304238920542',
    name: 'Loxleys | Sales',
    total: 180,
    runwayStart: '2026-08-23',
  },
];

const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;
const at = (d) => new Date(`${d}T12:00:00-04:00`).getTime();
const DAY = 86400000;
const TODAY = String(arg('today', new Date().toISOString().slice(0, 10)));

/** Resolve every phase to a concrete date window for one event. */
function ladder(eventDate, runwayStart) {
  const T = (n) => new Date(at(eventDate) - n * DAY).toISOString().slice(0, 10);
  const rows = [];
  for (const p of brand.paid_template.phases) {
    if (p.spend_share === 0) continue; // build and step move no money
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

async function graph(path, params = {}, method = 'GET') {
  const url = new URL(`${GRAPH}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (method === 'GET') url.searchParams.set(k, v);
    else body.set(k, v);
  }
  (method === 'GET' ? url.searchParams : body).set('access_token', TOKEN || '');
  const res = await fetch(url, method === 'GET' ? undefined : { method: 'POST', body });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`non-JSON from ${path}: ${text.slice(0, 120)}`); }
  if (j.error) throw new Error(`${j.error.error_user_msg || j.error.message} (code ${j.error.code})`);
  return j;
}
const get = (p, q) => graph(p, q, 'GET');
const post = (p, q) => graph(p, q, 'POST');

async function run(c) {
  const ev = brand.events[c.key];
  if (!ev) { console.log(`  !!  ${c.key}: not in brand.json`); return { failed: 1, changed: 0 }; }

  const rows = ladder(ev.date, c.runwayStart);
  console.log(`\n${c.name}  (${c.key}, event ${ev.date}, total $${c.total})`);
  console.log('  ' + 'PHASE'.padEnd(9) + 'WINDOW'.padEnd(26) + 'DAYS'.padStart(5) + 'SHARE'.padStart(7) + 'DAILY'.padStart(9));
  let todayRow = null;
  for (const r of rows) {
    const raw = Math.round((c.total * r.share * 100) / r.days);
    const daily = Math.max(raw, META_MIN_DAILY_CENTS);
    const isNow = TODAY >= r.from && TODAY <= r.to;
    if (isNow) todayRow = { ...r, daily };
    const floored = daily !== raw ? `  (ladder says ${money(raw)}; Meta's floor is ${money(META_MIN_DAILY_CENTS)})` : '';
    console.log(`  ${r.key.padEnd(9)}${`${r.from} .. ${r.to}`.padEnd(26)}${String(r.days).padStart(5)}${`${(r.share * 100).toFixed(0)}%`.padStart(7)}${money(daily).padStart(9)}${isNow ? '   <- today' : ''}${floored}`);
  }

  if (!todayRow) {
    // Two different reasons, and conflating them sends someone hunting a bug
    // that is not there. `step` (T-15, the early-bird inflection) carries a 0%
    // share, so it is a real gap day INSIDE the run where the budget simply
    // holds at the previous rate.
    const inside = TODAY >= rows[0].from && TODAY <= ev.date;
    console.log(inside
      ? `  SKIP  ${TODAY} falls between phases (the T-15 step day carries no spend share). Budget holds.`
      : `  SKIP  ${TODAY} is outside the run (${rows[0].from} .. ${ev.date}). Nothing to set.`);
    return { failed: 0, changed: 0 };
  }

  let live;
  try {
    live = await get(c.campaign, { fields: 'name,status,effective_status,daily_budget,stop_time' });
  } catch (e) { console.log(`  !!  read failed: ${e.message}`); return { failed: 1, changed: 0 }; }

  if (!live.daily_budget) {
    console.log('  !!  no campaign-level daily_budget -- this campaign is not CBO. Refusing.');
    return { failed: 1, changed: 0 };
  }

  const from = Number(live.daily_budget);
  const to = todayRow.daily;
  console.log(`\n  live    ${live.name}  ${live.status}/${live.effective_status}  ${money(from)}/day`);

  if (from === to) {
    console.log(`  SKIP    already at the ${todayRow.key} rate ${money(to)}/day`);
    return { failed: 0, changed: 0 };
  }

  if (to > MAX_DAILY_CENTS) {
    console.log(`  !!      ${money(to)}/day is over the ceiling --max-daily=${money(MAX_DAILY_CENTS)}.`);
    console.log(`          Refusing. A total of $${c.total} over these windows should not produce that;`);
    console.log('          check the total, the runway start and the event date before forcing it.');
    return { failed: 1, changed: 0 };
  }
  const jump = Math.max(to / from, from / to);
  if (jump > MAX_JUMP) {
    console.log(`  !!      ${money(from)} -> ${money(to)} is a ${jump.toFixed(1)}x move, over --max-jump=${MAX_JUMP}.`);
    return { failed: 1, changed: 0 };
  }

  console.log(`  PLAN    ${money(from)}/day -> ${money(to)}/day   (${todayRow.key})`);
  if (!EXECUTE) return { failed: 0, changed: 0 };

  try {
    await post(c.campaign, { daily_budget: String(to) });
  } catch (e) { console.log(`  !!      write failed: ${e.message}`); return { failed: 1, changed: 0 }; }

  const after = await get(c.campaign, { fields: 'daily_budget,status,effective_status' });
  const ok = String(after.daily_budget) === String(to);
  console.log(`  ${ok ? 'OK  ' : '!!  '}    now ${money(after.daily_budget)}/day, ${after.status}/${after.effective_status}`);
  return { failed: ok ? 0 : 1, changed: ok ? 1 : 0 };
}

async function main() {
  console.log(`budget ladder  ${TODAY}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);
  if (!TOKEN) { console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.'); process.exit(2); }

  const want = String(arg('event', '')).toUpperCase();
  const targets = ALL ? CAMPAIGNS : CAMPAIGNS.filter((c) => c.key === want);
  if (!targets.length) {
    console.error(`\n  x pass --event=<KEY> or --all. Known: ${CAMPAIGNS.map((c) => c.key).join(', ')}`);
    process.exit(2);
  }

  let failed = 0; let changed = 0;
  for (const c of targets) { const r = await run(c); failed += r.failed; changed += r.changed; }

  console.log(`\n  ${changed} changed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute.');
}

main().catch((e) => { console.error(`\n  x ${e.message}`); process.exitCode = 1; });
