#!/usr/bin/env node
/**
 * scripts/meta-budget-ladder.js
 *
 * Sets EVERY registered campaign's daily budget to whatever its budget ladder
 * says it should be TODAY, and is safe to run every day. Runs unattended at
 * 03:00 as the `SparkDate Budget Ladder` scheduled task (`--all --execute`).
 *
 * WHY THIS EXISTS
 *
 * Taylor, 2026-09-05: "keep the budget ladder convention which I could have
 * sworn was automatic." It was not. No script in the repo set a budget on a
 * schedule -- scripts/build-paid-campaign.js PRINTS the ladder and says so
 * outright, "Meta has no 'raise this on that date' -- every row below is a
 * manual edit." Every step was a diary entry nobody was keeping, and the
 * Loxleys campaign sat at the prime rate at T-17 because of it.
 *
 * WHAT CHANGED 2026-09-06 -- IT IS NO LONGER ONE CAMPAIGN
 *
 * The first version held its campaign list as a hardcoded array with Loxleys
 * in it. Taylor: several campaigns will run at once, starting with Tellus on
 * Oct 6, and reports/OCTOBER_SLATE_FEASIBILITY_2026-09-03.md has four Lancaster
 * events inside seven weeks. A hardcoded array fails that in the worst
 * available way -- a campaign missing from it is not an error, it is SILENCE.
 *
 * So:
 *   - the campaign list moved to content/paid-campaigns.json (data, not code);
 *   - the arithmetic moved to scripts/budget-ladder.js, which has no network in
 *     it and is tested offline by tests/budget-ladder.test.js;
 *   - the account is READ BACK and any ACTIVE campaign in neither the registry
 *     nor its `acknowledged` list is reported as UNGOVERNED with a non-zero
 *     exit, so the silence is now a noise;
 *   - one account-wide daily ceiling covers all of them at once, because four
 *     individually-sane ladders are the thing nobody was watching.
 *
 * THE LADDER IS DERIVED, NEVER TYPED
 *
 * Phases and shares come from content/brand.json paid_template, event dates
 * from brand.json events[KEY].date. Only the campaign id, the run total and
 * the runway start live in the registry, because those are the only facts
 * brand.json does not hold.
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
 *   - a registry entry naming an event brand.json does not have
 *   - a campaign that is not CBO (no campaign-level daily_budget to set)
 *   - a computed rate over the per-campaign ceiling (default $25.00)
 *   - an ACCOUNT-WIDE total over the ceiling (default $40.00) -- and that one
 *     refuses the WHOLE run, because half a ladder is worse than none
 *
 * It does NOT unpause anything. A paused campaign stays paused with a corrected
 * budget, so this can never start spend on its own.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for anything that touches the API
 *   META_AD_ACCOUNT_ID     optional, defaults to the SparkDate account
 *
 * Usage:
 *   node scripts/meta-budget-ladder.js --all                 # DRY RUN, every campaign
 *   node scripts/meta-budget-ladder.js --all --execute       # what the 03:00 task runs
 *   node scripts/meta-budget-ladder.js --event=LX
 *   node scripts/meta-budget-ladder.js --forecast=45         # offline, no token needed
 *   node scripts/meta-budget-ladder.js --check               # validate + audit, no writes
 *   node scripts/meta-budget-ladder.js --all --today=2026-10-01
 *   node scripts/meta-budget-ladder.js --registry=/tmp/october.json --forecast=60
 *                                                           # price a slate before committing to it
 */

'use strict';

const fs = require('node:fs');
const nodePath = require('node:path');

const brand = require('../content/brand.json');
const L = require('./budget-ladder.js');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (hit === undefined) return d;
  if (!hit.includes('=')) return true;
  return hit.split('=').slice(1).join('=');
};
// A candidate registry can be dry-run without touching the live one, which is
// how you price an October slate before committing to it:
//   node scripts/meta-budget-ladder.js --registry=/tmp/october.json --forecast=60
const REGISTRY_FILE = arg('registry', false);
// eslint-disable-next-line import/no-dynamic-require, global-require
const registry = REGISTRY_FILE
  ? require(nodePath.resolve(process.cwd(), String(REGISTRY_FILE)))
  : require('../content/paid-campaigns.json');

const EXECUTE = process.argv.includes('--execute');
const ALL = process.argv.includes('--all');
const CHECK = process.argv.includes('--check');
const FORECAST = arg('forecast', false);
const TODAY = String(arg('today', new Date().toISOString().slice(0, 10)));

const g = registry.guards || {};
const MAX_DAILY_CENTS = Number(arg('max-daily', (g.max_daily_dollars || 25) * 100));
const MAX_ACCOUNT_CENTS = Number(arg('max-account-daily', (g.max_account_daily_dollars || 40) * 100));
// Kept for the rare manual correction, off by default: the ladder's own
// prime -> convert step is 4.5x, so any jump guard tight enough to catch a typo
// also blocks the real steps.
const MAX_JUMP = Number(arg('max-jump', Infinity));

const { money } = L;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

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

/** Print one campaign's whole ladder, marking today. */
function printLadder(entry, plan) {
  const ev = brand.events[entry.event];
  const share = entry.share === undefined ? 1 : entry.share;
  const shareNote = share === 1 ? '' : `, ${(share * 100).toFixed(0)}% of the run`;
  console.log(`\n${entry.name}  (${entry.event}, event ${ev.date}, total $${entry.total}${shareNote})`);
  console.log(`  ${pad('PHASE', 9)}${pad('WINDOW', 26)}${rpad('DAYS', 5)}${rpad('SHARE', 7)}${rpad('DAILY', 9)}`);
  for (const r of plan.rows) {
    const { raw, cents, floored } = L.rowRate(r, entry.total, share);
    const isNow = TODAY >= r.from && TODAY <= r.to;
    const note = floored ? `  (ladder says ${money(raw)}; Meta's floor is ${money(cents)})` : '';
    console.log(`  ${pad(r.key, 9)}${pad(`${r.from} .. ${r.to}`, 26)}${rpad(r.days, 5)}${rpad(`${(r.share * 100).toFixed(0)}%`, 7)}${rpad(money(cents), 9)}${isNow ? '   <- today' : ''}${note}`);
  }
}

/**
 * Decide what one campaign needs, WITHOUT writing. Returns an action so the
 * account-wide ceiling can be checked across every campaign before any of them
 * is touched -- half a ladder is worse than none.
 */
async function planOne(entry, known) {
  const plan = L.rateFor(entry, TODAY, brand);
  if (plan.state === 'unknown-event') {
    console.log(`\n  !!  ${entry.name}: ${plan.reason}`);
    return { entry, verdict: 'fail' };
  }

  printLadder(entry, plan);

  let live = known;
  if (!live) {
    try {
      live = await get(entry.campaign_id, { fields: 'name,status,effective_status,daily_budget,stop_time' });
    } catch (e) {
      console.log(`  !!  read failed: ${e.message}`);
      return { entry, verdict: 'fail' };
    }
  }
  const liveCents = live.daily_budget ? Number(live.daily_budget) : 0;
  console.log(`\n  live    ${live.name}  ${live.status}/${live.effective_status}  ${live.daily_budget ? `${money(liveCents)}/day` : 'no campaign-level budget'}`);

  if (plan.state !== 'set') {
    // A held budget still SPENDS, so it counts toward the account ceiling.
    console.log(`  SKIP    ${plan.reason}`);
    return { entry, verdict: 'skip', holdCents: live.status === 'ACTIVE' ? liveCents : 0 };
  }

  if (!live.daily_budget) {
    console.log('  !!      no campaign-level daily_budget -- this campaign is not CBO. Refusing.');
    return { entry, verdict: 'fail' };
  }
  if (live.stop_time && live.stop_time.slice(0, 10) < TODAY) {
    console.log(`  !!      campaign stop_time ${live.stop_time.slice(0, 10)} is in the past -- it is not delivering. Refusing.`);
    return { entry, verdict: 'fail' };
  }

  if (liveCents === plan.cents) {
    console.log(`  SKIP    already at the ${plan.phase} rate ${money(plan.cents)}/day`);
    return { entry, verdict: 'skip', holdCents: plan.cents };
  }
  if (plan.cents > MAX_DAILY_CENTS) {
    console.log(`  !!      ${money(plan.cents)}/day is over the per-campaign ceiling ${money(MAX_DAILY_CENTS)}.`);
    console.log(`          Refusing. A total of $${entry.total} over these windows should not produce that;`);
    console.log('          check the total, the runway start and the event date before forcing it.');
    return { entry, verdict: 'fail' };
  }
  const jump = Math.max(plan.cents / liveCents, liveCents / plan.cents);
  if (jump > MAX_JUMP) {
    console.log(`  !!      ${money(liveCents)} -> ${money(plan.cents)} is a ${jump.toFixed(1)}x move, over --max-jump=${MAX_JUMP}.`);
    return { entry, verdict: 'fail' };
  }

  console.log(`  PLAN    ${money(liveCents)}/day -> ${money(plan.cents)}/day   (${plan.phase})`);
  return { entry, verdict: 'change', from: liveCents, to: plan.cents, phase: plan.phase, holdCents: plan.cents };
}

async function applyOne(action) {
  try {
    await post(action.entry.campaign_id, { daily_budget: String(action.to) });
  } catch (e) {
    console.log(`  !!  ${action.entry.name}: write failed: ${e.message}`);
    return false;
  }
  const after = await get(action.entry.campaign_id, { fields: 'daily_budget,status,effective_status' });
  const ok = String(after.daily_budget) === String(action.to);
  console.log(`  ${ok ? 'OK  ' : '!!  '}${action.entry.name}: now ${money(after.daily_budget)}/day, ${after.status}/${after.effective_status}`);
  return ok;
}

/**
 * The whole account in one call. Used for three things at once: reading each
 * managed campaign's current budget, totalling what the account spends today,
 * and finding campaigns the registry has never heard of.
 */
async function fetchAccount() {
  const j = await get(`${ACCOUNT}/campaigns`, {
    fields: 'id,name,status,effective_status,objective,daily_budget,stop_time',
    limit: '200',
  });
  return j.data || [];
}

function printAudit(audit) {
  if (audit.acknowledged.length) {
    console.log('\n  outside the ladder ON PURPOSE:');
    for (const c of audit.acknowledged) {
      console.log(`    -  ${c.name}  ${c.daily_budget ? money(c.daily_budget) : '-'}/day  ${c.why}`);
    }
  }
  if (audit.stale.length) {
    console.log('\n  ACKNOWLEDGEMENTS THAT HAVE EXPIRED -- decide again:');
    for (const c of audit.stale) {
      console.log(`    -  ${c.name}: "${c.why}"  (review_after ${c.review_after}, and it is still ACTIVE)`);
    }
  }
  if (audit.ungoverned.length) {
    console.log('\n  !! UNGOVERNED -- ACTIVE and in neither list in content/paid-campaigns.json:');
    for (const c of audit.ungoverned) {
      console.log(`    -  ${c.id}  ${c.name}  ${c.daily_budget ? money(c.daily_budget) : 'no CBO budget'}/day  ${c.objective}`);
    }
    console.log('     This campaign is spending on a budget no schedule moves. Either add it to');
    console.log('     `campaigns` so the ladder drives it, or to `acknowledged` with a reason and');
    console.log('     a review_after date saying it is deliberate.');
  }
}

/**
 * One line per executed run, appended forever.
 *
 * The 03:00 task writes its output nowhere, so a ladder that quietly started
 * refusing would look exactly like a ladder with nothing to do. This is also
 * the only place that will ever answer "why was Loxleys at $9.00 on the 12th?"
 * six weeks after the fact. Gitignored (logs/), best-effort, never fatal.
 */
function logRun(line) {
  try {
    const dir = nodePath.join(__dirname, '..', 'Business Plan', 'files', 'Night Tasks', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(nodePath.join(dir, 'budget-ladder.log'), `${line}\n`);
  } catch { /* a missing log must never stop a budget from being correct */ }
}

function printForecast(days) {
  const rows = L.forecast(TODAY, days, registry, brand);
  console.log(`\naccount ladder forecast, ${TODAY} + ${days} days  (ceiling ${money(MAX_ACCOUNT_CENTS)}/day)\n`);
  console.log(`  ${pad('DATE', 12)}${rpad('TOTAL', 8)}   LIVE`);
  let peak = 0; let peakDay = '';
  for (const r of rows) {
    if (r.total > peak) { peak = r.total; peakDay = r.date; }
    const live = r.live.map((x) => `${x.event}:${x.phase} ${money(x.cents)}`).join('  ') || '-';
    const over = r.total > MAX_ACCOUNT_CENTS ? '  !! over ceiling' : '';
    console.log(`  ${pad(r.date, 12)}${rpad(money(r.total), 8)}   ${live}${over}`);
  }
  console.log(`\n  peak ${money(peak)}/day on ${peakDay}. Sum over the window: ${money(rows.reduce((s, r) => s + r.total, 0))}.`);
  if (rows.every((r) => r.total === 0)) {
    console.log('  Every day is zero -- no registered campaign is in its run window over this range.');
  }
}

async function main() {
  if (REGISTRY_FILE && EXECUTE) {
    console.error('\n  x --registry is for modelling a slate that does not exist yet, so it refuses');
    console.error('    --execute. Put the entry in content/paid-campaigns.json before spending against it.');
    process.exit(2);
  }

  const { errors, warnings } = L.validate(registry, brand);
  for (const w of warnings) console.log(`  warn  ${w}`);
  if (errors.length) {
    console.error('\n  x content/paid-campaigns.json does not describe a runnable ladder:');
    for (const e of errors) console.error(`      - ${e}`);
    process.exit(2);
  }

  if (FORECAST !== false) {
    printForecast(Number(FORECAST === true ? 30 : FORECAST));
    return;
  }

  console.log(`budget ladder  ${TODAY}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);
  if (!TOKEN) { console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.'); process.exit(2); }

  const managed = registry.campaigns.filter((c) => c.managed !== false);
  const want = String(arg('event', '')).toUpperCase();
  const targets = (ALL || CHECK) ? managed : managed.filter((c) => c.event === want);
  if (!targets.length && !CHECK) {
    console.error(`\n  x pass --event=<KEY>, --all, --check or --forecast. Registered: ${managed.map((c) => c.event).join(', ') || '(none)'}`);
    process.exit(2);
  }

  // One read of the whole account, before anything is planned. The ceiling has
  // to see the campaigns the ladder does NOT drive -- Marion Court's hand-set
  // $14/day is spending whether or not this script knows about it, and a
  // ceiling that only sees its own half is a false comfort.
  let account = null;
  let failed = 0;
  try {
    account = await fetchAccount();
  } catch (e) {
    console.log(`\n  warn  could not read the account's campaign list (${e.message}).`);
    console.log('        Falling back to per-campaign reads; the daily ceiling will cover only');
    console.log('        the registered campaigns, and the ungoverned audit cannot run.');
  }
  const byId = new Map((account || []).map((c) => [String(c.id), c]));

  const actions = [];
  for (const c of targets) actions.push(await planOne(c, byId.get(String(c.campaign_id))));

  const audit = account ? L.ungoverned(account.filter((c) => c.effective_status === 'ACTIVE'), TODAY, registry) : null;
  const ackCents = audit ? audit.acknowledged.reduce((s, c) => s + Number(c.daily_budget || 0), 0) : 0;
  const managedCents = actions.reduce((s, a) => s + (a.holdCents || 0), 0);
  const accountCents = managedCents + ackCents;
  const changing = actions.filter((a) => a.verdict === 'change');
  failed += actions.filter((a) => a.verdict === 'fail').length;
  let changed = 0;

  if (targets.length) {
    const ack = ackCents ? ` + ${money(ackCents)} outside the ladder` : '';
    console.log(`\n  account  ${money(accountCents)}/day  (${money(managedCents)} laddered${ack};  ceiling ${money(MAX_ACCOUNT_CENTS)})`);
  }

  if (accountCents > MAX_ACCOUNT_CENTS) {
    console.log('\n  !!  REFUSING THE WHOLE RUN. Today\'s ladder puts the account over its daily ceiling.');
    console.log(`      ${money(accountCents)} > ${money(MAX_ACCOUNT_CENTS)}. Nothing was written -- half a ladder is worse than none.`);
    console.log('      Either the run totals are too big for this many concurrent events, a date is');
    console.log('      wrong, or a campaign outside the ladder is spending more than anyone assumed.');
    console.log('      `--forecast=45` shows which days overlap. Raise guards.max_account_daily_dollars');
    console.log('      in content/paid-campaigns.json only once the number is a decision, not a surprise.');
    failed += 1;
  } else if (EXECUTE && changing.length) {
    console.log('');
    for (const a of changing) {
      if (await applyOne(a)) changed += 1; else failed += 1;
    }
  }

  // The audit prints LAST and does not gate the ladder: a campaign nobody
  // registered is not a reason to skip the ones somebody did. It only moves
  // the exit code, which is what the scheduled task records.
  let ungovernedCount = 0;
  if (audit) {
    printAudit(audit);
    ungovernedCount = audit.ungoverned.length;
  } else if (ALL || CHECK) {
    failed += 1;
  }

  console.log(`\n  ${changed} changed, ${failed} failed, ${ungovernedCount} ungoverned`);
  if (EXECUTE) {
    const moves = changing.map((a) => `${a.entry.event}:${a.phase} ${money(a.from)}->${money(a.to)}`).join(' ') || 'no change';
    logRun(`${new Date().toISOString()}  ${TODAY}  account ${money(accountCents)}  ${moves}  `
      + `[${changed} changed, ${failed} failed, ${ungovernedCount} ungoverned]`);
  }
  if (failed || ungovernedCount) process.exitCode = 1;
  if (!EXECUTE && !CHECK) console.log('\nDry run. Re-run with --execute.');
}

main().catch((e) => { console.error(`\n  x ${e.message}`); process.exitCode = 1; });
