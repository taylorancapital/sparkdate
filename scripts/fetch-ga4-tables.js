#!/usr/bin/env node
/**
 * scripts/fetch-ga4-tables.js
 *
 * Pulls the core GA4 tables the nightly review actually reads, straight from
 * the Data API, and writes them into the Night Tasks folder as CSVs shaped
 * like the manual exports.
 *
 * WHY THIS EXISTS
 *
 * The nightly analysis has depended on someone remembering to export 38 CSVs
 * by hand. On nights that did not happen there was no report. Worse, the export
 * carried an artifact that took three reports to pin down: the numbers depend
 * on WHAT TIME the export was pulled. The 08-26 export was taken at 13:12 and
 * recorded that day as 54 sessions; the 08-27 export, taken at 23:19, read the
 * same day as 172. A scheduled pull always runs at the same hour, which removes
 * the variable rather than documenting it.
 *
 * VERIFIED EQUIVALENT, NOT ASSUMED. On 2026-08-29 this API returned exactly the
 * figures the manual export had for the same days -- Aug 22 175/132, Aug 24
 * 135/62, Aug 25 141/48, Aug 26 172/73 -- so these files are the same numbers,
 * not an approximation of them.
 *
 * WHAT IT DOES NOT REPLACE
 *
 * Twelve tables, not 38. The Explorations -- funnel steps, the A/B webview
 * segments, cohort retention -- are built from hand-made segments the Data API
 * cannot express, and pretending otherwise would produce files that look right
 * and mean something different. Those still need exporting by hand when a
 * report needs them. `ANALYTICS_METHOD.md` section 10 lists the traps that
 * apply to the funnel data regardless of how it arrives.
 *
 * FILENAMES DELIBERATELY DO NOT COLLIDE with the manual exports. Those are
 * `download*.csv`; these are `ga4-api-*.csv`. An automated job must never
 * overwrite a file a human put there.
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS   path to the service account JSON
 *   GA4_PROPERTY_ID                  optional -- defaults to 536859339
 *   GA4_TIMEZONE                     optional -- the PROPERTY's zone, which is
 *                                    what decides "today". Defaults to
 *                                    America/New_York. Change it only if the
 *                                    property's reporting timezone changes.
 *
 * Usage:
 *   node scripts/fetch-ga4-tables.js --dry-run
 *   node scripts/fetch-ga4-tables.js
 *   node scripts/fetch-ga4-tables.js --start=2026-05-19 --end=2026-08-29
 */

'use strict';

const fs = require('fs');
const path = require('path');
// google-auth-library is required lazily, inside token(). It is the only thing
// here that reaches the network, and it is not a declared dependency -- it
// resolves transitively through firebase-admin. Requiring it at module load
// would make importing this file for a unit test depend on that accident.

const REPO = path.join(__dirname, '..');
const OUTDIR = path.join(REPO, 'Business Plan', 'files', 'Night Tasks');
const PROPERTY = process.env.GA4_PROPERTY_ID || '536859339';
const API = 'https://analyticsdata.googleapis.com/v1beta';

// GA4 buckets every event into a calendar day using the PROPERTY's timezone,
// which for 536859339 is US Eastern. "Today" therefore has to be resolved in
// that zone, not in the machine's -- and not in UTC, which is where an earlier
// `new Date().toISOString()` put it. Verified rather than assumed: at
// 2026-08-31 03:26 UTC the Data API still returned no row for 20260831, because
// in the property it was 23:26 on 08-30.
//
// The nightly never tripped over this (02:00 Eastern is 06:00 UTC, same date),
// but any hand-run after 20:00 Eastern did: it stamped every file with
// TOMORROW's date and asked for a day that had not started, so the file was
// named for a day it contained nothing about.
//
// Not read from the Admin API on purpose -- that API is disabled on this
// project (`analyticsadmin.googleapis.com` returns SERVICE_DISABLED for
// 330206052938), so a lookup would fail the whole run to learn a constant.
const TZ = process.env.GA4_TIMEZONE || 'America/New_York';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

// en-CA formats as YYYY-MM-DD, which is the shape the Data API wants, and the
// timeZone option makes the DST switch someone else's problem.
const isoIn = (tz, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
const compact = (s) => s.replace(/-/g, '');

/**
 * The twelve tables. Each mirrors something the nightly report reads, and the
 * `title` matches the manual export's naming closely enough that a reader
 * recognises it.
 */
const TABLES = [
  {
    file: 'daily-trend',
    title: 'Daily trend - sessions, engaged sessions, users',
    dimensions: ['date'],
    metrics: ['sessions', 'engagedSessions', 'totalUsers', 'engagementRate'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    file: 'traffic-by-source',
    title: 'Traffic acquisition - session source / medium',
    dimensions: ['sessionSourceMedium'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    file: 'channel-groups',
    title: 'Traffic acquisition - default channel group',
    dimensions: ['sessionDefaultChannelGroup'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // landingPage, not landingPagePlusQueryString, on purpose: fbclid gives
    // nearly every paid session its own URL, so the query-string version is
    // 1,533 rows for 1,690 sessions and unreadable. Path-only is the table
    // the report actually wants.
    file: 'landing-pages',
    title: 'Landing pages (path only, query string stripped)',
    dimensions: ['landingPage'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    file: 'events',
    title: 'Events - event count and users',
    dimensions: ['eventName'],
    metrics: ['eventCount', 'totalUsers'],
    orderBy: { metric: { metricName: 'eventCount' }, desc: true },
  },
  {
    file: 'events-by-source',
    title: 'Events by session source / medium',
    dimensions: ['eventName', 'sessionSourceMedium'],
    metrics: ['eventCount', 'totalUsers'],
    orderBy: { metric: { metricName: 'eventCount' }, desc: true },
  },
  {
    // The sticky-bar CTR question (ANALYTICS_CONTEXT.md section 4, open
    // question 2) -- asked as the #1 item by three consecutive reports.
    // select_promotion (click) and view_promotion (impression) both fire with
    // an event-level promotion_name and creative_slot and NO items array; GA4
    // still populates the item-scoped promotion fields from those params (the
    // UI's "Items clicked in promotion" read 61 off exactly these events), so
    // itemPromotionName / itemsViewedInPromotion / itemsClickedInPromotion is
    // the pairing that comes back non-zero. This is numerator and denominator
    // per promotion per slot -- the CTR table itself.
    file: 'promotions',
    title: 'Promotions - views and clicks by promotion name and slot',
    dimensions: ['itemPromotionName', 'itemPromotionCreativeSlot'],
    metrics: ['itemsViewedInPromotion', 'itemsClickedInPromotion'],
    orderBy: { metric: { metricName: 'itemsViewedInPromotion' }, desc: true },
  },
  {
    // date x source: lets a report test whether a traffic-mix change (e.g. a
    // traffic-objective campaign turning on) explains a property-wide
    // engagement move, instead of refusing the question -- the 08-30 report's
    // section E had to. Same metrics as daily-trend so the two reconcile.
    file: 'daily-by-source',
    title: 'Daily trend by session source / medium',
    dimensions: ['date', 'sessionSourceMedium'],
    metrics: ['sessions', 'engagedSessions', 'totalUsers', 'engagementRate'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // landingPage x source: settles which page each source's sessions actually
    // arrive on. The 08-30 report's section C could prove only 11 of 435
    // facebook/paid_social sessions reached /lp (via /lp-only events) and had
    // to leave the other 424 undecided; this table is the decider it asks for
    // in section H2. Path-only for the same fbclid reason as landing-pages.
    file: 'landing-by-source',
    title: 'Landing pages by session source / medium (path only)',
    dimensions: ['landingPage', 'sessionSourceMedium'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    file: 'revenue-by-source',
    title: 'Revenue by session source / medium',
    dimensions: ['sessionSourceMedium'],
    metrics: ['transactions', 'totalRevenue'],
    orderBy: { metric: { metricName: 'totalRevenue' }, desc: true },
  },
  {
    file: 'revenue-by-item',
    title: 'Ecommerce purchases by item name',
    dimensions: ['itemName'],
    metrics: ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'],
    orderBy: { metric: { metricName: 'itemRevenue' }, desc: true },
  },
  {
    // Carries the datacenter-traffic check: ANALYTICS_METHOD section on bot
    // traffic is read off this table, and it needs region to tell Altoona IA
    // (a Meta datacenter) from Altoona PA (100 miles from Lancaster).
    file: 'cities',
    title: 'Cities and regions - users, key events, revenue',
    dimensions: ['city', 'region'],
    metrics: ['totalUsers', 'sessions', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'totalUsers' }, desc: true },
  },
];

async function token() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is unset. It must point at the service account JSON.\n' +
      'Note a User environment variable is NOT visible to shells opened before it was set.'
    );
  }
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
  const { token: t } = await (await auth.getClient()).getAccessToken();
  return t;
}

async function runReport(t, spec, start, end) {
  const body = {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: spec.dimensions.map((name) => ({ name })),
    metrics: spec.metrics.map((name) => ({ name })),
    limit: 100000,
    // Without this GA4 returns no totals block, so the "Grand total" row the
    // manual exports carry -- and which the nightly prompt's parser looks for
    // -- would silently be absent.
    metricAggregations: ['TOTAL'],
  };
  if (spec.orderBy) body.orderBys = [spec.orderBy];
  const res = await fetch(`${API}/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${spec.file}: ${json.error.message}`);
  return json;
}

const esc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GA4's TOTAL aggregation sums in floating point, so revenue comes back as
// "946.16000000000008". The manual exports show "946.16", and a reader
// comparing the two should not have to wonder whether the extra digits mean
// something. Rounded by METRIC NAME rather than by shape: engagementRate is
// legitimately more precise than two decimals and must not be flattened.
const fmt = (metricName, value) =>
  /revenue/i.test(metricName) && /^-?[0-9]+\.[0-9]{3,}$/.test(value)
    ? Number(value).toFixed(2)
    : value;

function toCsv(spec, report, start, end, pulledAt) {
  const head = [
    '# ----------------------------------------',
    '# sparkdate-philly',
    `# ${spec.title}`,
    `# ${compact(start)}-${compact(end)}`,
    // The pull time is the point. ANALYTICS_METHOD section 1: the final day's
    // counts are short in proportion to how much of that day had elapsed when
    // the data was pulled, and that is not a lag any waiting period fixes.
    `# pulled ${pulledAt} -- source: GA4 Data API, property ${PROPERTY} (dates in ${TZ})`,
    `# NOTE: the last two dates in any daily series are not final. See reports/ANALYTICS_METHOD.md section 1.`,
    '# ----------------------------------------',
    '',
  ];
  const cols = [...spec.dimensions, ...spec.metrics];
  const rows = (report.rows || []).map((r) => [
    ...r.dimensionValues.map((d) => d.value),
    ...r.metricValues.map((m, i) => fmt(spec.metrics[i], m.value)),
  ]);
  const totals = (report.totals || [])[0];
  const body = rows.map((r) => r.map(esc).join(','));
  if (totals) {
    const t = [
      ...spec.dimensions.map(() => ''),
      ...totals.metricValues.map((m, i) => fmt(spec.metrics[i], m.value)),
    ];
    body.push(t.map(esc).join(',') + ',Grand total');
  }
  return head.join('\n') + cols.map(esc).join(',') + '\n' + body.join('\n') + '\n';
}

async function main() {
  const end = arg('end', isoIn(TZ));
  const start = arg('start', '2026-05-19');
  const dry = flag('dry-run');
  const pulledAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  console.log(`GA4 property ${PROPERTY}  ${start} .. ${end}  (${TZ}; now ${pulledAt})`);
  console.log(dry ? 'DRY RUN -- nothing will be written\n' : `writing to ${OUTDIR}\n`);

  const t = await token();
  let wrote = 0;
  for (const spec of TABLES) {
    const report = await runReport(t, spec, start, end);
    const csv = toCsv(spec, report, start, end, pulledAt);
    const name = `ga4-api-${spec.file}-${end}.csv`;
    const dest = path.join(OUTDIR, name);
    const n = (report.rows || []).length;
    if (dry) {
      console.log(`  ${name.padEnd(44)} ${String(n).padStart(6)} rows  (not written)`);
    } else {
      fs.writeFileSync(dest, csv, 'utf8');
      wrote++;
      console.log(`  ${name.padEnd(44)} ${String(n).padStart(6)} rows`);
    }
  }
  console.log(dry ? '\nDry run. Re-run without --dry-run to write.' : `\nWrote ${wrote} file(s).`);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
}

module.exports = { isoIn, TZ };
