#!/usr/bin/env node
/**
 * scripts/meta-lx-switch-to-sales.js
 *
 * The switch: pause "Loxleys | Traffic", start "Loxleys | Sales", and hand the
 * budget ladder over to the new campaign.
 *
 * WHY BOTH, IN ONE SCRIPT
 *
 * Both campaigns target the same people in the same three cities. Run together
 * they bid against each other -- brand.json's _ad_set_note names that as the
 * account's existing bug. So this is one atomic-ish intent: the old one stops,
 * the new one starts, and LX never has two campaigns chasing one audience.
 *
 * WHAT THE LADDER SAYS, AND THE ONE PLACE THIS DEPARTS FROM IT
 *
 * scripts/build-paid-campaign.js --event=LX --budget=180 computes:
 *
 *     prime    ..2026-09-06     $1.80/day    15% of budget
 *     step       2026-09-07     early bird ends, $24.99 -> $29.99
 *     convert  09-08..09-14     $9.00/day    35%
 *     close    09-15..09-21    $11.57/day    45%
 *     day_of     2026-09-22     $9.00/day     5%
 *
 * This script starts the SALES campaign at the CONVERT rate ($9.00/day) three
 * days early rather than at the prime rate, and that is a deliberate departure.
 *
 * The prime rate exists for a TRAFFIC campaign whose job in that window is cheap
 * reach that builds a retargeting pool. A conversion campaign's job in the same
 * window is different: accumulate enough optimisation events to leave Meta's
 * learning phase. At $1.80/day it would not, and it would enter the 73%-of-sales
 * window still learning. The account has SIX lifetime pixel purchases against the
 * ~50/week Meta wants, so learning volume is the binding constraint, not reach.
 *
 * The TOTAL is unchanged. $9.00 x 3 (09-05..09-07) + $9.00 x 7 + $11.57 x 7 +
 * $9.00 = $180.00 -- the same $180 the ladder plans, with the prime days moved
 * up to the convert rate. And pausing Traffic frees $3.00/day x 17 = $51.00, so
 * total Loxleys spend over the remaining run goes DOWN, not up.
 *
 * METAS LADDER IS MANUAL. build-paid-campaign.js says it plainly: "Meta has no
 * 'raise this on that date' -- every row below is a manual edit." This script
 * sets today's rate and PRINTS the remaining steps with weekdays. Nothing
 * automates them; they are diary entries.
 *
 * SAFETY
 *
 * Dry run is the DEFAULT. It GETs live state and prints the plan; it never
 * POSTs. Every write is read back and compared. Ids are hardcoded, never
 * name-matched. Re-running is safe -- anything already in the target state
 * prints SKIP.
 *
 * The order is deliberate: PAUSE FIRST, then start. If the second half fails,
 * the account is left spending nothing rather than spending twice.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *
 * Usage:
 *   node scripts/meta-lx-switch-to-sales.js              # DRY RUN
 *   node scripts/meta-lx-switch-to-sales.js --execute
 *   node scripts/meta-lx-switch-to-sales.js --daily=180  # cents/day override
 */

'use strict';

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
const EXECUTE = process.argv.includes('--execute');
const DAILY_CENTS = Number(arg('daily', 900));

const TRAFFIC_CAMPAIGN = '120251085229290542'; // Loxleys | Traffic
const SALES_CAMPAIGN = '120251304238920542';   // Loxleys | Sales
const SALES_ADSETS = [
  { id: '120251304239050542', name: 'Loxleys | female | Sales' },
  { id: '120251304239850542', name: 'Loxleys | male | Sales' },
];
const SALES_ADS = [
  { id: '120251304239660542', name: 'Loxleys | female | convert video' },
  { id: '120251304240220542', name: 'Loxleys | male | convert video' },
];

const LADDER = [
  { when: '2026-09-08', label: 'convert', daily: 900 },
  { when: '2026-09-15', label: 'close', daily: 1157 },
  { when: '2026-09-22', label: 'day_of + RETIRE', daily: 900 },
];

const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;
const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

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
  if (j.error) throw new Error(`${j.error.error_user_msg || j.error.message} (code ${j.error.code}${j.error.error_subcode ? `/${j.error.error_subcode}` : ''})`);
  return j;
}
const get = (p, q) => graph(p, q, 'GET');
const post = (p, q) => graph(p, q, 'POST');

async function setStatus(id, label, want, extra = {}) {
  // Ads and ad sets under a CBO campaign have no daily_budget field at all, and
  // asking for it is a hard error (#100 "Tried accessing nonexisting field"),
  // not a null. Only request it where a budget is actually being set.
  const fields = extra.daily_budget
    ? 'name,status,effective_status,daily_budget'
    : 'name,status,effective_status';
  let live;
  try {
    live = await get(id, { fields });
  } catch (e) {
    console.log(`  !!   ${label.padEnd(34)} read failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }
  const budgetNeeded = extra.daily_budget && String(live.daily_budget) !== String(extra.daily_budget);
  if (live.status === want && !budgetNeeded) {
    console.log(`  SKIP ${label.padEnd(34)} already ${want}${live.daily_budget ? ` at ${money(live.daily_budget)}/day` : ''}`);
    return { changed: 0, failed: 0 };
  }
  const bits = [];
  if (live.status !== want) bits.push(`${live.status} -> ${want}`);
  if (budgetNeeded) bits.push(`${money(live.daily_budget)}/day -> ${money(extra.daily_budget)}/day`);
  console.log(`  PLAN ${label.padEnd(34)} ${bits.join(', ')}`);
  if (!EXECUTE) return { changed: 0, failed: 0 };

  try {
    await post(id, Object.assign({ status: want }, extra));
  } catch (e) {
    console.log(`  !!   ${label.padEnd(34)} write failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }
  const after = await get(id, { fields: extra.daily_budget ? 'status,effective_status,daily_budget' : 'status,effective_status' });
  const ok = after.status === want && (!extra.daily_budget || String(after.daily_budget) === String(extra.daily_budget));
  console.log(`  ${ok ? 'OK  ' : '!!  '} ${label.padEnd(34)} ${after.status}/${after.effective_status}${after.daily_budget ? ` at ${money(after.daily_budget)}/day` : ''}`);
  return { changed: ok ? 1 : 0, failed: ok ? 0 : 1 };
}

async function main() {
  console.log(`${ACCOUNT}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);
  if (!TOKEN) { console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.'); process.exit(2); }

  let changed = 0; let failed = 0;
  const tally = (r) => { changed += r.changed; failed += r.failed; };

  // 1. STOP the old one first. If anything below fails, LX spends nothing
  //    rather than spending twice into the same auction.
  console.log('\n1. PAUSE THE TRAFFIC CAMPAIGN');
  tally(await setStatus(TRAFFIC_CAMPAIGN, 'Loxleys | Traffic', 'PAUSED'));
  if (failed) {
    console.log('\n  x pausing failed -- NOT starting the sales campaign. Both would have run together.');
    process.exitCode = 1;
    return;
  }

  // 2. Budget on the campaign (CBO), then the children, then the ads.
  console.log('\n2. START THE SALES CAMPAIGN');
  tally(await setStatus(SALES_CAMPAIGN, 'Loxleys | Sales', 'ACTIVE', { daily_budget: String(DAILY_CENTS) }));
  for (const s of SALES_ADSETS) tally(await setStatus(s.id, s.name, 'ACTIVE'));
  for (const a of SALES_ADS) tally(await setStatus(a.id, a.name, 'ACTIVE'));

  console.log(`\n  ${changed} changed, ${failed} failed`);
  if (failed) process.exitCode = 1;

  if (!EXECUTE) { console.log('\nDry run. Re-run with --execute.'); return; }

  console.log('\nBUDGET LADDER -- every row is a MANUAL edit, Meta cannot schedule these');
  console.log('');
  console.log('  ' + 'WHEN'.padEnd(17) + ' ' + 'PHASE'.padEnd(16) + ' ' + 'DAILY'.padStart(7));
  console.log(`  ${dayName('2026-09-05').padEnd(17)} ${'convert (early)'.padEnd(16)} ${money(DAILY_CENTS).padStart(7)}   <- set now`);
  console.log(`  ${dayName('2026-09-07').padEnd(17)} early bird ends -- $24.99 becomes $29.99`);
  for (const l of LADDER) {
    console.log(`  ${dayName(l.when).padEnd(17)} ${l.label.padEnd(16)} ${money(l.daily).padStart(7)}`);
  }
  console.log('');
  console.log('  Total across the remaining run is $180.00 -- unchanged from the ladder.');
  console.log('  Pausing Traffic frees $3.00/day x 17 = $51.00, so LX spends LESS overall.');

  console.log('\nNEXT, by hand:');
  console.log('  - The two ads enter review. Delivery starts when Meta approves them.');
  console.log('  - Watch that gender holds: the female ad set must stay 100% female.');
  console.log('      npm run ads:review');
  console.log('  - Raise the budget on Tue 15 Sep to $11.57/day. Nothing will remind you.');
  console.log('  - Score it after 2026-09-22 against Marion Court, which stayed on Traffic.');
}

main().catch((e) => { console.error(`\n  x ${e.message}`); process.exitCode = 1; });
