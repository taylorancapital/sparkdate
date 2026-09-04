#!/usr/bin/env node
/**
 * scripts/meta-pause-stale.js
 *
 * The two fixes that need no statistics and no judgement call.
 *
 * 1. FIVE CAMPAIGNS READ ACTIVE AND ARE NOT RUNNING. Their stop_time passed
 *    (Tellus 2026-08-26, Good Good 2026-08-31). Ads Manager shows them green,
 *    which is why the account looks broken rather than finished, and why daily
 *    spend halved on 09-01 with no explanation.
 *
 *    They are set to PAUSED, not ARCHIVED. Archiving is a one-way door in Meta;
 *    pausing gets the same readability and can be undone.
 *
 * 2. ONE AD ADVERTISES A PRICE THAT EXPIRED ELEVEN DAYS AGO. "MC All Genders -
 *    Video Ad (Traffic)" carries link_description "$18.99 thru Aug 24" while
 *    checkout charges $27.49 -- 45% more than the ad promises.
 *
 *    It is PAUSED rather than corrected, because AdCreative is immutable apart
 *    from name and status: fixing the text means a new creative, which means a
 *    new dark post, which at T-4 costs the running ad's engagement and forces
 *    re-review for no gain. Its ad set is also the 59%-male one, and it is only
 *    $12.92 of spend. Pausing is the whole fix.
 *
 * SAFETY
 *
 * Dry run is the DEFAULT, as in meta-restore-traffic.js and meta-attach-pixel.js.
 * Dry run GETs live state and prints the plan; it never POSTs. Every write is
 * read back and compared. Ids are hardcoded, never name-matched. Re-running is
 * safe -- anything already in the target state prints SKIP.
 *
 * This script only ever moves things TOWARD paused. It cannot start spend.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *
 * Usage:
 *   node scripts/meta-pause-stale.js              # DRY RUN
 *   node scripts/meta-pause-stale.js --execute
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';
const EXECUTE = process.argv.includes('--execute');

const ENDED_CAMPAIGNS = [
  { id: '120250830674710542', name: 'Tellus | Sales-Obj-Women', ended: '2026-08-26' },
  { id: '120250817923770542', name: 'Tellus | All Genders', ended: '2026-08-26' },
  { id: '120250717389000542', name: 'Tellus | Retargeting', ended: '2026-08-26' },
  { id: '120250838307080542', name: 'Good Good | Retargeting', ended: '2026-08-31' },
  { id: '120250622050150542', name: 'Good Good | Traffic', ended: '2026-08-31' },
];

const STALE_ADS = [
  { id: '120251072514020542', name: 'MC All Genders - Video Ad (Traffic)', why: 'advertises "$18.99 thru Aug 24"; checkout charges $27.49' },
];

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
  try { j = JSON.parse(text); } catch { throw new Error(`non-JSON from ${path}: ${text.slice(0, 100)}`); }
  if (j.error) throw new Error(`${j.error.error_user_msg || j.error.message} (code ${j.error.code})`);
  return j;
}
const get = (p, q) => graph(p, q, 'GET');
const post = (p, q) => graph(p, q, 'POST');

async function pause(kind, item, fields) {
  let live;
  try {
    live = await get(item.id, { fields });
  } catch (e) {
    console.log(`  !!  ${item.name.padEnd(36)} read failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }
  if (live.status === 'PAUSED' || live.status === 'ARCHIVED') {
    console.log(`  SKIP ${item.name.padEnd(36)} already ${live.status}`);
    return { changed: 0, failed: 0 };
  }
  const tail = kind === 'campaign' ? `ended ${item.ended}` : item.why;
  console.log(`  PLAN ${item.name.padEnd(36)} ${live.status} -> PAUSED   (${tail})`);
  if (!EXECUTE) return { changed: 0, failed: 0 };

  try {
    await post(item.id, { status: 'PAUSED' });
  } catch (e) {
    console.log(`  !!  ${item.name.padEnd(36)} write failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }
  const after = await get(item.id, { fields: 'status,effective_status' });
  if (after.status === 'PAUSED') {
    console.log(`  OK   ${item.name.padEnd(36)} ${after.status} / ${after.effective_status}`);
    return { changed: 1, failed: 0 };
  }
  console.log(`  !!  ${item.name.padEnd(36)} read-back says ${after.status}`);
  return { changed: 0, failed: 1 };
}

async function main() {
  console.log(`${ACCOUNT}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);
  if (!TOKEN) {
    console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.');
    process.exit(2);
  }

  let changed = 0;
  let failed = 0;

  console.log('\nENDED BUT STILL READING ACTIVE');
  for (const c of ENDED_CAMPAIGNS) {
    const r = await pause('campaign', c, 'name,status,effective_status,stop_time');
    changed += r.changed; failed += r.failed;
  }

  console.log('\nADVERTISING A DEAD PRICE');
  for (const a of STALE_ADS) {
    const r = await pause('ad', a, 'name,status,effective_status');
    changed += r.changed; failed += r.failed;
  }

  console.log(`\n  ${changed} paused, ${failed} failed`);
  if (failed) process.exitCode = 1;
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute.');
}

main().catch((e) => {
  console.error(`\n  x ${e.message}`);
  process.exitCode = 1;
});
