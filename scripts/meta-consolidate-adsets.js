#!/usr/bin/env node
/**
 * scripts/meta-consolidate-adsets.js
 *
 * Rebuilds the Female / All-Genders ad set pairs as TWO AD SETS INSIDE ONE
 * CAMPAIGN, optimising for landing page views instead of conversions.
 *
 * WHY THIS HAS TO CREATE RATHER THAN EDIT
 *
 * The optimisation goal cannot be changed on a published ad set. Meta enforces
 * it as a catch-22 rather than a flat lock, and it is worth recording exactly,
 * because the first error makes it look solvable:
 *
 *   POST optimization_goal=LANDING_PAGE_VIEWS
 *     -> "The updated optimization goal or objective invalidates previously
 *         set attribution window ... supported combination of click-through
 *         and view-through attribution window values are: (1, 0). Please also
 *         update the attribution window."          (subcode 1885560)
 *
 *   POST optimization_goal + attribution_spec=(1,0)
 *     -> "Attribution window update is no longer supported after adset
 *         creation. Please create a new adset instead."
 *
 * Each rule points at the other. Ads Manager greys the control out entirely
 * and says the same thing in one sentence.
 *
 * WHY IT IS WORTH DOING
 *
 * The account switched from link-click Traffic campaigns to conversion
 * optimisation on 2026-08-13 and turned the old Traffic campaign off eight
 * minutes later. Cost per click went from $0.14-$0.20 to $0.62-$1.45 for the
 * same markets and events -- $387.57 bought 625 clicks where the old rate
 * would have bought ~2,280. Current unit economics are $71.78 per purchase on
 * a $18.99-$29.99 ticket.
 *
 * Conversion optimisation needs a steady conversion signal. At ~4 purchases a
 * week split across 9 ad sets there is not enough for Meta to find buyers, so
 * it charges the premium and delivers nothing extra. Landing page views is a
 * signal the site generates hundreds of times a week.
 *
 * Consolidation rides along because it costs nothing extra once new ad sets
 * are being created anyway. Meta's own top account recommendation is to merge
 * 8 fragmented ad sets, projecting 21-31% lower cost per result. Keeping
 * Female and All-Genders as two ad sets in ONE campaign preserves the
 * female-targeted creative -- which exists for gender balance at the events,
 * not for performance -- while letting campaign budget optimisation allocate
 * between them instead of leaving them to bid against each other in separate
 * auctions.
 *
 * WHAT IT DOES NOT TOUCH
 *
 *   - Campaigns. No campaign is created, deleted, renamed or re-objectived.
 *     New ad sets are created INSIDE the existing ones.
 *   - Budgets. Not one. Budget thrash -- roughly eight changes on a single
 *     campaign in nine days, each bouncing it back through review -- is one of
 *     the diagnosed causes of the CPM rise. Set the home campaign's budget by
 *     hand, once, after reviewing what this creates.
 *   - The three retargeting ad sets. They are a separate problem: every custom
 *     audience is under 1,000 people, so frequency 4.77-5.81 is arithmetic
 *     rather than fatigue, and no optimisation goal fixes that.
 *   - Creatives. New ads reference the EXISTING creative_id, so they point at
 *     the same hidden Page post and keep whatever social proof it has.
 *
 * SAFETY
 *
 *   - Dry run by default. --execute is required, same convention as social.js.
 *   - Everything is created PAUSED. Nothing spends until a human activates it
 *     in Ads Manager, which is also the review step.
 *   - Old ad sets are PAUSED, never deleted, so the whole change reverses by
 *     flipping statuses back.
 *   - Every write is read back. Meta returns success on writes it silently
 *     ignores; this has already bitten this project twice.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   needs ads_management
 *   META_AD_ACCOUNT_ID      optional -- defaults to the known account
 *
 * Usage:
 *   node scripts/meta-consolidate-adsets.js
 *   node scripts/meta-consolidate-adsets.js --execute
 *   node scripts/meta-consolidate-adsets.js --only=MC --execute
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

/**
 * The plan, written out rather than inferred from ad set names.
 *
 * Name-matching would have to decide that "Sale Obj Women" and "Sales
 * Object-Women" are the same concept while "Sale Obj All Genders" is not, on
 * an account where those three strings differ by a space and a plural. A
 * table is reviewable before it runs; a regex is not.
 *
 * `home` is the campaign the new pair moves into. Chosen as the campaign that
 * already carries the larger budget, so the surviving campaign is the one
 * whose spend history matches what it will now be doing.
 */
const GROUPS = [
  {
    key: 'MC',
    event: 'Marion Court',
    home: { id: '120250958676620542', name: 'Marion Court All Genders' },
    members: [
      { adsetId: '120250958720260542', label: 'Female' },
      { adsetId: '120250958718960542', label: 'All Genders' },
    ],
  },
  {
    key: 'GG',
    event: 'Good Good Things',
    home: { id: '120250837425640542', name: 'Campaign 1 Event 4 Good Good Campaign-Sale Obj Women' },
    members: [
      { adsetId: '120250837425670542', label: 'Female' },
      { adsetId: '120250837425630542', label: 'All Genders' },
    ],
  },
  {
    key: 'TL',
    event: 'Tellus AfterDark',
    home: { id: '120250817923770542', name: 'Campaign 1 Event 3 Tellus AfterDark -All Genders' },
    members: [
      { adsetId: '120250830674730542', label: 'Female' },
      { adsetId: '120250817923760542', label: 'All Genders' },
    ],
  },
];

async function get(path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.error_user_msg || json.error.message}`);
  return json;
}

async function post(path, fields) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = await res.json();
  if (json.error) {
    const e = json.error;
    throw new Error(e.error_user_msg || e.message);
  }
  return json;
}

/** The new ad set's shape, derived from the one it replaces. */
function plannedAdSet(source, group, member) {
  const promoted = source.promoted_object || {};
  return {
    name: `${group.event} | ${member.label} | LPV`,
    campaign_id: group.home.id,
    // The whole point of the rebuild.
    optimization_goal: 'LANDING_PAGE_VIEWS',
    // Meta rejects LANDING_PAGE_VIEWS with the inherited 7-day/1-day window;
    // (1, 0) is the combination it names in the error.
    attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 1 }]),
    billing_event: 'IMPRESSIONS',
    // Several source ad sets report destination_type UNDEFINED. Landing page
    // views is meaningless without a website destination, so it is set
    // explicitly rather than inherited.
    destination_type: 'WEBSITE',
    // Keep the pixel so the events still attribute, but drop
    // custom_event_type: PURCHASE -- that is the conversion event being
    // optimised for, which is exactly what is being moved away from.
    ...(promoted.pixel_id ? { promoted_object: JSON.stringify({ pixel_id: promoted.pixel_id }) } : {}),
    targeting: JSON.stringify(source.targeting || {}),
    // Inherited, not invented. Tellus ends 2026-08-26, Good Good 08-31,
    // Marion Court 09-08 -- an ad set without these would keep running past
    // the event it sells.
    ...(source.end_time ? { end_time: source.end_time } : {}),
    // No budget: the home campaign's CBO allocates between the pair, which is
    // the entire reason for putting them in one campaign.
    status: 'PAUSED',
  };
}

async function main() {
  const execute = flag('execute');
  const only = String(arg('only', '')).toUpperCase();
  const groups = only ? GROUPS.filter((g) => g.key === only) : GROUPS;
  if (!groups.length) { console.error(`No group "${only}". Known: ${GROUPS.map((g) => g.key).join(', ')}`); process.exit(2); }

  console.log(`\naccount ${ACCOUNT}`);
  console.log(execute ? 'EXECUTING -- creating paused ad sets and ads\n' : 'DRY RUN -- nothing will be written\n');

  let created = 0, failed = 0, paused = 0;

  for (const group of groups) {
    console.log(`${group.key}  ${group.event}`);
    console.log(`     home campaign: ${group.home.name}`);

    for (const member of group.members) {
      const source = await get(member.adsetId, {
        fields: 'id,name,targeting,promoted_object,end_time,campaign_id,optimization_goal',
      });
      const plan = plannedAdSet(source, group, member);
      const t = source.targeting || {};
      const genders = t.genders ? JSON.stringify(t.genders) : 'all';

      console.log(`     ${member.label}`);
      console.log(`       from   ${source.name.slice(0, 52)}`);
      console.log(`       goal   ${source.optimization_goal} -> LANDING_PAGE_VIEWS`);
      console.log(`       keeps  genders=${genders} age=${t.age_min}-${t.age_max} end=${source.end_time || '(none)'}`);
      console.log(`       new    "${plan.name}"  [PAUSED]`);

      // The ad that will move with it, reusing the existing creative so the
      // post -- and its social proof -- survives.
      const ads = await get(`${member.adsetId}/ads`, { fields: 'id,name,creative{id}', limit: 10 });
      const sourceAds = ads.data || [];
      for (const a of sourceAds) {
        console.log(`       ad     "${String(a.name).slice(0, 40)}" -> creative ${(a.creative || {}).id} reused`);
      }

      if (!execute) { created++; continue; }

      try {
        const madeSet = await post(`${ACCOUNT}/adsets`, plan);
        const check = await get(madeSet.id, { fields: 'id,name,optimization_goal,status,attribution_spec' });
        if (check.optimization_goal !== 'LANDING_PAGE_VIEWS') {
          console.log(`       !! created ${madeSet.id} but goal reads ${check.optimization_goal}`);
          failed++; continue;
        }
        console.log(`       OK     ad set ${madeSet.id} (${check.optimization_goal}, ${check.status})`);
        created++;

        for (const a of sourceAds) {
          const cid = (a.creative || {}).id;
          if (!cid) continue;
          const madeAd = await post(`${ACCOUNT}/ads`, {
            name: `${a.name} (LPV)`,
            adset_id: madeSet.id,
            creative: JSON.stringify({ creative_id: cid }),
            status: 'PAUSED',
          });
          console.log(`       OK     ad ${madeAd.id} on creative ${cid}`);
        }
      } catch (e) {
        console.log(`       !! FAILED: ${e.message}`);
        failed++;
      }
    }
    console.log();
  }

  // Only pause the originals once their replacements exist. Doing it first
  // would leave the account with nothing running if creation then failed.
  if (execute && created && !failed) {
    console.log('pausing the ad sets that were replaced:');
    for (const group of groups) {
      for (const member of group.members) {
        try {
          await post(member.adsetId, { status: 'PAUSED' });
          const back = await get(member.adsetId, { fields: 'name,status' });
          console.log(`  ${back.status === 'PAUSED' ? 'OK  ' : '??  '} ${String(back.name).slice(0, 50)} -> ${back.status}`);
          if (back.status === 'PAUSED') paused++;
        } catch (e) {
          console.log(`  !! ${member.adsetId}: ${e.message}`);
        }
      }
    }
    console.log();
  } else if (execute && failed) {
    console.log('NOT pausing the originals -- some creations failed, so the old ad sets\n'
      + 'stay live rather than leaving this account with nothing running.\n');
  }

  if (!execute) {
    console.log(`Dry run. ${created} ad set(s) would be created, paused, inside existing campaigns.`);
    console.log('Re-run with --execute to write. Nothing spends until you activate it.\n');
    return;
  }

  console.log(`${created} created, ${failed} failed, ${paused} old ad set(s) paused.\n`);
  if (created && !failed) {
    console.log('NEXT, by hand, in this order:');
    console.log('  1. Review the new paused ad sets in Ads Manager.');
    console.log('  2. Set each home campaign\'s daily budget to cover BOTH ad sets --');
    console.log('     it currently funds one. This is the only budget change to make.');
    console.log('  3. Activate the new ad sets and their ads.');
    console.log('  4. Leave everything alone for seven days, then compare CPC against');
    console.log('     the $0.62 average of 2026-08-13 to 08-22.\n');
  }
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
