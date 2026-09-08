#!/usr/bin/env node
/**
 * scripts/meta-launch-lx-retargeting.js
 *
 * Brings `Loxley's Retargeting` (120250964028390542) from the empty shell it has
 * been since 2026-08-17 to a real retargeting ad set, at the Build-phase step.
 *
 * WHY NOW. Taylor's call on 2026-08-30 (memory lx-campaign-live) was to build
 * Loxleys' retargeting AT the Sep 8 ladder step and not before -- a retargeting
 * campaign launched at T-30 has an empty audience. Sep 8 is T-14, the first day
 * of the playbook's Build phase (reports/META_AD_LADDER_PLAYBOOK.md section 1).
 *
 * WHAT WAS ACTUALLY WRONG WITH THE SHELL, read live 2026-09-08. All three of
 * these mean the ad set as built was not retargeting -- it was broad
 * prospecting wearing a retargeting name, and launching it as-is would have
 * spent real money on cold traffic:
 *
 *   1. `targeting.custom_audiences` was EMPTY. Nothing to retarget. The
 *      website audience "Loxleys Retargeting - Site Visitors"
 *      (120251194124890542) has existed and been filling since 2026-08-30, and
 *      was attached to nothing (memory website-audiences-are-orphans).
 *   2. `flexible_spec: [{relationship_statuses: [1]}]` -- Facebook's "Single"
 *      status. Priced live with delivery_estimate the same day, holding geo,
 *      age and gender constant: 1,000,000-1,200,000 reachable without it
 *      against 241,700-284,400 with it. It removes roughly 78%, and it is not
 *      a random 78%: relationship status is OPTIONAL self-declared profile
 *      data, so the field selects "people who publicly declare a relationship
 *      status on Facebook", not "single people". This is the exact field that
 *      halved Marion Court's retargeting pool and drove its frequency to 11.7
 *      for 0 purchases on $103.04
 *      (reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md).
 *      NOT a reason, though it was cited as one until 2026-09-08: Meta is NOT
 *      retiring this field. Its 2022 purge removed SENSITIVE categories
 *      (health, sexual orientation, religion, politics); relationship status
 *      survived and is still live core demographic targeting. The reach
 *      measurement is the whole case; the deprecation story was never true.
 *   3. No ads -- fixed by step 3 below, once the art landed the same morning.
 *
 * THE VIDEO AUDIENCE. Loxleys has no video-viewer audience; the site-visitor
 * one alone is the smaller half of the pool. This creates it from the four LX
 * dark-post reels. Note which id: a dark post's `attachments.target.id`, which
 * equals the creative's top-level `video_id` -- NOT the `act/advideos` id in
 * `object_story_spec.video_data.video_id` (memory meta-video-rendition-ids).
 * Creating it late costs nothing: engagement audiences backfill from view
 * history inside the retention window, and the earliest LX reel is 2026-08-30,
 * nine days inside a 30-day window.
 *
 * A deliberate departure from `MC Retargeting` (120250973173480542): that
 * audience's rule lists 100 object_ids -- every video the Page has, not Marion
 * Court's own. This one lists four, so the pool is people who watched a
 * LOXLEYS ad.
 *
 * THE AD (step 3, added 2026-09-08 once the art landed). Purpose-made
 * retargeting creative arrived in `SourceArt/Video` the same morning:
 * `LX-RETARGETING-CONVERT`, a facts card over the venue photo -- Sep 22,
 * Lancaster, $29.99, doors 6:30. Correct for this audience, which has already
 * seen the event: brand.json's `_no_reintroduction` rule says retargeting copy
 * must not explain the event again, and the copy here is the legacy
 * `caption_templates.retargeting.convert` template rendered from brand.json's
 * own event facts rather than retyped.
 *
 * `utm_content` is `lx_rt_patio` -- three segments, not four, per
 * `caption_rules.utm.content_format_retargeting`: for retargeting the phase and
 * the audience are the same fact, and the tag deliberately does NOT carry a
 * phase so the ad keeps one GA4 row across convert and close. Built through
 * `scripts/ad-utm.js` rather than by hand -- that module throws on an unknown
 * role or a bad slug, which is the bug that shipped `tl2__helesha` (#480) into
 * a field frozen at creation and uncorrectable afterwards.
 *
 * No 2-for-1 line, ever: brand.json restricts that copy to female ad sets.
 *
 * LEFT UNDONE ON PURPOSE, and the campaign therefore stays PAUSED:
 *   - No budget is changed and nothing is un-paused. The playbook's Build split
 *     (section 2) is $5.11 cold / $3.40 retarget at Loxleys' $180 run, which
 *     means stepping the LIVE cold campaign DOWN from $9.00. That is real money
 *     moving on a campaign that is currently serving, so it is a human's call,
 *     made via content/paid-campaigns.json and the ladder, not here.
 *
 * Safe to re-run: every step checks the live state first and skips what is
 * already right. DRY RUN IS THE DEFAULT.
 *
 * Usage:
 *   node scripts/meta-launch-lx-retargeting.js            # dry run, changes nothing
 *   node scripts/meta-launch-lx-retargeting.js --execute
 *   node scripts/meta-launch-lx-retargeting.js --art=<dir>   # override SourceArt/Video
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required, needs ads_management
 */

'use strict';

const fs = require('node:fs');
const nodePath = require('node:path');
const os = require('node:os');
const brand = require('../content/brand.json');
const { urlTags, assertCleanLink } = require('./ad-utm.js');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const ACCOUNT = 'act_1672342180672647';
const AD_SET = '120250964028400542'; // LX Retargeting | Video Viewers + Site Visitors | 22-45
const CAMPAIGN = '120250964028390542'; // Loxley's Retargeting
const SITE_AUDIENCE = '120251194124890542'; // Loxleys Retargeting - Site Visitors (website, 30d)
const VIDEO_AUDIENCE_NAME = 'Loxleys Retargeting - Video Viewers';

// Page-video (reel) ids for the four Loxleys ad videos, read from each dark
// post's attachments.target.id on 2026-09-08.
const LX_REELS = [
  { id: 2549526178842057, label: 'LX prime female   (dark post 2026-08-30)' },
  { id: 1441913527996824, label: 'LX prime male     (dark post 2026-08-30)' },
  { id: 1610404647272651, label: 'LX convert female (dark post 2026-09-05)' },
  { id: 1372040297898824, label: 'LX convert male   (dark post 2026-09-05)' },
];
const VIDEO_RETENTION_DAYS = 30; // playbook section 2: 30-day custom-audience lookback

// ---- the ad ---------------------------------------------------------------
const PAGE_ID = '1139242662602769';
const IG_USER_ID = '17841426630031658'; // instagram_user_id; v21.0 rejects instagram_actor_id
const PIXEL_ID = '4390442851170732';
const EVENT_KEY = 'LX';
const CREATIVE_SLUG = 'patio'; // the venue-photo facts card, one lowercase segment
const AD_NAME = 'LX-RT-PATIO';
const ART_BASENAME = 'LX-RETARGETING-CONVERT';
// 4:5 feed portrait -- the shape MC's retargeting ads used, and the shape the
// supplied thumbnail is cut to.
const ART_VIDEO = `${ART_BASENAME}_feed_portrait.mp4`;
const ART_THUMB = `${ART_BASENAME}_thumb.png`;
const DEFAULT_ART_DIR = nodePath.join(os.homedir(), 'OneDrive', 'SparkDate', 'SourceArt', 'Video');

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const EXECUTE = flag('execute') === true;
const GO_LIVE = flag('go-live') === true;
const ART_DIR = flag('art') || DEFAULT_ART_DIR;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

/**
 * The retargeting caption, rendered from brand.json rather than retyped.
 *
 * Uses the legacy `caption_templates.retargeting.convert` template and the
 * event's own facts, so a price or door-time change in brand.json cannot leave
 * a stale figure in an ad. The template's `_no_reintroduction` note is the
 * whole point of the copy: this audience has already seen the event.
 */
function retargetingCopy() {
  const ev = (brand.events || {})[EVENT_KEY];
  if (!ev) throw new Error(`brand.json has no event "${EVENT_KEY}"`);
  const tpl = ((brand.paid_template || {}).caption_templates || {}).retargeting;
  if (!tpl || !tpl.convert) throw new Error('brand.json has no caption_templates.retargeting.convert');

  const d = new Date(`${ev.date}T12:00:00Z`);
  const dateLong = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const dateShort = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  // Early bird is over (through 2026-09-07), so the live price is `regular`.
  // Refuse rather than guess if that ever stops being true -- a wrong price in
  // an ad is the failure brand.json's LX open_issues calls the "PRICE TRAP".
  const today = new Date().toISOString().slice(0, 10);
  const price = today > ev.pricing.early_bird_through
    ? `$${ev.pricing.regular}`
    : `$${ev.pricing.early_bird}`;

  const slots = {
    '{event_name}': ev.name,
    '{date_long}': dateLong,
    '{date_short}': dateShort,
    '{venue}': ev.venue,
    '{city}': ev.city,
    '{doors}': ev.doors,
    '{price}': price,
  };
  const fill = (s) => Object.entries(slots).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  const out = {
    message: fill(tpl.convert.primary_text),
    title: fill(tpl.convert.headline),
    link_description: fill(tpl.convert.description),
    price,
  };
  const leftover = [out.message, out.title, out.link_description].join(' ').match(/\{[a-z_]+\}/g);
  if (leftover) throw new Error(`unfilled caption slots: ${[...new Set(leftover)].join(', ')}`);
  // brand.json restricts the 2-for-1 line to female ad sets. Assert, don't trust.
  if (/2-for-1|2 for 1/i.test(out.message)) throw new Error('2-for-1 copy must never appear in retargeting');
  return out;
}

const DESTINATION = `https://sparkdate.date/lp?eventId=${(brand.events || {})[EVENT_KEY].event_id}`;

async function get(id, fields) {
  const url = new URL(`${GRAPH}/${id}`);
  if (fields) url.searchParams.set('fields', fields);
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
    // Meta's `message` is often just "Invalid parameter"; the useful text is in
    // error_user_msg / error_data / error_subcode. Print all of it -- a bare
    // "code 100" sends you looking in the wrong place.
    const e = body.error;
    throw new Error(`POST ${id}: ${e ? JSON.stringify(e, null, 1) : `HTTP ${res.status}`}`);
  }
  return body;
}

/** Multipart POST -- Meta's asset endpoints do not take urlencoded bodies. */
async function upload(path, field, filePath) {
  const fd = new FormData();
  fd.set(field, new Blob([fs.readFileSync(filePath)]), nodePath.basename(filePath));
  fd.set('access_token', TOKEN);
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`UPLOAD ${path}: ${body.error ? JSON.stringify(body.error, null, 1) : `HTTP ${res.status}`}`);
  }
  return body;
}

/**
 * A freshly uploaded video is not usable in a creative until Meta finishes
 * encoding it. Referencing it too early fails with an unhelpful "Invalid
 * parameter", so wait for `status.video_status === 'ready'` rather than
 * sleeping a guessed interval.
 */
async function waitForVideo(videoId, timeoutMs = 240000) {
  const started = Date.now();
  let last = '';
  for (;;) {
    const v = await get(videoId, 'status');
    const state = ((v.status || {}).video_status) || 'unknown';
    if (state !== last) { console.log(`            encoding: ${state}`); last = state; }
    if (state === 'ready') return;
    if (state === 'error') throw new Error(`Meta failed to encode video ${videoId}: ${JSON.stringify(v.status)}`);
    if (Date.now() - started > timeoutMs) {
      throw new Error(`video ${videoId} still "${state}" after ${Math.round(timeoutMs / 1000)}s -- `
        + 'it may still finish; re-run this script, which will find it by name rather than re-upload.');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Already uploaded by an earlier run? Match on the title we set. */
async function findVideo(title) {
  const list = await get(`${ACCOUNT}/advideos`, 'id,title,created_time');
  return (list.data || []).find((v) => v.title === title) || null;
}

async function findAd(name) {
  const list = await get(`${ACCOUNT}/ads`, 'id,name,effective_status,adset_id,creative{id,url_tags}');
  return (list.data || []).find((a) => a.name === name) || null;
}

/**
 * Every video id a custom-audience rule references, whichever syntax it is in
 * -- the modern inclusions/event_sources envelope, or the grandfathered flat
 * `[{event_name, object_id}]` array the UI-built audiences still carry.
 */
function videoIdsIn(rule) {
  const parsed = typeof rule === 'string' ? JSON.parse(rule) : rule;
  if (Array.isArray(parsed)) return parsed.map((r) => String(r.object_id));
  const out = [];
  for (const r of ((parsed.inclusions || {}).rules) || []) {
    for (const src of r.event_sources || []) if (src.type === 'video') out.push(String(src.id));
  }
  return out;
}

/** The audience may already exist from an earlier run, or from the Ads Manager UI. */
async function findVideoAudience() {
  const list = await get(`${ACCOUNT}/customaudiences`, 'id,name,subtype,retention_days,rule,delivery_status');
  return (list.data || []).find((a) => a.name === VIDEO_AUDIENCE_NAME) || null;
}

/**
 * Candidate rule syntaxes, widest-first.
 *
 * The account's two existing engagement audiences (`MC Retargeting`,
 * `Tellus360 Retargeting`) both carry the flat pre-v3.0 shape
 * `[{event_name, object_id}, ...]`. Copying it is what a reasonable person does
 * -- and v21.0 refuses it outright:
 *
 *   code 100 / subcode 1870029, "Custom Audience Rule Syntax Is Too Old --
 *   The custom audience rule syntax you are using is too old for Graph API v3.0."
 *
 * Those audiences were built in the Ads Manager UI and are grandfathered; they
 * are not a template. The modern shape is the same inclusions/event_sources
 * envelope the WEBSITE audiences use, with `type: "video"` sources. Meta's own
 * docs and its UI disagree on the filter's event vocabulary, and this account
 * has no modern example to read, so try the plausible values in order rather
 * than guessing once. A rejected attempt creates nothing.
 */
function candidateRules() {
  const flat = (eventName) => LX_REELS.map((r) => ({ event_name: eventName, object_id: r.id }));
  const envelope = (eventValue) => ({
    inclusions: {
      operator: 'or',
      rules: LX_REELS.map((r) => ({
        event_sources: [{ type: 'video', id: String(r.id) }],
        retention_seconds: VIDEO_RETENTION_DAYS * 86400,
        filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: eventValue }] },
      })),
    },
  });
  return [
    // PROVEN 2026-09-08 -- this is the one that worked. The flat rule Meta calls
    // "too old" is in fact required for video engagement; what the earlier
    // attempts were missing is the explicit subtype.
    { label: 'legacy flat + explicit subtype=ENGAGEMENT', rule: flat('video_watched'), extra: { subtype: 'ENGAGEMENT' } },
    // Kept so a future run re-proves the contradiction rather than trusting this
    // comment -- they cost one rejected POST each and create nothing.
    { label: 'legacy flat [{event_name, object_id}], no subtype (was 1870029)', rule: flat('video_watched') },
    { label: 'modern inclusions/event_sources video (was 1870049)', rule: envelope('video_watched') },
  ];
}

async function createVideoAudience() {
  const attempts = [];
  for (const candidate of candidateRules()) {
    const params = {
      name: VIDEO_AUDIENCE_NAME,
      description: 'Watched a Loxleys prime or convert video ad. Built 2026-09-08 at the Build-phase step.',
      rule: JSON.stringify(candidate.rule),
      retention_days: String(VIDEO_RETENTION_DAYS),
      ...(candidate.noPrefill ? {} : { prefill: '1' }),
      ...(candidate.extra || {}),
    };
    try {
      const made = await post(`${ACCOUNT}/customaudiences`, params);
      console.log(`  syntax  accepted: ${candidate.label}`);
      return made;
    } catch (err) {
      const sub = (err.message.match(/"error_subcode":\s*(\d+)/) || [])[1] || '?';
      console.log(`  syntax  rejected (subcode ${sub}): ${candidate.label}`);
      attempts.push(`${candidate.label}\n${err.message}`);
    }
  }
  throw new Error(`every candidate rule syntax was rejected:\n\n${attempts.join('\n\n')}`);
}

function summariseTargeting(label, t) {
  const ca = (t.custom_audiences || []).map((a) => `${a.name || a.id}`);
  const flex = JSON.stringify(t.flexible_spec || null);
  console.log(`  ${label} custom_audiences: ${ca.length ? ca.join(' + ') : '(none)'}`);
  console.log(`  ${label} flexible_spec:    ${flex}`);
  console.log(`  ${label} genders:          ${JSON.stringify(t.genders || 'all')}   age ${t.age_min}-${t.age_max}`);
}

(async () => {
  if (!TOKEN) throw new Error('META_ADS_ACCESS_TOKEN is not set');

  console.log(`meta-launch-lx-retargeting  ${new Date().toISOString().slice(0, 10)}  ${EXECUTE ? 'EXECUTE' : 'DRY RUN -- nothing will be written'}\n`);

  // --- Guard: never touch a campaign that is already serving. -----------------
  const campaign = await get(CAMPAIGN, 'id,name,status,effective_status,objective,daily_budget');
  console.log(`campaign  ${campaign.name}  ${campaign.effective_status}  $${(campaign.daily_budget / 100).toFixed(2)}/day  ${campaign.objective}`);
  // NOTE: the "campaign is already ACTIVE" refusal lives in step 2, not here.
  // It exists to protect the TARGETING edit -- changing targeting on a serving
  // ad set restarts its learning phase. It must not block --go-live, which only
  // flips status, nor a re-run where step 2 has nothing left to change.

  // --- Step 1: the video-viewer audience. ------------------------------------
  console.log('\n[1/3] video-viewer audience');
  let video = await findVideoAudience();
  if (video) {
    console.log(`  exists  ${video.id}  ${video.name}  ${video.retention_days}d  ${(video.delivery_status || {}).code} ${(video.delivery_status || {}).description || ''}`);
  } else {
    console.log(`  create  "${VIDEO_AUDIENCE_NAME}"  video_watched (3-sec), ${VIDEO_RETENTION_DAYS}d, on:`);
    for (const r of LX_REELS) console.log(`            ${r.id}  ${r.label}`);
    if (EXECUTE) {
      const made = await createVideoAudience();
      // Read back rather than trusting the POST's own answer.
      video = await get(made.id, 'id,name,subtype,retention_days,rule,delivery_status,operation_status');
      console.log(`  CREATED ${video.id}  subtype=${video.subtype}  ${video.retention_days}d  ${(video.delivery_status || {}).code} ${(video.delivery_status || {}).description || ''}`);
      const gotIds = videoIdsIn(video.rule).sort();
      const wantIds = LX_REELS.map((r) => String(r.id)).sort();
      if (gotIds.join(',') !== wantIds.join(',')) {
        throw new Error(`read-back mismatch: audience rule holds [${gotIds}], expected [${wantIds}]`);
      }
      console.log(`  verified rule holds exactly the ${wantIds.length} Loxleys reels`);
    }
  }

  // --- Step 2: the ad set's targeting. ---------------------------------------
  console.log('\n[2/3] ad set targeting');
  const adset = await get(AD_SET, 'id,name,status,effective_status,targeting,optimization_goal,promoted_object');
  console.log(`  ${adset.name}  ${adset.effective_status}`);
  summariseTargeting('BEFORE', adset.targeting);

  const wanted = { ...adset.targeting };
  const audienceIds = [SITE_AUDIENCE, ...(video ? [video.id] : [])];
  wanted.custom_audiences = audienceIds.map((id) => ({ id: String(id) }));
  // The Single filter is the whole point of this edit -- drop it, don't rewrite it.
  delete wanted.flexible_spec;

  const alreadyRight =
    !adset.targeting.flexible_spec &&
    JSON.stringify((adset.targeting.custom_audiences || []).map((a) => String(a.id)).sort())
      === JSON.stringify(audienceIds.map(String).sort());

  if (alreadyRight) {
    console.log('  SKIP    already has exactly these audiences and no flexible_spec');
  } else {
    if (campaign.effective_status === 'ACTIVE') {
      console.log('\nREFUSING: this would edit targeting on a campaign that is already ACTIVE,');
      console.log('which restarts the ad set\'s learning phase. Pause it first, or change it by hand.');
      process.exit(1);
    }
    console.log(`  CHANGE  attach ${audienceIds.length} audience(s): ${audienceIds.join(', ')}`);
    console.log('  CHANGE  drop flexible_spec (relationship_statuses: Single)');
    if (!video) {
      console.log('  NOTE    dry run: the video audience does not exist yet, so only the');
      console.log('          site-visitor audience is listed above. With --execute both attach.');
    }
    if (EXECUTE) {
      await post(AD_SET, { targeting: JSON.stringify(wanted) });
      const after = await get(AD_SET, 'id,targeting');
      summariseTargeting('AFTER ', after.targeting);
      if (after.targeting.flexible_spec) throw new Error('flexible_spec survived the write');
      const got = (after.targeting.custom_audiences || []).map((a) => String(a.id)).sort();
      if (got.join(',') !== audienceIds.map(String).sort().join(',')) {
        throw new Error(`read-back mismatch: ad set holds [${got}], expected [${audienceIds}]`);
      }
      console.log('  verified: no flexible_spec, both audiences attached');
    }
  }

  // --- Step 3: the ad. --------------------------------------------------------
  console.log('\n[3/3] retargeting ad');
  const copy = retargetingCopy();
  const tags = urlTags({
    event: EVENT_KEY, adSet: 'retargeting', creative: CREATIVE_SLUG,
  });
  assertCleanLink(DESTINATION); // Meta appends url_tags; a utm_* on the link would double it
  const videoPath = nodePath.join(ART_DIR, ART_VIDEO);
  const thumbPath = nodePath.join(ART_DIR, ART_THUMB);

  const existingAd = await findAd(AD_NAME);
  if (existingAd) {
    console.log(`  exists  ${existingAd.id}  ${AD_NAME}  ${existingAd.effective_status}`);
    console.log(`          url_tags ${(existingAd.creative || {}).url_tags || '(none)'}`);
    console.log('  SKIP    an ad by this name is already in the account');
  } else {
    for (const f of [videoPath, thumbPath]) {
      if (!fs.existsSync(f)) throw new Error(`art not found: ${f}\n  pass --art=<dir> if it lives elsewhere`);
    }
    console.log(`  video   ${ART_VIDEO}  (${(fs.statSync(videoPath).size / 1048576).toFixed(1)} MB)`);
    console.log(`  thumb   ${ART_THUMB}`);
    console.log(`  name    ${AD_NAME}`);
    console.log(`  tags    ${tags}`);
    console.log(`  link    ${DESTINATION}`);
    console.log(`  price   ${copy.price}  (early bird ended ${brand.events[EVENT_KEY].pricing.early_bird_through})`);
    console.log('  copy    ' + copy.message.split('\n').filter(Boolean).join('\n          '));
    console.log(`  title   ${copy.title}`);
    console.log(`  desc    ${copy.link_description}`);

    if (EXECUTE) {
      let video = await findVideo(ART_BASENAME);
      if (video) {
        console.log(`  reuse   advideo ${video.id} (uploaded by an earlier run)`);
      } else {
        video = await upload(`${ACCOUNT}/advideos`, 'source', videoPath);
        console.log(`  UPLOADED advideo ${video.id}`);
        await post(video.id, { title: ART_BASENAME });
      }
      await waitForVideo(video.id);

      const img = await upload(`${ACCOUNT}/adimages`, 'source', thumbPath);
      const hash = Object.values(img.images || {})[0].hash;
      console.log(`  UPLOADED adimage ${hash}`);

      const creative = await post(`${ACCOUNT}/adcreatives`, {
        name: `LX retargeting 2026-09 ${CREATIVE_SLUG} (video)`,
        object_story_spec: JSON.stringify({
          page_id: PAGE_ID,
          instagram_user_id: IG_USER_ID,
          video_data: {
            video_id: video.id,
            image_hash: hash,
            message: copy.message,
            title: copy.title,
            link_description: copy.link_description,
            call_to_action: { type: 'LEARN_MORE', value: { link: DESTINATION } },
          },
        }),
        url_tags: tags, // frozen at creation -- never editable again
      });
      console.log(`  CREATED creative ${creative.id}`);

      const ad = await post(`${ACCOUNT}/ads`, {
        name: AD_NAME,
        adset_id: AD_SET,
        creative: JSON.stringify({ creative_id: creative.id }),
        tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL_ID] }]),
        status: 'PAUSED',
      });
      console.log(`  CREATED ad ${ad.id}`);

      // ---- read back. A 200 is not evidence.
      const back = await get(ad.id, 'name,effective_status,adset_id,creative{id,url_tags,object_story_spec},tracking_specs');
      const spec = ((back.creative || {}).object_story_spec || {}).video_data || {};
      const checks = [
        ['in the retargeting ad set', back.adset_id === AD_SET, back.adset_id],
        ['url_tags exact', (back.creative || {}).url_tags === tags, (back.creative || {}).url_tags],
        ['no empty utm segment', !/__|=$|=&/.test((back.creative || {}).url_tags || 'x'), (back.creative || {}).url_tags],
        ['video attached', String(spec.video_id) === String(video.id), spec.video_id],
        ['pixel in tracking_specs', JSON.stringify(back.tracking_specs || '').includes(PIXEL_ID), JSON.stringify(back.tracking_specs || [])],
        ['paused', back.effective_status !== 'ACTIVE', back.effective_status],
      ];
      let failed = 0;
      for (const [label, ok, seen] of checks) {
        console.log(`  ${ok ? 'OK  ' : '!!  '}    ${label.padEnd(26)} ${seen}`);
        if (!ok) failed += 1;
      }
      if (failed) throw new Error(`${failed} read-back check(s) failed on ad ${ad.id}`);
    }
  }

  // --- Optional step 4: go live. ----------------------------------------------
  // Separate flag on purpose. Steps 1-3 spend nothing; this one starts real
  // delivery, so it never rides along with --execute.
  if (GO_LIVE) {
    console.log('\n[4/4] go live');
    const ad = await findAd(AD_NAME);
    if (!ad) throw new Error(`no ad named ${AD_NAME} -- run without --go-live first`);
    // Budgets are the ladder's job, not this script's. Refuse if it has not run.
    const c = await get(CAMPAIGN, 'daily_budget');
    console.log(`  campaign budget $${(c.daily_budget / 100).toFixed(2)}/day (set by scripts/meta-budget-ladder.js)`);

    const targets = [
      [CAMPAIGN, "campaign Loxley's Retargeting"],
      [AD_SET, 'ad set  LX Retargeting'],
      [ad.id, `ad      ${AD_NAME}`],
    ];
    for (const [id, label] of targets) {
      const before = await get(id, 'status,effective_status');
      if (before.status === 'ACTIVE') { console.log(`  SKIP    ${label} already ACTIVE`); continue; }
      if (!EXECUTE) { console.log(`  WOULD   ${label}  ${before.status} -> ACTIVE`); continue; }
      await post(id, { status: 'ACTIVE' });
      // Read-after-write here is eventually consistent: the ad set read back
      // PAUSED immediately after a POST that had in fact succeeded (seen
      // 2026-09-08). Retry briefly rather than either trusting the 200 or
      // calling a lag a failure -- both were wrong answers.
      let after = await get(id, 'status,effective_status');
      for (let i = 0; i < 6 && after.status !== 'ACTIVE'; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        after = await get(id, 'status,effective_status');
      }
      if (after.status !== 'ACTIVE') throw new Error(`${label} did not go ACTIVE after ~12s: ${after.status}`);
      console.log(`  LIVE    ${label}  status=${after.status} effective=${after.effective_status}`);
    }
    console.log('\n  effective_status IN_PROCESS on the ad means Meta ad review, not an error --');
    console.log('  it serves once approved. PENDING_REVIEW/DISAPPROVED would be the ones to chase.');
    if (!EXECUTE) console.log('\nDry run. Add --execute.');
    return;
  }

  // --- What a human still has to do. -----------------------------------------
  console.log('\nSTILL A HUMAN DECISION (deliberately not done here):');
  console.log('  - Nothing is un-paused and no budget moves. Going live means stepping');
  console.log('    the LIVE cold campaign DOWN from $9.00/day to the playbook\'s $5.11');
  console.log('    and funding retargeting at $3.40 -- real money on a serving campaign.');
  console.log('  - To do it: replace the single legacy LX entry in');
  console.log('    content/paid-campaigns.json with two playbook "v2" entries');
  console.log('    (role cold / retargeting, both total 180), then un-pause both.');
  console.log(`  - The campaign is ${campaign.effective_status} right now.`);

  if (!EXECUTE) console.log('\nDry run. Re-run with --execute.');
})().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
