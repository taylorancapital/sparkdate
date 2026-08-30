#!/usr/bin/env node
/**
 * scripts/lint-ad-copy.js
 *
 * Runs the brand rules against LIVE META ADS, the same way
 * lint-content-queue.js runs them against content/queue.csv.
 *
 * WHY THIS EXISTS
 *
 * Every brand rule in content/brand.json was enforced on organic posts and
 * on nothing else. The ads -- which are the only channel actually being paid
 * for -- were checked by eye or not at all, and the gaps that turned up when
 * someone finally looked were not subtle:
 *
 *   * four ads spelled utm_source "facebook" while fourteen spelled it
 *     "Facebook", splitting one channel into two GA4 rows and understating
 *     real Facebook volume
 *   * every ad carried utm_content=proof_rsa1, so no ad could be told apart
 *     from any other -- the exact bug the queue linter has caught since it
 *     was written
 *   * six ads were given url_tags on top of a destination URL that already
 *     had UTMs, so each sent two utm_source values in one request
 *
 * None of that was visible in Ads Manager, which sorts by spend and reorders
 * rows when you edit them.
 *
 * READ-ONLY. Lists ads and reports. It cannot change anything -- see
 * check-meta-ad-tags.js for why writing to a creative is not possible at all.
 *
 * Errors mean an ad states something FALSE or spends money on something that
 * cannot convert. Warnings mean work is outstanding for a human to judge.
 * Same split as the queue linter, and for the same reason: a build that goes
 * red for a judgement call teaches people to ignore it.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   ads_read is enough
 *   META_AD_ACCOUNT_ID      optional -- discovered if unset
 *
 * Usage:
 *   node scripts/lint-ad-copy.js
 *   node scripts/lint-ad-copy.js --json
 *   node scripts/lint-ad-copy.js --all-statuses   (include paused/archived)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const BRAND = path.join(__dirname, '..', 'content', 'brand.json');

// Only ads that can still serve. An archived ad with a bad price is not a
// problem anyone needs to fix.
const SERVABLE = ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED',
  'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];
const ALL = SERVABLE.concat(['ARCHIVED', 'DELETED', 'DISAPPROVED', 'PENDING_BILLING_INFO']);

const flag = (n) => process.argv.includes(`--${n}`);
const token = process.env.META_ADS_ACCESS_TOKEN;

async function get(p, params = {}) {
  const url = new URL(`${GRAPH}/${p}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${p}: ${json.error.message}`);
  return json;
}

/**
 * Every field a creative can hide its destination URL in.
 *
 * Image ads keep it in link_data, video ads in video_data's call to action.
 * Reading only the first is what made an earlier script report six correctly
 * tagged video ads as untagged.
 */
function destinationUrls(creative) {
  const s = creative.object_story_spec || {};
  const out = [];
  const add = (v) => { if (v) out.push(String(v)); };
  add((s.link_data || {}).link);
  add((((s.link_data || {}).call_to_action || {}).value || {}).link);
  add((((s.video_data || {}).call_to_action || {}).value || {}).link);
  add((s.photo_data || {}).url);
  for (const ch of (s.link_data || {}).child_attachments || []) add(ch.link);
  for (const l of (creative.asset_feed_spec || {}).link_urls || []) add(l.website_url);
  return out;
}

/** All human-readable copy on the ad, joined for text rules. */
function copyOf(creative) {
  const s = creative.object_story_spec || {};
  const d = s.link_data || s.video_data || s.photo_data || {};
  return [d.message, d.name, d.title, d.description, d.caption]
    .filter(Boolean).map(String).join('\n');
}

function lint(ads, brand, today) {
  const findings = [];
  const add = (severity, ad, check, message) =>
    findings.push({ severity, ad: ad.name, check, message });

  const banned = (brand.universal.banned_facts || [])
    .map((b) => ({ ...b, re: new RegExp(b.pattern, 'i') }));

  // eventId -> brand key, so a destination can be resolved to real pricing.
  const byEventId = new Map();
  for (const [key, ev] of Object.entries(brand.events)) {
    if (ev.event_id) byEventId.set(ev.event_id, { key, ...ev });
  }

  const sourceSpellings = new Map();
  const contentValues = new Map();

  for (const ad of ads) {
    const creative = ad.creative || {};
    const urls = destinationUrls(creative);
    const copy = copyOf(creative);

    // --- banned facts -------------------------------------------------
    for (const b of banned) {
      if (b.re.test(copy)) {
        add('error', ad, 'banned-fact', `${b.id}: ${String(b.description).split('.')[0]}`);
      }
    }

    // --- destination resolves to a real, future event -----------------
    let ev = null;
    for (const u of urls) {
      const m = u.match(/[?&]eventId=([^&]*)/);
      if (!m) continue;
      if (!m[1]) {
        // The exact failure lp.html fires targeted_event_missing_id for: the
        // URL looks targeted, the visitor is quietly sold whichever event is
        // soonest, and nothing separates it from ordinary traffic.
        add('error', ad, 'blank-event-id', 'destination has eventId= with no value -- visitors land on whichever event is soonest');
        continue;
      }
      const hit = byEventId.get(m[1]);
      if (!hit) add('warning', ad, 'unknown-event', `destination eventId ${m[1].slice(0, 12)}… is not in brand.json`);
      else ev = hit;
    }

    // Money burning on a night that already happened -- but ONLY if the ad can
    // still deliver.
    //
    // `effective_status: ACTIVE` on an ad means "nobody paused it", NOT "it is
    // running". Delivery stops at the AD SET's end_time, and nobody archives a
    // campaign once its event is over, so every finished event leaves ads
    // reading ACTIVE forever. Judging on status alone reported the three Tellus
    // campaigns as errors four days after they stopped: their ad sets ended
    // 2026-08-26 and they had spent $0 since. Five permanent errors for
    // something costing nothing is how a linter teaches people to ignore it --
    // the failure this file's own header argues against.
    if (ev && ev.date && ev.date < today) {
      const endsAt = ((ad.adset || {}).end_time) || '';
      const ended = endsAt && new Date(endsAt) < new Date();
      const live = ad.effective_status === 'ACTIVE' && !ended;
      add(live ? 'error' : 'warning', ad, 'past-event',
        `points at ${ev.name} (${ev.date}), which has already happened`
        + (ended ? ` -- ad set ended ${String(endsAt).slice(0, 10)}, no longer delivering` : ''));
    }

    // --- prices match what the event actually sells -------------------
    if (ev) {
      const allowed = Q.allowedPrices(brand, [ev.key]);
      if (allowed.size) {
        const bad = [...new Set(Q.pricesInText(copy))].filter((p) => !allowed.has(p));
        if (bad.length) {
          add('error', ad, 'price',
            `copy says $${bad.join(', $')} but ${ev.name} sells at $${[...allowed].join(', $')}`);
        }
      }
    }

    // --- UTM hygiene ---------------------------------------------------
    const tagged = urls.filter((u) => /utm_source=/i.test(u));
    if (creative.url_tags && tagged.length) {
      add('error', ad, 'duplicate-utm',
        'url_tags AND a utm_source in the destination -- Meta appends them, so this sends two utm_source values');
    }
    if (!creative.url_tags && !tagged.length) {
      add('warning', ad, 'untagged',
        'no utm_source anywhere -- purchases from this ad record as "direct" in Stripe');
    }

    const blob = urls.join(' ') + ' ' + (creative.url_tags || '');
    const src = blob.match(/utm_source=([^&\s]+)/);
    if (src) sourceSpellings.set(src[1], (sourceSpellings.get(src[1]) || 0) + 1);
    if (/utm_source=/i.test(blob) && !/utm_medium=/i.test(blob)) {
      add('warning', ad, 'no-medium', 'utm_source without utm_medium -- GA4 reports the medium as "(not set)"');
    }
    const content = blob.match(/utm_content=([^&\s]+)/);
    if (!content) {
      add('warning', ad, 'no-utm-content', 'no utm_content -- this ad cannot be told apart from any other');
    } else {
      if (!contentValues.has(content[1])) contentValues.set(content[1], []);
      contentValues.get(content[1]).push(ad.name);
    }
  }

  // --- one channel, one spelling ---------------------------------------
  // Case matters to GA4: "Facebook" and "facebook" are separate rows, so a
  // split spelling understates the real volume of whichever channel it hits.
  const byLower = new Map();
  for (const [spelling, n] of sourceSpellings) {
    const k = spelling.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, []);
    byLower.get(k).push(`${spelling} (${n})`);
  }
  for (const [k, list] of byLower) {
    if (list.length > 1) {
      findings.push({
        severity: 'error', ad: '(account-wide)', check: 'utm-source-case',
        message: `"${k}" is spelled ${list.length} ways: ${list.join(', ')} -- GA4 counts these as separate channels`,
      });
    }
  }

  // One utm_content across many ads defeats per-ad attribution entirely --
  // GA4 and Stripe can both see that "an ad" produced a sale and neither can
  // say which. This is the same rule the queue linter applies to rows, where
  // proof_rsa1 on all 45 was blocker #24; the ads were never checked.
  for (const [value, names] of contentValues) {
    if (names.length > 1) {
      findings.push({
        severity: 'error', ad: '(account-wide)', check: 'utm-content-shared',
        message: `utm_content="${value}" is on ${names.length} ads (${names.slice(0, 3).map((n) => String(n).slice(0, 22)).join(', ')}${names.length > 3 ? ', …' : ''}) -- none can be attributed individually`,
      });
    }
  }

  return findings;
}

async function main() {
  if (!token) { console.error('META_ADS_ACCESS_TOKEN is unset.'); process.exit(2); }
  const asJson = flag('json');
  const statuses = flag('all-statuses') ? ALL : SERVABLE;

  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const account = process.env.META_AD_ACCOUNT_ID
    || ((await get('me/adaccounts', { fields: 'id', limit: 25 })).data || [])[0]?.id;
  if (!account) throw new Error('No ad account visible -- set META_AD_ACCOUNT_ID.');

  const res = await get(`${account}/ads`, {
    // adset{end_time} is what actually stops delivery -- effective_status only
    // says whether somebody paused it. See the past-event check.
    fields: 'id,name,effective_status,adset{end_time},creative{id,url_tags,object_story_spec,asset_feed_spec}',
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: statuses }]),
    limit: 500,
  });
  const ads = res.data || [];
  const today = new Date().toISOString().slice(0, 10);
  const findings = lint(ads, brand, today);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  if (asJson) {
    console.log(JSON.stringify({ account, ads: ads.length, errors, warnings }, null, 2));
  } else {
    const byCheck = new Map();
    for (const f of findings) {
      if (!byCheck.has(f.check)) byCheck.set(f.check, []);
      byCheck.get(f.check).push(f);
    }
    console.log(`\n${account} -- ${ads.length} ad(s)`);
    for (const [check, list] of [...byCheck].sort()) {
      console.log(`\n${list[0].severity === 'error' ? 'ERROR  ' : 'warning'} ${check} (${list.length})`);
      for (const f of list) console.log(`   ${String(f.ad).slice(0, 40).padEnd(42)} ${f.message}`);
    }
    console.log(`\n${ads.length} ads -- ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(2); });

module.exports = { lint, destinationUrls, copyOf };
