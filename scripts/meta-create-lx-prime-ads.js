#!/usr/bin/env node
/**
 * scripts/meta-create-lx-prime-ads.js
 *
 * Creates the two PRIME ads in the "Loxleys | Traffic" campaign
 * (120251085229290542) — the brand.json-correct one that build-paid-campaign
 * built with female/male ad sets and no ads in it.
 *
 * WHY NEW CREATIVES INSTEAD OF REUSING THE DRAFTS
 *
 * The two Aug-22 draft creatives (2840839246291917, 1790312089082843) bake
 * the broken UTM era into their destination link -- utm_campaign=
 * Augweek2_lancaster, utm_content=proof_rsa1, utm_source=Facebook -- and
 * AdCreative is immutable apart from name/status/adlabels (see
 * check-meta-ad-tags.js), so they cannot be fixed, only replaced. One of
 * them ("LX All Genders - Video Ad") is not even a video creative.
 *
 * WHAT THIS SETS AT CREATION, BECAUSE IT CANNOT BE SET LATER
 *
 *   - url_tags: utm_source={{site_source_name}} fills per placement,
 *     lowercase (fb/ig/msg/an) -- ends both the hardcoded-Instagram problem
 *     and the Facebook/facebook case split. utm_campaign=LX_202609 and
 *     utm_content=<ad set> follow brand.json caption_rules.utm.
 *   - The destination link is CLEAN (eventId only). UTMs live in url_tags
 *     alone -- six live ads carry both and send two utm_source values per
 *     click (lint-ad-copy finding #3).
 *   - tracking_specs pins the Sparkdate pixel to each ad. The MC Traffic
 *     ads shipped with Website events unchecked (2026-08-28 audit) and
 *     report zero conversions partly for it.
 *
 * Ad copy is build/paid-handoff-LX.md verbatim, except the early-bird date
 * renders "Sept 7" rather than the raw ISO "2026-09-07" the slot-fill emits.
 *
 * DRY RUN IS THE DEFAULT, same as meta-restore-traffic.js and
 * meta-set-ad-creative.js. Nothing uploads and nothing changes without
 * --execute. Everything is created PAUSED; going live is a separate human
 * decision (campaign budget to the prime rate, then unpause).
 *
 * Env:  META_ADS_ACCESS_TOKEN   needs ads_management
 * Usage:
 *   node scripts/meta-create-lx-prime-ads.js             # dry run
 *   node scripts/meta-create-lx-prime-ads.js --execute
 */

'use strict';

const fs = require('fs');
const path = require('path');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

const EXECUTE = process.argv.includes('--execute');

// Read from the existing draft creatives on 2026-08-30; both carry the same
// page and IG actor.
const PAGE_ID = '1139242662602769';
// object_story_spec takes instagram_user_id -- instagram_actor_id is the
// deprecated name and v21.0 rejects it ("must be a valid Instagram account id").
const IG_USER_ID = '17841426630031658';
const PIXEL_ID = '4390442851170732';

const LINK = 'https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ';
const VIDEO_DIR = 'C:\\Users\\penns\\OneDrive\\SparkDate\\SourceArt\\Video';

const ADS = [
  {
    key: 'female',
    adsetId: '120251085229390542', // Loxleys | female | Traffic
    adName: 'Loxleys | female | prime video',
    video: path.join(VIDEO_DIR, 'LX-FEMALE-PRIME_feed_portrait.mp4'),
    thumb: path.join(VIDEO_DIR, 'LX-FEMALE-PRIME_thumb.png'),
    message: [
      'Loxleys. Tuesday, September 22 at Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM.',
      '',
      'Not an app. Not speed dating. A room of people who actually decided to show up.',
      '',
      'Early bird $24.99 through Sept 7.',
      '',
      // FEMALE AD SET ONLY -- caption_rules.banned_outside_female_ad_set.
      'Bring a friend - 2-for-1 on tickets.',
    ].join('\n'),
    headline: 'Lancaster, PA · Sep 22',
    description: 'Doors 6:30 PM',
    utmContent: 'female',
  },
  {
    key: 'male',
    adsetId: '120251085229680542', // Loxleys | male | Traffic
    adName: 'Loxleys | male | prime video',
    video: path.join(VIDEO_DIR, 'LX-MALE-PRIME_feed_portrait.mp4'),
    thumb: path.join(VIDEO_DIR, 'LX-MALE-PRIME_thumb.png'),
    message: [
      'Loxleys. Tuesday, September 22 at Loxleys, patio bar, Lancaster, PA. Doors 6:30 PM.',
      '',
      'Weeks of texting and no plan ever made. This is the other option.',
      '',
      'Early bird $24.99 through Sept 7.',
    ].join('\n'),
    headline: 'Lancaster, PA · Sep 22',
    description: 'Doors 6:30 PM',
    utmContent: 'male',
  },
];

const urlTags = (content) =>
  `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=LX_202609&utm_content=${content}`;

const token = process.env.META_ADS_ACCESS_TOKEN;

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

async function upload(p, fieldName, filePath, extraFields = {}) {
  const fd = new FormData();
  fd.append(fieldName, new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  fd.append('access_token', token);
  const json = await (await fetch(`${GRAPH}/${p}`, { method: 'POST', body: fd })).json();
  if (json.error) throw new Error(json.error.error_user_msg || json.error.message);
  return json;
}

// A creative built on a still-processing video fails opaquely, so wait for
// Meta to finish before touching it.
async function waitForVideo(videoId, maxSeconds = 180) {
  const start = Date.now();
  for (;;) {
    const v = await get(videoId, { fields: 'status' });
    const s = (v.status || {}).video_status;
    if (s === 'ready') return;
    if (s === 'error') throw new Error(`video ${videoId} failed processing`);
    if ((Date.now() - start) / 1000 > maxSeconds) {
      throw new Error(`video ${videoId} still "${s}" after ${maxSeconds}s`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  // Plan, whether or not we execute.
  for (const ad of ADS) {
    console.log(`\n${ad.adName}  ->  ad set ${ad.adsetId}`);
    for (const f of [ad.video, ad.thumb]) {
      const ok = fs.existsSync(f);
      const size = ok ? `${(fs.statSync(f).size / 1048576).toFixed(1)}MB` : 'MISSING';
      console.log(`  ${ok ? 'ok ' : '!! '} ${path.basename(f)}  ${size}`);
      if (!ok) process.exitCode = 1;
    }
    console.log(`  link      ${LINK}`);
    console.log(`  url_tags  ${urlTags(ad.utmContent)}`);
    console.log(`  headline  ${ad.headline}   description  ${ad.description}`);
    console.log('  message   ' + ad.message.split('\n')[0] + ' …');
  }

  if (!EXECUTE) {
    console.log('\nDry run. Nothing was uploaded or created. Re-run with --execute.');
    return;
  }
  if (!token) { console.error('✗ --execute needs META_ADS_ACCESS_TOKEN.'); process.exit(2); }
  if (process.exitCode) { console.error('✗ missing files, refusing to execute.'); process.exit(1); }

  for (const ad of ADS) {
    console.log(`\n=== ${ad.adName} ===`);

    const vid = await upload(`${ACCOUNT}/advideos`, 'source', ad.video);
    console.log(`  video    ${vid.id}  uploaded, waiting for processing...`);
    await waitForVideo(vid.id);
    console.log('  video    ready');

    const img = await upload(`${ACCOUNT}/adimages`, 'filename', ad.thumb);
    const hash = Object.values(img.images || {})[0].hash;
    console.log(`  thumb    ${hash}`);

    const creative = await post(`${ACCOUNT}/adcreatives`, {
      name: `LX ${ad.key} prime 2026-09 (video)`,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        instagram_user_id: IG_USER_ID,
        video_data: {
          video_id: vid.id,
          image_hash: hash,
          message: ad.message,
          title: ad.headline,
          link_description: ad.description,
          call_to_action: { type: 'LEARN_MORE', value: { link: LINK } },
        },
      }),
      url_tags: urlTags(ad.utmContent),
    });
    console.log(`  creative ${creative.id}`);

    const created = await post(`${ACCOUNT}/ads`, {
      name: ad.adName,
      adset_id: ad.adsetId,
      creative: JSON.stringify({ creative_id: creative.id }),
      // The pixel, attached at birth -- "Website events unchecked" is how the
      // MC ads ended up invisible to conversion reporting.
      tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL_ID] }]),
      status: 'PAUSED',
    });

    // Verify against the API, not our own output (build-paid-campaign rule).
    const back = await get(created.id, {
      fields: 'name,effective_status,adset_id,creative{id,url_tags},tracking_specs',
    });
    console.log(`  ad       ${created.id}  ${back.effective_status}  creative:${back.creative.id}`);
    console.log(`  verify   url_tags: ${back.creative.url_tags || '(NONE — WRONG)'}`);
    console.log(`  verify   pixel: ${JSON.stringify(back.tracking_specs)}`);
  }

  console.log('\nBoth ads created PAUSED. Going live is a separate step:');
  console.log('  1. campaign daily budget -> $4.00 (prime rate for the $240 plan)');
  console.log('  2. unpause campaign, both ad sets, both ads');
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
