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
 * THIS SCRIPT STILL ONLY BUILDS THE LEGACY SHAPE (updated 2026-09-06)
 *
 * The template below builds an OUTCOME_TRAFFIC campaign with female/male ad
 * sets. reports/ADS_OBJECTIVE_GAP_ANALYSIS_2026-09-06.md found OUTCOME_TRAFFIC
 * produced ZERO purchases across $740.23 lifetime spend, and that heavier
 * women-targeted spend correlates with a WORSE actual women's ticket share --
 * plus a live, independent delivery failure (a women-only ad set spending ~4%
 * of its assigned budget). Every campaign currently running was built or
 * rebuilt by hand to OUTCOME_SALES with broad targeting, bypassing this script
 * entirely. Full spec: that report's section 8.
 *
 * THE LADDER SIDE OF THIS IS DONE. content/brand.json's paid_template now has
 * a `playbook_v2` block (objective OUTCOME_SALES, two campaigns -- cold and
 * retargeting -- broad targeting only, a cold:retarget split that varies by
 * phase) and scripts/budget-ladder.js computes its daily rates, fully
 * offline-tested (tests/budget-ladder.test.js). A registry entry with
 * `playbook: "v2"` gets laddered correctly THE MOMENT a real v2 campaign
 * exists.
 *
 * WHAT'S STILL MISSING is exactly that campaign: this script's --execute path
 * below still only knows how to build the legacy shape (one OUTCOME_TRAFFIC
 * campaign, three gender-split ad sets). Do NOT run --execute against a real
 * event with this script as-is -- it would build the shape the account has
 * already abandoned. Rewriting its campaign-creation logic to build_v2's two
 * campaigns is deliberately not done in the same pass that built the ladder
 * arithmetic: this script calls the live Marketing API with no offline test
 * coverage, and a rushed structural change to the part that actually creates
 * objects in the ad account is a worse risk than leaving this flag one more
 * pass. Everything ABOVE --execute (the plan, the dates, the dollar amounts)
 * is safe to read for a v2 event today; nothing after --execute is.
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

// ─── Claude Design handoff for paid creative ───────────────────────
//
// Mirrors scripts/design-handoff.js deliberately, including why it is shaped
// this way: earlier handoffs specified ONE piece, so Design built one, and
// front-loaded brand reference so the model spent its first turn confirming
// rather than producing. Brand block stays short; everything after it is the
// work, ad after ad, with the finished copy already written.
//
// Organic creative comes from queue.csv through design-handoff.js. Paid does
// not live in the queue -- see paid_template._comment -- so it needs its own
// emitter. The ART is the shared part; only the delivery differs.
function emitHandoff(slots, fill, needsEarlyBird) {
  const CT = PT.caption_templates;
  // Underscore keys are notes to humans, not sizes. Emitting _comment as a
  // size produced "**_comment** undefined×undefined" in the brief.
  const dimsAll = (brand.asset_rules && brand.asset_rules.paid_ad_dimensions) || {};
  const dims = Object.fromEntries(Object.entries(dimsAll).filter(([k]) => !k.startsWith('_')));
  const sets = ['female', 'male', 'retargeting'];

  // Count first, so the brief can say how many and Design does not stop early.
  const dimsAllRef = dimsAll;
  const jobs = [];
  sets.forEach(k => {
    const node = CT[k] || {};
    Object.keys(node).filter(p => !p.startsWith('_') && p !== 'offer_line').forEach(ph => {
      const c = node[ph];
      if (needsEarlyBird(c.primary_text) && !(ev.pricing || {}).early_bird) return;
      jobs.push({ set: k, phase: ph, c });
    });
  });

  const L = [];
  L.push(`# ${ev.name} — Meta ad creative`);
  L.push('');
  L.push(`**${jobs.length} ads to build · ${Object.keys(dims).length} sizes each**`);
  L.push('');
  L.push('Every ad below has its finished copy. Set the type, export the PNG. Do not');
  L.push('rewrite the copy, do not ask which to start with, do not stop after the first');
  L.push(`one. Work straight down the list and produce all ${jobs.length}.`);
  L.push('');
  L.push('If you can only manage part of it in one go, finish whole ads and tell me the');
  L.push('last one you completed. I will paste "continue from <id>" and you carry on.');
  L.push('');
  L.push('## The look — same as organic, then we start');
  L.push('');
  L.push('- Canvas **#0a0e27** navy. Text **#ffffff** headings, **#f5f3f0** body. One action colour: **#ff6b6b** coral. **#d4af37** gold for a single emphasised number only.');
  L.push('- Headlines **Playfair Display 900**, tight (-1px). Body/labels **Inter** 400–600. Never headline in Inter.');
  L.push('- Wordmark `SPARKDATE` bottom-left, coral, Inter 600, 12px, uppercase, 2px tracking.');
  L.push('');
  L.push('## Format — VIDEO, 3–5 seconds');
  L.push('');
  if (dimsAll._format) L.push('- ' + dimsAll._format);
  if (dimsAll._silent_first) L.push('- **Silent-first.** ' + dimsAll._silent_first);
  if (dimsAll._beats) L.push('- **Beats.** ' + dimsAll._beats);
  if (dimsAll._export) L.push('- **Export.** ' + dimsAll._export);
  L.push('');
  L.push('**Sizes — build every ad at all of these:**');
  L.push('');
  Object.entries(dims).forEach(([k, v]) => {
    L.push(`- **${k}** ${v.width}×${v.height}${v.note ? ` — ${v.note}` : ''}`);
  });
  L.push('');
  L.push('**One hard rule:** the copy below is the AD TEXT, which Meta renders outside');
  L.push('the video. Do NOT burn the primary text into the frames. The video carries the');
  L.push('headline and the event facts only — Meta penalises text-heavy creative, and the');
  L.push('primary text is already going in the ad itself.');
  L.push('');
  L.push('---');
  L.push('');

  jobs.forEach((j, i) => {
    const isRetarget = j.set === 'retargeting';
    L.push(`## ${i + 1}. \`${eventKey}-${j.set.toUpperCase()}-${j.phase.toUpperCase()}\``);
    L.push('');
    L.push(`Ad set **${j.set}** · phase **${j.phase}**`);
    L.push('');
    L.push('### On screen');
    L.push('');
    L.push('```');
    L.push(fill(j.c.headline));
    L.push('```');
    L.push('');
    L.push(`Plus the event facts, small: **${ev.venue}, ${ev.city}** · doors **${ev.doors || '6:30'}**.`);
    if (isRetarget) {
      L.push('');
      L.push('> This audience has already seen an ad. Do not re-introduce the event —');
      L.push('> lead with the date and the price, not the concept.');
    }
    L.push('');
    L.push('### Ad text (goes in Meta, NOT burned into the video)');
    L.push('');
    L.push('```');
    L.push(fill(j.c.primary_text));
    if (j.set === 'female' && CT.female.offer_line) {
      L.push('');
      L.push(CT.female.offer_line + '   <-- FEMALE AD SET ONLY');
    }
    L.push('```');
    L.push('');
    L.push(`- **Headline:** ${fill(j.c.headline)}`);
    L.push(`- **Description:** ${fill(j.c.description)}`);
    L.push('');
    L.push('---');
    L.push('');
  });

  L.push('## Do not put these in any ad');
  L.push('');
  L.push('- The 2-for-1 offer in the **male** or **retargeting** ad sets. Female only.');
  L.push('- Any attendance or ticket-count number that is not in `content/brand.json`.');
  L.push('- A price that contradicts the event block above.');
  L.push('');
  return L.join('\n');
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

// ─── Rendered ad copy ──────────────────────────────────────────────
//
// Templates live in brand.json; the event supplies the slots. Rendered here so
// the copy is reviewable in the same breath as the budget that will carry it,
// and so the text handed to Claude Design is finished rather than a template
// someone still has to fill in.
const CT = PT.caption_templates;
if (CT && (flag('captions') || flag('handoff'))) {
  const pr = ev.pricing || {};
  const dt = new Date(`${ev.date}T12:00:00Z`);
  const long = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const short = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const slots = {
    '{event_name}': ev.name,
    '{venue}': ev.venue,
    '{city}': ev.city,
    '{date_long}': long,
    '{date_short}': short,
    '{doors}': ev.doors || '6:30',
    '{price}': pr.regular ? `$${pr.regular}` : '',
    '{early_price}': pr.early_bird ? `$${pr.early_bird}` : '',
    '{early_through}': pr.early_bird_through || '',
  };
  const needsEarlyBird = (t) => t.includes('{early_price}') || t.includes('{early_through}');
  const fill = (t) => Object.entries(slots).reduce((a, [k, v]) => a.split(k).join(v), t);

  // Written to a file rather than stdout, matching design-handoff.js: the
  // brief is pasted into Claude Design whole, and the plan above would be
  // noise inside it.
  if (flag('handoff')) {
    const md = emitHandoff(slots, fill, needsEarlyBird);
    const out = arg('out', path.join('build', `paid-handoff-${eventKey}.md`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
    console.log('handoff  ' + md.split(String.fromCharCode(10)).length + ' lines -> ' + out);
    console.log('');
    process.exit(0);
  }

  console.log('AD COPY');
  console.log('');
  for (const setKey of ['female', 'male', 'retargeting']) {
    const node = CT[setKey] || {};
    const phases = Object.keys(node).filter((k) => !k.startsWith('_') && k !== 'offer_line');
    for (const ph of phases) {
      const c = node[ph];
      console.log(`  ${setKey} / ${ph}`);
      // An event with no early bird cannot render early-bird copy. Filling the
      // slots with empty strings would look finished and ship a broken
      // sentence -- "Early bird  through ." -- so it is skipped loudly.
      if (needsEarlyBird(c.primary_text) && !pr.early_bird) {
        console.log('     SKIPPED — template needs an early bird, this event has none');
        console.log('');
        continue;
      }
      console.log(fill(c.primary_text).split('\n').map((l) => (l ? '     ' + l : '')).join('\n'));
      console.log('');
      console.log(`     headline:     ${fill(c.headline)}`);
      console.log(`     description:  ${fill(c.description)}`);
      if (setKey === 'female' && CT.female.offer_line) {
        console.log(`     offer line:   ${CT.female.offer_line}   [FEMALE AD SET ONLY]`);
      }
      console.log('');
    }
  }
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
  // geo.cities is a LIST. A market is rarely one circle: Lancaster is really
  // the Lancaster-Harrisburg-York triangle, and a single 20-mile radius drops
  // two thirds of it.
  const wanted = geo.cities || [];
  if (!wanted.length) throw new Error('market geo has no cities');

  const out = [];
  for (const c of wanted) {
    const res = await get('search', {
      type: 'adgeolocation',
      location_types: JSON.stringify(['city']),
      q: c.city,
    });
    // Match on EXACT name as well as country and region. Searching "Lancaster"
    // returns both Lancaster and West Lancaster in Pennsylvania, and every one
    // of these names also exists in several other states -- York alone matches
    // Nebraska, New York and Maine. Taking the first hit was ordering-dependent
    // and would eventually have targeted the wrong town without saying so.
    const hits = (res.data || []).filter(
      (r) => r.country_code === c.country
        && (!c.region || r.region === c.region)
        && String(r.name).toLowerCase() === String(c.city).toLowerCase()
    );
    if (!hits.length) throw new Error(`no Meta city match for ${c.city}, ${c.region}`);
    if (hits.length > 1) {
      throw new Error(`ambiguous Meta match for ${c.city}, ${c.region}: ${hits.map((h) => h.key).join(', ')}`);
    }
    out.push({ key: hits[0].key, radius: c.radius_miles, distance_unit: 'mile' });
    console.log(`  geo  ${c.city}, ${c.region} -> ${hits[0].key} @ ${c.radius_miles}mi`);
  }

  // MUST be wrapped in geo_locations. Returning a bare { cities: [...] } is
  // what created an empty campaign on 2026-08-23: the campaign POST succeeded,
  // then every ad set was rejected with "Add at least one location or choose a
  // custom audience" because the targeting object had no geo_locations key at
  // all. Meta does not validate the campaign against the ad sets that will
  // follow, so a malformed targeting shape fails HALFWAY.
  return { geo_locations: { cities: out } };
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
  // The campaign is created at the START of prime, so it opens at the PRIME
  // daily rate -- not the run average.
  //
  // Averaging was the original behaviour and it quietly defeated the whole
  // point: $300 over a 30-day runway is $10/day flat, against a prime rate of
  // $3/day. Left alone that spends ~$150 during prime instead of $45, which is
  // 3.3x over on the phase that produces 18% of sales, and correspondingly
  // starves the last fortnight that produces 73%. The tool would have printed
  // the right schedule and then built the wrong campaign.
  //
  // The later steps are NOT automated. Meta has no native concept of "raise
  // this budget on that date", so each transition is a human editing the
  // campaign budget on the date the plan names. That is stated in the output
  // rather than left to be discovered.
  const primePhase = plan.find((x) => x.key === 'prime');
  const dailyCents = Math.max(100, primePhase && primePhase.daily ? primePhase.daily
                                 : Math.round(totalCents / runDays));

  const sourceAdSet = arg('from-adset', null);
  let baseTargeting = null;
  if (sourceAdSet) {
    const src = await get(sourceAdSet, { fields: 'name,targeting' });
    baseTargeting = src.targeting || {};
    console.log(`targeting copied from ${String(src.name).slice(0, 48)}`);
  } else {
    if (!market.geo) throw new Error(`markets.${ev.market} has no geo block to build targeting from`);
    baseTargeting = { ...(await resolveGeo(market.geo)), age_min: 22, age_max: 45 };
    console.log(`targeting built from markets.${ev.market}.geo (${(market.geo.cities || []).map((c) => c.city).join(', ')})`);
  }

  // Targeting is resolved and validated BEFORE the campaign is created, so a
  // bad geo block fails with nothing written rather than leaving an empty
  // campaign behind. Ordering is the fix; the geo_locations bug above is what
  // proved it was needed.
  if (!baseTargeting || !baseTargeting.geo_locations) {
    throw new Error('targeting has no geo_locations — refusing to create a campaign that its ad sets will be rejected from');
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

  // If ANY ad set fails, delete the campaign.
  //
  // Validating before creating was not enough, and could never have been:
  // on 2026-08-23 this left THREE empty campaigns in the live account, each
  // from a different Meta requirement discovered only by attempting it --
  // first a missing geo_locations wrapper, then advantage_audience. Meta
  // does not validate a campaign against ad sets that do not exist yet, so
  // a half-built run is the default failure mode and the next unknown rule
  // would have produced a fourth husk.
  //
  // Guessing every rule in advance is not possible. Cleaning up after
  // ourselves is.
  const GENDER = { female: [2], male: [1] };
  try {
  for (const a of buildable) {
    const set = await post(`${ACCOUNT}/adsets`, {
      name: `${ev.name} | ${a.key} | Traffic`,
      campaign_id: camp.id,
      optimization_goal: PT.campaign.optimization_goal,
      billing_event: PT.campaign.billing_event,
      attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 1 }]),
      // advantage_audience MUST be stated. Meta rejects an ad set that leaves
      // it unset: "you need to enable or disable the Advantage audience
      // feature ... within the targeting_automation field".
      //
      // It is 0, and that is a design decision rather than a default.
      // Advantage audience lets Meta spend OUTSIDE the targeting it was
      // given -- including outside the gender split. Turning it on would
      // let the female ad set serve men and the male ad set serve women,
      // which dissolves the one axis these two ad sets exist to separate.
      // #256 hit the neighbouring version of this: an ad set carrying
      // Advantage+ audience was "not eligible for individual_setting"
      // inside an OUTCOME_TRAFFIC campaign.
      targeting: JSON.stringify({
        ...baseTargeting,
        genders: GENDER[a.key],
        targeting_automation: { advantage_audience: 0 },
      }),
      end_time: `${ev.date}T16:30:00-0400`,
      // No per-ad-set budget: the campaign's CBO allocates between them, which
      // is the whole reason they share a campaign instead of bidding separately.
      status: 'PAUSED',
    });
    const sb = await get(set.id, { fields: 'name,status,optimization_goal' });
    console.log(`OK  ad set ${set.id}  ${sb.optimization_goal}  ${sb.status}  (${a.key})`);
  }
  } catch (e) {
    console.error('');
    console.error(`\u2717 ad set failed: ${e.message}`);
    console.error(`  rolling back campaign ${camp.id} so it is not left empty...`);
    try {
      const u = new URL(`${GRAPH}/${camp.id}`);
      u.searchParams.set('access_token', token);
      const res = await (await fetch(u, { method: 'DELETE' })).json();
      console.error(res && res.success
        ? `  campaign ${camp.id} deleted. Nothing was left behind.`
        : `  DELETE returned ${JSON.stringify(res)} -- check campaign ${camp.id} by hand.`);
    } catch (delErr) {
      console.error(`  rollback ALSO failed (${delErr.message}). Delete campaign ${camp.id} by hand.`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('Created PAUSED at the PRIME daily rate. Ads still need creatives');
  console.log('attached — this builds the structure, not the art.');
  console.log('');

  // The ladder, not just the steps left to take.
  //
  // This used to print three bare "date -> $X/day" lines. Three problems: it
  // omitted the rate the campaign was just created at, so there was nothing to
  // read the climb against; it printed `day_of`, an object key, at a human; and
  // it gave no weekday, when every row is a diary entry someone has to keep.
  //
  // Prime is included and marked as already applied. The early-bird cutoff is
  // shown inline because it is the reason the ladder steps where it does, and
  // the campaign's own end is shown last so nobody adds a fourth reminder to
  // turn it off.
  const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US',
    { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });

  console.log('BUDGET LADDER');
  console.log('Meta has no "raise this on that date" — every row below is a manual edit.');
  console.log('');
  // Header built from the same pad widths as the rows below, so the columns
  // cannot drift apart when someone edits one and not the other.
  console.log('  ' + 'WHEN'.padEnd(17) + ' ' + 'PHASE'.padEnd(10) + ' '
    + 'DAILY'.padStart(6) + '   ' + 'SHARE');

  const eb = (ev.pricing || {}).early_bird_through;
  for (const ph of plan) {
    if (ph.key === 'build' || ph.key === 'step') continue;

    // The early-bird cutoff lands between prime and convert and explains the
    // jump, so it prints where it falls rather than as a footnote.
    if (eb && ph.key === 'convert') {
      const p = ev.pricing;
      console.log(`  ${dayName(eb).padEnd(17)} early bird ends — $${p.early_bird} becomes $${p.regular}`);
    }

    const label = ph.key.replace('_', '-');
    const note = ph.key === 'prime' ? '   ← already set, running now' : '';
    console.log(
      `  ${dayName(ph.startsOn).padEnd(17)} ${label.padEnd(10)} ` +
      `${money(ph.daily).padStart(6)}    ${String(Math.round(ph.share * 100)).padStart(3)}%${note}`
    );
  }
  console.log(`  ${dayName(ev.date).padEnd(17)} ends 16:30 — stop_time is already set, no action`);
  console.log('');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
