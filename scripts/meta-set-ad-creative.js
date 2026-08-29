#!/usr/bin/env node
/**
 * scripts/meta-set-ad-creative.js
 *
 * Swaps the creative on a live Meta ad: uploads a video and its thumbnail,
 * builds a new adcreative from the CURRENT one, and points the ad at it.
 *
 * WHY THIS EXISTS
 *
 * Everything else in scripts/ that touches Meta ads only reads
 * (fetch-meta-insights, check-meta-ad-tags, sync-meta-spend). The one writer,
 * meta-restore-traffic.js, creates campaigns. There was no path to change an
 * ad's creative, so "attach this video to the retargeting ad" meant driving
 * Ads Manager by hand -- which batches every pending edit in the account behind
 * one "Review and publish" button. An API write touches one object and cannot
 * publish somebody else's queued draft.
 *
 * WHAT IT PRESERVES, AND WHY THAT MATTERS
 *
 * A creative is not just its media. The existing one carries page_id,
 * instagram_user_id, the message body, headline, description and the
 * call_to_action type -- and losing any of those silently changes the ad.
 * This reads the current creative and carries all of it forward, overriding
 * only what you pass on the command line.
 *
 * IMAGE -> VIDEO IS A SHAPE CHANGE, NOT A FIELD SWAP. A still ad uses
 * `link_data` with the destination at `link`. A video ad uses `video_data`
 * with the destination at `call_to_action.value.link`. Copying `link` onto a
 * video creative produces an ad with no destination, which is why this
 * translates rather than merges.
 *
 * Image-specific Advantage+ enhancements (image_animation, image_templates,
 * image_touchups, image_brightness_and_contrast) are dropped when the target
 * is video -- they cannot apply, and sending them has been observed to make
 * the creative call fail rather than be ignored.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   needs ads_management (ads_read is NOT enough)
 *   META_AD_ACCOUNT_ID      optional -- discovered if unset
 *
 * Usage:
 *   node scripts/meta-set-ad-creative.js --ad=<id> --video=<path> --thumb=<path>
 *   node scripts/meta-set-ad-creative.js --ad=<id> --video=... --thumb=... --url=<destination>
 *   node scripts/meta-set-ad-creative.js --ad=<id> ... --execute
 *
 * DRY RUN IS THE DEFAULT, same convention as meta-restore-traffic.js and
 * social.js. Nothing uploads and nothing changes without --execute.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) {
  console.error('META_ADS_ACCESS_TOKEN is unset. It needs ads_management, not just ads_read.');
  process.exit(1);
}

async function api(pathname, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(`${GRAPH}/${pathname}`);
  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('access_token', token);
  }
  const res = await fetch(url, body ? { method, body } : { method });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const e = json.error;
    throw new Error(`${e.message}${e.error_user_msg ? ` -- ${e.error_user_msg}` : ''} (code ${e.code})`);
  }
  return json;
}

async function accountId() {
  if (process.env.META_AD_ACCOUNT_ID) return process.env.META_AD_ACCOUNT_ID;
  const me = await api('me/adaccounts', { params: { fields: 'id,name', limit: 50 } });
  const list = me.data || [];
  if (list.length === 1) return list[0].id;
  throw new Error(`${list.length} ad accounts visible -- set META_AD_ACCOUNT_ID.`);
}

/** Upload a file to an edge that takes multipart, returning the parsed body. */
async function upload(act, edge, file, field) {
  const fd = new FormData();
  fd.set('access_token', token);
  const buf = fs.readFileSync(file);
  fd.set(field, new Blob([buf]), path.basename(file));
  const res = await fetch(`${GRAPH}/${act}/${edge}`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(`${edge}: ${json.error.message}`);
  return json;
}

async function post(pathname, fields) {
  const fd = new FormData();
  fd.set('access_token', token);
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await fetch(`${GRAPH}/${pathname}`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const e = json.error;
    throw new Error(`${e.message}${e.error_user_msg ? ` -- ${e.error_user_msg}` : ''} (code ${e.code})`);
  }
  return json;
}

/** Meta transcodes after upload; a creative built too early fails validation. */
async function waitForVideo(videoId, timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    const v = await api(videoId, { params: { fields: 'status' } });
    const phase = (v.status && v.status.video_status) || 'unknown';
    if (phase === 'ready') return true;
    if (phase === 'error') throw new Error(`video ${videoId} failed processing`);
    if (Date.now() - started > timeoutMs) {
      throw new Error(`video ${videoId} still "${phase}" after ${timeoutMs / 1000}s`);
    }
    process.stdout.write(`  video ${videoId}: ${phase}...\r`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Image-only Advantage+ features cannot apply to a video creative. */
const IMAGE_ONLY_FEATURES = [
  'image_animation',
  'image_brightness_and_contrast',
  'image_templates',
  'image_touchups',
  'cv_transformation',
];

function videoSafeDof(dof) {
  if (!dof || !dof.creative_features_spec) return undefined;
  const kept = {};
  for (const [k, v] of Object.entries(dof.creative_features_spec)) {
    if (!IMAGE_ONLY_FEATURES.includes(k)) kept[k] = v;
  }
  return Object.keys(kept).length ? { creative_features_spec: kept } : undefined;
}

async function main() {
  const adId = arg('ad');
  const videoPath = arg('video');
  const thumbPath = arg('thumb');
  const overrideUrl = arg('url');
  const overrideName = arg('creative-name');
  // --message replaces the ad body. A literal backslash-n in the argument
  // becomes a real newline here, because a shell argument cannot carry one
  // portably across cmd, PowerShell and bash.
  const rawMessage = arg('message');
  const overrideMessage =
    rawMessage === undefined ? undefined : rawMessage.replace(/\\n/g, '\n');
  // Reuse already-uploaded media instead of sending it again. Uploads survive a
  // failed run -- the creative step is what fails when the app is in
  // development mode -- so a retry should not re-transcode a video Meta already
  // has. Both come from a previous run's output.
  const reuseVideoId = arg('video-id');
  const reuseImageHash = arg('image-hash');
  const execute = flag('execute');

  if (!adId || (!videoPath && !reuseVideoId) || (!thumbPath && !reuseImageHash)) {
    console.error('Required: --ad=<id>, then either');
    console.error('  --video=<path> --thumb=<path>        (upload fresh)');
    console.error('  --video-id=<id> --image-hash=<hash>  (reuse a previous upload)');
    console.error('Optional: --url=<destination> --message=<body> --creative-name=<name> --execute');
    process.exit(1);
  }
  for (const f of [videoPath, thumbPath]) {
    if (f && !fs.existsSync(f)) { console.error(`No such file: ${f}`); process.exit(1); }
  }

  const act = await accountId();
  console.log(execute ? 'EXECUTING\n' : 'DRY RUN -- nothing will be uploaded or written\n');
  console.log(`account : ${act}`);

  const ad = await api(adId, {
    params: { fields: 'id,name,status,effective_status,adset{name},campaign{name},creative{id}' },
  });
  console.log(`ad      : ${ad.name}`);
  console.log(`          ${ad.id} | ${ad.status} / ${ad.effective_status}`);
  console.log(`campaign: ${ad.campaign && ad.campaign.name}`);

  const current = await api(ad.creative.id, {
    params: { fields: 'id,name,object_story_spec,degrees_of_freedom_spec,call_to_action_type' },
  });
  const spec = current.object_story_spec || {};
  const src = spec.link_data || spec.video_data || {};
  const wasVideo = Boolean(spec.video_data);

  // A link ad keeps the destination at link_data.link; a video ad keeps it at
  // call_to_action.value.link. Read both so the translation cannot lose it.
  const currentUrl =
    (src.call_to_action && src.call_to_action.value && src.call_to_action.value.link) || src.link;
  const link = overrideUrl || currentUrl;
  if (!link) throw new Error('Could not determine a destination URL, and none was passed via --url.');

  console.log(`\ncurrent creative : ${current.id}`);
  console.log(`  shape          : ${wasVideo ? 'video_data' : 'link_data'} -> video_data`);
  console.log(`  headline       : ${src.name || '(none)'}`);
  console.log(`  description    : ${src.description || src.link_description || '(none)'}`);
  console.log(`  cta            : ${(src.call_to_action && src.call_to_action.type) || '(none)'}`);
  console.log(`  destination    : ${currentUrl || '(none)'}`);
  if (overrideUrl) console.log(`  destination NEW: ${overrideUrl}`);
  if (overrideMessage !== undefined) {
    console.log('');
    console.log('  message NEW:');
    overrideMessage.split(String.fromCharCode(10)).forEach((l) => console.log(`    | ${l}`));
  }

  const describe = (file, reused, label) => {
    if (reused) return `  ${label} : reusing ${reused}`;
    const st = fs.statSync(file);
    return `  ${label} : ${path.basename(file)} (${(st.size / 1048576).toFixed(2)} MB)`;
  };
  console.log('');
  console.log(reuseVideoId && reuseImageHash ? 'media:' : 'uploading:');
  console.log(describe(videoPath, reuseVideoId, 'video'));
  console.log(describe(thumbPath, reuseImageHash, 'thumb'));

  if (!execute) {
    console.log('\nWould then:');
    console.log('  1. POST advideos + adimages');
    console.log('  2. POST adcreatives with video_data carrying the fields above');
    console.log(`  3. POST ${ad.id} pointing it at the new creative`);
    console.log('\nDry run. Re-run with --execute.\n');
    return;
  }

  let videoId = reuseVideoId;
  if (videoId) {
    console.log(`  video reused   : ${videoId}`);
  } else {
    const vid = await upload(act, 'advideos', videoPath, 'source');
    videoId = vid.id;
    console.log(`  video uploaded : ${videoId}`);
  }

  let imageHash = reuseImageHash;
  if (imageHash) {
    console.log(`  thumb reused   : ${imageHash}`);
  } else {
    const img = await upload(act, 'adimages', thumbPath, 'file');
    const imgEntry = Object.values(img.images || {})[0];
    if (!imgEntry) throw new Error('adimages returned no hash');
    imageHash = imgEntry.hash;
    console.log(`  thumb uploaded : ${imageHash}`);
  }

  await waitForVideo(videoId);
  console.log(`  video ready    : ${videoId}          `);

  const videoData = {
    video_id: videoId,
    image_hash: imageHash,
    call_to_action: {
      type: (src.call_to_action && src.call_to_action.type) || 'LEARN_MORE',
      value: { link },
    },
  };
  const message = overrideMessage !== undefined ? overrideMessage : src.message;
  if (message) videoData.message = message;
  if (src.name) videoData.title = src.name;
  const desc = src.description || src.link_description;
  if (desc) videoData.link_description = desc;

  const payload = {
    name: overrideName || `${src.name || ad.name} ${new Date().toISOString().slice(0, 10)}`,
    object_story_spec: {
      page_id: spec.page_id,
      ...(spec.instagram_user_id ? { instagram_user_id: spec.instagram_user_id } : {}),
      video_data: videoData,
    },
  };
  const dof = videoSafeDof(current.degrees_of_freedom_spec);
  if (dof) payload.degrees_of_freedom_spec = dof;

  const created = await post(`${act}/adcreatives`, payload);
  console.log(`  creative made  : ${created.id}`);

  await post(ad.id, { creative: { creative_id: created.id } });
  console.log(`  ad updated     : ${ad.id} -> creative ${created.id}`);

  const after = await api(ad.id, {
    params: { fields: 'id,name,status,effective_status,creative{id,name,video_id}' },
  });
  console.log('\nverified:');
  console.log(`  ${after.name}`);
  console.log(`  status   : ${after.status} / ${after.effective_status}`);
  console.log(`  creative : ${after.creative.id} (video ${after.creative.video_id || 'none'})`);
  console.log('\nThe previous creative is not deleted -- it is detached and still readable.\n');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
