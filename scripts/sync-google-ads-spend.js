#!/usr/bin/env node
/**
 * scripts/sync-google-ads-spend.js
 *
 * Pulls GOOGLE ADS cost into the same `ad_spend` collection the Meta sync
 * writes, so the dashboard's cost series and every CAC figure stop excluding it.
 *
 * WHY THIS EXISTS
 *
 * `scripts/sync-meta-spend.js` was the only writer to `ad_spend`, and it stamps
 * `source: 'meta'` on every document. Google Ads spend therefore had no path
 * into Firestore at all -- not filtered out, just never fetched. Discovered
 * 2026-09-04: $37.91 across 2026-06-15..2026-07-24, in a property everyone
 * described as Meta-only.
 *
 * That is small in absolute terms and large where it lands. TIME_ALLOCATION
 * 2026-09-04 put July's net contribution at $60.30 across 84 merged PRs; $35.35
 * of this sits in July, which takes that to $24.95 and the return per PR from
 * $0.72 to $0.30.
 *
 * WHERE THE NUMBERS COME FROM -- GA4, not the Google Ads API
 *
 * The Google Ads API needs a developer token and its own OAuth client. GA4
 * already has the cost, imported through the linked Google Ads account, and
 * this repo already holds GA4 credentials. So this reads
 * `advertiserAdCost` / `advertiserAdClicks` / `advertiserAdImpressions` from
 * the Data API.
 *
 * THE TRAP THAT HID THIS FOR MONTHS: every advertiserAd* metric and
 * returnOnAdSpend ERROR when queried on their own --
 *
 *     "Please add sessionCampaignName to make the request compatible"
 *
 * so any probe that tests metrics in isolation concludes they are unavailable.
 * They are not. They need a campaign dimension in the same request.
 *
 * DOCUMENT ID, AND WHY IT IS NOT JUST THE DATE
 *
 * The Meta sync writes `ad_spend/{YYYY-MM-DD}` with `batch.set`, which is a
 * WHOLE-DOCUMENT overwrite. Writing Google spend to that same id would silently
 * destroy that day's Meta spend. So these are `ad_spend/{YYYY-MM-DD}__google`.
 *
 * That is safe with the existing dashboard rather than merely tolerated by it.
 * `loadAdSpend()` in public/admin.html reads the whole collection and the cost
 * series does:
 *
 *     adSpendDays.forEach(day => {
 *       const k = String(day.date || day.id || '');
 *       if (out.has(k)) out.set(k, out.get(k) + Number(day.total || 0));
 *     });
 *
 * It keys on the `date` FIELD before the doc id, and it ADDS. So a second
 * document for a date accumulates onto the first instead of replacing it, and
 * no dashboard change is needed for the cost math to become correct.
 *
 * ONE dashboard change WAS needed, and it is in this commit: the Meta freshness
 * indicator took the newest `syncedAt` across every document in the collection.
 * Google documents written now would have made a stale Meta sync look fresh --
 * defeating the signal that exists because the P&L once showed ads as free for
 * a month with nothing on screen distinguishing "no spend" from "not synced".
 * It now filters to `source === 'meta'`.
 *
 * The daily figures are rounded to cents, so their sum can differ from GA4's
 * own grand total by a cent or so ($37.92 against 37.912513 over the whole
 * range). That is inherent to a per-day ledger, not an error -- but quote GA4
 * for a period total rather than adding these up if the cent matters.
 *
 * These campaigns will also appear in the dashboard's campaign performance
 * table beside Meta's, with no badge distinguishing them. The join keys on
 * `c.id || c.name` and Google rows carry no id, so they key by name and roll
 * into `_unattributed` per event. Correct, but worth knowing before reading
 * that table as Meta-only.
 *
 * byEvent IS DELIBERATELY UNATTRIBUTED. The Meta sync maps campaigns to events
 * by reading each ad's destination URL for an eventId. Google campaigns here
 * carry no such mapping, and guessing one would put money against an event on
 * no evidence. Every dollar lands in `_unattributed`, which the dashboard
 * already understands: it counts toward the day's total and is skipped when
 * building per-event spend.
 *
 * Env -- NO NEW SECRET IS REQUIRED. See token() for why.
 *   GOOGLE_APPLICATION_CREDENTIALS   path to a service-account JSON. What this
 *                                    machine uses; absent in CI.
 *   FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *                                    the CI path. Already present for the
 *                                    Firestore write, and the same key can read
 *                                    GA4 -- the GA4 service account IS the
 *                                    Firebase Admin account.
 *   FIREBASE_PROJECT_ID              needed with --execute
 *   GA4_SERVICE_ACCOUNT_JSON         optional override, if the two accounts are
 *                                    ever separated
 *   GA4_PROPERTY_ID                  optional -- defaults to 536859339
 *
 * Usage:
 *   node scripts/sync-google-ads-spend.js                 # dry run, last 30 days
 *   node scripts/sync-google-ads-spend.js --days=120
 *   node scripts/sync-google-ads-spend.js --start=2026-05-01 --end=2026-09-04
 *   node scripts/sync-google-ads-spend.js --execute
 */

'use strict';

const PROPERTY = process.env.GA4_PROPERTY_ID || '536859339';
const API = 'https://analyticsdata.googleapis.com/v1beta';

// The property's reporting timezone decides what "today" is. Same reasoning as
// fetch-ga4-tables.js: resolving it in the machine's zone (or UTC) asks for a
// day that has not started yet and stamps files with tomorrow's date.
const TZ = process.env.GA4_TIMEZONE || 'America/New_York';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const EXECUTE = process.argv.includes('--execute');

const isoIn = (tz, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

const money = (n) => `$${Number(n).toFixed(2)}`;
// GA4 returns YYYYMMDD; Firestore doc ids and the dashboard both want YYYY-MM-DD.
const dashed = (yyyymmdd) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const round2 = (n) => Math.round(n * 100) / 100;

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

/**
 * Two ways in, and the fallback is the one CI uses.
 *
 * On this machine GOOGLE_APPLICATION_CREDENTIALS points at a service-account
 * file, so the default ADC lookup finds it. GitHub Actions has no such file --
 * but it does not need a new secret either, because the GA4 service account and
 * the Firebase Admin account are THE SAME KEY:
 *
 *     firebase-adminsdk-fbsvc@sparkdate-philly.iam.gserviceaccount.com
 *
 * FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are already in Actions for the
 * Firestore write, and google-auth-library will take them inline. Verified
 * 2026-09-04 by deleting GOOGLE_APPLICATION_CREDENTIALS and authenticating from
 * those two values alone: GA4 returned the real cost rows.
 *
 * Adding a second secret holding the same private key would have meant two
 * copies to rotate and two to leak, for no capability.
 *
 * GA4_SERVICE_ACCOUNT_JSON remains as an override, for the day the two accounts
 * are separated or the GA4 reader is narrowed to analytics-only.
 */
async function token() {
  const { GoogleAuth } = require('google-auth-library');

  let auth;
  let via;
  if (process.env.GA4_SERVICE_ACCOUNT_JSON) {
    via = 'GA4_SERVICE_ACCOUNT_JSON';
    auth = new GoogleAuth({ credentials: JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON), scopes: SCOPES });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    via = `GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`;
    auth = new GoogleAuth({ scopes: SCOPES });
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    via = 'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY';
    auth = new GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        // Actions stores the newlines escaped; sync-meta-spend.js un-escapes
        // the same way for the Admin SDK.
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: SCOPES,
    });
  } else {
    throw new Error(
      'No GA4 credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account\n' +
      '  file, or provide FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or\n' +
      '  GA4_SERVICE_ACCOUNT_JSON. Which one was used is printed on every run.'
    );
  }

  // Printed on purpose. A sync that silently authenticated by an unexpected
  // route is how "0 documents" becomes indistinguishable from "wrong account".
  console.log(`Auth: ${via}`);
  const t = await (await auth.getClient()).getAccessToken();
  return t.token;
}

async function fetchCost(t, start, end) {
  const res = await fetch(`${API}/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: start, endDate: end }],
      // sessionCampaignName is NOT optional decoration -- without a campaign
      // dimension the advertiserAd* metrics return 400. See the docblock.
      dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }],
      metrics: [
        { name: 'advertiserAdCost' },
        { name: 'advertiserAdClicks' },
        { name: 'advertiserAdImpressions' },
      ],
      limit: 100000,
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    const msg = (j.error && j.error.message) || JSON.stringify(j).slice(0, 300);
    throw new Error(`GA4 runReport ${res.status}: ${msg}`);
  }
  return j.rows || [];
}

function group(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const cost = parseFloat(r.metricValues[0].value) || 0;
    const clicks = parseInt(r.metricValues[1].value, 10) || 0;
    const impressions = parseInt(r.metricValues[2].value, 10) || 0;
    // Rows with no cost are every other campaign in the property -- Meta's,
    // and the (not set) bucket that carries all organic sessions. Writing them
    // would create ~100 empty documents a day and mean nothing.
    if (cost <= 0) continue;

    const date = dashed(r.dimensionValues[0].value);
    const name = r.dimensionValues[1].value || '(not set)';
    if (!byDate.has(date)) byDate.set(date, { date, total: 0, byCampaign: [] });
    const day = byDate.get(date);
    // Accumulate RAW and round once per day below. Rounding on every add would
    // round twice on a multi-campaign day.
    day.total += cost;
    day.byCampaign.push({ name, spend: round2(cost), clicks, impressions });
  }
  for (const day of byDate.values()) {
    day.total = round2(day.total);
    day.byCampaign.sort((a, b) => b.spend - a.spend);
    // Unattributed on purpose: no eventId mapping exists for these campaigns.
    day.byEvent = { _unattributed: day.total };
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const end = arg('end', isoIn(TZ));
  const days = parseInt(arg('days', '30'), 10);
  const start = arg('start', isoIn(TZ, new Date(Date.now() - (days - 1) * 86400000)));

  console.log(`\nGoogle Ads spend via GA4 property ${PROPERTY}`);
  console.log(`Range ${start} .. ${end}  (dates in ${TZ})\n`);

  const t = await token();
  const rows = await fetchCost(t, start, end);
  const sorted = group(rows);

  if (!sorted.length) {
    console.log('No Google Ads cost in this range. Nothing to write.');
    console.log('That is a real answer, not a failure: spend has been dormant since 2026-07-24.\n');
    return;
  }

  let total = 0;
  console.log('date          spend    clicks  impr   campaigns');
  for (const d of sorted) {
    total += d.total;
    const names = d.byCampaign.map((c) => c.name).join(', ');
    const clicks = d.byCampaign.reduce((s, c) => s + c.clicks, 0);
    const impr = d.byCampaign.reduce((s, c) => s + c.impressions, 0);
    console.log(
      `${d.date}  ${money(d.total).padStart(8)}  ${String(clicks).padStart(6)}  ${String(impr).padStart(5)}   ${names.slice(0, 46)}`
    );
  }
  console.log(`${''.padEnd(12)}  ${money(total).padStart(8)}   TOTAL over ${sorted.length} day(s)\n`);

  if (!EXECUTE) {
    console.log(`Dry run. ${sorted.length} document(s) would be written to ad_spend/ as {date}__google.`);
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

  // `{date}__google`, never `{date}` -- see the docblock. Keyed so a re-run
  // overwrites its own document and backfilling twice cannot double a number,
  // and namespaced so it can never overwrite Meta's.
  let written = 0;
  for (let i = 0; i < sorted.length; i += 400) {
    const batch = db.batch();
    for (const d of sorted.slice(i, i + 400)) {
      batch.set(db.collection('ad_spend').doc(`${d.date}__google`), {
        ...d, source: 'google_ads', currency: 'USD', syncedAt: FieldValue.serverTimestamp(),
      });
      written++;
    }
    await batch.commit();
  }
  console.log(`wrote ${written} document(s) to ad_spend/ as {date}__google`);
  console.log('The admin dashboard reads these directly -- no deploy needed.\n');
}

if (require.main === module) {
  main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
}

module.exports = { group, dashed, isoIn };
