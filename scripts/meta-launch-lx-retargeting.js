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
 *      against 241,700-284,400 with it. It removes roughly 78%, and not a
 *      random 78% -- only people who publicly declared Single on a profile
 *      field most users leave blank (memory single-filter-costs-80-percent).
 *      This is the exact field that halved Marion Court's retargeting pool and
 *      drove its frequency to 11.7 for 0 purchases on $103.04
 *      (reports/MARION_COURT_RETARGETING_FATIGUE_2026-09-01.md).
 *   3. No ads. Still true after this script runs -- see LEFT UNDONE below.
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
 * LEFT UNDONE ON PURPOSE, and the campaign therefore stays PAUSED:
 *   - No ad is created. Loxleys has no retargeting creative and Taylor's call
 *     on 2026-09-08 was to wait for purpose-made art rather than reuse the
 *     convert video.
 *   - No budget is changed. The playbook's Build split (section 2) is $5.11
 *     cold / $3.40 retarget at Loxleys' $180 run, but stepping cold down from
 *     $9.00 while retargeting cannot serve would just remove $3.89/day from the
 *     only campaign that can deliver. Section 2's own floor-priority tail says
 *     to run cold-only and hold retargeting at its existing budget in exactly
 *     this situation. Both budgets move on the day the art lands, via
 *     content/paid-campaigns.json, not here.
 *
 * Safe to re-run: every step checks the live state first and skips what is
 * already right. DRY RUN IS THE DEFAULT.
 *
 * Usage:
 *   node scripts/meta-launch-lx-retargeting.js            # dry run, changes nothing
 *   node scripts/meta-launch-lx-retargeting.js --execute
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required, needs ads_management
 */

'use strict';

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

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const EXECUTE = flag('execute') === true;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

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
  if (campaign.effective_status === 'ACTIVE') {
    console.log('\nREFUSING: the campaign is already ACTIVE. A targeting edit on a serving');
    console.log('ad set restarts its learning phase. Pause it first, or make the change by hand.');
    process.exit(1);
  }

  // --- Step 1: the video-viewer audience. ------------------------------------
  console.log('\n[1/2] video-viewer audience');
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
  console.log('\n[2/2] ad set targeting');
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

  // --- What a human still has to do. -----------------------------------------
  console.log('\nSTILL BLOCKING LAUNCH (deliberately not done here):');
  console.log('  - No ad exists in this ad set. Loxleys has no retargeting creative;');
  console.log('    Taylor is waiting on purpose-made art (2026-09-08).');
  console.log('  - Budget stays as-is. Once an ad is live, register both legs in');
  console.log('    content/paid-campaigns.json with playbook "v2" + role cold/retargeting');
  console.log('    and let scripts/meta-budget-ladder.js step them together.');
  console.log(`  - The campaign is ${campaign.effective_status} and this script never un-pauses it.`);

  if (!EXECUTE) console.log('\nDry run. Re-run with --execute.');
})().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
