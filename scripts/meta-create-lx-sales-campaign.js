#!/usr/bin/env node
/**
 * scripts/meta-create-lx-sales-campaign.js
 *
 * Builds "Loxleys | Sales" -- an OUTCOME_SALES campaign, two ad sets
 * (female, male) and two ads -- as the deliberate counterpart to the running
 * OUTCOME_TRAFFIC "Loxleys | Traffic" campaign (120251085229290542).
 *
 * Everything is created PAUSED. Nothing spends until a human starts it.
 *
 * WHY A NEW CAMPAIGN AND NOT AN EDIT
 *
 * `objective` is immutable in the Graph API. A sales objective costs a new
 * campaign, ad set and ad -- which is also the ONLY moment `url_tags` can be
 * set (Meta subcode 1815573), so this is the one chance to ship Loxleys'
 * conversion ads correctly tagged instead of inheriting the proof_rsa1 era.
 *
 * READ THIS BEFORE RUNNING IT -- brand.json ARGUES AGAINST THIS CHANGE
 *
 * content/brand.json paid_template.campaign pins objective OUTCOME_TRAFFIC with
 * a `_why_traffic` note citing measured costs of $0.13-$0.30 per LINK_CLICK
 * against $0.66-$1.58 per OFFSITE_CONVERSION in this account. That is a 3-5x
 * price per optimisation event. This script contradicts a documented, measured
 * decision, and does so on purpose:
 *
 *   - OUTCOME_TRAFFIC has produced 0 sales lifetime on $254.14 and 1,156
 *     landing-page views. OUTCOME_SALES produced all 6.
 *   - BUT per DOLLAR that difference is p = 0.224 -- NOT significant. See
 *     reports/META_ADS_DELIVERY_DIAGNOSIS_2026-09-04.md section 7f. With six
 *     conversions on the account, nothing here is causally provable, and
 *     proving it would take ~$5,671 per arm against $769 of lifetime spend.
 *   - The reason to do it anyway is the Tellus precedent (section 7g): sales
 *     campaigns went live 2026-08-13 at T-13 and four purchases landed inside
 *     five days after none in the account's history. That is confounded --
 *     spend jumped 4.5x the same day and the pixel's ecommerce events were not
 *     reporting at all before 08-13 -- but it is first-hand and it is the only
 *     time this account has ever sold at a clip.
 *
 * So: this is a BET, not a fix. Loxleys is the right place to make it because
 * it stops 2026-09-22 and has runway to learn; Marion Court at T-4 does not
 * (see scripts/meta-set-adset-goal.js for the cheap half that fits there).
 *
 * WHAT THIS PRESERVES DELIBERATELY, SO THE BET IS READABLE
 *
 * Same videos, same hooks, same geography, same ages, same genders as the
 * running prime ads. The objective is the variable. The creative is reused by
 * VIDEO ID rather than re-uploaded, so it is provably the same asset:
 *
 *   NOTE the rendition trap -- creative.video_id is NOT the same id as
 *   creative.object_story_spec.video_data.video_id. Female: 2549526178842057
 *   vs 1420196480082165. Male: 1441913527996824 vs 1464886812146012. The
 *   object_story_spec value is the real one. Diffing the other pair produced a
 *   wrong headline and a bad PR on 2026-09-02.
 *
 * NO relationship_statuses FILTER. The live Loxleys ad sets carry none, and
 * Marion Court's `[{relationship_statuses:[1]}]` costs 80% of reachable
 * audience (530,600 -> 105,700 on Meta's own delivery_estimate). Not added here.
 *
 * GENDER EXPANSION IS THE THING THAT MUST NOT LEAK
 *
 * `targeting_automation.individual_setting.gender: 1` OVERRIDES genders:[2].
 * It is why "Good Good Campaign-Sale Obj Women" spent 64% of its money on men
 * and its only purchase was a man, while "Tellus Sales-Obj-Women" -- same
 * OUTCOME_SALES objective, expansion off -- held 100% women on $60.74. Ads
 * Manager turns Advantage+ audience ON BY DEFAULT in its creation flow; the API
 * does not, and `advantage_audience: 0` alone does NOT cover it (every live ad
 * set has that at 0 while three still carried gender expansion).
 *
 * This script sends the exact targeting_automation shape the known-good live
 * Loxleys ad sets carry, and then FAILS LOUDLY on read-back if Meta has set
 * individual_setting.gender to 1 anyway. Verify, do not assume.
 *
 * THE PRICE LINE IS COMPUTED, NEVER TYPED
 *
 * brand.json has LX early_bird 24.99 through 2026-09-07, regular 29.99. The
 * price in the copy is derived from this campaign's start date so it cannot be
 * typed wrong.
 *
 * The live prime ads are NOT a defect and are not touched. "Early bird $24.99
 * through Sept 7" states its own deadline, which is honest advertising, not a
 * stale price -- Taylor's call, 2026-09-04, and the right one. That is a
 * different thing from Marion Court's "$18.99 thru Aug 24", which named a price
 * 45% below what checkout actually charged. Loxleys also runs a deliberate
 * BUDGET LADDER ($3/day -> $9 on 09-08 -> $11.57 on 09-15) built around the
 * early-bird step. Nothing here changes any of that.
 *
 * SAFETY
 *
 * Dry run is the DEFAULT, matching meta-create-lx-prime-ads.js,
 * meta-restore-traffic.js, meta-attach-pixel.js and meta-set-ad-creative.js.
 * Dry run GETs live state (budget exposure, the reference ad sets, existing
 * campaign names) and prints the full plan; it never POSTs. Every created
 * object is read back from the API and verified -- a 200 is not evidence.
 *
 * NOT IDEMPOTENT, and it cannot be: Meta accepts duplicate campaign names
 * silently. It DOES refuse if a campaign named "Loxleys | Sales" already
 * exists, which is the guard meta-restore-traffic.js's header warns is missing
 * there. Delete or rename before re-running.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required for --execute, needs ads_management
 *   META_AD_ACCOUNT_ID     optional, defaults to the SparkDate account
 *
 * Usage:
 *   node scripts/meta-create-lx-sales-campaign.js                    # DRY RUN
 *   node scripts/meta-create-lx-sales-campaign.js --execute
 *   node scripts/meta-create-lx-sales-campaign.js --daily=900        # cents/day
 *   node scripts/meta-create-lx-sales-campaign.js --start=2026-09-08
 *   node scripts/meta-create-lx-sales-campaign.js --placements=auto  # don't restrict
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
const flag = (n) => process.argv.includes(`--${n}`);

const EXECUTE = flag('execute');

// --- fixed account identity (hardcoded, never name-matched) ---
const PAGE_ID = '1139242662602769';
const IG_USER_ID = '17841426630031658'; // instagram_user_id; instagram_actor_id is deprecated and v21.0 rejects it
const PIXEL_ID = '4390442851170732';
const LX_TRAFFIC_CAMPAIGN = '120251085229290542';
const LINK = 'https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ';

const CAMPAIGN_NAME = 'Loxleys | Sales';

// --- schedule and money ---
const EVENT = brand.events.LX;
const EVENT_DATE = EVENT.date;                       // 2026-09-22
const EARLY_BIRD_THROUGH = EVENT.pricing.early_bird_through; // 2026-09-07
const START = String(arg('start', '2026-09-08'));    // T-14, the convert window, day after early bird ends
const DAILY_CENTS = Number(arg('daily', 900));       // matches the documented 09-08 ladder step
const PLACEMENTS = String(arg('placements', 'restricted'));

// Phase is a TIME WINDOW in brand.json, not an objective. T-14..T-8 is `convert`.
const PHASE = String(arg('phase', 'convert'));

const dayMs = 86400000;
const at = (d) => new Date(`${d}T12:00:00-04:00`).getTime();
const tMinus = (d) => Math.round((at(EVENT_DATE) - at(d)) / dayMs);

const priceFor = (startDate) =>
  at(startDate) > at(EARLY_BIRD_THROUGH) ? EVENT.pricing.regular : EVENT.pricing.early_bird;

const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;
const usd = (n) => `$${Number(n).toFixed(2)}`;

/**
 * Copy is the prime copy with ONE line changed: the price. Same hook, same
 * video, so the objective stays the only variable. The 2-for-1 line is female
 * only -- brand.json caption_rules.banned_outside_female_ad_set, a marketing
 * rule not a product one (checkout honours it for every buyer).
 */
const body = (key, price) => {
  const head = 'Loxleys. Tuesday, September 22 at Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM.';
  const hook = key === 'female'
    ? 'Not an app. Not speed dating. A room of people who actually decided to show up.'
    : 'Weeks of texting and no plan ever made. This is the other option.';
  const cost = at(START) > at(EARLY_BIRD_THROUGH)
    ? `${usd(price)}.`
    : `Early bird ${usd(price)} through Sept 7.`;
  const two = key === 'female' ? '\n\nBring a friend - 2-for-1 on tickets.' : '';
  return `${head}\n\n${hook}\n\n${cost}${two}`;
};

const ADS = [
  {
    key: 'female',
    genders: [2],
    adSetName: 'Loxleys | female | Sales',
    adName: 'Loxleys | female | convert video',
    // object_story_spec.video_data.video_id -- NOT creative.video_id (rendition)
    videoId: '1420196480082165',
    imageHash: '153ae3f587491a79e2f5fd5404771206',
    headline: 'Lancaster, PA - Sep 22',
    description: 'Doors 6:30 PM',
    utm: { event: 'LX', phase: PHASE, adSet: 'female', creative: 'showup' },
  },
  {
    key: 'male',
    genders: [1],
    adSetName: 'Loxleys | male | Sales',
    adName: 'Loxleys | male | convert video',
    videoId: '1464886812146012',
    imageHash: 'ca76c9866bca8265be13f348778ef088',
    headline: 'Lancaster, PA - Sep 22',
    description: 'Doors 6:30 PM',
    utm: { event: 'LX', phase: PHASE, adSet: 'male', creative: 'noplan' },
  },
];

/** Cloned verbatim from the live Loxleys ad sets. Cities + 20mi, NOT Marion
 *  Court's custom_locations + 15mi -- the two campaigns are not copy-paste
 *  compatible and swapping the shape silently changes reach. */
const targeting = (genders) => {
  const t = {
    age_min: 22,
    age_max: 45,
    genders,
    geo_locations: {
      cities: [
        { country: 'US', distance_unit: 'mile', key: '2509279', name: 'Harrisburg', radius: 20, region: 'Pennsylvania', region_id: '3881' },
        { country: 'US', distance_unit: 'mile', key: '2510150', name: 'Lancaster', radius: 20, region: 'Pennsylvania', region_id: '3881' },
        { country: 'US', distance_unit: 'mile', key: '2514536', name: 'York', radius: 20, region: 'Pennsylvania', region_id: '3881' },
      ],
      location_types: ['frequently_in', 'home', 'recent'],
    },
    // The known-good shape. Gender expansion is absent, which is what holds
    // female delivery at 100%. Verified again on read-back.
    targeting_automation: { advantage_audience: 0 },
  };
  if (PLACEMENTS === 'restricted') {
    // Drops audience_network entirely (rewarded video is where people tap an ad
    // to collect a game reward) and facebook_reels_overlay (11 link clicks
    // bought ONE landing-page view -- ten of eleven were mis-taps).
    // NOTE: this does NOT escape the in-app browser. Nearly every paid-social
    // tap opens there whatever the placement; only device_platforms:['desktop']
    // would, and that is too narrow for a local event. The in-app problem is
    // addressed by the LANDING_PAGE_VIEWS goal and the 09-02 checkout rebuild.
    t.publisher_platforms = ['facebook', 'instagram'];
    t.facebook_positions = ['feed', 'facebook_reels', 'story'];
    t.instagram_positions = ['stream', 'story', 'reels'];
  }
  return t;
};

async function graph(path, params = {}, method = 'GET') {
  const url = new URL(`${GRAPH}/${path}`);
  const bodyParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (method === 'GET') url.searchParams.set(k, v);
    else bodyParams.set(k, v);
  }
  (method === 'GET' ? url.searchParams : bodyParams).set('access_token', TOKEN || '');
  const res = await fetch(url, method === 'GET' ? undefined : { method: 'POST', body: bodyParams });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    // Graph intermittently returns a bare non-JSON "Service Unavailable" body.
    throw new Error(`non-JSON response from ${path}: ${text.slice(0, 120)}`);
  }
  if (j.error) {
    const e = j.error;
    throw new Error(`${e.error_user_msg || e.message} (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})`);
  }
  return j;
}
const get = (p, q) => graph(p, q, 'GET');
const post = (p, q) => graph(p, q, 'POST');

async function main() {
  console.log(`${ACCOUNT}  ${EXECUTE ? 'EXECUTING' : 'DRY RUN -- nothing will be written'}`);

  if (!TOKEN) {
    console.error('\n  x META_ADS_ACCESS_TOKEN is unset -- even a dry run reads live state.');
    process.exit(2);
  }

  const price = priceFor(START);

  // ---- pre-flight assertions. All of these run in the dry run too, because
  // ---- url_tags cannot be fixed after creation.
  console.log('\nPRE-FLIGHT');

  const straddles = at(START) <= at(EARLY_BIRD_THROUGH) && at(EVENT_DATE) > at(EARLY_BIRD_THROUGH);
  if (straddles) {
    // Informational, not a refusal. An early-bird line that states its own
    // deadline is honest advertising; the copy below says "through Sept 7".
    console.log(`  note     starts ${START}, inside early bird (ends ${EARLY_BIRD_THROUGH}).`);
    console.log(`           Copy will read "Early bird ${usd(price)} through Sept 7" -- the deadline is stated,`);
    console.log(`           so it stays honest after it passes. Regular is ${usd(EVENT.pricing.regular)}.`);
  } else {
    console.log(`  ok       price ${usd(price)} is true for the whole run (early bird ended ${EARLY_BIRD_THROUGH})`);
  }

  try {
    assertCleanLink(LINK);
    console.log('  ok       destination link carries no utm_* (Meta appends url_tags; both would send two utm_source)');
  } catch (e) {
    console.error(`  x ${e.message}`);
    process.exit(2);
  }

  let tags;
  try {
    tags = ADS.map((a) => ({ ...a, url_tags: urlTags(a.utm), utm_content: utmContent(a.utm) }));
    assertUniqueContent(tags.map((a) => a.utm_content));
    console.log(`  ok       utm_campaign ${utmCampaign('LX')}`);
    for (const a of tags) console.log(`  ok       ${a.key.padEnd(7)} utm_content ${a.utm_content}`);
  } catch (e) {
    console.error(`  x ${e.message}`);
    process.exit(2);
  }

  // Cross-run collision check the batch-local assert cannot do.
  const live = await get(`${ACCOUNT}/ads`, { fields: 'name,creative{url_tags}', limit: '200' });
  const taken = new Set(
    (live.data || [])
      .map((a) => String((a.creative || {}).url_tags || '').match(/utm_content=([^&]+)/))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  const clash = tags.filter((a) => taken.has(a.utm_content));
  if (clash.length) {
    console.error(`  x utm_content already live on this account: ${clash.map((c) => c.utm_content).join(', ')}`);
    console.error('    assertUniqueContent is batch-local only; this is the cross-run check. Pick a new creative slug.');
    process.exit(2);
  }
  console.log(`  ok       neither utm_content collides with the ${taken.size} already live`);

  const existing = await get(`${ACCOUNT}/campaigns`, { fields: 'name,id,effective_status', limit: '200' });
  const dupe = (existing.data || []).find((c) => c.name === CAMPAIGN_NAME);
  if (dupe) {
    console.error(`  x a campaign named "${CAMPAIGN_NAME}" already exists (${dupe.id}, ${dupe.effective_status}).`);
    console.error('    Meta accepts duplicate names silently, so this refuses rather than building a second one.');
    process.exit(2);
  }
  console.log(`  ok       no campaign named "${CAMPAIGN_NAME}" exists yet`);

  // ---- budget exposure, read live so the number is not stale
  const lxTraffic = await get(LX_TRAFFIC_CAMPAIGN, { fields: 'name,daily_budget,effective_status,stop_time' });
  console.log('\nBUDGET EXPOSURE');
  console.log(`  existing  ${lxTraffic.name.padEnd(22)} ${money(lxTraffic.daily_budget).padStart(7)}/day  ${lxTraffic.effective_status}`);
  console.log(`  new       ${CAMPAIGN_NAME.padEnd(22)} ${money(DAILY_CENTS).padStart(7)}/day  (PAUSED on create)`);
  const days = Math.max(0, Math.round((at(EVENT_DATE) - at(START)) / dayMs));
  console.log(`  combined  from ${START} to ${EVENT_DATE} (${days} days)`);
  console.log(`            ${money(Number(lxTraffic.daily_budget) + DAILY_CENTS)}/day  x ${days} = ${money((Number(lxTraffic.daily_budget) + DAILY_CENTS) * days)} if BOTH run`);
  console.log(`            ${money(DAILY_CENTS)}/day  x ${days} = ${money(DAILY_CENTS * days)} if only the new one runs`);
  console.log('  !!        both campaigns target the SAME people in the same cities. Run concurrently');
  console.log('            and they bid against each other -- brand.json _ad_set_note calls that out');
  console.log('            as the live account\'s existing bug. Pausing "Loxleys | Traffic" when this');
  console.log('            starts is the cleaner read AND the cheaper one. That is a human decision;');
  console.log('            this script will not touch the running campaign.');

  // ---- the plan
  console.log('\nPLAN');
  console.log(`  campaign  ${CAMPAIGN_NAME}`);
  console.log(`            objective OUTCOME_SALES, CBO ${money(DAILY_CENTS)}/day, LOWEST_COST_WITHOUT_CAP, PAUSED`);
  console.log(`            ${START} -> ${EVENT_DATE}T16:30:00-0400   (start is T-${tMinus(START)}, phase "${PHASE}")`);
  console.log(`  placements ${PLACEMENTS === 'restricted' ? 'fb+ig feed/story/reels -- no audience_network, no reels_overlay' : 'automatic (all)'}`);
  for (const a of tags) {
    console.log(`\n  ad set    ${a.adSetName}`);
    console.log(`            OFFSITE_CONVERSIONS / IMPRESSIONS, promoted_object pixel ${PIXEL_ID} PURCHASE`);
    console.log(`            genders ${JSON.stringify(a.genders)}, age 22-45, Harrisburg+Lancaster+York 20mi`);
    console.log('            targeting_automation.advantage_audience 0, NO gender expansion, NO relationship filter');
    console.log(`  ad        ${a.adName}   (PAUSED)`);
    console.log(`            video ${a.videoId}  thumb ${a.imageHash}   [reused, not re-uploaded]`);
    console.log(`            headline  ${a.headline}`);
    console.log(`            body      ${body(a.key, price).split('\n')[0]} ...`);
    console.log(`            price     ${usd(price)}${a.key === 'female' ? '  + 2-for-1 line' : ''}`);
    console.log(`            link      ${LINK}`);
    console.log(`            url_tags  ${a.url_tags}`);
  }

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute.');
    return;
  }

  // ---- write
  console.log('\nEXECUTING');
  const campaign = await post(`${ACCOUNT}/campaigns`, {
    name: CAMPAIGN_NAME,
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: '[]',
    daily_budget: String(DAILY_CENTS),
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    start_time: `${START}T00:00:00-0400`,
    stop_time: `${EVENT_DATE}T16:30:00-0400`,
  });
  console.log(`  campaign  ${campaign.id}`);

  let failed = 0;
  for (const a of tags) {
    const adset = await post(`${ACCOUNT}/adsets`, {
      name: a.adSetName,
      campaign_id: campaign.id,
      status: 'PAUSED',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      destination_type: 'WEBSITE',
      promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
      targeting: JSON.stringify(targeting(a.genders)),
      start_time: `${START}T00:00:00-0400`,
      end_time: `${EVENT_DATE}T16:30:00-0400`,
    });
    console.log(`  ad set    ${adset.id}  ${a.adSetName}`);

    const creative = await post(`${ACCOUNT}/adcreatives`, {
      name: `LX ${a.key} ${PHASE} 2026-09 (video)`,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        instagram_user_id: IG_USER_ID,
        video_data: {
          video_id: a.videoId,
          image_hash: a.imageHash,
          message: body(a.key, price),
          title: a.headline,
          link_description: a.description,
          call_to_action: { type: 'LEARN_MORE', value: { link: LINK } },
        },
      }),
      url_tags: a.url_tags,
    });
    console.log(`  creative  ${creative.id}`);

    const ad = await post(`${ACCOUNT}/ads`, {
      name: a.adName,
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL_ID] }]),
      status: 'PAUSED',
    });
    console.log(`  ad        ${ad.id}  ${a.adName}`);

    // ---- read back. A 200 is not evidence.
    const backSet = await get(adset.id, { fields: 'optimization_goal,promoted_object,targeting,effective_status' });
    const backAd = await get(ad.id, { fields: 'name,effective_status,creative{id,url_tags},tracking_specs' });
    const ta = (backSet.targeting || {}).targeting_automation || {};
    const genderExpansion = (ta.individual_setting || {}).gender;
    const servedGenders = JSON.stringify((backSet.targeting || {}).genders);

    const checks = [
      ['goal', backSet.optimization_goal === 'OFFSITE_CONVERSIONS', backSet.optimization_goal],
      ['pixel', (backSet.promoted_object || {}).pixel_id === PIXEL_ID, (backSet.promoted_object || {}).custom_event_type],
      ['genders', servedGenders === JSON.stringify(a.genders), servedGenders],
      ['gender expansion OFF', genderExpansion !== 1, genderExpansion === undefined ? 'unset' : String(genderExpansion)],
      ['url_tags', (backAd.creative || {}).url_tags === a.url_tags, (backAd.creative || {}).url_tags],
    ];
    for (const [label, ok, seen] of checks) {
      console.log(`  ${ok ? 'OK  ' : '!!  '}      ${label.padEnd(22)} ${seen}`);
      if (!ok) failed += 1;
    }
    if (genderExpansion === 1) {
      console.log('  !!        Meta enabled gender expansion server-side. This ad set WILL serve men.');
      console.log('            Turn Advantage+ audience off in Ads Manager before starting it.');
    }
  }

  console.log(`\n  ${failed ? `${failed} check(s) FAILED` : 'all checks passed'}`);
  if (failed) process.exitCode = 1;

  console.log('\nNEXT, by hand:');
  console.log('  - Everything is PAUSED. Nothing spends until you start it.');
  console.log('  - Decide about "Loxleys | Traffic": running both bids against yourself.');
  console.log('  - Confirm the tags landed independently:  npm run ads:lint');
  console.log('  - Confirm the pixel is in tracking:       npm run ads:review');
  console.log(`  - This is a bet, not a fix (p = 0.224). Score it after ${EVENT_DATE}.`);
}

main().catch((e) => {
  console.error(`\n  x ${e.message}`);
  process.exitCode = 1;
});
