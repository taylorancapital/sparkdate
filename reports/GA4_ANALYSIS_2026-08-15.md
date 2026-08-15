# GA4 Analysis — 2026-08-15 (Nightly Automation)

**This run made zero code changes.** It is a read-only analysis of the GA4 exports sitting in
the Night Tasks folder. No files in `public/`, `api/`, or `lib/` were modified. The only change
in this branch is this report file. Source reading (git log/show/grep on a fresh clone) was used
only to explain the numbers, never to fix anything.

## Data used

20 files in `Business Plan/files/Night Tasks/`, all sharing the header `# 20260519-20260814`
(May 19 – Aug 14, 2026): `download.csv` through `download (16).csv` (17 files: Philly vs
Lancaster filtered + all-cities bot-check, Monthly Trends × 4, Traffic & Events Monitoring × 3,
Retention & Cohorts, Funnel Exploration, Conversion Tracking, Revenue Analysis × 3, Segment by
Device, Checkout Events Tracking), plus three new-this-export ecommerce files
(`download-ecommerce.csv`, `download (1)-ecommerce.csv`, `download (2)-ecommerce.csv` — item-level
views/cart/purchase/revenue) and `data.pdf` (a GA4 Path Exploration screenshot export, same
window). No prior-period export was needed for the main comparison — the last merged report,
`reports/GA4_ANALYSIS_2026-08-14.md` (window `…-20260813`), is already in this repo and used
directly for week-over-week deltas below.

**Caveat on the window label:** every file's header claims `…-20260814`, but the day-indexed
daily-trend tables (Monthly Trends, Direct vs Paid) all stop at `Nth day = 0087`, which maps to
**Aug 13**, not Aug 14 (verified by counting forward from the `20260519` start date and
cross-checking against the 08-14 report's own day-index mapping). So the aggregate/item-level
tables cover through Aug 14, but nothing in this pull gives day-level granularity for Aug 14
itself — likely an export pulled early Aug 14 before that day's data had accumulated. Treat any
"as of Aug 14" framing below as aggregate-only, not daily.

## Headline: the in-app-browser checkout block flagged as "unconfirmed" in the last three reports is real, and has already been removed

Every report since 07-24 has tracked `in_app_browser_detected` climbing (17.1% → 20.5% → 21.8% →
31.4% of sessions) while Facebook/Instagram paid traffic converted at ~$0. The 08-08 and 08-14
reports additionally flagged two event names — `in_app_browser_checkout_blocked` (12 occurrences
this window, `download (3).csv`) and `in_app_browser_checkout_override` (2 occurrences) — as
"not found anywhere in this repo's source," an open question for Taylor to check in GTM.

That grep-miss is because the code that generated those events **has already been deleted.**
Tracing it in this session's clone (needed `git fetch --unshallow`; the standard `--depth 1` clone
only shows one commit):

- **`a8ea161`** (Jul 24, 2026 14:53 EDT, PR #115) — `lp.html: block the ticket click for in-app
  browsers, not just warn`. This is the commit that added `in_app_browser_checkout_blocked` (fires
  when the tap is intercepted) and `in_app_browser_checkout_override` (fires if the visitor
  clicked through anyway) to `lp.html`.
- **`85aed6d`** (Aug 13, 2026 22:01 EDT, PR #165) — `Escape the Instagram/Facebook webview on
  Android; warn on events.html`. Its second commit, "Stop blocking the Get Tickets tap in in-app
  browsers," removes the block entirely: *"Meta Insights for Aug 7-13 located the leak: 409 ad
  clicks produced 321 landing-page views, 2 view-content events, and zero purchases... lp.html was
  intercepting the Get Tickets tap for in-app browsers and answering with a copy-paste wall
  instead of navigating... The tap now navigates for everyone."* Same commit also adds an Android
  Chrome-escape intent, and adds in-app-browser warning coverage to `events.html`'s checkout step
  (which previously had analytics tagging but no user-facing handling at all).

**Net effect:** the block was live for exactly 20 days (Jul 24 14:53 → Aug 13 22:01 EDT) — nearly
the entire window this and the last several reports have analyzed — and has been off for less
than a day as of this export's cutoff (day 87 / Aug 13). This closes **NEEDS TAYLOR INPUT #3**
from the 08-14 report; no further input is needed on whether the mechanism is real. What's still
open is whether removing it actually recovers revenue — see "what to re-check" below, since almost
none of this window's outcome data postdates the fix.

## Revenue: one new transaction since the last report, still thin

`download (13).csv` / `download (14).csv`: **$503.32 across 19 transactions**, up from $481.83/18
in the 08-14 report. `download (12).csv` (Revenue Trend) shows the increase lands entirely on day
87 (Aug 13): **+$21.49**, and `download (13).csv`'s item total rose by exactly **+$18.99** ($441.83
→ $460.82) — the known Tellus AfterDark base price. Read together, this is one additional Tellus
AfterDark ticket sale on Aug 13, price + the standard $2.50 fee. Six-day-flat-revenue streak from
the 08-14 report is now broken, but by a single low-value sale, not a trend reversal.

**Revenue by item**, `download (13).csv`:

| Item | Revenue |
|---|---|
| SparkDate: Round 2 — Summer Nights | $199.92 |
| Founders Mixer | $192.93 |
| Tellus AfterDark: Singles Edition | $37.98 |
| Good Good Night @ Good Good Things | $29.99 |

**Item revenue vs. source revenue gap, service-fee check:** $503.32 − $460.82 = **$42.50 = 17 ×
$2.50**, the known `SERVICE_FEE` (`public/event.html:984`) / `SERVICE_FEE_CENTS`
(`lib/pricing.js:19`, confirmed still in sync). Every prior report found this gap as a clean
`(transaction count) × $2.50`; this time it's 17, not 19 — **2 of the 19 transactions did not
carry the standard fee.** No per-transaction data exists in this export to confirm which two, but
Founders Mixer (8 units, $192.93, i.e. $24.12/unit average — not a round ticket-price-plus-fee
number like the other three items) is the natural suspect: it may route through a different
sale path than the standard `event.html` checkout. Flagged as a hypothesis, not a finding — see
NEEDS TAYLOR INPUT.

## New this export: item-level view→cart→purchase funnel (wasn't available before)

`download-ecommerce.csv` / `download (1)-ecommerce.csv` / `download (2)-ecommerce.csv` — a report
type not present in the 08-14 pull:

| Item | Viewed | Added to cart | Purchased | Revenue |
|---|---|---|---|---|
| Good Good Night @ Good Good Things | 66 | 11 | 1 | $29.99 |
| Tellus AfterDark: Singles Edition | 63 | 7 | 2 | $37.98 |
| SparkDate: Round 2 — Summer Nights | 19 | 7 | 8 | $199.92 |
| Real People, Real Drinks, Real Court | 5 | 0 | 0 | $0 |
| Sparkdate: The Loxley's Social | 5 | 2 | 0 | $0 |
| Founders Mixer | 0 | 0 | 8 | $192.93 |

Round 2's view→purchase rate (8/19 = 42%) is by far the best of any item with real view volume —
worth understanding what's different about that listing (price point, event date proximity,
traffic source) and applying it elsewhere. Good Good Night is the opposite: the most-viewed item
(66) but only 1 purchase (1.5% of viewers) despite a healthy 11 add-to-carts — something between
"added to cart" and "completed" is failing specifically for this item; worth a manual test
purchase to see if its checkout path behaves differently. **Founders Mixer again shows 0 recorded
views/carts against 8 real purchases** — consistent with the service-fee anomaly above, this
reinforces that it isn't being sold through the instrumented `view_item`/`add_to_cart` flow on
`event.html` at all.

## Funnel granularity increased since 08-14 — but one step's definition undercuts the headline number

`download (15).csv` ("Segment by Device") now has 5 steps (Session start → View product → Add to
cart → Begin checkout → Purchase) versus the 3-step version (Session start → Begin-checkout →
Purchase) the 08-14 report worked from — someone reconfigured this GA4 Explore between reports.
The new steps look alarming at first read: **mobile users who reach "Add to cart" (14) have a 0%
completion rate to "Begin checkout"** (0 of 14 continue; desktop is 75%, 3 of 4).

**This is very likely a measurement artifact, not a live bug — verified against source, not
guessed:** `add_to_cart` fires on `public/event.html` (`updatePricing()`, when a gender is first
selected) — but `begin_checkout` **never fires on `event.html` at all.** It's only fired from
`public/index.html` (`get_tickets_block` / `sticky_ticket_bar` CTA clicks) and `public/lp.html`
(the "Get Tickets" tap), both of which happen *before* a visitor ever lands on the ticket page. A
user who adds to cart on `event.html` has, by definition, already passed the page where
`begin_checkout` fires — so this funnel step ordering asks GA4 to find a *second*, later
`begin_checkout` event after `add_to_cart`, which requires the visitor to navigate backward to
`index.html`/`lp.html` and click the CTA again. That's a real but unusual path, not the typical
one, which is almost certainly why the step's completion rate reads near-zero across both device
types (desktop's "75%" is 3 users — too small to read as healthy either). **Recommend the Explore
be rebuilt using `checkout_form_started` (which does fire on `event.html`'s real form) as the step
after `add_to_cart`, not `begin_checkout`** — that would measure the actual on-page path instead
of an unlikely cross-page one. Not applied here per this task's hard rule against code/config
changes; this is a GA4 Explore configuration edit, not a codebase one anyway.

The companion **`download (16).csv` ("Checkout Events Tracking")** uses the *correct* two events
for what it's trying to measure — Begin Checkout (43 users, i.e. CTA clicks on index/lp) →
Checkout Form Started (12 users, 33% of the 43, on `event.html`) → Purchase (4 users, 33% of the
12). Read plainly: **of everyone who clicks "Get Tickets," 72% never reach — or never interact
with — the actual ticket page's checkout form**, and a further 67% of those who do reach it don't
complete. That 72% drop is a legitimate navigation/landing gap (distinct from the mobile-specific
artifact above) and is exactly the kind of gap the now-removed in-app-browser block would have
caused for part of this window — again, largely pre-fix data.

## Traffic concentration: Facebook/Instagram still ~68% of users, ~9.5% of revenue

`download (4).csv` (Campaign Performance), combining every Facebook/Instagram source/medium
variant (`Facebook / paid_social` 667, `facebook / paid_social` 389, `facebook / social` 38,
`Facebook / paid` 22, `m.facebook.com / referral` 33, `facebook.com / referral` 21, `Facebook /
organic` 10, `Instagram / paid_social` 26): **1,206 of 1,770 active users (68.1%)**, up from 65.4%
in the 08-14 report. Combined revenue from all of those rows: still just **$47.99**, entirely from
the one `facebook / social` (organic share) row — every `paid_social` variant is $0, unchanged
across seven consecutive reports. `googleads / paid` shows the same shape on a smaller scale: 56
users, 51 key events, $0 revenue.

`in_app_browser_detected` fired on **874 of 2,745 `session_start` events (31.9%)**, up slightly
from 31.4% in the 08-14 report (window is one day wider, so treat this as roughly flat, not a
fresh spike). The Path Exploration PDF (`data.pdf`) shows the same pattern at the session level:
of 2,660 `page_view`s immediately following `session_start`, the single largest STEP+2 event is
**`in_app_browser_detected` at 696 (26.2%)** — ahead of `scroll` (810 total, but split across
multiple event types) as the dominant thing that happens right after the first page loads for a
large share of sessions.

## Bot-traffic city signal — still stable, still circumstantial

`download (1).csv` (All Cities): Prineville OR (41) + Council Bluffs IA (21) + Lulea Sweden (22) +
Ashburn VA (19) = **103 of 1,770 active users (5.8%)**, matching the 5.76% figure in the 08-14
report and the 5–7% band every report has shown since 07-29. Not growing as a share; still not
confirmed as bots, just consistent with the same known-datacenter-city signal.

## Already resolved since the last report (no action needed)

- **`account.html` / `admin.html` missing `noindex`** — flagged in the 08-10
  (`SITEMAP_ROUTES_DIFF_2026-08-10.md`) report as a proposed zero-risk fix. Confirmed fixed:
  `git log` shows `0f99955 Add noindex to account.html and admin.html (#158)`.
- **In-app-browser checkout block** — see Headline above; resolved via PR #165.

## Zero-risk fixes

None identified this run. Same standing gap as every prior report: **no "Pages and screens"
report** is present in this export, so no per-page engagement/bounce/CTA audit could be run this
time either — that would be needed to responsibly propose any dead-link/meta-description/alt-text
fix, and guessing without the traffic data isn't safer than not fixing it.

## NEEDS TAYLOR INPUT (ranked)

1. **Confirm the in-app-browser block removal (PR #165) actually recovers revenue from that
   segment.** This is the most important open question left after this report, precisely because
   the last three reports' top concern is now resolved on the code side — the only thing left to
   know is whether it works. Compare `begin_checkout` (tagged with `in_app_browser: true/false`
   since PR #165) against purchase completion for each cohort over the next 1-2 weeks.
2. **Founders Mixer's revenue path.** $192.93 across 8 transactions with zero recorded
   `view_item`/`add_to_cart` events, and it's the best explanation on hand for why the item-vs-
   source revenue gap ($42.50) doesn't match a clean `19 × $2.50` this time (only 17 of 19
   transactions carry the fee). Worth a direct check of how these 8 sales are actually being
   processed (manual link, different product config, comped seats logged as $ sales) — not
   something this report can determine from GA4 aggregates alone.
3. **Good Good Night's add-to-cart-to-purchase collapse.** 11 add-to-carts, 1 purchase (9%
   completion) — the worst of any item with meaningful cart volume, versus Round 2's 8-of-7
   (funnel counts can exceed 100% across a multi-week window as add-to-carts and purchases don't
   have to be the same visitor) but clearly a much healthier ratio. Worth a manual test purchase
   on this specific listing.
4. **Rebuild the "Segment by Device" GA4 Explore** to use `checkout_form_started` instead of
   `begin_checkout` as the step after `add_to_cart` — see the funnel section above for why the
   current 0%-mobile-completion number is very likely a step-definition artifact, not a live
   bug, and is at risk of being read as an urgent mobile-checkout emergency if not corrected.
5. **Standardize Facebook/Instagram UTM tagging** — 1,206 users (68.1% of traffic) still split
   across 8 source/medium variants for one platform, unchanged standing recommendation.
6. **Consider pulling a categorized breakdown of `checkout_error`** (7 occurrences this window).
   The code (`public/event.html`) already buckets these into `card_declined` / `network` /
   `card_incomplete` / `other` via a `category` parameter, but the standard GA4 CSV export used
   here doesn't include that dimension — a custom Explore with `category` as a breakdown would
   turn this from "7 failures, unknown cause" into an actionable list.

## What to re-check in ~1 week

- Whether `begin_checkout` → purchase completion for `in_app_browser: true` sessions improves now
  that the block is off (near-zero historical baseline given the block covered nearly this entire
  analysis window).
- Whether total revenue and transaction count move beyond the single Aug 13 sale, especially given
  Aug 9-13 was an all-time traffic-record week (per the 08-14 report) that still hasn't converted
  proportionally.
- Whether Founders Mixer's view/cart telemetry gap is explained, and whether the 17-of-19 service-
  fee anomaly persists or was specific to this window.
- Whether Facebook/Instagram `paid_social` revenue moves off $0 (eighth consecutive report at or
  near zero for this specific tag combination).
- Whether Wilmington and Colorado Springs (both fully wired to live routes as of the Aug 14 14:44
  EDT merge of PR #173, per this session's git log) show up as new geographic traffic — this
  export's daily data cuts off before that merge, so there's nothing to report on it yet.

## Caveats / method notes

- **Window granularity mismatch:** all 20 files claim `…-20260814`, but daily-indexed tables only
  have data through day 87 = Aug 13 (verified by index-counting from the `20260519` start, cross-
  checked against the identical method the 08-14 report used and got the same day-87=Aug-13
  result for its narrower window). Aggregate/item-level tables (revenue, ecommerce, campaign
  performance, events) do cover through Aug 14 by their own totals, so this report treats those as
  current and the day-by-day trend tables as accurate only through Aug 13.
- **Git history:** the initial clone was `--depth 1` per this task's standard workaround; getting
  the exact commit/date for the in-app-browser block's introduction and removal required
  `git fetch --unshallow` on the already-cloned working copy (a read-only operation, no push
  implications). Both commits (`a8ea161`, `85aed6d`) were confirmed by full commit message and
  diff, not inferred from a commit title alone.
- **Founders Mixer's fee/telemetry gap is a hypothesis**, built from aggregate arithmetic (2 of 19
  transactions missing the standard $2.50 fee; this item alone would explain up to 8 of those if
  none of its sales carry the fee, more than needed — so it's plausible but not proven from this
  data).
- Total revenue sample remains modest: 19 transactions, $503.32. Single-transaction swings (like
  the +$21.49 this window) are visible as real percentage moves in a sample this size; treat
  week-over-week revenue deltas as directional, not statistically strong, until volume grows.
- No live network egress was used — no requests were made to sparkdate.date, GTM, GA4's UI, or any
  ad platform. Everything above comes from the CSV/PDF files in the Night Tasks folder and a
  read-only clone/grep/log of the repo.
