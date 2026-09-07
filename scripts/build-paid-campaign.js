#!/usr/bin/env node
/**
 * scripts/build-paid-campaign.js
 *
 * Builds one event's Meta paid campaigns from content/brand.json's
 * `paid_template.playbook_v2`, and prints the dated spend plan that goes
 * with it.
 *
 * REWRITTEN 2026-09-06. Taylor, directly: "I don't want to retain the old
 * shape. I want the new playbook for go forward." The old shape (one
 * OUTCOME_TRAFFIC campaign, female/male/retargeting ad sets under one CBO
 * budget) is GONE from this script, not merely superseded. It built the
 * account into the state reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md
 * found: OUTCOME_TRAFFIC produced zero purchases across $740.23 lifetime
 * spend, and heavier women-targeted spend correlated with a WORSE actual
 * women's ticket share, on top of a live delivery failure independent of
 * that correlation (a women-only ad set spending ~4% of its assigned
 * budget). Every campaign actually running had already been rebuilt by hand
 * to the shape this script now builds; this closes the gap between the
 * account and the one tool meant to build for it.
 *
 * WHAT IT BUILDS NOW: playbook_v2, section 8 of that report
 *
 * TWO campaigns per event, never one: `<Event> | Cold` and `<Event> |
 * Retargeting`. Both OUTCOME_SALES, OFFSITE_CONVERSIONS optimizing the
 * account's own PURCHASE pixel, 7-day click + 1-day view attribution, PAUSED
 * on creation. Every ad set is broad -- no `genders` restriction, ever,
 * either campaign, any phase. The phase math (Seed/Build/Close, a
 * cold:retarget split that VARIES by phase, the $2.00 floor-priority rule,
 * the cold-start rule for a runway under 21 days) is NOT reimplemented here
 * -- it is required from scripts/budget-ladder.js, the same offline-tested
 * arithmetic content/paid-campaigns.json's registry drives nightly. This
 * script is a thin, live-API front end on top of it, not a second copy of
 * the math to drift out of sync.
 *
 * WHAT THIS SCRIPT STILL DOES NOT DO
 *
 * It builds STRUCTURE, not ads: campaign + one ad set each, PAUSED, no
 * creative attached. That matches its own prior scope (the legacy version
 * never attached creative either) and matches reality for a brand-new event
 * -- Tellus Oct 6 has no creative yet, so there is nothing to attach. Once
 * creative exists, ads are built and attached separately.
 *
 * The Retargeting campaign's ad set additionally needs a custom audience
 * that does not exist until the Cold campaign has actually run -- pass
 * --retargeting-audience=<id> once a pool exists; without it, the
 * Retargeting CAMPAIGN is still created (so it has a real campaign_id to
 * register), but its ad set is not, and the output says so plainly rather
 * than guessing an audience.
 *
 * Ad copy: paid_template.caption_templates is keyed by the old female/male/
 * retargeting ad sets and has no broad-targeting counterpart yet -- see
 * playbook_v2._gender_rule's "where the reach-women effort goes instead" for
 * what replaces it (creative INSIDE the broad ad set, not a targeting axis).
 * --captions/--handoff refuse rather than render copy for ad sets that no
 * longer exist.
 *
 * PLANNING NEEDS NO TOKEN
 *
 * Everything up to --execute runs offline against brand.json. Only --execute
 * touches the API, and even --execute only ever creates PAUSED objects --
 * nothing spends until a human starts it.
 *
 * PROVEN FIELD VALUES, NOT GUESSED
 *
 * The pixel id, promoted_object shape, attribution_spec and
 * targeting_automation values below are copied from scripts/meta-create-lx-
 * sales-campaign.js, the hand-built OUTCOME_SALES campaign verified against
 * the live account on 2026-09-05 -- including its read-back checks, which
 * caught Meta silently enabling gender expansion server-side on a targeting
 * shape that looked correct on write. This script performs the same
 * read-back verification for the same reason: a 200 is not evidence.
 *
 * Usage:
 *   node scripts/build-paid-campaign.js --event=TL2                 # plan only
 *   node scripts/build-paid-campaign.js --event=TL2 --budget=250
 *   node scripts/build-paid-campaign.js --event=TL2 --runway=14     # cold-start
 *   node scripts/build-paid-campaign.js --event=TL2 --from-adset=1202...
 *   node scripts/build-paid-campaign.js --event=TL2 --retargeting-audience=1202... --execute
 *
 * --execute additionally requires META_ADS_ACCESS_TOKEN.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./budget-ladder.js');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

// Proven on the live account 2026-09-05 (scripts/meta-create-lx-sales-campaign.js)
// -- the account's one conversions pixel, matching every OUTCOME_SALES ad set
// currently running.
const PIXEL_ID = '4390442851170732';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const EXECUTE = flag('execute');
const money = (c) => `$${(Number(c) / 100).toFixed(2)}`;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = 86400000;
const at = (d) => new Date(`${d}T12:00:00-04:00`).getTime();

// ─── Load the source of truth ──────────────────────────────────────

const brandPath = path.join(__dirname, '..', 'content', 'brand.json');
const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
const PB = brand.paid_template && brand.paid_template.playbook_v2;
if (!PB) {
  console.error('✗ content/brand.json has no paid_template.playbook_v2. Is this branch behind?');
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

const warnings = [];

// ─── The dated plan, from budget-ladder.js's own tested arithmetic ─

const TOTAL = Number(arg('budget', PB.reference_total_dollars));
const TODAY = String(arg('today', iso(Date.now())));
const runwayDays = Number(arg('runway', PB._lead_time.default_days));
if (!Number.isFinite(runwayDays) || runwayDays < 1) {
  console.error('✗ --runway must be a positive number of days.');
  process.exit(2);
}
const runwayStart = iso(at(ev.date) - runwayDays * dayMs);
if (runwayDays < PB._lead_time.default_days) {
  warnings.push(`--runway=${runwayDays} is a cold start (default is ${PB._lead_time.default_days}). `
    + `${PB._lead_time.cold_start_rule}`);
}

const rows = L.phaseWindowsV2(ev.date, runwayStart, PB);
const scale = TOTAL / PB.reference_total_dollars;
const plan = rows.map((r) => {
  const { cold, retarget } = L.roleRates(r, scale);
  return { ...r, cold, retarget };
});

// Cross-check the price step against the measured inflection, same reasoning
// as the legacy version: brand.json sets early_bird_through per event; the
// playbook's Seed/Build boundary sits at T-15/T-14 because that is where
// cumulative sales go 27% -> 55% (paid_template._measured). If an event's
// early bird lands somewhere else, the two schedules have drifted apart and
// the person running this should know before spending.
let ebNote = 'no early bird on this event';
if (ev.pricing && ev.pricing.early_bird_through) {
  const ebOffset = Math.round((at(ev.date) - at(ev.pricing.early_bird_through)) / dayMs);
  ebNote = `early bird ends ${ev.pricing.early_bird_through} = T-${ebOffset}`;
  if (ebOffset < 14 || ebOffset > 15) {
    warnings.push(`early_bird_through is T-${ebOffset}, but Seed/Build's boundary (the measured `
      + 'inflection) sits at T-15/T-14. One of the two should move.');
  }
}

// ─── Print the plan ────────────────────────────────────────────────

console.log('');
console.log(`${ev.name}  (${eventKey})  ${ev.date}   ${ev.venue}, ${ev.city}`);
console.log(`today ${TODAY}   runway ${runwayDays}d${runwayDays === PB._lead_time.default_days ? '' : ` (default ${PB._lead_time.default_days}d)`}   ${ebNote}`);
if (ev.pricing) {
  const p = ev.pricing;
  console.log(`pricing  ${p.early_bird ? `early $${p.early_bird} -> ` : ''}regular $${p.regular}${p.disputed ? '   ** DISPUTED in brand.json **' : ''}`);
}
console.log(`budget   $${TOTAL} total${TOTAL === PB.reference_total_dollars ? ' (the playbook\'s own reference)' : ` (${(scale).toFixed(2)}x the $${PB.reference_total_dollars} reference)`}`);
console.log('');

for (const role of PB.roles) {
  console.log(`campaign  "${ev.name} | ${role.name_suffix}"`);
  console.log(`          ${PB.campaign.objective} / ${PB.campaign.optimization_goal} / ${PB.campaign.billing_event}, PAUSED, stops ${ev.date}`);
  console.log(`          ad set: ${role.targeting}`);
}
console.log('');

console.log('phase      window                       split    daily cold   daily retarget');
for (const p of plan) {
  const isNow = TODAY >= p.from && TODAY <= p.to;
  const cold = p.cold ? money(p.cold.cents) : '—';
  const ret = p.retarget ? money(p.retarget.cents) + (p.retarget.floored ? ' (floor)' : '')
    : 'HOLD (too small)';
  console.log(
    `${p.key.padEnd(9)}  ${`${p.from} .. ${p.to}`.padEnd(26)} `
    + `${`${(p.cold_share * 100).toFixed(0)}/${(p.retarget_share * 100).toFixed(0)}`.padEnd(8)} `
    + `${cold.padStart(11)}   ${ret.padStart(11)}${isNow ? '   <- today' : ''}`,
  );
}
console.log('');

for (const p of plan) console.log(`  ${p.key.padEnd(9)} ${p.why}`);
console.log('');

if (warnings.length) {
  console.log('WARNINGS');
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

// ─── Ad copy: refuse rather than render a shape that no longer exists ──
if (flag('captions') || flag('handoff')) {
  console.error('✗ paid_template.caption_templates is keyed by the retired female/male/');
  console.error('  retargeting ad sets and has no broad-targeting counterpart yet -- see');
  console.error('  playbook_v2._gender_rule in content/brand.json for what replaces gender');
  console.error('  targeting (creative INSIDE the broad ad set, not a separate axis). Write');
  console.error('  new copy directly rather than rendering the old templates against a shape');
  console.error('  that no longer matches the live account.');
  process.exit(2);
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

async function graph(p, params = {}, method = 'GET') {
  const url = new URL(`${GRAPH}/${p}`);
  const bodyParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (method === 'GET') url.searchParams.set(k, v);
    else bodyParams.set(k, v);
  }
  (method === 'GET' ? url.searchParams : bodyParams).set('access_token', token);
  const res = await fetch(url, method === 'GET' ? undefined : { method: 'POST', body: bodyParams });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response from ${p}: ${text.slice(0, 120)}`);
  }
  if (j.error) {
    const e = j.error;
    throw new Error(`${e.error_user_msg || e.message} (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})`);
  }
  return j;
}
const get = (p, q) => graph(p, q, 'GET');
const post = (p, q) => graph(p, q, 'POST');

/** Meta's own city key for a market, looked up rather than hardcoded. */
async function resolveGeo(geo) {
  const wanted = geo.cities || [];
  if (!wanted.length) throw new Error('market geo has no cities');
  const out = [];
  for (const c of wanted) {
    const res = await get('search', {
      type: 'adgeolocation',
      location_types: JSON.stringify(['city']),
      q: c.city,
    });
    // Match on EXACT name, country and region -- "Lancaster" alone also
    // matches West Lancaster and towns of the same name in other states.
    const hits = (res.data || []).filter(
      (r) => r.country_code === c.country
        && (!c.region || r.region === c.region)
        && String(r.name).toLowerCase() === String(c.city).toLowerCase(),
    );
    if (!hits.length) throw new Error(`no Meta city match for ${c.city}, ${c.region}`);
    if (hits.length > 1) {
      throw new Error(`ambiguous Meta match for ${c.city}, ${c.region}: ${hits.map((h) => h.key).join(', ')}`);
    }
    out.push({ key: hits[0].key, radius: c.radius_miles, distance_unit: 'mile' });
    console.log(`  geo  ${c.city}, ${c.region} -> ${hits[0].key} @ ${c.radius_miles}mi`);
  }
  // MUST be wrapped in geo_locations -- a bare {cities:[...]} created an empty
  // campaign on 2026-08-23 whose ad sets were then rejected for having no
  // location at all. Meta does not validate the campaign against the ad sets
  // that will follow it, so a malformed targeting shape fails HALFWAY.
  return { geo_locations: { cities: out } };
}

/**
 * Broad targeting for a playbook_v2 ad set -- no `genders` key at all, which
 * is Meta's own "all genders" default, and the whole point of this rewrite.
 * advantage_audience is still explicitly 0: it lets Meta spend on lookalikes
 * outside the given geo, which is a real expansion this account has not
 * opted into, gender aside.
 */
function broadTargeting(baseGeo, audienceId) {
  const t = {
    ...baseGeo,
    age_min: 22,
    age_max: 45,
    targeting_automation: { advantage_audience: 0 },
  };
  if (audienceId) t.custom_audiences = [{ id: audienceId }];
  return t;
}

async function createCampaign(name) {
  const existing = await get(`${ACCOUNT}/campaigns`, { fields: 'name,id,effective_status', limit: '200' });
  const dupe = (existing.data || []).find((c) => c.name === name);
  if (dupe) throw new Error(`a campaign named "${name}" already exists (${dupe.id}, ${dupe.effective_status}) -- Meta accepts duplicate names silently, so this refuses rather than building a second one`);

  return post(`${ACCOUNT}/campaigns`, {
    name,
    objective: PB.campaign.objective,
    status: 'PAUSED',
    special_ad_categories: '[]',
    start_time: `${TODAY}T00:00:00-0400`,
    stop_time: `${ev.date}T16:30:00-0400`,
  });
}

async function createAdSet(campaignId, name, dailyCents, targeting) {
  const set = await post(`${ACCOUNT}/adsets`, {
    name,
    campaign_id: campaignId,
    status: 'PAUSED',
    optimization_goal: PB.campaign.optimization_goal,
    billing_event: PB.campaign.billing_event,
    destination_type: 'WEBSITE',
    daily_budget: String(dailyCents),
    promoted_object: JSON.stringify({ pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' }),
    // SETTABLE ONLY AT CREATION (code 1/1504040 on a live edit). Every prior
    // OUTCOME_SALES ad set built for this account carries this exact window --
    // matching it, not choosing a fresh one, is what keeps the account's
    // measurements comparable across campaigns.
    attribution_spec: JSON.stringify([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 },
    ]),
    targeting: JSON.stringify(targeting),
    start_time: `${TODAY}T00:00:00-0400`,
    end_time: `${ev.date}T16:30:00-0400`,
  });
  // Read back. A 200 is not evidence -- meta-create-lx-sales-campaign.js
  // caught Meta silently enabling gender expansion server-side on a shape
  // that looked correct on write.
  const back = await get(set.id, { fields: 'optimization_goal,promoted_object,targeting,attribution_spec,daily_budget' });
  const ta = (back.targeting || {}).targeting_automation || {};
  const genderExpansion = (ta.individual_setting || {}).gender;
  const checks = [
    ['goal', back.optimization_goal === PB.campaign.optimization_goal, back.optimization_goal],
    ['pixel', (back.promoted_object || {}).pixel_id === PIXEL_ID, (back.promoted_object || {}).custom_event_type],
    ['broad (no genders key)', (back.targeting || {}).genders === undefined, JSON.stringify((back.targeting || {}).genders)],
    ['gender expansion OFF', genderExpansion !== 1, genderExpansion === undefined ? 'unset' : String(genderExpansion)],
    ['attribution 7d click', (back.attribution_spec || []).some((x) => x.event_type === 'CLICK_THROUGH' && Number(x.window_days) === 7), JSON.stringify(back.attribution_spec || [])],
    ['daily_budget', Number(back.daily_budget) === dailyCents, money(back.daily_budget)],
  ];
  let failed = 0;
  for (const [label, ok, seen] of checks) {
    console.log(`    ${ok ? 'OK  ' : '!!  '}  ${label.padEnd(24)} ${seen}`);
    if (!ok) failed += 1;
  }
  if (genderExpansion === 1) {
    console.log('    !!    Meta enabled gender expansion server-side despite advantage_audience:0.');
    console.log('          Turn Advantage+ audience off in Ads Manager before starting this ad set.');
  }
  if (failed) throw new Error(`${failed} read-back check(s) failed on ad set ${set.id} -- see above`);
  return set;
}

async function rollback(campaignId, why) {
  console.error(`  rolling back campaign ${campaignId} (${why})...`);
  try {
    const u = new URL(`${GRAPH}/${campaignId}`);
    u.searchParams.set('access_token', token);
    const res = await (await fetch(u, { method: 'DELETE' })).json();
    console.error(res && res.success
      ? `  campaign ${campaignId} deleted. Nothing was left behind.`
      : `  DELETE returned ${JSON.stringify(res)} -- check campaign ${campaignId} by hand.`);
  } catch (delErr) {
    console.error(`  rollback ALSO failed (${delErr.message}). Delete campaign ${campaignId} by hand.`);
  }
}

async function main() {
  const first = plan.find((p) => TODAY >= p.from && TODAY <= p.to) || plan[0];
  if (!first.cold) throw new Error(`${first.key}'s scaled total is too small to fund even the cold campaign past the floor -- raise --budget`);

  console.log('\nEXECUTING');

  const sourceAdSet = arg('from-adset', null);
  let baseGeo;
  if (sourceAdSet) {
    const src = await get(sourceAdSet, { fields: 'name,targeting' });
    baseGeo = { geo_locations: (src.targeting || {}).geo_locations };
    console.log(`targeting copied from ${String(src.name).slice(0, 48)} (geo only -- broad has no genders to copy)`);
  } else {
    if (!market.geo) throw new Error(`markets.${ev.market} has no geo block to build targeting from`);
    baseGeo = await resolveGeo(market.geo);
  }
  if (!baseGeo || !baseGeo.geo_locations) {
    throw new Error('targeting has no geo_locations — refusing to create a campaign whose ad set would be rejected');
  }

  // ---- Cold: campaign + ad set, always built in full.
  const coldName = `${ev.name} | Cold`;
  const coldCampaign = await createCampaign(coldName);
  console.log(`\ncampaign  ${coldCampaign.id}  ${coldName}`);
  try {
    await createAdSet(coldCampaign.id, `${coldName} | broad`, first.cold.cents, broadTargeting(baseGeo));
  } catch (e) {
    console.error(`\n✗ Cold ad set failed: ${e.message}`);
    await rollback(coldCampaign.id, 'ad set failed');
    process.exit(1);
  }
  console.log(`  ad set built at the ${first.key} rate, ${money(first.cold.cents)}/day`);

  // ---- Retargeting: campaign always built (so it has a real campaign_id to
  // register); its ad set only if an audience was given -- see the header.
  const rtName = `${ev.name} | Retargeting`;
  const rtCampaign = await createCampaign(rtName);
  console.log(`\ncampaign  ${rtCampaign.id}  ${rtName}`);
  const audienceId = arg('retargeting-audience', null);
  if (!audienceId) {
    console.log('  ad set    NOT BUILT — needs --retargeting-audience=<id>. The campaign exists');
    console.log('            (register its id in content/paid-campaigns.json now if you want),');
    console.log('            but nothing will deliver until the ad set is added.');
  } else if (!first.retarget) {
    console.log(`  ad set    NOT BUILT — ${first.key}'s scaled total is too small to fund retargeting`);
    console.log('            past the $2.00 floor this phase. Build it once a later phase clears it.');
  } else {
    try {
      await createAdSet(rtCampaign.id, `${rtName} | broad`, first.retarget.cents, broadTargeting(baseGeo, audienceId));
      console.log(`  ad set built at the ${first.key} rate, ${money(first.retarget.cents)}/day`);
    } catch (e) {
      console.error(`\n✗ Retargeting ad set failed: ${e.message}`);
      await rollback(rtCampaign.id, 'ad set failed');
      process.exit(1);
    }
  }

  console.log('\nBoth campaigns created PAUSED. No ads attached yet -- this builds the');
  console.log('structure, not the art. Next, by hand:');
  console.log(`  - Register both campaign ids in content/paid-campaigns.json: role "cold" =`);
  console.log(`    ${coldCampaign.id}, role "retargeting" = ${rtCampaign.id}, playbook "v2",`);
  console.log(`    total ${TOTAL}, runway_start ${runwayStart}.`);
  console.log('  - Attach creative once it exists, then start each campaign yourself.');
  if (!audienceId) console.log('  - Come back with --retargeting-audience once a pool exists.');
  console.log('');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
