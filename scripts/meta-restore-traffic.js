#!/usr/bin/env node
/**
 * scripts/meta-restore-traffic.js
 *
 * Two operations, both aimed at getting cost per click back to what this
 * account was paying before 2026-08-13.
 *
 *   GOOD GOOD   revive the dormant Traffic campaign, and pause the two
 *               conversion campaigns selling the same event so they stop
 *               bidding against it.
 *   MARION COURT build a Traffic campaign, because unlike Good Good it has
 *               no dormant one to revive -- it launched 2026-08-17, after
 *               the account had already switched.
 *
 * WHY
 *
 * On 2026-08-13 the account moved from link-click Traffic campaigns to
 * conversion optimisation and switched the old Traffic campaign off eight
 * minutes later. Fourteen-day numbers, same markets, same events:
 *
 *   OUTCOME_TRAFFIC / LINK_CLICKS         $49 -> 307 clicks   $0.13-$0.19
 *   OUTCOME_SALES / OFFSITE_CONVERSIONS  $368 -> 575 clicks   $0.33-$1.45
 *
 * That $368 buys roughly 2,300 clicks at the Traffic rate. Marion Court is
 * the worst of it: $59 for 50 clicks in two weeks, at $1.29 and $1.45.
 *
 * Conversion optimisation needs a steady conversion signal. At ~4 purchases a
 * week across nine ad sets there is not enough for Meta to find buyers, so it
 * charges the premium and delivers nothing extra.
 *
 * WHY REVIVE RATHER THAN REBUILD
 *
 * The optimisation goal cannot be changed on a published ad set (Meta refuses
 * the goal change without an attribution window change, and refuses the
 * attribution window change outright), and a new ad set cannot join a
 * campaign-budget campaign whose existing ad set has a different goal. Both
 * dead ends. The Good Good Traffic campaign, however, was only ever PAUSED --
 * its ad set is still ACTIVE and its creative still points at the right event
 * with correct UTMs. Two status flips restore a configuration that ran for a
 * week at $0.13 a click.
 *
 * SHAPE OF THE NEW MARION COURT CAMPAIGN
 *
 * Copied from the Good Good Traffic campaign rather than invented:
 * OUTCOME_TRAFFIC, LINK_CLICKS, IMPRESSIONS billing,
 * LOWEST_COST_WITHOUT_CAP, attribution (1, 0). Targeting, ages, genders and
 * end times come from the two live Marion Court ad sets, and the ads reuse
 * their existing creative_ids so they keep the same Page posts.
 *
 * It uses CAMPAIGN budget optimisation with both ad sets inside one campaign
 * -- the structure Taylor chose, so female targeting survives for gender
 * balance while Meta allocates between the pair instead of leaving them to
 * bid against each other in separate auctions. Both ad sets share
 * LINK_CLICKS, which is what CBO requires.
 *
 * SAFETY
 *
 *   - Dry run by default; --execute required.
 *   - Marion Court is created PAUSED and the existing Marion Court campaigns
 *     are left RUNNING, so the account is never left with nothing serving
 *     that event. Activating the new one and pausing the old is a human step.
 *   - Good Good's revival is immediate and deliberate: it is a known-good
 *     configuration that already ran for a week, not something to review.
 *   - Every write is read back. Meta returns success on writes it silently
 *     ignores; that has bitten this project twice.
 *
 * Env: META_ADS_ACCESS_TOKEN (ads_management), META_AD_ACCOUNT_ID (optional)
 *
 * Usage:
 *   node scripts/meta-restore-traffic.js
 *   node scripts/meta-restore-traffic.js --execute
 *   node scripts/meta-restore-traffic.js --only=gg --execute
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) { console.error('META_ADS_ACCESS_TOKEN is unset.'); process.exit(2); }
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

// Ids are written out rather than matched by name. This account contains
// "Sale Obj Women", "Sales Object-Women" and "Sale Obj All Genders" -- three
// strings a regex would have to tell apart correctly on the first try, on
// live spend.
const GG = {
  reviveCampaign: { id: '120250622050150542', name: 'Campaign 1 Event 3 Good Good Campaign' },
  reviveAd: { id: '120250622050170542', name: 'Campaign 1 Event 3 Good Good Ad' },
  // The two prospecting campaigns selling the same event. Retargeting is
  // deliberately left running: it works a different audience (past site
  // visitors) at $0.78, and Meta pairs it with Tellus retargeting rather
  // than with these.
  pauseCampaigns: [
    { id: '120250837425640542', name: 'Good Good Campaign-Sale Obj Women ($10/day)' },
    { id: '120250837425650542', name: 'Good Good Campaign-Sale Obj All Genders ($2/day)' },
  ],
};

const MC = {
  campaignName: 'Marion Court | Traffic',
  // $6/day = the $3 + $3 the two current Marion Court prospecting campaigns
  // already carry. Deliberately not an increase -- budget changes are their
  // own diagnosed problem on this account.
  dailyBudgetCents: 600,
  stopTime: '2026-09-08T16:30:00-0400',
  adSets: [
    { label: 'Female', sourceAdSet: '120250958720260542', creativeId: '989920904068883', adName: 'MC Women - Video Ad' },
    { label: 'All Genders', sourceAdSet: '120250958718960542', creativeId: '2226093511569186', adName: 'MC All Genders - Video Ad' },
  ],
};

async function get(path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error.error_user_msg || json.error.message);
  return json;
}

async function post(path, fields) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = await res.json();
  if (json.error) throw new Error(json.error.error_user_msg || json.error.message);
  return json;
}

/** Set a status and confirm it actually took. */
async function setStatus(id, status, label) {
  await post(id, { status });
  const back = await get(id, { fields: 'name,status' });
  const ok = back.status === status;
  console.log(`     ${ok ? 'OK  ' : '!!  '} ${label} -> ${back.status}`);
  return ok;
}

async function doGoodGood(execute) {
  console.log('GOOD GOOD  revive the Traffic campaign, stand down its conversion siblings');
  const camp = await get(GG.reviveCampaign.id, { fields: 'name,status,objective,stop_time' });
  const ad = await get(GG.reviveAd.id, { fields: 'name,status' });
  const sets = await get(`${GG.reviveCampaign.id}/adsets`, { fields: 'name,status,optimization_goal,daily_budget,end_time' });
  const s = (sets.data || [])[0] || {};

  console.log(`     campaign  ${camp.status} -> ACTIVE   (${camp.objective}, ends ${String(camp.stop_time).slice(0, 10)})`);
  console.log(`     ad set    ${s.status} already, ${s.optimization_goal}, $${(+s.daily_budget / 100).toFixed(2)}/day, ends ${String(s.end_time).slice(0, 10)}`);
  console.log(`     ad        ${ad.status} -> ACTIVE`);
  for (const c of GG.pauseCampaigns) console.log(`     pause     ${c.name}`);
  console.log('     leaving   Good Good Retargeting running (different audience, $0.78)');

  if (!execute) return { changed: 0 };

  let changed = 0;
  if (await setStatus(GG.reviveCampaign.id, 'ACTIVE', 'campaign')) changed++;
  if (await setStatus(GG.reviveAd.id, 'ACTIVE', 'ad')) changed++;
  for (const c of GG.pauseCampaigns) {
    if (await setStatus(c.id, 'PAUSED', c.name)) changed++;
  }
  return { changed };
}

async function doMarionCourt(execute) {
  console.log('MARION COURT  build a Traffic campaign (nothing dormant to revive)');
  console.log(`     campaign  "${MC.campaignName}"  OUTCOME_TRAFFIC, CBO $${(MC.dailyBudgetCents / 100).toFixed(2)}/day, PAUSED`);

  const planned = [];
  for (const a of MC.adSets) {
    const src = await get(a.sourceAdSet, { fields: 'name,targeting,end_time' });
    const t = src.targeting || {};
    console.log(`     ad set    "Marion Court | ${a.label} | Traffic"  LINK_CLICKS, PAUSED`);
    console.log(`               targeting from ${String(src.name).slice(0, 40)}`);
    console.log(`               genders=${JSON.stringify(t.genders || 'all')} age=${t.age_min}-${t.age_max} ends ${String(src.end_time).slice(0, 10)}`);
    console.log(`     ad        "${a.adName} (Traffic)" -> creative ${a.creativeId} reused`);
    planned.push({ ...a, src });
  }
  console.log('     leaving   the existing Marion Court campaigns RUNNING until you activate this');

  if (!execute) return { changed: 0 };

  const camp = await post(`${ACCOUNT}/campaigns`, {
    name: MC.campaignName,
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
    daily_budget: String(MC.dailyBudgetCents),
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    stop_time: MC.stopTime,
  });
  const campBack = await get(camp.id, { fields: 'name,status,objective,daily_budget' });
  console.log(`     OK   campaign ${camp.id} (${campBack.objective}, ${campBack.status}, $${(+campBack.daily_budget / 100).toFixed(2)}/day)`);

  let changed = 1;
  for (const p of planned) {
    const set = await post(`${ACCOUNT}/adsets`, {
      name: `Marion Court | ${p.label} | Traffic`,
      campaign_id: camp.id,
      optimization_goal: 'LINK_CLICKS',
      billing_event: 'IMPRESSIONS',
      // Mirrors the Good Good Traffic ad set exactly.
      attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 1 }]),
      targeting: JSON.stringify(p.src.targeting || {}),
      end_time: p.src.end_time,
      // No budget here on purpose: the campaign's CBO allocates between the
      // two ad sets, which is the reason they share a campaign.
      status: 'PAUSED',
    });
    const setBack = await get(set.id, { fields: 'name,status,optimization_goal' });
    console.log(`     OK   ad set ${set.id} (${setBack.optimization_goal}, ${setBack.status})`);
    changed++;

    const ad = await post(`${ACCOUNT}/ads`, {
      name: `${p.adName} (Traffic)`,
      adset_id: set.id,
      creative: JSON.stringify({ creative_id: p.creativeId }),
      status: 'PAUSED',
    });
    console.log(`     OK   ad ${ad.id} on creative ${p.creativeId}`);
    changed++;
  }
  return { changed };
}

async function main() {
  const execute = flag('execute');
  const only = String(arg('only', '')).toLowerCase();

  console.log(`\naccount ${ACCOUNT}`);
  console.log(execute ? 'EXECUTING\n' : 'DRY RUN -- nothing will be written\n');

  let total = 0;
  try {
    if (!only || only === 'gg') { total += (await doGoodGood(execute)).changed; console.log(); }
    if (!only || only === 'mc') { total += (await doMarionCourt(execute)).changed; console.log(); }
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    console.error('\nStopping here. Anything already written above is reported and is\n'
      + 'reversible by status; nothing was deleted.');
    process.exitCode = 1;
    return;
  }

  if (!execute) {
    console.log('Dry run. Re-run with --execute.\n');
    return;
  }

  console.log(`${total} change(s) applied.\n`);
  console.log('NEXT, by hand:');
  console.log('  Good Good is LIVE now on the Traffic campaign at $3/day. Nothing to do.');
  console.log('  Marion Court is PAUSED. Review it, then activate the campaign, both ad');
  console.log('  sets and both ads, and pause "Marion Court Female" and "Marion Court');
  console.log('  All Genders" so they stop bidding against it.');
  console.log('  Then leave everything alone for seven days.\n');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
