# GA4 Analysis — 2026-07-30 (Nightly Automation)

**This run made zero code changes.** It is a read-only analysis of a fresh GA4 export
sitting in the Night Tasks folder. No files in `public/`, `api/`, or `lib/` were
touched. The only change in this branch is this report.

## Data used

16 CSVs (`download.csv`, `download (1).csv` … `download (15).csv`) + one Path
Exploration PDF (`data.pdf`), all in `Night Tasks/`, each carrying its own
`# 20260519-20260730` header — confirmed fresh (2 days wider than the `…-20260728`
window used in the 2026-07-29 report) by reading each file's own date-range line
per the 07-28 lesson, not filenames or mount timestamps. Report titles this pull:
"Philly vs Lancaster" (incl. a new "check for bot traffic" city breakdown), Conversion
Tracking, Funnel exploration, Segment by Device, Retention & Cohorts, Revenue Analysis
(by Source / by Item / Trend), Monthly Trends (Active Users / Sessions / Engagement
Rate / Engaged Sessions), and Traffic & Events Monitoring (Direct vs Paid, Events
Counts Last 28 Days, Campaign Performance "check GAds tag"). No "Pages and screens"
report is in this export — same gap noted in the 07-27 report — so per-page
engagement/bounce analysis (the core of Prompt 9's page-level ask) still can't be run
against this data drop.

## Headline

Paid social is still producing effectively zero ticket revenue. Combined Facebook/
Instagram paid_social (both `facebook / paid_social`, 387 users, and the separately-
counted `Facebook / paid_social`, 193 users — capitalization variant, same channel)
plus `tiktok / paid_social` (27 users) totals **607 active users, 5 key events, $0.00
revenue** this window. This is at least the fifth consecutive nightly GA4 report with
this finding (07-24, 07-26, 07-27, 07-28, 07-29, now 07-30). Total revenue this window
is **$432.85 from 16 real purchases**, up from $405.36 / 15 purchases in the 07-29
report — the one new transaction landed 2026-07-29, $27.49, per the Revenue Trend
table, and traces to `google / cpc` in the source breakdown (one of that channel's
transactions this window).

## New finding: the ghost conversion is overwhelmingly a Google Ads artifact, not Meta's

`ads_conversion_About_Us_1` (a $0 Google-Ads-imported About-Us-page-visit conversion
action) is 96 of 149 sitewide key events (64.4%) — consistent with prior reports
flagging it as the dominant "key event." This export's new Campaign Performance table
(`download (15).csv`) lets it be isolated by channel for the first time: summing key
events across every `googleads / *` source/medium row —
`googleads / paid` (50), `googleads / (not set)` (16), `googleads / offline` (14),
`googleads / cpc` (11) — gives 91 of the 96, i.e. **~95% of the ghost-conversion volume
comes specifically from Google Ads traffic**, not Facebook/Instagram. All four of
those rows show $0 revenue despite carrying real key-event counts. This narrows the
"NEEDS TAYLOR INPUT" GA4-config question from 07-29 (which treated it as a general
site-wide issue) to a specific place to look first: the Google Ads conversion action
import settings and the `About_Us` conversion action definition in Google Ads /
GA4's linked conversion events.

## Reconfirmed from prior reports (same conclusion, fresh numbers)

- **Funnel Explore config gap.** Both `download (3).csv` (Funnel exploration 1) and
  `download (4).csv` (Segment by Device) show 0 completed purchases against this
  window's real 16 — Step 1 "Session start" 1,112 users down to Step 4 "Purchase" 0
  in both explores. Cross-checked against `download (2).csv` (Key Events Breakdown,
  16 purchases, $432.85) and `download (6).csv` (Revenue by Source, 16 transactions
  summed) — the real purchases are unambiguously there, the Explore just isn't
  catching them. This is the same GA4 Explore-configuration issue flagged in the
  07-27/07-28/07-29 reports, now a fourth confirmation. Still a GA4-UI question for
  Taylor (rebuild the funnel steps from real events, check the funnel's date range/
  segment scoping and open- vs closed-funnel setting), not a codebase bug.
- **Item vs. source revenue gap = the known $2.50 service fee, exact match again.**
  `download (7).csv` (Revenue by Item) totals $392.85 across "SparkDate: Round 2 —
  Summer Nights" ($199.92) and "Founders Mixer" ($192.93); `download (6).csv`
  (Revenue by Source) totals $432.85. The $40.00 gap is exactly 16 × $2.50 — reconfirmed
  live in this session's clone at `public/event.html:665` (`const SERVICE_FEE = 2.50`)
  and `lib/pricing.js:19` (`SERVICE_FEE_CENTS = 250`, the two are documented as
  required to stay in sync). Not a bug.
- **Bot-traffic city signal, reconfirmed at a similar rate.** `download.csv` ("check
  for bot traffic" city breakdown) shows Prineville OR (28) + Lulea Sweden (12) +
  Council Bluffs IA (18) + Ashburn VA (17) = 75 of 1,112 active users (6.7%)
  geolocating to known Meta/Google/AWS data-center cities — matches the "~7%" figure
  from 07-29 almost exactly. Still circumstantial (GA4 city geolocation isn't a bot
  signal by itself), still worth a second data-quality opinion, not confirmed either
  way.
- **In-app-browser rate is trending up, not down.** The Path Exploration PDF shows
  `in_app_browser_detected` firing on 354 of the 1,730 sessions that reach a
  `page_view` after `session_start` (20.5%), up from 17.1% (247/1,446) in the 07-26
  report. `facebook / paid_social` + `Facebook / paid_social` combined (580 users) is
  still the largest single traffic source and still converts at $0 — the in-app-
  browser mitigation code in `public/lp.html` / `public/event.html` exists (confirmed
  again this session) but the underlying behavioral question — are users seeing the
  warning and bailing anyway? — is unchanged from 07-28's framing.

## New finding: source/medium fragmentation, quantified and confirmed as NOT a code bug

`download (15).csv` (Campaign Performance) lists 43 distinct `Session source / medium`
rows for what should functionally be 3-4 channels. Notably:
- **Facebook/Meta paid traffic split 4 ways** by capitalization/labeling alone:
  `facebook / paid_social` (387), `Facebook / paid_social` (193), `Facebook / paid`
  (22), plus organic variants `facebook / social` (38), `m.facebook.com / referral`
  (23), `facebook.com / referral` (18), `Facebook / organic` (2),
  `eventsmanager.facebook.com / referral` (1) — 11 rows total for one platform.
- **Google Ads split 7 ways:** `googleads / paid` (55), `googleads / (not set)` (15),
  `googleads / offline` (14), `googleads / cpc` (11), `Google Ads / cpc` (15),
  `google / cpc` (9), `Google / (not set)` (1).
- **TikTok split 3 ways:** `tiktok / paid_social` (27), `TikTok / social` (1),
  `tiktok.com / referral` (1).

I grepped this session's repo clone for `paid_social` across `public/`, `api/`, and
`lib/` and got **zero matches** — the string doesn't appear anywhere in the codebase.
`lib/utm.js` (the one centralized UTM builder, used only by the email nurture
sequence) sets `utm_source`/`utm_medium` from plain string arguments with no
capitalization logic. **This confirms the fragmentation is coming from how the ad
platforms themselves tag outbound links (Meta Ads Manager / Google Ads / TikTok Ads
campaign UTM settings), not from a site-side bug** — there's nothing here to fix in
code. NEEDS TAYLOR INPUT: standardizing UTM casing/values at the ad-platform level
(lowercase `facebook`/`paid_social` consistently across every ad set) would
consolidate GA4's channel grouping and make attribution reporting meaningfully
cleaner without touching a line of site code.

## New finding: a small, unexplained `[object Object] / undefined` source (10 users, 0.9%)

Also in the Campaign Performance table: `[object Object] / undefined` — 10 active
users, 0 key events, $0 revenue. This is the signature of a JavaScript object being
stringified into a URL parameter (or GA4 field) instead of a proper string. I grepped
for `utm_source`, `paid_social`, and every `navigator.share`/`URLSearchParams` usage
across `public/*.html` and found no place in this codebase's tracking code that would
produce this — `lib/utm.js` only ever receives string literals. At under 1% of
traffic and $0 revenue this isn't worth chasing further tonight, but it's flagged as
a data-quality curiosity: possibly a third-party embed/iframe with a broken
`document.referrer`, a malformed ad-platform click-tracking redirect, or a browser
extension mangling the URL before GA4 sees it. Re-check in ~1 week; if it grows past
a couple percent of traffic it's worth a closer look at what's actually referring
those sessions (GA4 real-time view, or a raw BigQuery export if one exists).

## Traffic acceleration — still watching, numbers now stronger

`download (5).csv` (weekly cohorts) gives clean week-over-week totals: the week of
Jul 19–25 (last full week as of the 07-29 report) = **216** unique active users. The
current, still-partial week of Jul 26–30 (only 5 days, through the very start of
Jul 30) is already at **192** — daily figures for that partial week were
53 / 60 / 34 / 64 / 6(partial-day) for Jul 26–30 respectively (`download (9).csv`,
Monthly Trends–Active Users Trend, dates derived from the `Nth day` offset and
cross-validated against the cohort totals). At the current pace this week is on track
to match or exceed the prior best full week once Jul 30–31 are complete. Revenue has
not yet moved proportionally (this window's only post-07-28 sale is the single
$27.49 Jul 29 transaction) — same "watch, not a problem yet" framing as 07-29, now
with one more week of the acceleration holding.

## Zero-risk fixes

None identified this run. `grep` confirmed no `paid_social` string, no object-
stringification pattern, and no drift in the `SERVICE_FEE` / `SERVICE_FEE_CENTS`
constants between `public/event.html` and `lib/pricing.js`. Every finding this pass
is a data-attribution, ad-platform-config, or GA4-Explore-config question — nothing
mechanical in the codebase to fix.

## NEEDS TAYLOR INPUT (ranked)

1. **Google Ads conversion-action config** — investigate why `ads_conversion_About_Us_1`
   accounts for ~95% of Google Ads' apparent "key events" while carrying $0 revenue.
   Check in GA4/Google Ads: the conversion action's value settings and whether it's
   being double-counted as a "key event" alongside real purchase conversions.
2. **Standardize UTM tagging across ad platforms** — consolidate the 11 Facebook/Meta
   and 7 Google Ads source/medium variants down to one consistent lowercase scheme
   per platform (`facebook`/`paid_social`, `google`/`cpc`, etc.) in each platform's own
   campaign settings. This is a reporting-cleanliness fix, not urgent, but it's been
   the same fragmentation pattern for three reports running (07-26, 07-29, now 07-30).
3. **Rebuild the GA4 Funnel Exploration** so it reflects the 16 real purchases this
   window instead of showing 0 — fourth consecutive report with this discrepancy.
4. **Facebook in-app-browser checkout** — the mitigation code exists and
   `in_app_browser_detected` is now firing on a *larger* share of sessions (20.5%,
   up from 17.1%) while Facebook paid traffic still converts at ~$0. Worth deciding
   whether the current warning/intercept UX is actually working or needs a stronger
   intervention (e.g., forcing an external-browser redirect rather than just warning).
5. **`[object Object] / undefined` source** — low priority at <1% of traffic, but
   worth a GA4 real-time check if it grows.

## What to re-check in ~1 week

- Whether the Jul 26–30 traffic acceleration (192 users in 5 partial days) converts
  to a proportional revenue bump, or stays flat like the prior weeks.
- Whether `ads_conversion_About_Us_1`'s share of key events changes once/if the
  Google Ads conversion-action question above gets reviewed.
- Whether the `in_app_browser_detected` rate keeps climbing past 20.5%.
- Whether the Funnel Exploration still shows 0 purchases against the real total.

## Caveats / method notes

- Sample size is still modest (16 total transactions, $432.85) — per-channel splits
  below single digits (e.g. `email / nurture`, `(not set)`, each 1 transaction) are
  not statistically meaningful on their own; treat channel-level revenue claims as
  directional, not precise.
- Date mapping for the daily trend tables (`Nth day` offsets) was derived by assuming
  day 0 = 2026-05-19 (the window start) and cross-validated against the independently-
  reported weekly cohort totals in `download (5).csv`, which matched closely (daily
  sums slightly exceed weekly unique-user totals, as expected from within-week repeat
  visitors) — reasonably confident in the mapping, not certain to the exact hour for
  the partial final day.
- No "Pages and screens" report was present in this export, so no per-page
  engagement/bounce analysis could be run this time (same gap as 07-27).
- This is a source-level, no-live-network-egress analysis — no requests were made to
  sparkdate.date or any ad platform API; everything above comes from the CSVs/PDF in
  the Night Tasks folder and a read-only grep of this session's repo clone.
