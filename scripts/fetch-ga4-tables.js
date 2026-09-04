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
 * The runReport tables. Each mirrors something the nightly report reads, and
 * the `title` matches the manual export's naming closely enough that a reader
 * recognises it. (This block said "the twelve tables" until 2026-09-04; it had
 * been wrong for a while, so it now says no number at all.)
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
  {
    // Added 2026-09-04 after a coverage audit against the property's own
    // metadata endpoint (379 dimensions, 92 metrics available; we read 20 and
    // 17). This is the table that audit turned up as the largest single gap.
    //
    // Since 05-19: new = 3,826 users -> 24 transactions -> $651.76, and
    // returning = 221 users -> 15 transactions -> $409.36. That is $0.17 per
    // new user against $1.85 per returning one. Returning visitors are 5.5% of
    // the users and 38.6% of the revenue.
    //
    // It reconciles: 24+15 = the 39 `purchase` events, and the two revenue
    // figures sum to revenue-daily's $1,061.12 grand total.
    //
    // '(not set)' is a real bucket here (212 sessions), not an error.
    file: 'new-vs-returning',
    title: 'New vs returning - sessions, users, key events, revenue',
    dimensions: ['newVsReturning'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue', 'transactions'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // 168 rows, always -- 7 days x 24 hours, in the PROPERTY's timezone, which
    // is the same clock the posting schedule is written in. Nothing else in the
    // pull can answer "is 1 PM actually when anyone is here", which is the time
    // every queued post and every ad schedule currently assumes.
    file: 'by-day-hour',
    title: 'Day of week x hour of day - sessions, key events',
    dimensions: ['dayOfWeekName', 'hour'],
    metrics: ['sessions', 'keyEvents'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // bounceRate is 1 - engagementRate, so it inherits the same two-day
    // settling lag the header warns about: 09-03 read bounceRate 1.0 and
    // engagedSessions 0 on the 09-04 pull purely because the day had not
    // finished processing. Read the third-newest row, not the newest.
    file: 'session-quality-daily',
    title: 'Session quality by day - bounce rate, duration, sessions per user',
    dimensions: ['date'],
    metrics: ['bounceRate', 'averageSessionDuration', 'sessionsPerUser'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // totalUsers (which the rest of the pull uses) does not split new from
    // returning, so a flat user count could not distinguish "we reached more
    // people" from "the same people came back".
    file: 'users-daily',
    title: 'Users by day - new, active, purchasers, first-time purchasers',
    dimensions: ['date'],
    metrics: ['newUsers', 'activeUsers', 'totalPurchasers', 'firstTimePurchasers'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // landingPage only sees the entry page. This sees every page, so a page
    // that is never a landing page (the checkout, /matches) has a row at all.
    file: 'page-views',
    title: 'All pages - screen page views and sessions by path and title',
    dimensions: ['pagePath', 'pageTitle'],
    metrics: ['screenPageViews', 'sessions'],
    orderBy: { metric: { metricName: 'screenPageViews' }, desc: true },
  },
  {
    // Same event-scoped trap as checkout-errors above: unfiltered this is 54
    // rows, 50 of them page_view / session_start carrying '(not set)' because
    // those events never had a `reason` parameter at all.
    //
    // GA4 registers this dimension under the uiName "Fetch failure reason",
    // which is wrong and cost a wrong filter on the first attempt. Measured
    // 2026-09-04, `reason` is set by exactly one event, checkout_error:
    //   checkout_error                  25 (not set), 3 "your postal code is incomplete."
    //   next_event_fetch_failed         62 (not set), 0 with a value
    //   targeted_event_not_found         6 (not set), 0 with a value
    //   in_app_browser_checkout_blocked 12 (not set), 0 with a value
    //
    // So it is filtered to checkout_error, and it is thin on purpose: 3 of 28.
    // The site sets `reason` on a minority of checkout errors. That is a gap in
    // the site, not in this table -- but the 3 rows are the only place the
    // literal decline text is visible, which `category` alone never shows.
    file: 'checkout-error-reasons',
    title: 'Checkout error reason (customEvent:reason, checkout_error only)',
    dimensions: ['customEvent:reason'],
    metrics: ['eventCount', 'totalUsers'],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'checkout_error' } } },
    orderBy: { metric: { metricName: 'eventCount' }, desc: true },
  },
  {
    // Only two audiences are defined on the property: All Users, and
    // Purchasers (393 sessions / 35 users). Worth pulling mainly so the report
    // can see when a third one appears -- and so 'Purchasers' is available as a
    // segment without re-deriving it.
    file: 'audiences',
    title: 'GA4 audiences - sessions, users, key events, revenue',
    dimensions: ['audienceName'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // THERE IS GOOGLE ADS SPEND IN THIS PROPERTY AND NOTHING HAS EVER READ IT.
    //
    // The advertiserAd* family and returnOnAdSpend error out on their own --
    // "Please add sessionCampaignName to make the request compatible" -- which
    // is why a naive probe reports them unavailable and why they were missed.
    // Paired with sessionCampaignName they return, since 05-19:
    //   Website traffic-Search-1  $35.35, 110 clicks, 448 impressions, ROAS 0
    //   Campaign #1                $2.56,   4 clicks,  61 impressions, ROAS 10.73
    //
    // $37.91 of spend that no report, no CAC figure and no recurring_costs row
    // accounts for. Meta is not the only paid channel after all.
    file: 'google-ads-cost',
    title: 'Google Ads cost by campaign (advertiserAd* needs sessionCampaignName)',
    dimensions: ['sessionCampaignName'],
    metrics: ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions',
      'advertiserAdCostPerClick', 'advertiserAdCostPerKeyEvent', 'returnOnAdSpend'],
    orderBy: { metric: { metricName: 'advertiserAdCost' }, desc: true },
    notes: [
      'advertiserAdCostPerKeyEvent reads 0.00 on Website traffic-Search-1. That does NOT mean the clicks were free -- the campaign produced ZERO key events, and GA4 prints 0 for undefined. It is the most misreadable cell in this file: the campaign that bought nothing shows the best cost per outcome.',
      'Revenue and ROAS here are LAST-CLICK. GA4 data-driven attribution credits Campaign #1 $0.00 and 1.14 key events for the same period, so the 10.73 ROAS below is the optimistic end of a range, not a fact.',
      'The Grand total row divides property-wide outcomes by Google spend. Read ROAS and the per-click/per-key-event columns PER ROW; their totals are meaningless.',
    ],
  },
  {
    // 24 rows -- the spend is not evenly spread, it clusters in 07-10..07-24.
    // Daily, so a spend spike can be lined up against the revenue series
    // instead of sitting as one lump total.
    file: 'google-ads-cost-daily',
    title: 'Google Ads cost by day and campaign',
    dimensions: ['date', 'sessionCampaignName'],
    metrics: ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions'],
    orderBy: { dimension: { dimensionName: 'date' } },
  },
  {
    // The diagnostic table, and the reason the one above is not enough.
    //
    // Cost and sessions DO NOT JOIN. Measured 2026-09-04:
    //   Website traffic-Search-1 | Google Ads | google / cpc  -> $35.35, 0 sessions
    //   Campaign #1              | Google Ads | google / cpc  ->  $2.56, 2 sessions
    //   (not set)                | Google Ads | google / cpc  ->  $0.00, 9 sessions
    //   (not set)                | Google Ads | googleads/cpc ->  $0.00, 11 sessions
    //
    // So ~$38 of spend sits on campaigns with ~2 sessions, while the 20 sessions
    // GA4 does attribute to Google Ads carry no campaign name and no cost. Any
    // cost-per-acquisition computed from either half alone is wrong. This table
    // is what makes that visible rather than silently averaging it away.
    //
    // sessionSourcePlatform is also the only field that separates "Meta Ads"
    // from "Google Ads" from "Unlabeled", and nothing else in the pull reads it.
    file: 'paid-cost-vs-sessions',
    title: 'Cost vs sessions by campaign, source platform and source/medium',
    dimensions: ['sessionCampaignName', 'sessionSourcePlatform', 'sessionSourceMedium'],
    metrics: ['advertiserAdCost', 'sessions', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
  },
  {
    // transactionId is a real per-purchase key and nothing read it. Pulling it
    // with `date` immediately shows that IT IS BEING REUSED:
    //   8E9WZTat32JyoUjWuIE7 appears on 08-15 (3 txns) AND 08-18 (2 txns)
    //   DHHBNANFlrfEEB6SMLMy carries 8 transactions on one id
    //   pi_3U7y8yRsTCYDr2LL1LPtpFAy (a Stripe payment-intent id) carries exactly 1
    // 16 distinct ids for 39 transactions. The Stripe-style ids behave; the
    // Firestore-style doc ids do not, which is what #200 set out to fix.
    // Whether that is legacy data or a live regression is NOT established here.
    file: 'transactions',
    title: 'Transactions by transaction_id and date (exposes id reuse)',
    dimensions: ['transactionId', 'date'],
    metrics: ['totalRevenue', 'transactions', 'itemsPurchased'],
    orderBy: { metric: { metricName: 'totalRevenue' }, desc: true },
    // NOTE on the metric choice, which is load-bearing. Do NOT add itemName
    // here: it forces the whole request into ITEM scope, `transactions`
    // becomes unavailable, and itemRevenue totals $968.60 against the
    // property's $1,061.12 -- a ledger that under-reports by $92.52. Verified
    // 2026-09-04; the item-scoped variant was designed, tested and rejected.
    // As written this reconciles exactly: $1,061.12 and 39 transactions.
    //
    // itemsPurchased totals 41, not 39, and that is correct -- two Stripe
    // orders carried two tickets each. Transactions is the order count.
    notes: [
      'transaction_id IS BEING REUSED. 8E9WZTat32JyoUjWuIE7 appears on 08-15 (3 transactions) and again on 08-18 (2). Firestore-style doc ids carry up to 8 orders each; Stripe payment-intent ids (pi_...) carry exactly 1. 16 distinct ids for 39 transactions, so GA4 de-duplication is inoperative on most purchases. Whether this is legacy data or a live regression is NOT established -- see PR #200.',
      'itemsPurchased (41) exceeds transactions (39) because two orders bought two tickets. That is not a fault.',
    ],
  },
  {
    // Where the Google spend actually went. Costs nothing (4 rows) and is the
    // only place the account, the campaign type and the ad network appear.
    // Measured 2026-09-04:
    //   Sparkdate | Website traffic-Search-1 | Search          | Google search           $32.77, 106 clicks, 405 impr
    //   Sparkdate | Website traffic-Search-1 | Search          | Search partners          $2.58,   4 clicks,  36 impr
    //   Sparkdate | Website traffic-Search-1 | Search          | Google Display Network   $0.00,   0 clicks,   7 impr
    //   Sparkdate | Campaign #1              | Performance Max | Cross-network            $2.56,   4 clicks,  61 impr
    //
    // Note this contradicts an earlier claim of mine that the sessionGoogleAds*
    // family is a constant placeholder. That is true of sa360*/dv360* (which
    // return a literal "cpc"/"cpm" on every row regardless of real source);
    // the googleAds* family carries real values, because an account is linked.
    file: 'google-ads-by-network',
    title: 'Google Ads cost by account, campaign type and ad network',
    dimensions: ['sessionGoogleAdsAccountName', 'sessionGoogleAdsCampaignName',
      'sessionGoogleAdsCampaignType', 'sessionGoogleAdsAdNetworkType'],
    metrics: ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions'],
    orderBy: { metric: { metricName: 'advertiserAdCost' }, desc: true },
  },
  {
    // Creative-level cost. The read that earns the file: one creative is 12x
    // more expensive per click than the other -- 816106298597 took $25.71 for
    // 20 clicks ($1.286 each) against 816738636689's $9.64 for 90 ($0.107).
    file: 'google-ads-creatives',
    title: 'Google Ads cost by ad group and creative',
    dimensions: ['sessionGoogleAdsAdGroupId', 'sessionGoogleAdsCreativeId'],
    metrics: ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions'],
    orderBy: { metric: { metricName: 'advertiserAdCost' }, desc: true },
    notes: [
      "This file's advertiserAdCost total is 35.35, NOT the property's 37.91. Google Ads does not report Performance Max cost at ad-group granularity, so Campaign #1's $2.56 disappears here. Quote money from google-ads-cost, not from this file.",
    ],
  },
  {
    // The disjoint WEEKLY bucket that CLAUDE.md's "disjoint buckets, never
    // rolling windows" rule presupposes exists, and did not.
    //
    // sessions/revenue/transactions here could be summed out of the daily
    // tables. activeUsers CANNOT: its 15 weekly rows sum to 3,969 against a
    // deduplicated 3,841, because a user active in two weeks counts once per
    // week and once overall. That is the column that justifies the table.
    //
    // ISO (Monday-start) not `yearWeek` (Sunday-start), to match the Monday
    // cohort boundaries cohort-retention already uses. They are NOT
    // interchangeable: week 202635 reads 1,071 sessions on isoYearIsoWeek and
    // 980 on yearWeek. Same label, different number.
    file: 'weekly-trend',
    title: 'Weekly trend, ISO weeks (Monday-start) - sessions, users, revenue',
    dimensions: ['isoYearIsoWeek'],
    metrics: ['sessions', 'activeUsers', 'newUsers', 'keyEvents', 'transactions', 'totalRevenue'],
    orderBy: { dimension: { dimensionName: 'isoYearIsoWeek' } },
    notes: [
      'The NEWEST week is almost always PARTIAL. 202636 covers Mon 08-31 to Thu 09-03 only (574 sessions) against 202635\'s full 1,071. Reading that as a 47% collapse is the trap this table invites.',
      'ISO weeks are Monday-start. The `week`/`yearWeek`/`nthWeek` dimensions are SUNDAY-start and produce different numbers for the same label -- do not compare this file against a Sunday-start chart.',
    ],
  },
  {
    // The pull had city and region but nothing above region, so the
    // bot/datacenter check that cities exists for stopped at the state line.
    // Measured: 4,820 of 5,190 sessions are United States, and the 191 foreign
    // sessions produce almost no key events (Sweden 70/0, Ireland 45/0, China
    // 35/0, India 21/0, UK 18/0).
    //
    // The reason to pull it is the anomaly it exposes: 118 sessions with
    // country '(not set)' carry 82 key events and $0 revenue. That is a 58%
    // key-event rate against a property-wide rate near 3%, and it inflates
    // every conversion rate the nightly computes. continentId is 'ZZ' on those
    // rows -- the explicit unknown marker -- which is why the id columns are
    // here despite looking redundant. All six dimensions cost 61 rows; four
    // cost 61 rows too.
    file: 'geo-country-language',
    title: 'Country, continent and language - sessions, users, key events, revenue',
    dimensions: ['continent', 'continentId', 'country', 'countryId', 'language', 'languageCode'],
    metrics: ['sessions', 'totalUsers', 'keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
    notes: [
      "118 sessions report country '(not set)' / continentId 'ZZ' and fire 82 key events -- a 58% rate against roughly 3% property-wide, on $0 revenue. Treat that bucket as suspect traffic before quoting any engagement or conversion rate.",
    ],
  },
  {
    // Per-AD attribution, which utm-content could not do. sessionManualTerm
    // carries the Meta AD id (120250622050160542) under the campaign id
    // 120250622050150542, so "which ad" is answerable without going anywhere
    // near landingPagePlusQueryString and its fbclid explosion.
    // 287 rows; totals reconcile to 5,190 / 231 / $1,061.12 / 39.
    file: 'utm-ad-detail',
    title: 'Manual UTM detail - source/medium, campaign, content and term (Meta ad id)',
    dimensions: ['sessionManualSourceMedium', 'sessionManualCampaignName',
      'sessionManualAdContent', 'sessionManualTerm'],
    metrics: ['sessions', 'keyEvents', 'totalRevenue', 'transactions'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
    notes: [
      'To split sessionManualSourceMedium into source and medium, split on " / " -- with ONE exception, measured: the null pair comes back as a bare "(not set)", not "(not set) / (not set)". That is the LARGEST row in the file at 791 sessions, so a naive split mislabels the biggest bucket. There is no " | " value.',
    ],
  },
  {
    // The auto-tagging overwrite diagnostic. Google Ads auto-tagging REPLACES
    // the hand-written utm_campaign, and the manual twin is the only place the
    // real campaign name survives. Measured 2026-09-04, 126 rows, two rows
    // diverge with a real value on both sides:
    //   firstUserCampaignName 'Campaign #1'  vs manual 'week1_math'
    //   'google / cpc' vs 'googleads / offline'  (18 sessions)
    //   'googleads / cpc' vs 'googleads / (not set)' (11 sessions)
    // Nothing else in the pull would show that the two disagree.
    //
    // Also the pull's only first-user (acquisition-scope) coverage: every
    // other table is session-scope, so "where did this person originally come
    // from" was unanswerable.
    file: 'first-user-tagging',
    title: 'First-user acquisition: auto-tagged vs manual campaign (overwrite diagnostic)',
    dimensions: ['firstUserSourceMedium', 'firstUserManualSourceMedium',
      'firstUserCampaignName', 'firstUserManualCampaignName',
      'firstUserCampaignId', 'firstUserManualCampaignId'],
    metrics: ['sessions'],
    orderBy: { metric: { metricName: 'sessions' }, desc: true },
    notes: [
      'Rows where the auto-tagged and manual columns DISAGREE are the point of this file. Google Ads auto-tagging overwrites utm_campaign, so the manual column is the only surviving record of what the link was actually tagged with.',
      'The API caps a request at 9 dimensions, which is why this file carries only the pairs that diverge.',
    ],
  },
  {
    // GA4's DATA-DRIVEN attribution, which is a different number from every
    // other table here and is the one Google's own UI shows by default.
    // Credit is FRACTIONAL: 'eventbrite / listing' gets 22.872082 key events
    // and $290.39; session-scope tables would give it whole numbers.
    //
    // The first read is a live bug: the top row by key events is
    //   googleads / paid | <campaign-name>  ->  41 key events, $0
    // `<campaign-name>` is an UNREPLACED placeholder in a tracking template --
    // a real link somewhere is shipping the literal text. 41 key events are
    // filed under it.
    //
    // `sessions` and `transactions` are deliberately absent: the API rejects
    // transactions here ("Please remove transactions to make the request
    // compatible"), and sessions is not an attribution-scope measure.
    file: 'attribution-credit',
    title: 'Data-driven attribution credit by source/medium and campaign (fractional)',
    dimensions: ['sourceMedium', 'campaignName'],
    metrics: ['keyEvents', 'totalRevenue'],
    orderBy: { metric: { metricName: 'keyEvents' }, desc: true },
    notes: [
      'These are DATA-DRIVEN attribution credits and they are FRACTIONAL by design (22.872082 key events). They will NOT match the whole numbers in the session-scope tables, and that is not a data fault -- the two answer different questions.',
      'The row "googleads / paid | <campaign-name>" is an unreplaced tracking-template placeholder, not a campaign. 41 key events are filed under it.',
    ],
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

// NO add_to_cart. It was a step here for one night and it wrecked the bottom of
// every funnel table, because most buyers on this property never touch a cart.
//
// A closed funnel counts users who completed EVERY step IN ORDER, so one
// off-path step discards everyone who skipped it. Measured 2026-09-01 over
// 20260519-20260901, adding one step at a time:
//
//     session_start -> purchase                      34   <- GA4's own count
//             + view_item                            24
//             + begin_checkout                       12
//             + add_to_cart                           5
//
// GA4 reports 37 transactions / 34 purchasing users / $1,006.14 for that window.
// The five-step funnel found 5 of those 34 -- 15%. `begin_checkout` has 146
// users against add_to_cart's 57, which is the whole story: people go straight
// to checkout.
//
// This is not hypothetical damage. GA4_ANALYSIS_2026-09-01 read these tables on
// their first night and reported "Paid Social ... purchase 2" and "282
// normal-browser users producing 4" as purchase counts. They were chain counts.
//
// Dropping the step takes capture from 5/34 to 12/34. Still lossy -- 10 buyers
// never fire view_item at all -- which is why the header carries a standing
// warning and why nobody should read a funnel's last step as revenue. The cart
// numbers are NOT lost: `ga4-api-events-*.csv` carries add_to_cart's own count
// and user total, unconditioned by any chain.
const PURCHASE_STEPS = [
  step('1 session_start', 'session_start'),
  step('2 view_item', 'view_item'),
  step('3 begin_checkout', 'begin_checkout'),
  step('4 purchase', 'purchase'),
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
  {
    // THE CHECKOUT PATH. Deliberately skips view_item, and that is the entire
    // point of it existing next to the other funnels rather than replacing one.
    //
    // ANALYTICS_METHOD section 4 has always said `/lp` does not fire
    // `view_item` -- it is a landing page, not a product page. Any funnel that
    // starts at view_item therefore discards every buyer who arrived through
    // `/lp`, which is 2,566 of 3,485 sessions in the window measured. That is
    // not a small correction, it is most of the traffic.
    //
    // Measured 2026-09-01 over 20260519-20260901 against GA4's own 34
    // purchasing users:
    //
    //     session_start -> purchase                          34   (the ceiling)
    //     session_start -> begin_checkout -> purchase        21   (this table)
    //     session_start -> view_item -> begin_checkout ->
    //                                        purchase        12   (the others)
    //
    // So this captures 21 of 34 where the view_item funnels capture 12. The
    // remaining 13 never fire begin_checkout either, and no funnel starting
    // from a step can reach them.
    //
    // Broken down by LANDING PAGE because that is the question nothing else
    // answers, and the first read is worth the table on its own: `/lp` took
    // 2,566 sessions to 7 purchases while `/` took 349 to the same 7.
    file: 'funnel-checkout-by-landing-page',
    title: 'Checkout path (no view_item step) by landing page',
    steps: [
      step('1 session_start', 'session_start'),
      step('2 begin_checkout', 'begin_checkout'),
      step('3 purchase', 'purchase'),
    ],
    breakdown: 'landingPage',
    // Its purchase row will NOT match funnel-by-channel's, and that is correct
    // rather than a data fault: they count different chains. Stated in the
    // file header so a reader does not raise it as an inconsistency.
    note: 'This funnel SKIPS view_item on purpose, so it counts more buyers than the view_item funnels do (21 vs 12 of GA4\'s 34 purchasing users, measured 20260519-20260901). A mismatch between this table\'s purchase row and funnel-by-channel\'s is EXPECTED and is not a data fault -- see ANALYTICS_METHOD.md section 4.',
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
  // `spec.notes` was silently dropped until 2026-09-04: header() has taken a
  // `notes` parameter all along, but only toCsvFunnel() ever passed one, so a
  // notes array on a TABLES entry rendered nowhere. Every caveat below that
  // says "stated in the file header" depended on this line.
  const head = header(spec, start, end, pulledAt, spec.notes || []);
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
  // The warning that has to come first, because the last step LOOKS like a
  // conversion count and is not one. GA4_ANALYSIS_2026-09-01 quoted this
  // table's purchase column as purchases; the five-step version of this funnel
  // was finding 5 of 34 real buyers at the time.
  notes.push('THIS IS A CHAIN COUNT, NOT A CONVERSION COUNT. A closed funnel counts only users who completed EVERY step IN ORDER, so the last step UNDERSTATES the real total by however many people skipped a step. For actual purchases and revenue read ga4-api-revenue-daily-*.csv and the purchase row of ga4-api-events-*.csv.');
  if (spec.steps.some((s) => s.filterExpression.funnelEventFilter.eventName === 'begin_checkout')) {
    notes.push('begin_checkout was REDEFINED on 2026-08-21 (ANALYTICS_METHOD section 3). A window spanning that date mixes two definitions at that step.');
  }
  // A funnel may carry its own caveat, appended after the standing ones so that
  // whichever warning applies to EVERY funnel keeps the lead position.
  if (spec.note) notes.push(spec.note);
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
