#!/usr/bin/env node
/**
 * scripts/check-meta-ad-tags.js
 *
 * Reports which Meta ads are missing UTM tracking parameters, and prints the
 * exact value to paste. Read-only.
 *
 * WHY THIS DOES NOT WRITE (it used to try, and could not)
 *
 * An earlier version of this script set `url_tags` on each ad's creative via
 * the API. Every write failed with Meta's generic "Invalid parameter". The
 * detailed error says exactly why:
 *
 *   "Failed to update creative <id>. Please specify name, status or
 *    associated adlabels for updating the creative."   (subcode 1815573)
 *
 * AdCreative is immutable apart from name, status and adlabels. url_tags is
 * set at creation and cannot be changed afterwards.
 *
 * The obvious next attempt -- overriding at the ad level with
 * `creative={"creative_id":X,"url_tags":Y}` -- is worse, because it returns
 * {"success":true} and changes NOTHING. Verified: the ad kept the same
 * creative id and the creative still had no url_tags field. A caller that
 * trusted the 200 would report ten ads tagged and have tagged none.
 *
 * The only API route left is building a NEW creative from the old one's
 * object_story_spec plus url_tags and repointing the ad. That is deliberately
 * not automated here: every creative in this account is ad-created, so a new
 * creative means a new hidden Page post, which forfeits whatever likes,
 * comments and shares the running ad has accumulated. That is a judgement
 * call about live spend, not a script's decision -- and the cost could not be
 * measured, since reading those dark posts needs permissions this token does
 * not have.
 *
 * So: this reports, and a human pastes. Setting url_tags at CREATION time is
 * free, so the real fix is tagging new ads as they are built.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   ads_read is sufficient
 *   META_AD_ACCOUNT_ID      optional -- discovered if unset
 *
 * Usage:
 *   node scripts/check-meta-ad-tags.js
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const TAG = 'utm_source={{site_source_name}}'
  + '&utm_medium=paid_social'
  + '&utm_campaign={{campaign.name}}'
  + '&utm_content={{ad.name}}';

// Everything that can still serve. Archived and deleted ads are excluded --
// they will never run again, so an untagged one is not a problem to fix.
const LIVE_STATUSES = ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED',
  'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) {
  console.error('META_ADS_ACCESS_TOKEN is unset.');
  process.exit(2);
}

async function get(path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.message}`);
  return json;
}

async function resolveAccount() {
  if (process.env.META_AD_ACCOUNT_ID) return process.env.META_AD_ACCOUNT_ID;
  const list = (await get('me/adaccounts', { fields: 'id,name', limit: 25 })).data || [];
  if (list.length === 1) return list[0].id;
  if (!list.length) throw new Error('No ad accounts visible to this token.');
  throw new Error(`${list.length} accounts visible -- set META_AD_ACCOUNT_ID.`);
}

function classify(ad) {
  const c = ad.creative || {};
  const link = ((c.object_story_spec || {}).link_data || {}).link || '';
  if (/utm_source=/i.test(link)) return 'link';   // tagged inside the destination URL
  if (c.url_tags) return 'tags';                  // tagged the right way
  return 'none';
}

async function main() {
  const account = await resolveAccount();
  const res = await get(`${account}/ads`, {
    fields: 'id,name,effective_status,campaign{name},creative{id,url_tags,object_story_spec}',
    filtering: JSON.stringify([
      { field: 'ad.effective_status', operator: 'IN', value: LIVE_STATUSES },
    ]),
    limit: 500,
  });

  const ads = res.data || [];
  const groups = { none: [], link: [], tags: [] };
  for (const ad of ads) groups[classify(ad)].push(ad);

  // Active first -- those are spending money untracked right now.
  const rank = (a) => (a.effective_status === 'ACTIVE' ? 0 : 1);
  groups.none.sort((a, b) => rank(a) - rank(b));

  console.log(`\naccount ${account} -- ${ads.length} servable ad(s)\n`);

  if (groups.none.length) {
    console.log(`UNTAGGED -- ${groups.none.length} ad(s). These record as "direct" in Stripe:\n`);
    for (const ad of groups.none) {
      console.log(`  ${String(ad.effective_status).padEnd(8)} ${String(ad.name).slice(0, 52)}`);
      console.log(`  ${''.padEnd(8)} campaign: ${String((ad.campaign || {}).name || '?').slice(0, 60)}`);
    }
    console.log();
  }

  if (groups.link.length) {
    console.log(`ALREADY TAGGED, inside the destination link -- ${groups.link.length} ad(s).`);
    console.log('Do NOT add URL parameters to these: Meta APPENDS url_tags to the link,');
    console.log('so they would carry two utm_source values and GA4 picks between them');
    console.log('in a way that is not documented.\n');
    for (const ad of groups.link) console.log(`  ${String(ad.name).slice(0, 60)}`);
    console.log();
  }

  if (groups.tags.length) {
    console.log(`CORRECTLY TAGGED via URL parameters -- ${groups.tags.length} ad(s).\n`);
    for (const ad of groups.tags) console.log(`  ${String(ad.name).slice(0, 60)}`);
    console.log();
  }

  if (!groups.none.length) {
    console.log('Nothing to do -- every servable ad is tagged.\n');
    return;
  }

  console.log('-'.repeat(70));
  console.log('\nPaste this into each untagged ad:\n');
  console.log(`  ${TAG}\n`);
  console.log('Ads Manager -> open the AD (not the campaign or ad set)');
  console.log('            -> scroll to Tracking -> URL parameters -> paste -> Publish\n');
  console.log('It is an AD-level field. There is no Tracking section at campaign or');
  console.log('ad set level, which is why looking there finds nothing.\n');
  console.log('This cannot be scripted: AdCreative is immutable except for name,');
  console.log('status and adlabels, so url_tags can only be set when a creative is');
  console.log('CREATED. See the header of this file for what was tried.\n');
  console.log('Expect the ad to re-enter review after the edit.\n');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
