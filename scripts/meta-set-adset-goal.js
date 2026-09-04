#!/usr/bin/env node
/**
 * scripts/meta-set-adset-goal.js
 *
 * Would change optimization_goal and attribution_spec on LIVE ad sets.
 *
 * ############################################################################
 * # BOTH EDITS ARE REFUSED BY META. RUN 2026-09-04 19:3x, all four targets
 * # failed, nothing was written, ad sets verified unchanged afterwards.
 * #
 * #   optimization_goal ->  code 100/1885760
 * #     "The same optimization for ad delivery selection is required if the
 * #      campaign bid strategy is lowest cost. To change the optimization for
 * #      ad delivery selection, duplicate the campaign and change each ad set's
 * #      optimization for ad delivery before publishing."
 * #     Every live campaign is CBO + LOWEST_COST_WITHOUT_CAP, so this bites on
 * #     all of them. It is a CAMPAIGN-level lock, not an ad-set one.
 * #
 * #   attribution_spec  ->  code 1/1504040
 * #     "Attribution window update is no longer supported after adset creation.
 * #      Please create a new adset instead."
 * #     Flat refusal. The 1-day click window on every live prospecting ad set
 * #     is frozen for the life of that ad set.
 * #
 * # So neither is a field edit. Both cost a NEW AD SET, and the goal change
 * # additionally costs a new CAMPAIGN. That is why the Loxleys rebuild in
 * # scripts/meta-create-lx-sales-campaign.js is the place to fix them -- it is
 * # already creating both, and can set the goal and the window at birth where
 * # they are still writable.
 * #
 * # KEPT because the --revert path and the guards still work if a future ad set
 * # is created where these ARE editable, and because this docblock is the
 * # cheapest possible record of two constraints that cost a live attempt to
 * # discover.
 * ############################################################################
 *
 * WHY THIS AND NOT A SALES OBJECTIVE
 *
 * A campaign's `objective` is immutable in the Graph API -- switching Marion
 * Court to OUTCOME_SALES means a new campaign, ad set and ad, and Marion Court
 * is at T-4 (event 2026-09-08). Measured 2026-09-04, the account's optimisation
 * events over the previous 7 days were:
 *
 *     purchase              0      <- a sales objective would learn from nothing
 *     initiate_checkout     2
 *     add_to_cart           3
 *     view_content         17
 *     landing_page_view   519      <- the only goal that clears Meta's ~50/week
 *
 * optimization_goal, unlike objective, IS writable on a live ad set. So the
 * cheap half of the change is available without a rebuild: stop paying for
 * people who TAP and start paying for people whose browser actually LOADS the
 * page. That is the exact defect measured in
 * reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md section 6b -- the
 * facebook/reels_overlay placement bought 11 link clicks and ONE landing-page
 * view, so ten of eleven never arrived at all.
 *
 * WHAT IT COSTS
 *
 * The edit RESETS THE LEARNING PHASE. At T-4 that is a real cost and the reason
 * this is worth doing only alongside a placement restriction, not instead of
 * one. CPC will rise; that is the intended effect, not a regression.
 *
 * SAFETY
 *
 * Dry run is the DEFAULT -- same convention as meta-restore-traffic.js,
 * meta-attach-pixel.js and meta-set-ad-creative.js. Dry run still GETs live
 * state, because the printed "before" is the whole point of it. It never POSTs.
 * Nothing here touches budget, targeting, creative, schedule or status. Every
 * write is read back from the API and compared -- a POST returning 200 is not
 * accepted as evidence the field landed.
 *
 * Ad set ids are hardcoded in TARGETS, never matched by name: the account holds
 * "Sale Obj Women", "Sales Object-Women" and "Sale Obj All Genders", three
 * strings a regex would have to disambiguate correctly on the first try, on
 * live spend.
 *
 * Re-running is safe. An ad set already at the target goal prints SKIP.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *                          (ads_read is not enough and fails inside the POST)
 *   META_AD_ACCOUNT_ID     optional, defaults to the SparkDate account
 *
 * Usage:
 *   node scripts/meta-set-adset-goal.js                     # DRY RUN
 *   node scripts/meta-set-adset-goal.js --execute           # write it
 *   node scripts/meta-set-adset-goal.js --only=mc-female
 *   node scripts/meta-set-adset-goal.js --revert --execute  # back to LINK_CLICKS
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
const flag = (n) => process.argv.includes(`--${n}`);

const EXECUTE = flag('execute');
const REVERT = flag('revert');
const ONLY = String(arg('only', '')).toLowerCase();
const FORCE_MC_GOAL = flag('include-mc-goal');

/**
 * from/to are asserted, not assumed. If the live goal is neither, the target is
 * refused rather than overwritten -- someone changed it by hand and this script
 * should not silently stamp over that.
 */
const TARGETS = [
  // Loxleys, T-18 with runway to 2026-09-22. Both changes.
  {
    key: 'lx-female',
    adset: '120251085229390542',
    name: 'Loxleys | female | Traffic',
    objective: 'OUTCOME_TRAFFIC',
    from: 'LINK_CLICKS',
    to: 'LANDING_PAGE_VIEWS',
    window: 7,
    why: 'buys page loads, not taps; reverts the 2026-08-05 switch',
  },
  {
    key: 'lx-male',
    adset: '120251085229680542',
    name: 'Loxleys | male | Traffic',
    objective: 'OUTCOME_TRAFFIC',
    from: 'LINK_CLICKS',
    to: 'LANDING_PAGE_VIEWS',
    window: 7,
    why: 'buys page loads, not taps; reverts the 2026-08-05 switch',
  },
  // Marion Court is at T-4 and ACCELERATING (weekly tickets 0, 1, 4, 6). A goal
  // change resets the learning phase, so only the attribution window moves here
  // -- that is a reporting/credit setting and does not restart learning.
  {
    key: 'mc-female',
    adset: '120251072513240542',
    name: 'Marion Court | Female | Traffic',
    objective: 'OUTCOME_TRAFFIC',
    windowOnly: true,
    window: 7,
    why: 'a measured click-to-buy lag of 14 days cannot be credited in 1',
  },
  {
    key: 'mc-all',
    adset: '120251072513740542',
    name: 'Marion Court | All Genders | Traffic',
    objective: 'OUTCOME_TRAFFIC',
    windowOnly: true,
    window: 7,
    why: 'a measured click-to-buy lag of 14 days cannot be credited in 1',
  },
];

async function graph(path, params = {}, method = 'GET') {
  const url = new URL(`${GRAPH}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (method === 'GET') url.searchParams.set(k, v);
    else body.set(k, v);
  }
  const auth = method === 'GET' ? url.searchParams : body;
  auth.set('access_token', TOKEN || '');
  const res = await fetch(url, method === 'GET' ? undefined : { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (j.error) {
    const e = j.error;
    throw new Error(`${e.error_user_msg || e.message} (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})`);
  }
  return j;
}

const get = (path, params) => graph(path, params, 'GET');
const post = (path, params) => graph(path, params, 'POST');

function pick(t) {
  const want = REVERT ? t.from : t.to;
  const have = REVERT ? t.to : t.from;
  return { want, have };
}

const winOf = (spec) => {
  const c = (spec || []).find((s) => s.event_type === 'CLICK_THROUGH');
  return c ? Number(c.window_days) : null;
};

async function run(t) {
  const { want, have } = pick(t);
  console.log(`\n  ${t.key}  ${t.name}`);
  console.log(`    adset    ${t.adset}`);

  let live;
  try {
    live = await get(t.adset, {
      fields: 'name,optimization_goal,billing_event,status,effective_status,end_time,attribution_spec,campaign{id,objective,daily_budget,stop_time}',
    });
  } catch (e) {
    console.log(`    !!       read failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }

  const camp = live.campaign || {};
  const liveWin = winOf(live.attribution_spec);
  console.log(`    campaign ${camp.id || '?'}  ${camp.objective || '?'}  $${((Number(camp.daily_budget || 0)) / 100).toFixed(2)}/day (CBO)`);
  console.log(`    status   ${live.effective_status}   ends ${live.end_time || camp.stop_time || '?'}`);
  console.log(`    goal     ${live.optimization_goal}  billed on ${live.billing_event}`);
  console.log(`    window   ${liveWin === null ? '(none)' : `${liveWin}-day click`}`);

  if (camp.objective !== t.objective) {
    console.log(`    !!       campaign objective is ${camp.objective}, expected ${t.objective}. Refusing.`);
    return { changed: 0, failed: 1 };
  }
  const endsAt = live.end_time || camp.stop_time;
  if (endsAt && new Date(endsAt).getTime() < Date.now()) {
    console.log(`    !!       ended ${endsAt} -- ACTIVE does not mean delivering. Refusing.`);
    return { changed: 0, failed: 1 };
  }

  const edits = {};

  // --- the attribution window, on every target
  if (t.window && liveWin !== t.window) {
    console.log(`    PLAN     window ${liveWin}-day  ->  ${t.window}-day click`);
    console.log(`             ${t.why}`);
    edits.attribution_spec = JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: t.window }]);
  } else if (t.window) {
    console.log(`    SKIP     window already ${t.window}-day`);
  }

  // --- the optimisation goal, only where it is safe to reset learning
  if (t.windowOnly) {
    console.log(`    HELD     goal stays ${live.optimization_goal} -- T-4 and accelerating; a goal change`);
    console.log('             resets the learning phase. Run --include-mc-goal to force it.');
    if (!FORCE_MC_GOAL) { /* fall through with goal untouched */ } else {
      console.log('             --include-mc-goal given: changing it anyway.');
      if (live.optimization_goal === 'LINK_CLICKS') edits.optimization_goal = 'LANDING_PAGE_VIEWS';
    }
  } else if (live.optimization_goal === want) {
    console.log(`    SKIP     goal already ${want}`);
  } else if (live.optimization_goal !== have) {
    console.log(`    !!       live goal is ${live.optimization_goal}, expected ${have}. Changed by hand. Refusing.`);
    return { changed: 0, failed: 1 };
  } else {
    console.log(`    PLAN     goal ${live.optimization_goal}  ->  ${want}   (RESETS the learning phase)`);
    edits.optimization_goal = want;
  }

  if (!Object.keys(edits).length) return { changed: 0, failed: 0 };
  if (!EXECUTE) return { changed: 0, failed: 0 };

  try {
    await post(t.adset, edits);
  } catch (e) {
    console.log(`    !!       write failed: ${e.message}`);
    return { changed: 0, failed: 1 };
  }

  // Never trust the POST's 200. Read it back.
  const after = await get(t.adset, { fields: 'optimization_goal,billing_event,attribution_spec,effective_status' });
  const afterWin = winOf(after.attribution_spec);
  let bad = 0;
  if (edits.optimization_goal && after.optimization_goal !== edits.optimization_goal) bad += 1;
  if (edits.attribution_spec && afterWin !== t.window) bad += 1;
  console.log(`    ${bad ? '!!  ' : 'OK  '}     goal ${after.optimization_goal}, window ${afterWin}-day, ${after.effective_status}`);
  if (bad) {
    console.log('             read-back disagrees with what was asked. The silent no-op is the outcome to fear.');
    return { changed: 0, failed: 1 };
  }
  return { changed: 1, failed: 0 };
}

async function main() {
  console.log(`${ACCOUNT}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}${REVERT ? '  [REVERT]' : ''}`);

  if (EXECUTE && !TOKEN) {
    console.error('\n  x --execute needs META_ADS_ACCESS_TOKEN (ads_management).');
    process.exit(2);
  }
  if (!TOKEN) {
    console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.');
    process.exit(2);
  }

  const targets = ONLY ? TARGETS.filter((t) => t.key.toLowerCase() === ONLY) : TARGETS;
  if (!targets.length) {
    console.error(`\n  x no target matches --only=${ONLY}. Known: ${TARGETS.map((t) => t.key).join(', ')}`);
    process.exit(2);
  }

  let changed = 0;
  let failed = 0;
  for (const t of targets) {
    const r = await run(t);
    changed += r.changed;
    failed += r.failed;
  }

  console.log(`\n  ${changed} changed, ${failed} failed`);
  if (failed) process.exitCode = 1;

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute.');
    return;
  }
  if (changed) {
    console.log('\nNEXT, by hand:');
    console.log('  - Ads Manager will show the ad set back in Learning. Expect CPC to rise.');
    console.log('  - Watch link clicks vs landing page views, not CPC alone:');
    console.log('      npm run ads:review');
    console.log('  - Undo with: node scripts/meta-set-adset-goal.js --revert --execute');
  }
}

main().catch((e) => {
  console.error(`\n  x ${e.message}`);
  process.exitCode = 1;
});
