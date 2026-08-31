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
 * CORRECTED 2026-08-31. This section used to say the Explorations -- funnel
 * steps, the A/B webview segments, cohort retention -- "are built from hand-made
 * segments the Data API cannot express." That was wrong on all three counts, and
 * it was load-bearing: it was the stated reason 38 tables were still exported by
 * hand. Each was probed against property 536859339 before this was rewritten.
 *
 *   - Funnels come from `v1alpha:runFunnelReport`, which returns
 *     funnelStepName / activeUsers / funnelStepCompletionRate /
 *     funnelStepAbandonments / funnelStepAbandonmentRate -- exactly the columns
 *     of `download (15|17|19|20|23|28).csv`.
 *   - Segments are real: `segments[].sessionSegment.sessionInclusionCriteria
 *     .andConditionGroups[].segmentFilterExpression.segmentFilter`. The A/B
 *     webview split is reproduced below, and can equally be had as a
 *     `funnelBreakdown` on the custom dimension.
 *   - Cohort retention is `runReport` + `cohortSpec`. Each cohort needs
 *     `dimension: "firstSessionDate"` or the call 400s -- that error message is
 *     the entire reason it looked impossible.
 *   - A sequence ("view_item THEN generate_lead", `download (30).csv`) is just a
 *     two-step funnel.
 *
 * The one thing with no API method at all is PATH exploration
 * (`runPathReport` 404s), and no export in the set is a path exploration.
 *
 * So the honest boundary is not capability, it is coverage: of the 38 manual
 * exports, 14 were already redundant before this change and the rest are added
 * here. `ANALYTICS_METHOD.md` section 10 lists the traps that apply to funnel
 * data regardless of how it arrives, and section 3 the `begin_checkout`
 * redefinition that any funnel spanning 2026-08-21 mixes together.
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
// Funnels exist only on v1alpha. That is Google's staging, not ours -- there is
// no v1beta equivalent, so a funnel means an alpha call or no funnel.
const ALPHA = 'https://analyticsdata.googleapis.com/v1alpha';

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

  // ---------------------------------------------------------------------
  // Added 2026-08-31. Each of these replaces a table that was being exported
  // by hand; the `download (N).csv` reference is the one it stands in for.
  // None of them needed anything clever -- they are plain runReport calls that
  // simply had not been asked for.
  // ---------------------------------------------------------------------
  {
    // download (3).csv. The nightly had NO device dimension at all, which made
    // "is this a mobile problem?" unanswerable from the API files alone.
    file: 'by-device',
    title: 'Device category - sessions, key events, revenue',
    dimensions: ['deviceCategory'],
    metrics: ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // download (7).csv. The in-app-browser question is asked of this table when
    // the custom dimension is (not set) -- iOS/Safari vs iOS/"Android Webview"
    // still separates most of it.
    file: 'os-browser',
    title: 'Operating system and browser - sessions, engaged sessions',
    dimensions: ['operatingSystem', 'browser'],
    metrics: ['sessions', 'engagedSessions', 'totalUsers', 'keyEvents'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // download (18).csv. `events` carries eventCount, which is NOT the same
    // question: keyEvents counts only the events marked as key, and eventValue
    // is the money attached to them.
    file: 'key-events',
    title: 'Key events by event name - count, value, revenue',
    dimensions: ['eventName'],
    metrics: ['keyEvents', 'eventValue', 'totalRevenue'],
    orderBy: { metric: { metricName: 'keyEvents' }, desc: true },
  },
  {
    // download (4).csv.
    file: 'key-events-daily',
    title: 'Key events over time',
    dimensions: ['date'],
    metrics: ['keyEvents', 'eventCount'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // download (5).csv.
    file: 'key-events-by-source',
    title: 'Key events by event name and session source / medium',
    dimensions: ['eventName', 'sessionSourceMedium'],
    metrics: ['keyEvents', 'eventValue'],
    orderBy: { metric: { metricName: 'keyEvents' }, desc: true },
  },
  {
    // download (37).csv. `daily-trend` has no money column at all, so "what did
    // we take yesterday" could not be read off the daily series.
    file: 'revenue-daily',
    title: 'Revenue over time - revenue, transactions, key events',
    dimensions: ['date'],
    metrics: ['totalRevenue', 'transactions', 'keyEvents'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // download.csv (the unnumbered one).
    file: 'items-daily',
    title: 'Items purchased over time by item name',
    dimensions: ['date', 'itemName'],
    metrics: ['itemsPurchased', 'itemRevenue'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // download (11|12|13).csv, all three of which are this one table sliced
    // differently. Values are 'true' / 'false' / '(not set)' -- (not set) is the
    // majority and means the event fired before the detector ran, NOT that the
    // session was a normal browser. Do not read it as 'false'.
    file: 'webview-by-event',
    title: 'In_App_Browser x event name (customEvent:in_app_browser)',
    dimensions: ['customEvent:in_app_browser', 'eventName'],
    metrics: ['eventCount', 'totalUsers'],
    orderBy: { metric: { metricName: 'eventCount' }, desc: true },
  },
  {
    // download (14).csv. Small numbers by nature -- card_incomplete 15,
    // card_declined 1, other 1 since 05-19 -- but it is the only place a failed
    // payment is visible at all.
    //
    // FILTERED to eventName=checkout_error on purpose. `customEvent:category`
    // is an event-scoped parameter, so every other event in the property also
    // gets a row for it: unfiltered, this table was 53 rows of which 50 were
    // page_view / session_start / scroll carrying "(not set)" or "". Those are
    // not checkout errors with no category, they are events that never had one.
    file: 'checkout-errors',
    title: 'Checkout error category (customEvent:category, checkout_error only)',
    dimensions: ['customEvent:category'],
    metrics: ['eventCount', 'totalUsers'],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'checkout_error' } } },
    orderBy: { metric: { metricName: 'eventCount' }, desc: true },
  },
  {
    // Not in the manual set -- this one answers the standing per-ad attribution
    // question instead. sessionManualAdContent IS utm_content, so this is the
    // table that shows proof_rsa1 swallowing every ad into one bucket.
    file: 'utm-content',
    title: 'utm_content (sessionManualAdContent) - sessions, key events, revenue',
    dimensions: ['sessionManualAdContent', 'sessionCampaignName'],
    metrics: ['sessions', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
];

// The funnels. `v1alpha:runFunnelReport`, not runReport -- different endpoint,
// different response shape (`funnelTable`), so these are written by their own
// path below.
//
// ANALYTICS_METHOD section 3: `begin_checkout` was redefined on 2026-08-21, so
// any funnel whose window spans that date mixes two definitions at that step.
// The step is kept because dropping it hides where the drop-off is; the caveat
// is stamped into each file's header instead.
const step = (name, eventName) => ({
  name,
  filterExpression: { funnelEventFilter: { eventName } },
});

// The A/B webview split, as a real segment. Shape matters and is easy to get
// wrong: the leaf is `segmentFilter`, nested under `segmentFilterExpression`
// inside `andConditionGroups`. Anything else 400s with "Cannot find field".
const webviewSegment = (name, value) => ({
  name,
  sessionSegment: {
    sessionInclusionCriteria: {
      andConditionGroups: [{
        segmentFilterExpression: {
          segmentFilter: {
            fieldName: 'customEvent:in_app_browser',
            stringFilter: { value },
          },
        },
      }],
    },
  },
});

const PURCHASE_STEPS = [
  step('1 session_start', 'session_start'),
  step('2 view_item', 'view_item'),
  step('3 add_to_cart', 'add_to_cart'),
  step('4 begin_checkout', 'begin_checkout'),
  step('5 purchase', 'purchase'),
];

const FUNNELS = [
  {
    // download (15|17|23).csv.
    file: 'funnel-by-device',
    title: 'Purchase funnel, broken down by device category',
    steps: PURCHASE_STEPS,
    breakdown: 'deviceCategory',
  },
  {
    // download (20).csv.
    file: 'funnel-by-channel',
    title: 'Purchase funnel, broken down by default channel group',
    steps: PURCHASE_STEPS,
    breakdown: 'sessionDefaultChannelGroup',
  },
  {
    // download (8|9|10|19|28).csv -- five hand exports, one call. Measured
    // 2026-08-01..08-30: webview 687 sessions completing to view_item at 4.1%,
    // normal browser 236 at 41.1%. That gap is the whole reason these exports
    // existed.
    file: 'funnel-webview-vs-normal',
    title: 'Purchase funnel, webview vs normal browser (segments)',
    steps: PURCHASE_STEPS,
    segments: [webviewSegment('A - webview', 'true'), webviewSegment('B - normal', 'false')],
  },
  {
    // download (29|30).csv. The "SEQ - view_item then generate_lead" segment is
    // an ordered pair, which is all a two-step funnel is.
    file: 'funnel-waitlist-sequence',
    title: 'Sequence: view_item then generate_lead',
    steps: [step('1 view_item', 'view_item'), step('2 generate_lead', 'generate_lead')],
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
  if (spec.dimensionFilter) body.dimensionFilter = spec.dimensionFilter;
  const res = await fetch(`${API}/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${spec.file}: ${json.error.message}`);
  return json;
}

/**
 * Funnels live on v1alpha, not v1beta, and on `:runFunnelReport`, not
 * `:runReport`. The response is a `funnelTable`, not `rows` -- close enough in
 * shape to reuse the row walker, far enough that it needs its own call.
 *
 * There is no metricAggregations here and no Grand total row: a funnel's
 * "total" is its first step, and appending a sum of completion rates would be
 * meaningless.
 */
async function runFunnel(t, spec, start, end) {
  const body = {
    dateRanges: [{ startDate: start, endDate: end }],
    funnel: { steps: spec.steps },
  };
  if (spec.breakdown) body.funnelBreakdown = { breakdownDimension: { name: spec.breakdown }, limit: 15 };
  if (spec.segments) body.segments = spec.segments;
  const res = await fetch(`${ALPHA}/properties/${PROPERTY}:runFunnelReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${spec.file}: ${json.error.message}`);
  return json;
}

/**
 * Weekly retention. This is `runReport` with a cohortSpec and NO dateRanges --
 * the cohort's own ranges replace them, and passing both is an error.
 *
 * Each cohort needs `dimension: 'firstSessionDate'` spelled out. Omitting it
 * fails with "The dimension field in cohortSpec.cohorts.dimension is required",
 * which is the error that made this look impossible for long enough to get
 * written into the docblock as fact.
 *
 * Weeks are built backwards from `end` on Monday boundaries, most recent last,
 * so the file reads chronologically.
 */
function cohortSpec(end, weeks = 6) {
  const endDate = new Date(`${end}T00:00:00Z`);
  // Monday of the week `end` falls in; getUTCDay() is 0 for Sunday.
  const monday = new Date(endDate);
  monday.setUTCDate(monday.getUTCDate() - ((endDate.getUTCDay() + 6) % 7));
  const cohorts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(monday);
    s.setUTCDate(s.getUTCDate() - i * 7);
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + 6);
    const startDate = s.toISOString().slice(0, 10);
    cohorts.push({
      name: `wk of ${startDate}`,
      dimension: 'firstSessionDate',
      dateRange: { startDate, endDate: e.toISOString().slice(0, 10) },
    });
  }
  return {
    cohorts,
    cohortsRange: { granularity: 'WEEKLY', startOffset: 0, endOffset: weeks - 1 },
  };
}

async function runCohort(t, end) {
  const body = {
    cohortSpec: cohortSpec(end),
    dimensions: [{ name: 'cohort' }, { name: 'cohortNthWeek' }],
    metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
    // Default ordering is by active users descending, which scatters each
    // cohort's weeks across the file. Ordering by cohort then week makes it
    // read as the retention triangle it is.
    orderBys: [
      { dimension: { dimensionName: 'cohort' } },
      { dimension: { dimensionName: 'cohortNthWeek' } },
    ],
  };
  const res = await fetch(`${API}/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`cohort-retention: ${json.error.message}`);
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

function header(spec, start, end, pulledAt, notes = []) {
  return [
    '# ----------------------------------------',
    '# sparkdate-philly',
    `# ${spec.title}`,
    `# ${compact(start)}-${compact(end)}`,
    // The pull time is the point. ANALYTICS_METHOD section 1: the final day's
    // counts are short in proportion to how much of that day had elapsed when
    // the data was pulled, and that is not a lag any waiting period fixes.
    `# pulled ${pulledAt} -- source: GA4 Data API, property ${PROPERTY} (dates in ${TZ})`,
    `# NOTE: the last two dates in any daily series are not final. See reports/ANALYTICS_METHOD.md section 1.`,
    ...notes.map((n) => `# NOTE: ${n}`),
    '# ----------------------------------------',
    '',
  ];
}

function toCsv(spec, report, start, end, pulledAt) {
  const head = header(spec, start, end, pulledAt);
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

/**
 * A funnel response is a `funnelTable`, and its column names are read off the
 * response rather than hardcoded. That is not defensiveness for its own sake:
 * this endpoint returns MORE metricHeaders than each row has metricValues, so a
 * hardcoded column list silently misaligns the header from the data. Trust the
 * row width, and take only that many names.
 */
function toCsvFunnel(spec, report, start, end, pulledAt) {
  const t = report.funnelTable || {};
  const rows = t.rows || [];
  const dimNames = (t.dimensionHeaders || []).map((h) => h.name);
  const metNames = (t.metricHeaders || []).map((h) => h.name);
  const width = rows.length ? rows[0].metricValues.length : metNames.length;
  const cols = [...dimNames, ...metNames.slice(0, width)];

  const notes = [];
  if (spec.steps.some((s) => s.filterExpression.funnelEventFilter.eventName === 'begin_checkout')) {
    notes.push('begin_checkout was REDEFINED on 2026-08-21 (ANALYTICS_METHOD section 3). A window spanning that date mixes two definitions at that step.');
  }
  notes.push('No Grand total row: a funnel\'s total is its first step, and summing completion rates would mean nothing.');

  const body = rows.map((r) => [
    ...r.dimensionValues.map((d) => d.value),
    ...r.metricValues.slice(0, width).map((m) => m.value),
  ].map(esc).join(','));

  return header(spec, start, end, pulledAt, notes).join('\n') +
    cols.map(esc).join(',') + '\n' + body.join('\n') + '\n';
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
  const failed = [];

  // One table's failure must not cost the other twenty-six. This runs
  // unattended at 02:00; before this, a single transient error on any table
  // threw and the night produced NOTHING. Failures are collected, reported at
  // the end, and still set a non-zero exit so the nightly log shows a WARN.
  const emit = async (spec, fetcher, writer) => {
    const name = `ga4-api-${spec.file}-${end}.csv`;
    try {
      const report = await fetcher();
      const csv = writer(report);
      const n = (report.rows || report.funnelTable?.rows || []).length;
      if (dry) {
        console.log(`  ${name.padEnd(44)} ${String(n).padStart(6)} rows  (not written)`);
      } else {
        fs.writeFileSync(path.join(OUTDIR, name), csv, 'utf8');
        wrote++;
        console.log(`  ${name.padEnd(44)} ${String(n).padStart(6)} rows`);
      }
    } catch (e) {
      failed.push(spec.file);
      console.log(`  ${name.padEnd(44)}    !!  ${e.message.split('\n')[0].slice(0, 90)}`);
    }
  };

  for (const spec of TABLES) {
    await emit(spec, () => runReport(t, spec, start, end),
      (r) => toCsv(spec, r, start, end, pulledAt));
  }

  console.log('\n  -- funnels (v1alpha) --');
  for (const spec of FUNNELS) {
    await emit(spec, () => runFunnel(t, spec, start, end),
      (r) => toCsvFunnel(spec, r, start, end, pulledAt));
  }

  console.log('\n  -- cohorts --');
  const cohortTable = {
    file: 'cohort-retention',
    title: 'Weekly cohort retention - active users by week since first session',
    dimensions: ['cohort', 'cohortNthWeek'],
    metrics: ['cohortActiveUsers', 'cohortTotalUsers'],
  };
  await emit(cohortTable, () => runCohort(t, end),
    (r) => toCsv(cohortTable, r, start, end, pulledAt));

  if (failed.length) {
    console.log(`\n${failed.length} table(s) FAILED: ${failed.join(', ')}`);
  }
  console.log(dry ? '\nDry run. Re-run without --dry-run to write.' : `\nWrote ${wrote} file(s).`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
}

module.exports = { isoIn, TZ, cohortSpec, toCsvFunnel, TABLES, FUNNELS };
