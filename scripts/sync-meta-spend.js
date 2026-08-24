#!/usr/bin/env node
/**
 * scripts/sync-meta-spend.js
 *
 * Pulls daily Meta ad spend, attributes each campaign to the EVENT it sells,
 * and writes it to Firestore so the admin dashboard can trend it instead of
 * showing a number somebody typed once.
 *
 * WHY THIS EXISTS
 *
 * Ad cost currently reaches the dashboard as `costFacebook` / `costTiktok` /
 * `costEventbriteAds` -- dollar figures hand-entered on each event doc. That
 * has two consequences the numbers do not advertise:
 *
 *   1. CAC and margin silently understate for any period nobody filled in.
 *      A blank month reads as a free month.
 *   2. There is no trend. A single typed total cannot show that cost per
 *      click tripled on 2026-08-13, which is the kind of thing worth seeing
 *      the week it happens rather than the month after.
 *
 * WHY NOT AN API ROUTE
 *
 * api/ holds exactly 12 functions, which is the Vercel Hobby cap. A thirteenth
 * would mean deleting one or paying for Pro. So this runs on a schedule
 * outside Vercel -- same reasoning, and the same GitHub Actions pattern, as
 * .github/workflows/social-publish.yml -- and writes to Firestore, which the
 * admin dashboard already reads directly for eight other collections.
 *
 * HOW A CAMPAIGN IS ATTRIBUTED TO AN EVENT
 *
 * From its own destination URL. Every ad's link carries `eventId=<doc id>`,
 * matching the Firestore event, so the campaign that spends the money names
 * the event it is selling. Nothing has to be mapped by hand or kept in sync.
 *
 * Reading that link is fussier than it looks: an IMAGE ad keeps it under
 * object_story_spec.link_data.link while a VIDEO ad keeps it under
 * video_data.call_to_action.value.link. Checking only the first is what made
 * an earlier script report six video ads as untagged and recommend breaking
 * them. destinationUrls() below checks every field a creative can hide a URL
 * in, and the same function exists in check-meta-ad-tags.js for that reason.
 *
 * A campaign whose ads point at DIFFERENT events is recorded as ambiguous
 * rather than assigned to whichever came first. A campaign with no eventId at
 * all lands in `_unattributed`, which is itself worth seeing -- it means money
 * is going somewhere the dashboard cannot account for.
 *
 * SHAPE IN FIRESTORE
 *
 *   ad_spend/{YYYY-MM-DD}
 *     date        '2026-08-22'
 *     total       19.26                       dollars, all campaigns
 *     byEvent     { '<eventId>': 5.20, _unattributed: 2.00 }
 *     byCampaign  [ { id, name, eventId, spend, clicks, linkClicks, impressions, adsets } ]
 *     byAdset     [ { id, name, campaignId, campaignName, objective, eventId,
 *                     spend, clicks, linkClicks, impressions } ]
 *     source      'meta'
 *     syncedAt    server timestamp
 *
 * One document per DAY rather than per campaign-day. That keeps the collection
 * at ~365 docs a year instead of thousands, lets the dashboard read a date
 * range without a composite index, and makes a re-run idempotent: the same day
 * always overwrites the same document, so backfilling twice cannot double a
 * number.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN   ads_read is enough -- this never writes to Meta
 *   META_AD_ACCOUNT_ID      optional
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *                           only needed with --execute
 *
 * Usage:
 *   node scripts/sync-meta-spend.js                  # dry run, last 30 days
 *   node scripts/sync-meta-spend.js --days=90
 *   node scripts/sync-meta-spend.js --execute
 */

'use strict';

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const EXECUTE = flag('execute');
const DAYS = Math.max(1, Math.min(365, Number(arg('days', 30)) || 30));

const token = process.env.META_ADS_ACCESS_TOKEN;
if (!token) { console.error('Missing env var: META_ADS_ACCESS_TOKEN'); process.exit(2); }
const ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';

async function get(path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.error_user_msg || json.error.message}`);
  return json;
}

/**
 * Every field a creative can hide its destination URL in.
 *
 * Kept in step with the copy in check-meta-ad-tags.js. Image ads and video ads
 * store the link in different places, and a carousel stores one per card.
 */
function destinationUrls(creative) {
  const s = (creative || {}).object_story_spec || {};
  const out = [];
  const add = (v) => { if (v) out.push(String(v)); };
  add((s.link_data || {}).link);
  add((((s.link_data || {}).call_to_action || {}).value || {}).link);
  add((((s.video_data || {}).call_to_action || {}).value || {}).link);
  add((s.template_data || {}).link);
  for (const ch of (s.link_data || {}).child_attachments || []) add(ch.link);
  for (const l of ((creative || {}).asset_feed_spec || {}).link_urls || []) add(l.website_url);
  return out;
}

/** The Firestore event id a URL sells, or null. */
function eventIdFrom(url) {
  const m = String(url).match(/[?&](?:eventId|event)=([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/**
 * campaign id -> { eventId, ambiguous } for every campaign that has ever run.
 * Archived and paused campaigns are included on purpose: they spent money on
 * days inside the window even if they are not spending now, and leaving them
 * out would silently drop that spend from the day's total.
 */
async function campaignEventMap() {
  // EVERY status, explicitly. Meta's /ads edge excludes ARCHIVED and DELETED
  // by default, and those ads belong to campaigns that spent real money on
  // days inside the window. Without this the attribution rate silently fell
  // from 100% to 46% the moment six campaigns were archived -- the spend was
  // still counted, it just stopped being attributable to an event.
  const ALL_STATUSES = ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'ADSET_PAUSED',
    'CAMPAIGN_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED',
    'DISAPPROVED', 'PENDING_BILLING_INFO'];
  const ads = await get(`${ACCOUNT}/ads`, {
    fields: 'id,campaign_id,creative{object_story_spec,asset_feed_spec}',
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ALL_STATUSES }]),
    limit: 500,
  });
  const byCampaign = new Map();
  for (const ad of ads.data || []) {
    const ids = new Set(
      destinationUrls(ad.creative).map(eventIdFrom).filter(Boolean)
    );
    if (!ids.size) continue;
    const seen = byCampaign.get(ad.campaign_id) || new Set();
    for (const id of ids) seen.add(id);
    byCampaign.set(ad.campaign_id, seen);
  }
  const out = new Map();
  for (const [cid, ids] of byCampaign) {
    out.set(cid, { eventId: ids.size === 1 ? [...ids][0] : null, ambiguous: ids.size > 1 });
  }
  return out;
}

function ymd(d) { return d.toISOString().slice(0, 10); }

async function main() {
  const until = new Date();
  const since = new Date(until.getTime() - (DAYS - 1) * 86400000);

  console.log(`\naccount ${ACCOUNT}`);
  console.log(`window  ${ymd(since)} to ${ymd(until)} (${DAYS} days)`);
  console.log(EXECUTE ? 'EXECUTING -- will write to Firestore\n' : 'DRY RUN -- nothing written\n');

  const map = await campaignEventMap();
  // AD SET level, not campaign. Gender targeting lives in AD SETS -- a single
  // campaign routinely holds a "| Female |" set beside an all-genders one --
  // so a campaign-level pull cannot see the split that is actually being
  // managed. Taylor hit this directly: the dashboard reported a Good Good
  // women's CPC of $1.25 while Ads Manager showed $0.15, because those were
  // two different ad sets inside two different campaigns and only the
  // campaign totals were stored. byCampaign is still written (aggregated up
  // from the ad sets below), so nothing downstream has to change.
  //
  // `objective` is pulled because it turned out to be the single most
  // decisive field on this account: across every venue, LINK_CLICKS ad sets
  // produced 406 landing-page views and ZERO checkouts, while OUTCOME_SALES
  // ad sets produced 35. Cheap clicks are not cheap tickets, and without the
  // objective stored next to the CPC the dashboard makes the cheap ones look
  // like the winners.
  //
  // `clicks` is ALL clicks (what Ads Manager's default CPC column shows);
  // `inline_link_clicks` is link clicks only. Both are stored because
  // comparing one against the other is exactly how the $1.25-vs-$0.15
  // confusion above got started.
  const rows = (await get(`${ACCOUNT}/insights`, {
    fields: 'campaign_id,campaign_name,adset_id,adset_name,objective,spend,clicks,inline_link_clicks,impressions',
    level: 'adset',
    time_increment: '1',
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    limit: 500,
  })).data || [];

  // date -> doc
  const days = new Map();
  const ambiguous = new Set();
  for (const r of rows) {
    const date = r.date_start;
    if (!days.has(date)) days.set(date, { date, total: 0, byEvent: {}, byCampaign: [], byAdset: [] });
    const day = days.get(date);
    const spend = Math.round((Number(r.spend) || 0) * 100) / 100;
    const info = map.get(r.campaign_id) || {};
    if (info.ambiguous) ambiguous.add(r.campaign_name);
    const key = info.eventId || '_unattributed';

    day.total = Math.round((day.total + spend) * 100) / 100;
    day.byEvent[key] = Math.round(((day.byEvent[key] || 0) + spend) * 100) / 100;
    day.byAdset.push({
      id: r.adset_id,
      name: r.adset_name || '(unnamed)',
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      objective: r.objective || null,
      eventId: info.eventId || null,
      spend,
      clicks: Number(r.clicks) || 0,
      linkClicks: Number(r.inline_link_clicks) || 0,
      impressions: Number(r.impressions) || 0,
    });
  }

  // Fold the ad sets up into the campaign rows the dashboard already reads.
  // Same shape as before the ad-set switch, so byCampaign stays a drop-in --
  // an older dashboard build keeps working against a newer document.
  for (const day of days.values()) {
    const roll = new Map();
    for (const a of day.byAdset) {
      const c = roll.get(a.campaignId) || {
        id: a.campaignId, name: a.campaignName, eventId: a.eventId,
        spend: 0, clicks: 0, linkClicks: 0, impressions: 0, adsets: 0,
      };
      c.spend += a.spend;
      c.clicks += a.clicks;
      c.linkClicks += a.linkClicks;
      c.impressions += a.impressions;
      c.adsets += 1;
      roll.set(a.campaignId, c);
    }
    day.byCampaign = [...roll.values()].map(c => ({ ...c, spend: Math.round(c.spend * 100) / 100 }));
  }

  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const grand = sorted.reduce((a, d) => a + d.total, 0);
  const perEvent = {};
  for (const d of sorted) for (const [k, v] of Object.entries(d.byEvent)) perEvent[k] = (perEvent[k] || 0) + v;

  console.log('date         spend   campaigns  ad sets  attributed');
  for (const d of sorted.slice(-14)) {
    const attributed = Object.entries(d.byEvent).filter(([k]) => k !== '_unattributed').reduce((a, [, v]) => a + v, 0);
    const pct = d.total ? Math.round(attributed / d.total * 100) : 0;
    console.log(`  ${d.date}  ${('$' + d.total.toFixed(2)).padStart(8)}  ${String(d.byCampaign.length).padStart(6)}  ${String(d.byAdset.length).padStart(7)}     ${String(pct).padStart(3)}%`);
  }
  if (sorted.length > 14) console.log(`  … ${sorted.length - 14} earlier day(s) not printed`);

  console.log('');
  console.log(`${sorted.length} day(s), $${grand.toFixed(2)} total`);
  console.log('');
  console.log('spend by event over the window:');
  for (const [k, v] of Object.entries(perEvent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(k === '_unattributed' ? 'UNATTRIBUTED' : k).padEnd(26)} $${v.toFixed(2)}`);
  }
  // Name the unattributed campaigns rather than leaving a bare total. On this
  // account every dollar of it is June/July spend pointing at Eventbrite, a
  // Facebook Event page or a bare /lp -- all predating the eventId= link
  // convention -- which is history rather than a defect, and much easier to
  // conclude when the destinations are printed than when they are not.
  if (perEvent._unattributed) {
    const noEvent = new Map();
    for (const d of sorted) {
      for (const c of d.byCampaign) {
        if (c.eventId) continue;
        noEvent.set(c.name, Math.round(((noEvent.get(c.name) || 0) + c.spend) * 100) / 100);
      }
    }
    console.log('');
    console.log('unattributed, by campaign (no eventId in the destination URL):');
    for (const [n, v] of [...noEvent].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`  $${v.toFixed(2).padStart(8)}  ${String(n).slice(0, 52)}`);
    }
    if (noEvent.size > 12) console.log(`  … ${noEvent.size - 12} more`);
  }

  if (ambiguous.size) {
    console.log('');
    console.log('AMBIGUOUS -- ads in one campaign point at different events, so its');
    console.log('spend is recorded as unattributed rather than guessed:');
    for (const n of ambiguous) console.log(`  ${String(n).slice(0, 60)}`);
  }

  if (!EXECUTE) {
    console.log('');
    console.log(`Dry run. ${sorted.length} document(s) would be written to ad_spend/.`);
    console.log('Re-run with --execute.\n');
    return;
  }

  const admin = require('firebase-admin');
  const need = (k) => {
    if (!process.env[k]) {
      console.error(`\n✗ Missing env var: ${k}`);
      console.error('  Copy from your Vercel project settings or .env.local');
      process.exit(2);
    }
    return process.env[k];
  };
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: need('FIREBASE_PROJECT_ID'),
        clientEmail: need('FIREBASE_CLIENT_EMAIL'),
        privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  // Batched, and keyed by date so a re-run overwrites rather than appends.
  // Backfilling the same window twice must not double any number.
  let written = 0;
  for (let i = 0; i < sorted.length; i += 400) {
    const batch = db.batch();
    for (const d of sorted.slice(i, i + 400)) {
      batch.set(db.collection('ad_spend').doc(d.date), {
        ...d, source: 'meta', currency: 'USD', syncedAt: FieldValue.serverTimestamp(),
      });
      written++;
    }
    await batch.commit();
  }
  console.log('');
  console.log(`wrote ${written} document(s) to ad_spend/`);
  console.log('The admin dashboard reads these directly -- no deploy needed.\n');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
