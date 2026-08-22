#!/usr/bin/env node
/**
 * scripts/tag-meta-ads.js
 *
 * Adds UTM tracking parameters to Meta ads that have none.
 *
 * WHY THIS EXISTS
 *
 * 31 of 35 ads in the account carried no utm_source at all. Only 4 were
 * tagged. That has two consequences, and the second is the expensive one:
 *
 *   1. GA4 could only classify the other traffic by inferring from fbclid,
 *      which produces a lowercase "facebook / paid_social" row alongside the
 *      capitalised "Facebook / paid_social" from the tagged four. Same spend,
 *      two rows, neither one the real total.
 *
 *   2. lib/attribution.js reads UTMs from the landing URL. No UTMs means
 *      sparkdate_attr is never written, which means channelOf() returns
 *      'direct'. So roughly 90% of paid traffic records as DIRECT in Stripe
 *      no matter how correct the checkout code is. The attribution pipeline
 *      was fixed and still could not answer the question, because the ads
 *      were not putting anything into it.
 *
 * WHAT IT SETS
 *
 *   utm_source={{site_source_name}}&utm_medium=paid_social
 *   &utm_campaign={{campaign.name}}&utm_content={{ad.name}}
 *
 * Those are Meta's own macros, expanded per ad at delivery. {{site_source_name}}
 * resolves to fb / ig / an / msg -- which is deliberately NOT the capitalised
 * "Facebook" the four legacy ads hardcode. A hardcoded source is only correct
 * for a single-platform campaign, and Advantage+ placements span Facebook and
 * Instagram, so hardcoding mislabels every Instagram click. Accuracy about
 * which platform actually delivered the click beats matching the old spelling.
 *
 * WHAT IT REFUSES TO TOUCH
 *
 *   - Archived ads. They will never serve again, so writing to them is churn
 *     against a live account for no gain.
 *   - Ads whose UTMs already sit INSIDE the destination link. Meta appends
 *     url_tags to that link, so tagging these would send two utm_source
 *     values in one URL and GA4's choice between them is not defined.
 *   - Ads that already have url_tags, unless --force.
 *
 * Dry run is the default. --execute is required to write, same convention as
 * scripts/social.js, because this modifies a live ad account.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   needs ads_management (ads_read alone cannot write)
 *   META_AD_ACCOUNT_ID      optional -- discovered if unset
 *
 * Usage:
 *   node scripts/tag-meta-ads.js                 # dry run
 *   node scripts/tag-meta-ads.js --execute
 *   node scripts/tag-meta-ads.js --execute --include-paused=false
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const TAG = 'utm_source={{site_source_name}}'
  + '&utm_medium=paid_social'
  + '&utm_campaign={{campaign.name}}'
  + '&utm_content={{ad.name}}';

// Everything that can still serve. ARCHIVED and DELETED are deliberately
// absent -- see the header.
const LIVE_STATUSES = ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED',
  'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

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

async function post(path, fields) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function resolveAccount() {
  if (process.env.META_AD_ACCOUNT_ID) return process.env.META_AD_ACCOUNT_ID;
  const me = await get('me/adaccounts', { fields: 'id,name', limit: 25 });
  const list = me.data || [];
  if (list.length === 1) return list[0].id;
  if (!list.length) throw new Error('No ad accounts visible to this token.');
  throw new Error(
    `${list.length} ad accounts visible -- set META_AD_ACCOUNT_ID to one of: `
    + list.map((a) => a.id).join(', '));
}

/** Why this ad should be left alone, or null if it should be tagged. */
function skipReason(ad, force) {
  const creative = ad.creative || {};
  const link = ((creative.object_story_spec || {}).link_data || {}).link || '';
  if (/utm_source=/i.test(link)) {
    // The decisive one. url_tags are APPENDED to this link, so tagging would
    // put two utm_source values in one URL.
    return 'UTMs already inside the destination link -- tagging would duplicate utm_source';
  }
  if (creative.url_tags && !force) return `already has url_tags (${creative.url_tags.slice(0, 40)}…)`;
  if (!creative.id) return 'no readable creative';
  return null;
}

async function main() {
  const execute = flag('execute');
  const force = flag('force');
  const includePaused = arg('include-paused', 'true') !== 'false';

  const account = await resolveAccount();
  console.log(`\naccount: ${account}`);
  console.log(`tag    : ${TAG}\n`);

  const res = await get(`${account}/ads`, {
    fields: 'id,name,effective_status,campaign{name},creative{id,url_tags,object_story_spec}',
    filtering: JSON.stringify([
      { field: 'ad.effective_status', operator: 'IN', value: LIVE_STATUSES },
    ]),
    limit: 500,
  });

  let ads = res.data || [];
  if (!includePaused) ads = ads.filter((a) => a.effective_status === 'ACTIVE');

  const todo = [];
  const skipped = [];
  for (const ad of ads) {
    const why = skipReason(ad, force);
    if (why) skipped.push({ ad, why });
    else todo.push(ad);
  }

  // Active first: those are the ones spending money untracked right now.
  todo.sort((a, b) => (a.effective_status === 'ACTIVE' ? -1 : 1)
    - (b.effective_status === 'ACTIVE' ? -1 : 1));

  console.log(`${ads.length} servable ad(s): ${todo.length} to tag, ${skipped.length} skipped\n`);

  for (const { ad, why } of skipped) {
    console.log(`  SKIP  ${String(ad.name).slice(0, 46).padEnd(48)} ${why}`);
  }
  if (skipped.length) console.log();

  let done = 0, failed = 0;
  for (const ad of todo) {
    const label = `${String(ad.effective_status).padEnd(8)} ${String(ad.name).slice(0, 46)}`;
    if (!execute) {
      console.log(`  would tag  ${label}`);
      continue;
    }
    try {
      await post(ad.creative.id, { url_tags: TAG });
      // Read back rather than trusting the 200. A creative can report success
      // and leave the field unchanged when it is in a state Meta will not
      // edit, and a silent no-op here looks identical to a success.
      const check = await get(ad.creative.id, { fields: 'url_tags' });
      if (check.url_tags === TAG) {
        console.log(`  TAGGED     ${label}`);
        done++;
      } else {
        console.log(`  !! NO-OP   ${label}`);
        console.log(`             wrote the tag, read back: ${JSON.stringify(check.url_tags)}`);
        failed++;
      }
    } catch (e) {
      console.log(`  !! FAILED  ${label}`);
      console.log(`             ${e.message}`);
      failed++;
    }
  }

  console.log();
  if (!execute) {
    console.log(`Dry run. ${todo.length} ad(s) would be tagged. Re-run with --execute to write.`);
  } else {
    console.log(`${done} tagged, ${failed} failed.`);
    if (done) {
      console.log('\nVerify: click one of your own live ads and watch GA4 Realtime.');
      console.log('Source should show as fb or ig with medium paid_social.');
    }
  }
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  if (/permission|OAuth|(#200)/i.test(e.message)) {
    console.error('The token needs ads_management. ads_read alone can list ads but not modify them.');
  }
  process.exitCode = 1;
});
