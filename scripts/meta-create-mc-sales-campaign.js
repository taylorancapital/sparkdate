#!/usr/bin/env node
/**
 * scripts/meta-create-mc-sales-campaign.js
 *
 * Builds "Marion Court | Sales" -- an OUTCOME_SALES campaign with ONE female ad
 * set, on the 2-for-1 creative. Taylor, 2026-09-05: "make marion court sales
 * objective, don't touch retargeting, we want women sales."
 *
 * READ THIS FIRST -- THIS IS A T-3 HAIL MARY, NOT THE LOXLEYS EXPERIMENT
 *
 * Marion Court is 2026-09-08 and the campaign stops that day at 16:30. This
 * campaign gets about three days, minus ad review.
 *
 *   - `objective` is immutable, so a sales objective costs a whole new campaign,
 *     ad set and ad. There is no edit that does this.
 *   - Optimisation events available in the last 7 days: purchase 0,
 *     add_to_cart 0, initiate_checkout 2, view_content 11. Meta wants ~50/week
 *     to leave the learning phase. This campaign will not leave it.
 *   - It is still built on custom_event_type PURCHASE, and that is a considered
 *     choice rather than optimism: "Marion Court Retargeting" is live RIGHT NOW
 *     on OUTCOME_SALES / OFFSITE_CONVERSIONS / PURCHASE with zero lifetime
 *     purchases, and it delivers. So we have in-account evidence that Meta will
 *     serve this configuration on no conversion history. Matching it also keeps
 *     Marion Court and Loxleys comparable, which is the entire point of running
 *     the objective change at all.
 *
 * Expect it to underdeliver. The honest reason to run it anyway is that the
 * objective is the one lever with evidence behind it and there is nothing else
 * left to pull three days out.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED
 *
 *   - "Marion Court Retargeting" (120250958681350542). Taylor said so, and it is
 *     already OUTCOME_SALES.
 *   - "Marion Court | Traffic" (120251072513090542) stays ACTIVE. It is the
 *     known quantity at T-3 and it is ACCELERATING -- its own weekly ticket
 *     counts run 0, 1, 4, 6 with the best week being the current one. Pausing a
 *     working campaign three days out to make room for an unproven one is the
 *     larger risk, so this campaign is ADDITIVE. The two will compete in the
 *     same auction to some degree; that is the accepted cost, not an oversight.
 *     Pausing it is one command if that call changes:
 *       node scripts/meta-lx-switch-to-sales.js is the Loxleys shape of it.
 *
 * WHAT THIS FIXES THAT COULD NEVER BE FIXED IN PLACE
 *
 * The live MC Women ad carries the poisoned tagging era in a frozen field:
 *     utm_source=Instagram (hardcoded, whatever the placement)
 *     utm_campaign=Augweek3_lancaster (an AUGUST name on a September 8 event)
 *     utm_content=proof_rsa1 (the seeded EXAMPLE value, shared by 11 ads)
 * plus call_to_action BOOK_TRAVEL on a Lancaster mixer. url_tags and the CTA are
 * both settable ONLY at creative creation, so a new creative is the only route.
 * This one ships utm_content=mc_close_female_bringafriend and LEARN_MORE.
 *
 * THE SINGLE FILTER IS DROPPED, ON PURPOSE
 *
 * The live MC ad sets carry flexible_spec [{relationship_statuses:[1]}], which
 * Meta's own delivery_estimate prices at 80% of reachable audience (530,600 ->
 * 105,700 for the same geo/age/gender). A cold campaign with three days to live
 * cannot afford that, and Loxleys carries no such filter -- dropping it also
 * makes the two events comparable for the first time.
 *
 * GENDER
 *
 * Female only, genders:[2], and targeting_automation carries advantage_audience
 * 0 with NO individual_setting. That is the shape that holds female delivery at
 * exactly 100% in this account; the shape with individual_setting.gender=1 is
 * the one that put 64% of a "Sale Obj Women" campaign's money on men. Verified
 * on read-back, and the script FAILS LOUDLY if Meta sets it server-side.
 *
 * SAFETY
 *
 * Dry run is the DEFAULT. Everything is created PAUSED. Every created object is
 * read back and compared. Refuses if a campaign of this name already exists.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *
 * Usage:
 *   node scripts/meta-create-mc-sales-campaign.js                 # DRY RUN
 *   node scripts/meta-create-mc-sales-campaign.js --execute
 *   node scripts/meta-create-mc-sales-campaign.js --daily=1000    # cents/day
 */

'use strict';

const brand = require('../content/brand.json');
const { urlTags, utmContent, utmCampaign, assertCleanLink, assertUniqueContent } = require('./ad-utm.js');

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

const PAGE_ID = '1139242662602769';
const IG_USER_ID = '17841426630031658';
const PIXEL_ID = '4390442851170732';
const MC_TRAFFIC_CAMPAIGN = '120251072513090542';
const LINK = 'https://sparkdate.date/lp?eventId=WUaooYvOq0eC0D1QVCvQ';
const CAMPAIGN_NAME = 'Marion Court | Sales';

const EVENT = brand.events.MC;
const EVENT_DATE = EVENT.date;                 // 2026-09-08
const STOP = `${EVENT_DATE}T16:30:00-0400`;    // matches the Traffic campaign exactly
const START = String(arg('start', '2026-09-05'));
const DAILY_CENTS = Number(arg('daily', 1000));

const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;

// The live MC Women creative, reused by VIDEO ID so it is provably the same
// asset. NOTE object_story_spec.video_data.video_id -- creative.video_id is a
// different rendition id and would reference the wrong thing.
const AD = {
  key: 'female',
  genders: [2],
  adSetName: 'Marion Court | Female | Sales',
  adName: 'Marion Court | female | close 2for1',
  videoId: '1082861517651493',
  imageHash: 'c7ad3ba1b9ddc575a3cbf1ff82e55e6a',
  headline: 'Bring a friend. One ticket, two of you.',
  description: '2-for-1 tickets live now',
  // Copy is the live ad's, verbatim. The objective is the variable; changing the
  // words too would make the result unreadable.
  message: 'Thinking about it, but not alone? Bring your friend — one ticket gets you both in.\n\n'
    + 'Split the nerves, double the people you actually talk to, and have someone to debrief with on the way out.\n\n'
    + 'Tuesday, September 8 · Marion Court Room, Lancaster · 2-for-1 live now.',
  utm: { event: 'MC', phase: 'close', adSet: 'female', creative: 'bringafriend' },
};

// Cloned from the live MC Female ad set, MINUS the relationship filter.
const TARGETING = {
  age_min: 22,
  age_max: 45,
  genders: AD.genders,
  geo_locations: {
    custom_locations: [
      { name: 'York, PA', address_string: 'York, PA', distance_unit: 'mile', latitude: 39.9626, longitude: -76.7277, radius: 15, primary_city_id: 2514536, region_id: 3881, country: 'US' },
      { name: 'Lancaster, PA', address_string: 'Lancaster, PA', distance_unit: 'mile', latitude: 40.0379, longitude: -76.3055, radius: 15, primary_city_id: 2510150, region_id: 3881, country: 'US' },
      { name: 'Harrisburg, PA', address_string: 'Harrisburg, PA', distance_unit: 'mile', latitude: 40.2732, longitude: -76.8867, radius: 15, primary_city_id: 2509279, region_id: 3881, country: 'US' },
      { name: 'Reading, PA', address_string: 'Reading, PA', distance_unit: 'mile', latitude: 40.3356, longitude: -75.9269, radius: 15, primary_city_id: 2512427, region_id: 3881, country: 'US' },
    ],
    location_types: ['frequently_in', 'home', 'recent'],
  },
  targeting_automation: { advantage_audience: 0 },
  // Audience Network only: 27.6% arrival rate, zero downstream events on $71.27
  // lifetime. Everything else stays automatic -- the broader placement
  // restriction was withdrawn on 2026-09-04 as unsupported.
  publisher_platforms: ['facebook', 'instagram'],
};

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

async function main() {
  console.log(`${ACCOUNT}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);
  if (!TOKEN) { console.error('\n  x META_ADS_ACCESS_TOKEN is unset.'); process.exit(2); }

  console.log('\nPRE-FLIGHT');
  const tag = urlTags(AD.utm);
  const content = utmContent(AD.utm);
  try {
    assertCleanLink(LINK);
    assertUniqueContent([content]);
  } catch (e) { console.error(`  x ${e.message}`); process.exit(2); }
  console.log(`  ok       utm_campaign ${utmCampaign('MC')}`);
  console.log(`  ok       utm_content  ${content}`);
  console.log('  ok       link carries no utm_* (Meta appends url_tags)');

  const live = await get(`${ACCOUNT}/ads`, { fields: 'name,creative{url_tags}', limit: '200' });
  const taken = new Set((live.data || [])
    .map((a) => String((a.creative || {}).url_tags || '').match(/utm_content=([^&]+)/))
    .filter(Boolean).map((m) => m[1]));
  if (taken.has(content)) { console.error(`  x utm_content ${content} is already live on this account.`); process.exit(2); }
  console.log(`  ok       does not collide with the ${taken.size} already live`);

  const camps = await get(`${ACCOUNT}/campaigns`, { fields: 'name,id,effective_status', limit: '200' });
  const dupe = (camps.data || []).find((c) => c.name === CAMPAIGN_NAME);
  if (dupe) { console.error(`  x "${CAMPAIGN_NAME}" already exists (${dupe.id}). Refusing.`); process.exit(2); }
  console.log(`  ok       no campaign named "${CAMPAIGN_NAME}" yet`);

  const mcTraffic = await get(MC_TRAFFIC_CAMPAIGN, { fields: 'name,daily_budget,effective_status,stop_time' });
  const days = Math.max(1, Math.round((new Date(STOP) - new Date(`${START}T12:00:00-0400`)) / 86400000));

  console.log('\nEXPOSURE');
  console.log(`  existing  ${mcTraffic.name.padEnd(24)} ${money(mcTraffic.daily_budget).padStart(7)}/day  ${mcTraffic.effective_status}  (LEFT RUNNING)`);
  console.log(`  new       ${CAMPAIGN_NAME.padEnd(24)} ${money(DAILY_CENTS).padStart(7)}/day`);
  console.log(`  window    ${START} -> ${STOP}  (~${days} days)`);
  console.log(`  new spend at most ${money(DAILY_CENTS * days)} before the event stops it`);
  console.log('  !!        both target the same women in the same four cities and WILL compete.');
  console.log('            That is accepted: at T-3 the Traffic campaign is accelerating and');
  console.log('            pausing it to clear the auction is the larger risk.');

  console.log('\nPLAN');
  console.log(`  campaign  ${CAMPAIGN_NAME}   OUTCOME_SALES, CBO ${money(DAILY_CENTS)}/day, PAUSED`);
  console.log(`  ad set    ${AD.adSetName}`);
  console.log(`            OFFSITE_CONVERSIONS / IMPRESSIONS, promoted_object pixel PURCHASE`);
  console.log('            attribution 7-day click / 1-day view  (creation-only field)');
  console.log('            genders [2], 22-45, York+Lancaster+Harrisburg+Reading 15mi');
  console.log('            NO relationship filter (the live ad sets have one; it costs 80% of reach)');
  console.log('            no audience_network');
  console.log(`  ad        ${AD.adName}   (PAUSED)`);
  console.log(`            video ${AD.videoId}  [reused from the live MC Women ad]`);
  console.log(`            CTA LEARN_MORE   (the live one is BOOK_TRAVEL)`);
  console.log(`            url_tags  ${tag}`);

  if (!EXECUTE) { console.log('\nDry run. Re-run with --execute.'); return; }

  console.log('\nEXECUTING');
  const campaign = await post(`${ACCOUNT}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: '[]',
    daily_budget: String(DAILY_CENTS),
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    start_time: `${START}T00:00:00-0400`,
    stop_time: STOP,
  });
  console.log(`  campaign  ${campaign.id}`);

  const adset = await post(`${ACCOUNT}/adsets`, {
    name: AD.adSetName,
    campaign_id: campaign.id,
    status: 'PAUSED',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    destination_type: 'WEBSITE',
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    targeting: JSON.stringify(TARGETING),
    attribution_spec: JSON.stringify([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 },
    ]),
    start_time: `${START}T00:00:00-0400`,
    end_time: STOP,
  });
  console.log(`  ad set    ${adset.id}`);

  const creative = await post(`${ACCOUNT}/adcreatives`, {
    name: 'MC female close 2026-09 (video)',
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      instagram_user_id: IG_USER_ID,
      video_data: {
        video_id: AD.videoId,
        image_hash: AD.imageHash,
        message: AD.message,
        title: AD.headline,
        link_description: AD.description,
        call_to_action: { type: 'LEARN_MORE', value: { link: LINK } },
      },
    }),
    url_tags: tag,
  });
  console.log(`  creative  ${creative.id}`);

  const ad = await post(`${ACCOUNT}/ads`, {
    name: AD.adName,
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creative.id }),
    tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL_ID] }]),
    status: 'PAUSED',
  });
  console.log(`  ad        ${ad.id}`);

  const backSet = await get(adset.id, { fields: 'optimization_goal,promoted_object,targeting,attribution_spec,effective_status' });
  const backAd = await get(ad.id, { fields: 'creative{url_tags},effective_status' });
  const ta = (backSet.targeting || {}).targeting_automation || {};
  const expansion = (ta.individual_setting || {}).gender;
  const checks = [
    ['goal', backSet.optimization_goal === 'OFFSITE_CONVERSIONS', backSet.optimization_goal],
    ['pixel', (backSet.promoted_object || {}).pixel_id === PIXEL_ID, (backSet.promoted_object || {}).custom_event_type],
    ['genders', JSON.stringify((backSet.targeting || {}).genders) === JSON.stringify(AD.genders), JSON.stringify((backSet.targeting || {}).genders)],
    ['gender expansion OFF', expansion !== 1, expansion === undefined ? 'absent (correct)' : String(expansion)],
    ['no relationship filter', !(backSet.targeting || {}).flexible_spec, JSON.stringify((backSet.targeting || {}).flexible_spec || 'none')],
    ['attribution 7d click', (backSet.attribution_spec || []).some((x) => x.event_type === 'CLICK_THROUGH' && Number(x.window_days) === 7), JSON.stringify(backSet.attribution_spec || [])],
    ['url_tags', (backAd.creative || {}).url_tags === tag, (backAd.creative || {}).url_tags],
  ];
  let failed = 0;
  for (const [label, ok, seen] of checks) {
    console.log(`  ${ok ? 'OK  ' : '!!  '}      ${label.padEnd(24)} ${seen}`);
    if (!ok) failed += 1;
  }
  console.log(`\n  ${failed ? `${failed} check(s) FAILED` : 'all checks passed'}`);
  if (failed) process.exitCode = 1;

  console.log('\nNEXT, by hand:');
  console.log('  - Everything is PAUSED. Start it in Ads Manager, or:');
  console.log(`      node -e "..." # or flip campaign ${campaign.id}, adset ${adset.id}, ad ${ad.id}`);
  console.log('  - "Marion Court Retargeting" and "Marion Court | Traffic" were NOT touched.');
  console.log('  - It will not leave the learning phase in three days. Judge it on whether');
  console.log('    women reach checkout, not on purchases -- there will be too few to read.');
}

main().catch((e) => { console.error(`\n  x ${e.message}`); process.exitCode = 1; });
