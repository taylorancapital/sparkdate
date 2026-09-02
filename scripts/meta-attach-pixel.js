#!/usr/bin/env node
/**
 * scripts/meta-attach-pixel.js
 *
 * Attaches the Sparkdate pixel to an existing ad's tracking_specs -- the fix
 * for ads built in Ads Manager with "Website events" unchecked, which report
 * landing_page_view and nothing after it (memory meta-pixel-is-per-ad-tracking).
 *
 * WHAT THIS DOES AND DOES NOT DO. tracking_specs is REPORTING. Delivery follows
 * the ad set's optimization_goal, and the Marion Court Traffic sets optimise
 * LINK_CLICKS with no promoted_object. So this lets the ads COUNT a cart, a
 * checkout and a purchase; it does not change who Meta shows them to. Expect
 * measurement, not lift -- a flat week after this is not a failure.
 *
 * WHETHER IT WORKS AT ALL IS AN OPEN QUESTION until it is run. The Marketing
 * API docs say "only update fields that were used during ad creation can be
 * updated", and these ads were created WITHOUT tracking_specs; but Ads Manager
 * exposes the Tracking section on an existing ad, which implies the write is
 * supported. That is why this reads the field back from the API afterwards and
 * fails loudly if it did not take -- a silent no-op is the outcome to fear, not
 * an error. Never trust our own POST's response (build-paid-campaign rule).
 *
 * DRY RUN IS THE DEFAULT, same as meta-set-ad-creative.js and
 * meta-create-lx-prime-ads.js. Nothing changes without --execute.
 *
 * Usage:
 *   node scripts/meta-attach-pixel.js --ad=<id> [--ad=<id2>]      # dry run
 *   node scripts/meta-attach-pixel.js --ad=<id> --execute
 *   node scripts/meta-attach-pixel.js --ad=<id> --pixel=<id> --execute
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required, needs ads_management (not just ads_read)
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const DEFAULT_PIXEL = '4390442851170732'; // "Sparkdate Date's Pixel - Active Version"

const argv = process.argv.slice(2);
const ADS = argv.filter((a) => a.startsWith('--ad=')).map((a) => a.slice(5));
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const EXECUTE = flag('execute') === true;
const PIXEL = flag('pixel') || DEFAULT_PIXEL;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

// The one entry these ads are missing, in the shape meta-create-lx-prime-ads.js
// sets at birth. Keep them identical, so an ad fixed here and an ad born right
// are indistinguishable in the review.
const PIXEL_SPEC = { 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL] };

// APPEND, never replace. The MC Traffic ads are not untracked -- each already
// carries seven specs (onsite_conversion with conversion ids, link_click,
// post_engagement, post_interaction_gross, one_pd_landing_page_view, all
// scoped to the ad's post) and is missing only the offsite pixel entry.
// Writing `[PIXEL_SPEC]` alone would drop all seven, taking the
// one_pd_landing_page_view spec that the landing-page-view numbers in
// meta-ads-review.js come from. Caught on the 2026-09-02 dry run; the whole
// reason this script reads before it writes.
const merged = (existing) => [...(Array.isArray(existing) ? existing : []), PIXEL_SPEC];

async function get(id, fields) {
  const url = new URL(`${GRAPH}/${id}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`GET ${id}: ${body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`}`);
  }
  return body;
}

async function post(id, fields) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set('access_token', TOKEN);
  const res = await fetch(`${GRAPH}/${id}`, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`POST ${id}: ${body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`}`);
  }
  return body;
}

const hasPixel = (specs, pixel) =>
  Array.isArray(specs) && specs.some((s) => [].concat(s.fb_pixel || []).map(String).includes(String(pixel)));

async function main() {
  if (!TOKEN) {
    console.error('ERROR: META_ADS_ACCESS_TOKEN is not set (needs ads_management).');
    process.exit(2);
  }
  if (!ADS.length) {
    console.error('ERROR: pass at least one --ad=<id>.');
    process.exit(2);
  }

  console.log(`Pixel ${PIXEL}${EXECUTE ? '' : '   (DRY RUN — nothing will change)'}\n`);
  let changed = 0;
  let failed = 0;

  for (const id of ADS) {
    const before = await get(id, 'name,effective_status,tracking_specs,adset{name,optimization_goal}');
    console.log(`${before.name}  [${before.effective_status}]  ${id}`);
    console.log(`  ad set   ${before.adset.name} — optimises ${before.adset.optimization_goal}`);
    console.log(`  before   ${JSON.stringify(before.tracking_specs || null)}`);

    if (hasPixel(before.tracking_specs, PIXEL)) {
      console.log('  SKIP     already carries this pixel; nothing to do.\n');
      continue;
    }
    const kept = Array.isArray(before.tracking_specs) ? before.tracking_specs.length : 0;
    const next = merged(before.tracking_specs);
    console.log(`  keeping  ${kept} existing spec(s), appending the pixel -> ${next.length} total`);

    if (!EXECUTE) {
      console.log(`  would add ${JSON.stringify(PIXEL_SPEC)}\n`);
      continue;
    }

    await post(id, { tracking_specs: JSON.stringify(next) });

    // Read it back. A silent no-op is the failure mode that matters here --
    // the POST returning success is not evidence the field took. Check both
    // that the pixel arrived AND that nothing was dropped on the way.
    const after = await get(id, 'tracking_specs');
    const now = Array.isArray(after.tracking_specs) ? after.tracking_specs.length : 0;
    console.log(`  after    ${now} spec(s): ${JSON.stringify(after.tracking_specs || null)}`);
    if (hasPixel(after.tracking_specs, PIXEL) && now >= kept) {
      console.log(`  OK       pixel attached, ${kept} pre-existing spec(s) intact.\n`);
      changed++;
    } else if (hasPixel(after.tracking_specs, PIXEL)) {
      console.log(`  PARTIAL  pixel attached but specs went ${kept} -> ${now}. Something was dropped.\n`);
      failed++;
    } else {
      console.log('  FAILED   the write was accepted but the pixel did not take.\n');
      failed++;
    }
  }

  if (!EXECUTE) {
    console.log('Dry run. Re-run with --execute.');
    return;
  }
  console.log(`${changed} ad(s) updated, ${failed} failed.`);
  console.log('Confirm independently with: npm run ads:review  (the "Pixel in tracking" section)');
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
