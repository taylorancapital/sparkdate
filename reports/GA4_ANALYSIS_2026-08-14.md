# GA4 Analysis — 2026-08-14 (Nightly Automation, corrected re-run)

**This run made zero code changes.** It is a read-only analysis of fresh GA4 exports and, for the
first time, real Meta Ads spend data, both in the Night Tasks folder. No files in `public/`,
`api/`, or `lib/` were touched. The only change in this branch is this report.

**Supersedes the earlier same-day run.** An initial pass this morning found the CSVs in the
folder still dated through Aug 8 (stale) and stopped without analysis. The user then moved fresh
exports into the correct folder — 17 GA4 CSVs now covering **May 19 – Aug 13, 2026** (5 new days
of data) plus a brand-new `meta-insights-2026-08-13.csv`, a direct pull from the Meta Marketing
API (campaign-level spend, clicks, impressions, and pixel actions for Aug 7–13). This is the first
report in this project's history with real ad-spend numbers to set against the GA4 side. This
report replaces the earlier placeholder in the same commit history.

## CORRECTION — added 2026-08-16

**Finding 1 below is withdrawn. There was no engagement collapse.** The 1.3% figure for Aug 13 is
an artifact of when this report's export was taken, not a measurement.

The export behind this report carries the header `# 20260519-20260813` and was **created at 10:00
pm on Aug 13** — so Aug 13, its final row, was still roughly two hours from over, and had not been
through GA4's normal 24–48h processing window at all. The next export
(`# 20260519-20260815`, created 11:55 pm on Aug 15), used by the 08-16 report, puts the same day at
**64.9%**. The day did not crater and then recover; it was simply read before it existed.

| Aug 13 engagement rate | Source |
|---|---|
| 1.3% (withdrawn) | this report — export taken 10:00 pm *on* Aug 13 |
| **64.9%** | 08-16 report — export taken 11:55 pm Aug 15, day fully processed |

**Also unresolved:** the two exports disagree on Aug 11 (21.8% here vs 15.1% in the 08-16 report)
and Aug 12 (15.1% here vs 52.4% there). Those days were already settled when this export ran and
should not have moved. Until the raw `download (4).csv` and `download (14).csv` are compared
directly, treat this report's **entire daily engagement series as unverified**, not just the last
row. The Aug 5–10 values are uncontested only because no second export covers them.

**What this correction does NOT touch.** The traffic record and the Meta-spend findings stand:
they come from aggregate tables and the Meta Marketing API pull, not the daily-indexed trend
files. Finding 2 ($104.69 across 9 campaigns, zero pixel-confirmed purchases for Aug 7–13) is
unaffected and was independently reconfirmed by the 08-16 report.

**Root cause, and the standing fix.** Every nightly export is taken late on the last evening of
its own range, so its final row is always a partial day — and this report read that row as real.
The 08-16 report inherits the same flaw (its Aug 14 value came from an export run ~24h later,
still inside the processing window). Either pull the export the morning *after* the range ends, or
have the report drop its final daily row by default.

## Data used

17 GA4 CSVs (`download.csv` through `download (16).csv`), each confirmed via its own
`# 20260519-20260813` header, plus `meta-insights-2026-08-13.csv` (`# 20260807-20260813`,
`source: Meta Marketing API (Insights, level=campaign)`, 9 campaign rows). Report titles this
pull: Philly vs Lancaster (All Cities bot-check + filtered), Monthly Trends (Active Users /
Sessions / Engagement Rate / Engaged Sessions), Traffic & Events Monitoring (Direct vs Paid,
Events Counts, Campaign Performance), Revenue Analysis (Trend / by Item / by Source), Checkout
Events Tracking + Funnel + Segment-by-Device (three separate funnel views), Retention & Cohorts,
Conversion Tracking (Key Events Breakdown). Same gap as every prior report: **no "Pages and
screens" report in this export**, so page-level engagement/bounce analysis still can't be run.

## Headline: traffic hit an all-time high while engagement quality collapsed to near zero — same week Meta spend produced zero pixel-confirmed purchases

> **Half of this headline is withdrawn — see the CORRECTION above.** The engagement collapse was a
> partial-day export artifact. The traffic record and the zero-purchase finding stand.

Three things happened in the same 5-day window (Aug 9–13) and line up too closely to treat as
unrelated:

**1. ~~Engagement rate cratered from 75.9% to 1.3% in eight days~~ — WITHDRAWN**, tracking almost exactly against
the paid-traffic ramp (`download (4).csv`, Monthly Trends–Engagement Rate Trend, each day
individually mapped from the `Nth day` index against the `20260519` range start):

| Date | Engagement rate | Paid traffic (users) | Direct traffic (users) |
|---|---|---|---|
| Aug 5 | 75.9% | 7 | 7 |
| Aug 6 | 47.9% | 21 | 16 |
| Aug 7 | 37.5% | 53 | 5 |
| Aug 8 | 27.8% | 33 | 1 |
| Aug 9 | 40.7% | 57 | 4 |
| Aug 10 | 31.6% | 64 | 8 |
| Aug 11 | 21.8% | 74 | 5 |
| Aug 12 | 15.1% | 58 | 4 |
| ~~**Aug 13**~~ | ~~**1.3%**~~ → **64.9%** | **55** | **1** |

(`download (6).csv`, Active Users: Direct vs Paid, same day-index mapping.)

> **The conclusion drawn from this table was wrong.** Aug 13's 1.3% was a partial day — the export
> ran at 10:00 pm that same evening. Its real value is 64.9%. Aug 11 and Aug 12 are also disputed
> by the later export. The paid/direct user counts in the right-hand columns are unaffected; only
> the engagement-rate column is in question. Original text follows, struck through:
>
> ~~As paid traffic climbed and direct traffic stayed near-flat, engagement rate fell almost
> monotonically to a value that is functionally "visitors leaving immediately" — 1.3% engagement on
> a 60-active-user day is not noise, it's close to nobody engaging at all.~~

**2. That same week set an all-time traffic record.** The weekly cohort table
(`download (14).csv`, `Weekly cohort = 0000`, `date_range_0` rows) shows Aug 9–13 (a partial,
5-day week) at **352 active users** — 30% above the prior full-7-day-week record of 270
(Jul 26–Aug 1), and more than double the previous week's 177 (Aug 2–8, revised up slightly from
171 in the 08-08 report — normal GA4 processing-window drift, not a new finding).

**3. Meta's own pixel data confirms zero purchases from this spend, not just an attribution gap.**
`meta-insights-2026-08-13.csv` — the first direct Meta Ads API pull available for this
project — shows **$104.69 spent across 9 campaigns, 413 clicks (3.61% CTR, $0.25 avg CPC),
11,449 impressions, for Aug 7–13**. Parsing the `actions` field (the platform's own pixel-side
event log, independent of GA4) across all 9 campaigns: **zero `purchase` actions anywhere.** Only
one ad set ("...Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All Genders", $8.95 spent)
registered any checkout-adjacent pixel event at all — 1 `initiate_checkout` (and its `fb_pixel`
mirror). Every other campaign shows engagement/click/video-view actions but nothing past
`landing_page_view`. This is materially different from the GA4-side "channel shows $0 revenue"
finding in every prior report — GA4 revenue attribution can be argued with (cross-device, cookie
loss, etc.); Meta's own pixel showing zero purchase signals across its entire campaign set for a
$104.69 week cannot.

**Reading these three together:** the paid-traffic surge that produced GA4's best week ever
delivered almost no engagement and, per Meta's own tracking, no purchases. The most defensible
read is that this specific traffic (whichever audience/placement combination is driving the Aug
9–13 numbers) is low-intent, mismatched to the landing experience, or partly non-human — not that
existing site friction (checkout, in-app-browser, etc.) is newly worse. Revenue and GA4 funnel
counts for this window are unchanged from Aug 8 (see below), so nothing downstream of "did the
visitor stay past the first screen" moved either. Worth checking GA4 Realtime + the actual ad
creative/audience targeting for these 9 campaigns before spending further.

## Revenue: completely flat for 6 straight days

`download (11).csv` (Revenue by Source) and `download (10).csv` (Revenue by Item) are byte-for-byte
identical to the 2026-08-08 report: **$481.83 total, 18 transactions**, same per-source and
per-item breakdown. `download (9).csv` (Revenue Trend) confirms the last transaction landed on
day 80 of the range = **Aug 7** ($21.49, from `email / returning` — not Facebook). Zero purchases
in the 6 days since, despite Aug 9–13 alone bringing 352 new active users. This is the same
"traffic growing, revenue flat" pattern flagged as "watch, not yet a problem" in the 07-29, 07-30,
and 08-08 reports — it is now a much starker gap (441 users in Aug 9–13 + one earlier partial-week
overlap vs. $0 revenue) and, per the Meta pixel data above, at least part of it is explainable:
the newest, largest traffic source isn't converting because it isn't sticking around long enough to
convert.

## New, unconfirmed finding: two never-before-seen event names, not found in current site source

`download (7).csv` (Events Counts Last 28 Days) includes two events that do not appear in any
prior report: **`in_app_browser_checkout_blocked` (11 occurrences)** and
**`in_app_browser_checkout_override` (2 occurrences)**. Names strongly suggest an actual
blocking/override mechanism at checkout for in-app-browser sessions — which would directly
contradict every prior report's characterization of the in-app-browser handling as "a
non-blocking, dismissible banner... never gated" (most recently reconfirmed in the 08-08 report
by reading `public/event.html` directly).

Grepped this session's fresh clone of `public/`, `api/`, and `lib/` for both exact strings:
**zero matches anywhere in the repo.** For comparison, `ads_conversion_About_Us_1` (97 occurrences,
$0 revenue, in the Key Events Breakdown) is *also* absent from source — that one is a known,
GA4/GTM-side "mark as key event" conversion definition with no corresponding `gtag()` call in the
code, confirmed by the same grep-miss pattern. So a source-code miss alone doesn't prove these two
new events are fake or misconfigured — GA4/GTM-managed events not tied to literal code exist
elsewhere in this property already.

**This is flagged as an open question, not a fact either way.** If real, it means in-app-browser
checkout blocking exists today through some mechanism outside this repo's visibility (a GTM custom
tag, a payment processor's own script, or code merged to a branch other than `main`), which would
be a meaningful update to the standing "banner-only" understanding — especially with
`in_app_browser_detected` now at 31.4% of sessions (below). If it's a stray/misfired event, it's
low-priority. Recommend Taylor or the dev team check the GTM container and GA4 event configuration
directly rather than this report guessing further from source alone.

## Reconfirmed from prior reports, fresh numbers

- **In-app-browser rate keeps climbing.** `download (7).csv`: `in_app_browser_detected` = 840
  against `session_start` = 2,678 = **31.4%**, up from 21.8% (08-08), 20.5% (07-30), 17.1% (07-26).
  A 9.6-point jump in less than a week — the steepest single-period increase yet recorded across
  six straight reports of this metric climbing.
- **Facebook/Meta channel fragmentation, still present, still not a code bug.** `download (8).csv`
  (Campaign Performance) shows the same pattern, now with combined Facebook/Instagram
  variants (`Facebook / paid_social` 606, `facebook / paid_social` 389, `facebook / social` 38,
  `Facebook / paid` 22, `m.facebook.com / referral` 31, `facebook.com / referral` 21, `Facebook /
  organic` 10, `Instagram / paid_social` 7) = **1,124 users, 65.4% of the site's 1,719 active users**
  this window — up from 62% (08-08). Combined revenue from all of those variants: still just
  **$47.99**, all from the one `facebook / social` row; every `paid_social` variant is still $0.
  Re-grepped `paid_social` across `public/`, `api/`, `lib/` this session — zero matches, confirming
  again this is Meta Ads Manager's own UTM tagging, not site code.
- **Bot-traffic city signal, still stable.** `download (1).csv`: Prineville OR (40) + Council
  Bluffs IA (21) + Lulea Sweden (20) + Ashburn VA (18) = 99 of 1,719 active users (**5.76%**) —
  in the same 5–7% band as every prior report (07-29: ~7%, 07-30: 6.7%, 08-08: 6.2%). Still
  circumstantial, still not confirmed, still not growing as a share.
- **Funnel Explorations still undercount real purchases.** Two separate funnel views both show
  well under 18: `download (15).csv` (device segment) catches 5 purchases (3 desktop + 2 mobile,
  from 1,718 session starts → 40 begin-checkout → 5 purchase); `download (12).csv` (checkout
  events) catches only 3. Session-start → begin-checkout completion rate is 2.3%
  (`download (15).csv`). Same persistent gap as every prior report — GA4 Explore
  step/segment definitions still don't match real transaction volume.
- **Item vs. source revenue gap, same $2.50 service-fee pattern.** `download (10).csv` totals
  $441.83 across 4 items; `download (11).csv` totals $481.83 across 18 transactions. Gap is still
  exactly $40.00 = 16 × $2.50, still matching `SERVICE_FEE` (`public/event.html`) /
  `SERVICE_FEE_CENTS` (`lib/pricing.js`), both re-confirmed in sync in this session's clone. No new
  transactions this window, so no new data on the "Good Good Night" / "Tellus AfterDark" fee-skip
  inference from the 08-08 report — still unverified from source alone.

## New observation: Google Ads shows the same "key events but no revenue" shape as Facebook

`download (8).csv`: `googleads / paid` — 56 users, **51 key events**, $0.00 revenue.
`googleads / (not set)` — 15 users, 16 key events, $0. `googleads / cpc` — 11 users, 11 key
events, $0. `googleads / offline` — 14 users, **14 key events**, $0. Combined: 96 users, 92 key
events, $0 revenue. This wasn't a headline in prior reports (Google's spend/revenue pattern hadn't
been checked this closely before), but the shape — high conversion-event volume, zero site
revenue — mirrors the Facebook pattern closely enough to flag. No Google Ads spend data exists yet
(only Meta has an API pull configured), so there's no way to compute a cost-per-acquisition or
confirm whether this is the same "traffic technically converts on a non-revenue key event" issue
seen elsewhere, or something else. Worth the same kind of direct spend pull Meta now has.

## Meta campaign-level detail (new data source — nothing to compare against yet)

| Campaign | Spend | Clicks | CPC | Pixel signal |
|---|---|---|---|---|
| Event 3 Good Good Campaign | $17.46 | 134 | $0.13 | 1 lead |
| Event 3 Tellus AfterDark @ Tellus360 (base) | $19.01 | 110 | $0.17 | none past landing_page_view |
| Event 3 Tellus AfterDark @ Tellus360 – Women | $20.92 | 110 | $0.19 | none past landing_page_view |
| Tellus AfterDark Retargeting | $2.30 | 4 | $0.58 | none |
| Event 3 Tellus AfterDark @ Tellus360 – All Genders | $8.95 | 15 | $0.60 | 1 lead, 1 initiate_checkout, 1 add_to_cart |
| Event 3 Tellus AfterDark @ Tellus360 – Sales-Obj-Women | $7.76 | 15 | $0.52 | none past landing_page_view |
| Event 4 Good Good – Sale Obj Women | $5.79 | 7 | $0.83 | none |
| Event 4 Good Good – Sale Obj All Genders | $6.07 | 8 | $0.76 | 4 leads |
| Event 4 Good Good – Retargeting | $16.43 | 10 | **$1.64** | none — only post_engagement/post_save |

The Retargeting campaign for Event 4 has the worst CPC in the set (6.5x the $0.25 average) and the
weakest signal — no lead, no checkout step, nothing past a post-save. Only the "All Genders" ad
set for the Tellus AfterDark campaign shows any checkout-funnel activity at all. This is one week
of data with no prior period to trend against — flagged as a candidate for the next report to
compare, not a conclusion yet.

## Zero-risk fixes

None identified this run. No "Pages and screens" report was available to audit specific
underperforming pages (same gap as every prior report). Re-confirmed no `paid_social` or
`checkout_blocked`/`checkout_override` strings anywhere in `public/`, `api/`, `lib/`, and no drift
between the two service-fee constants. Nothing mechanical to fix from what this pull contains.

## NEEDS TAYLOR INPUT (ranked)

1. ~~**The engagement-rate collapse (75.9% → 1.3% over 8 days) is the most urgent item in this
   report.**~~ **WITHDRAWN — this was not real.** Aug 13's 1.3% was a partial-day export artifact;
   the day settled at 64.9%. No action was warranted and none should be taken on this basis. The
   replacement action item is the export-timing fix in the CORRECTION above, so no future report
   reads an incomplete final day as a real number. *(Original recommendation, for the record:
   check GA4 Realtime traffic quality and the landing experience behind the 9 campaigns before
   further spend.)*
2. **Meta ad spend vs. confirmed-zero pixel purchases.** $104.69 for 413 clicks and zero purchase
   actions, confirmed at the Meta pixel level (not just a GA4 attribution question this time). The
   "Event 4 Good Good – Retargeting" ad set in particular ($16.43, $1.64 CPC, no funnel signal at
   all) is the weakest individual performer and a reasonable first candidate to pause or rework.
3. **Confirm whether `in_app_browser_checkout_blocked` / `in_app_browser_checkout_override` reflect
   a real, currently-live mechanism.** Not found in this repo's source; could be GTM-managed (like
   the existing `ads_conversion_About_Us_1` key event) or could indicate an actual checkout gate
   that contradicts the standing "banner-only" documentation. With in-app-browser sessions now at
   31.4% of traffic, this matters more than it did at 17–22%.
4. **Standardize UTM tagging across Meta ad sets** — same standing recommendation, now covering
   1,124 users (65.4% of traffic) across 8 distinct source/medium variants for one platform.
5. **Rebuild/verify the GA4 Funnel Explorations** — still undercounting (5 of 18, or 3 of 18
   depending on the view) with no improvement this pull. Same standing item as every prior report.
6. **Consider a Google Ads spend pull, same as the new Meta one.** `googleads / paid` shows 51 key
   events and $0 revenue on 56 users — matches the Facebook pattern closely enough to warrant the
   same direct-spend visibility Meta now has.

## What to re-check in ~1 week

- ~~Whether the engagement-rate collapse reverses, stabilizes, or continues past 1.3%.~~
  Moot — there was no collapse. Instead: reconcile `download (4).csv` against `download (14).csv`
  for Aug 11–12, the two days the exports still disagree on.
- Whether Meta's pixel registers any `purchase` action in the next weekly pull, or continues at
  zero across all campaigns.
- Whether `in_app_browser_detected` keeps climbing past 31.4%, and whether the two new
  checkout_blocked/override events recur (and get an explanation).
- Whether revenue breaks its 6-day-flat streak, especially against the Aug 9–13 traffic record.
- Whether the bot-traffic city share (5.76%) holds in the same band or moves.
- Whether the Funnel Explorations' purchase counts improve, regress, or stay flat.

## Caveats / method notes

- The Meta insights CSV covers a single week (Aug 7–13) with no prior-period export to trend
  against — this report treats it as a new baseline, not a trend, except where it's cross-referable
  against the same-week GA4 numbers.
- Daily GA4 metrics (engagement rate, paid/direct traffic) are reported against the `Nth day` index
  in each CSV, manually mapped to calendar dates by counting forward from the `20260519` range
  start and cross-checked for internal consistency (day counts matched row counts in every table
  used this way).
- Revenue sample is still modest (18 total transactions, $481.83) — no new transactions this window
  means no new per-channel revenue data to add nuance to single-transaction rows.
- The `in_app_browser_checkout_blocked`/`override` finding is explicitly flagged as unconfirmed —
  a source-code grep-miss is not proof either way, per the `ads_conversion_About_Us_1` precedent
  in this same dataset.
- No "Pages and screens" report was present in this export, so no per-page engagement/bounce
  analysis could be run (same gap as every prior report to date).
- This is a source-level, no-live-network-egress analysis — no requests were made to
  sparkdate.date, Meta, or any ad platform API; everything above comes from the CSVs in the Night
  Tasks folder and a read-only grep/git-log of this session's repo clone.
