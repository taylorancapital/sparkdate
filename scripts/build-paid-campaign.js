#!/usr/bin/env node
/**
 * scripts/build-paid-campaign.js
 *
 * Builds one event's Meta paid campaign from content/brand.json's
 * `paid_template`, and prints the dated spend plan that goes with it.
 *
 * WHY THIS EXISTS
 *
 * Paid ran outside the system that governs organic. calendar_template's beats
 * are all ig/fb/tiktok; nothing described a campaign. Ads were built by hand in
 * Ads Manager, which is how Loxley's ended up built-but-paused with nothing to
 * catch it, and how the account ended up running "All Genders" + "Female" ad
 * sets that target the same women against each other.
 *
 * paid_template is the source of truth. This script is the thing that reads it.
 *
 * THE SPEND CURVE IS MEASURED, NOT ASSUMED
 *
 * 73% of tickets sell in the final 14 days (n=51, two COMPLETED events -- events
 * still on sale are censored and would bias the curve early). Budget is weighted
 * to match rather than spread flat: 15% prime, 35% convert, 45% close, 5% day-of.
 *
 * COMPRESSION APPLIES TO PRIME ONLY
 *
 * Buyer behaviour does not compress. People still buy in the last 14 days
 * whether the runway was 30 days or 21. Compressing every phase proportionally
 * would move the budget step to T-10 on a 21-day runway and miss the real
 * inflection at T-15, which is the opposite of the point. So prime absorbs all
 * of it and the back half stays anchored to absolute days before the event.
 *
 * PLANNING NEEDS NO TOKEN
 *
 * Everything up to --execute runs offline against brand.json. That is
 * deliberate: the plan is the part worth reading and arguing with, and
 * requiring a Meta token to see it would make it unreviewable. Only --execute
 * touches the API.
 *
 * TARGETING: COPY WHAT WORKS IN THE DESTINATION
 *
 * --from-adset=<id> copies targeting from a proven ad set and changes only
 * `genders`. That is the lesson from #256: copying the paused female CONVERSION
 * ad set failed with "not eligible for individual_setting" because it carried
 * Advantage+ automation invalid inside OUTCOME_TRAFFIC. Copying a sibling that
 * already runs in the destination worked.
 *
 * With no --from-adset (a genuinely new event with nothing to copy), targeting
 * is built from markets[].geo, resolving the city key through Meta's
 * adgeolocation search at run time rather than hardcoding a key nobody verified.
 *
 * RETARGETING IS NOT BUILT HERE
 *
 * paid_template puts it live_from `convert`, and it needs a custom audience
 * that does not exist until prime has run. Building it now produces a campaign
 * with an empty audience and nothing to show -- exactly why Loxley's
 * Retargeting was deliberately left out of #255. Pass
 * --retargeting-audience=<id> once a pool exists.
 *
 * Usage:
 *   node scripts/build-paid-campaign.js --event=LX                  # plan only
 *   node scripts/build-paid-campaign.js --event=LX --runway=21
 *   node scripts/build-paid-campaign.js --event=LX --budget=200
 *   node scripts/build-paid-campaign.js --event=LX --from-adset=1202... --execute
 *
 * --execute additionally requires META_ADS_ACCESS_TOKEN.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const EXECUTE = flag('execute');
const money = (c) => `$${(c / 100).toFixed(2)}`;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// ─── Load the source of truth ──────────────────────────────────────

const brandPath = path.join(__dirname, '..', 'content', 'brand.json');
const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
const PT = brand.paid_template;
if (!PT) {
  console.error('✗ content/brand.json has no paid_template. Is this branch behind?');
  process.exit(2);
}

const eventKey = String(arg('event', '')).toUpperCase();
if (!eventKey) {
  console.error('✗ --event=<KEY> is required. Known: ' + Object.keys(brand.events).join(', '));
  process.exit(2);
}
const ev = brand.events[eventKey];
if (!ev) {
  console.error(`✗ No event "${eventKey}". Known: ` + Object.keys(brand.events).join(', '));
  process.exit(2);
}

const market = brand.markets[ev.market] || {};
const eventDate = new Date(`${ev.date}T00:00:00Z`);

// ─── Runway and compression ────────────────────────────────────────

const runway = Number(arg('runway', PT.runway.reference_days));
const MIN = PT.runway.minimum_days;
if (!Number.isFinite(runway) || runway < 1) {
  console.error('✗ --runway must be a positive number of days.');
  process.exit(2);
}

const warnings = [];
if (runway < MIN) {
  warnings.push(
    `runway ${runway}d is below the stated minimum of ${MIN}d. ` +
    'Prime is what shrinks, and prime is what builds the retargeting pool.'
  );
}

// Prime is the only phase that compresses; everything from T-15 is anchored to
// absolute days before the event, because that is where the buying happens.
const primeStart = runway;      // T-<runway>
const primeEnd = 16;            // through T-16
const primeDays = Math.max(0, primeStart - primeEnd + 1);
if (primeDays === 0) {
  warnings.push(
    `runway ${runway}d leaves NO prime phase (it ends at T-16). ` +
    'Retargeting will launch with no audience pool to work.'
  );
}

// ─── The dated plan ────────────────────────────────────────────────

const totalBudget = arg('budget', null);
const totalCents = totalBudget ? Math.round(Number(totalBudget) * 100) : null;

const phaseWindows = {
  build: { from: primeStart, to: primeStart, days: 1 },
  prime: { from: primeStart, to: primeEnd, days: primeDays },
  step: { from: 15, to: 15, days: 1 },
  convert: { from: 14, to: 8, days: 7 },
  close: { from: 7, to: 1, days: 7 },
  day_of: { from: 0, to: 0, days: 1 },
};

const plan = PT.phases.map((ph) => {
  const w = phaseWindows[ph.key];
  const cents = totalCents === null ? null : Math.round(totalCents * ph.spend_share);
  const daily = cents && w.days > 0 ? Math.round(cents / w.days) : null;
  return {
    key: ph.key,
    startsOn: iso(addDays(eventDate, -w.from)),
    endsOn: iso(addDays(eventDate, -w.to)),
    days: w.days,
    share: ph.spend_share,
    cents,
    daily,
    compresses: ph.compresses,
    action: ph.action,
  };
});

// Cross-check the price step against the measured inflection. brand.json sets
// early_bird_through per event; paid_template puts the budget step at T-15
// because that is where cumulative sales go 27% -> 55%. If an event's early
// bird lands somewhere else, the two schedules have drifted apart and the
// person running this should know before spending.
let ebNote = 'no early bird on this event';
if (ev.pricing && ev.pricing.early_bird_through) {
  const eb = new Date(`${ev.pricing.early_bird_through}T00:00:00Z`);
  const ebOffset = Math.round((eventDate - eb) / 86400000);
  ebNote = `early bird ends ${ev.pricing.early_bird_through} = T-${ebOffset}`;
  if (ebOffset !== 15) {
    warnings.push(
      `early_bird_through is T-${ebOffset}, but the budget step is at T-15 ` +
      '(the measured inflection). One of the two should move.'
    );
  }
}

// ─── Print the plan ────────────────────────────────────────────────

console.log('');
console.log(`${ev.name}  (${eventKey})  ${ev.date}   ${ev.venue}, ${ev.city}`);
console.log(`runway ${runway}d${runway === PT.runway.reference_days ? '' : ` (reference ${PT.runway.reference_days}d)`}   ${ebNote}`);
if (ev.pricing) {
  const p = ev.pricing;
  console.log(`pricing  ${p.early_bird ? `early $${p.early_bird} -> ` : ''}regular $${p.regular}${p.disputed ? '   ** DISPUTED in brand.json **' : ''}`);
}
console.log('');

console.log(`campaign  "${ev.name} | Traffic"`);
console.log(`          ${PT.campaign.objective} / ${PT.campaign.optimization_goal} / ${PT.campaign.billing_event} / ${PT.campaign.bid_strategy}`);
console.log(`          CBO, created PAUSED, stops ${ev.date}`);
console.log('');

const buildable = PT.ad_sets.filter((a) => a.key !== 'retargeting');
for (const a of buildable) {
  console.log(`ad set    "${ev.name} | ${a.key} | Traffic"   ${Math.round(a.budget_share * 100)}% of ad-set weight`);
  console.log(`          ${a.targeting}`);
  if (a.offer) console.log(`          offer: ${a.offer}`);
}
const rt = PT.ad_sets.find((a) => a.key === 'retargeting');
const rtAudience = arg('retargeting-audience', null);
console.log(`ad set    "${ev.name} | retargeting"   ${rtAudience ? `audience ${rtAudience}` : 'NOT BUILT — needs --retargeting-audience'}`);
console.log(`          live_from ${rt.live_from}: nothing to retarget until prime has built the pool`);
console.log('');

console.log('phase      window                       days   share   budget     daily');
for (const p of plan) {
  const b = p.cents === null ? '     —' : money(p.cents).padStart(7);
  const d = p.daily === null ? '     —' : money(p.daily).padStart(7);
  const win = p.days <= 1 ? p.startsOn : `${p.startsOn} .. ${p.endsOn}`;
  console.log(
    `${p.key.padEnd(9)}  ${win.padEnd(26)} ${String(p.days).padStart(4)}   ` +
    `${String(Math.round(p.share * 100)).padStart(3)}%  ${b}  ${d}${p.compresses ? '   (compresses)' : ''}`
  );
}
console.log('');
if (totalCents === null) {
  console.log('No --budget given, so no dollar figures. Pass --budget=<total dollars for the run>.');
  console.log('');
}

for (const p of plan) console.log(`  ${p.key.padEnd(9)} ${p.action}`);
console.log('');

// Compressing prime while holding its 15% share fixed raises its DAILY rate.
// Squeezed hard enough it overtakes convert, which silently inverts the whole
// premise -- spending fastest during the phase that produces 18% of sales and
// slower during the one that produces 27%. The share is right; the rate is not.
const primeP = plan.find((x) => x.key === 'prime');
const convertP = plan.find((x) => x.key === 'convert');
if (primeP.daily && convertP.daily && primeP.daily > convertP.daily) {
  warnings.push(
    `prime runs ${money(primeP.daily)}/day against convert's ${money(convertP.daily)}/day. ` +
    'Compression has inverted the curve -- it now spends fastest before the buying starts. ' +
    'Lower --budget, lengthen the runway, or accept that prime is really a burst.'
  );
}

if (warnings.length) {
  console.log('WARNINGS');
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (!EXECUTE) {
  console.log('Plan only. Nothing was created. Re-run with --execute (needs META_ADS_ACCESS_TOKEN).');
  console.log('');
  process.exit(0);
}

// ─── Execute ───────────────────────────────────────────────────────

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) {
  console.error('✗ --execute needs META_ADS_ACCESS_TOKEN. Copy it from the GitHub secret or Vercel.');
  process.exit(2);
}

async function get(p, params = {}) {
  const url = new URL(`${GRAPH}/${p}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const json = await (await fetch(url)).json();
  if (json.error) throw new Error(json.error.error_user_msg || json.error.message);
  return json;
}

async function post(p, fields) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const json = await (await fetch(`${GRAPH}/${p}`, { method: 'POST', body })).json();
  if (json.error) throw new Error(json.error.error_user_msg || json.error.message);
  return json;
}

/** Meta's own city key for a market, looked up rather than hardcoded. */
async function resolveGeo(geo) {
  const res = await get('search', {
    type: 'adgeolocation',
    location_types: JSON.stringify(['city']),
    q: geo.city,
  });
  const hit = (res.data || []).find(
    (r) => r.country_code === geo.country && (!geo.region || r.region === geo.region)
  );
  if (!hit) throw new Error(`no Meta city match for ${geo.city}, ${geo.region}`);
  return {
    cities: [{ key: hit.key, radius: geo.radius_miles, distance_unit: 'mile' }],
  };
}

async function main() {
  if (!totalCents) {
    console.error('✗ --execute needs --budget=<total dollars> to set the campaign budget.');
    process.exit(2);
  }

  // Campaign daily budget: the run's total spread over the days it actually
  // runs. CBO reallocates between the ad sets day to day; the phase weighting
  // above is what a human raises or lowers the budget to, not something Meta
  // enforces on its own.
  const runDays = Math.max(1, runway);
  const dailyCents = Math.max(100, Math.round(totalCents / runDays));

  const sourceAdSet = arg('from-adset', null);
  let baseTargeting = null;
  if (sourceAdSet) {
    const src = await get(sourceAdSet, { fields: 'name,targeting' });
    baseTargeting = src.targeting || {};
    console.log(`targeting copied from ${String(src.name).slice(0, 48)}`);
  } else {
    if (!market.geo) throw new Error(`markets.${ev.market} has no geo block to build targeting from`);
    baseTargeting = { ...(await resolveGeo(market.geo)), age_min: 22, age_max: 45 };
    console.log(`targeting built from markets.${ev.market}.geo (${market.geo.city}, ${market.geo.radius_miles}mi)`);
  }

  const camp = await post(`${ACCOUNT}/campaigns`, {
    name: `${ev.name} | Traffic`,
    objective: PT.campaign.objective,
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
    daily_budget: String(dailyCents),
    bid_strategy: PT.campaign.bid_strategy,
    stop_time: `${ev.date}T16:30:00-0400`,
  });
  const back = await get(camp.id, { fields: 'name,status,objective,daily_budget' });
  console.log(`OK  campaign ${camp.id}  ${back.objective}  ${back.status}  ${money(+back.daily_budget)}/day`);

  const GENDER = { female: [2], male: [1] };
  for (const a of buildable) {
    const set = await post(`${ACCOUNT}/adsets`, {
      name: `${ev.name} | ${a.key} | Traffic`,
      campaign_id: camp.id,
      optimization_goal: PT.campaign.optimization_goal,
      billing_event: PT.campaign.billing_event,
      attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 1 }]),
      targeting: JSON.stringify({ ...baseTargeting, genders: GENDER[a.key] }),
      end_time: `${ev.date}T16:30:00-0400`,
      // No per-ad-set budget: the campaign's CBO allocates between them, which
      // is the whole reason they share a campaign instead of bidding separately.
      status: 'PAUSED',
    });
    const sb = await get(set.id, { fields: 'name,status,optimization_goal' });
    console.log(`OK  ad set ${set.id}  ${sb.optimization_goal}  ${sb.status}  (${a.key})`);
  }

  console.log('');
  console.log('Created PAUSED. Ads still need creatives attached — this builds the');
  console.log('structure, not the art. Verify in Ads Manager before activating.');
  console.log('');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
