# GA4 Analysis — 2026-08-17 (Nightly Automation, Cowork Session)

**This run made zero code changes.** It is a read-only analysis of a fresh GA4 export sitting in
`Business Plan/files/Night Tasks/`. The only file added to the repo is this report.

## What was analyzed

Picked **Prompt 9 (GA4 Analysis → Site Improvement Suggestions)** per the prompt library's
"ROTATION SUGGESTION": a fresh GA4 export was sitting in the Night Tasks folder, confirmed fresh
by each CSV's own `#` header (`20260519-20260817`), not by filename or mount timestamp per the
07-28 lesson. This is one day wider than the last logged Prompt 9 run
(`reports/GA4_ANALYSIS_2026-08-16.md` on branch `claude/ga4-analysis-2026-08-16`, window
`...-20260815`), so per this file's own rule ("Prompt 9 runs whenever a fresh export lands, not a
violation of 'don't repeat two nights running'") this was a legitimate re-run, not a duplicate.

Files read: all 22 `download*.csv` files (traffic, revenue, funnel, device, cohort, bot-traffic,
and the raw landing-page/query-string free-form export) plus `data.pdf` (Path Exploration) and
`meta-insights-2026-08-16.csv`.

**Correction (added same day, user flagged the error):** the paragraph originally here claimed the
Meta pull hadn't refreshed and skipped analyzing it. That was wrong — `Night Tasks/logs/2026-08-17.log`
(not checked before the original write-up) confirms the local nightly PowerShell script pulled
fresh Meta Ads insights at 02:00:07-02:00:09 EDT, a genuine rolling 7-day window (Aug 10-16,
9 campaigns, 9 rows written) that is one day newer than the 08-16 report's window (Aug 9-15,
`meta-insights-2026-08-15.csv`). The two filenames/windows look superficially similar but are not
the same file. See the new Meta section below for the actual comparison.

**Headline: this is mostly an incremental night, not a new-story night.** Total revenue moved
from $628.77/24 transactions (08-16 report) to **$656.26/25 transactions** (+$27.49/+1
transaction) — one additional standard ticket sale in roughly a day and a half of new data.
Every other item/channel number is byte-identical to the 08-15 report except one item, detailed
below. The genuinely new thing this window: **Loxley's Social converted its first-ever sales.**

## Revenue

| Metric | This window (thru Aug 17) | 08-16 report (thru Aug 15) | Change |
|---|---|---|---|
| Total revenue | $656.26 | $628.77 | +$27.49 |
| Transactions | 25 | 24 | +1 |

**Revenue by item** (`download (20).csv`, `download (14).csv`):

| Item | Item revenue | Viewed | Added to cart | Purchased | vs. prior report |
|---|---|---|---|---|---|
| SparkDate: Round 2 — Summer Nights | $199.92 | 19 | 7 | 8 | unchanged since 08-15 |
| Founders Mixer | $192.93 | 0 | 0 | 8 | unchanged since 07-29 (static ~3 weeks) |
| Tellus AfterDark: Singles Edition | $137.94 | 139 | 15 | 6 | **+$24.99/+1 purchase since 08-16** (was $112.95/5) |
| Sparkdate: The Loxley's Social | $37.98 | 10 | 4 | 2 | **new: was $0/0 purchases in the 08-15 report (5 viewed, 2 carted, 0 purchased then)** |
| Good Good Night @ Good Good Things | $29.99 | 69 | 11 | 1 | unchanged since 08-15 (+3 views, still 1 purchase) |
| SparkDate: Real People, Real Drinks, Real Court | $0 | 7 | 0 | 0 | unchanged pattern since 08-15 (+2 views, still 0 conversion) |

**The +1 transaction since 08-16 is a Tellus AfterDark ticket**, not a new item — its item revenue
rose by exactly $24.99 (the standard ticket price), while every other item's revenue/purchase
count matches the 08-15 report exactly. **Loxley's Social is the one real "new" data point**: it
existed with zero conversions as of 08-15 (5 viewed/2 carted/0 purchased) and has since converted
its first 2 sales ($37.98) — worth watching whether this keeps climbing or was a one-off from
whoever's already in the cart-abandon pool.

**Item vs. source revenue gap (service-fee check):** $656.26 − $598.76 = **$57.50**. At the known
$2.50 `SERVICE_FEE` (`public/event.html:984`, confirmed still `2.50`; `lib/pricing.js:19`
`SERVICE_FEE_CENTS = 250`, confirmed still in sync) × 25 transactions, a clean match would be
$62.50 — this window is **$5.00 short, i.e. 2 of 25 transactions didn't carry the standard fee**.
This is the same shape of gap the 08-15 report first flagged (2 of 19 then); **Founders Mixer
remains the standing, unconfirmed suspect** (its 8 sales have 0 recorded `view_item`/`add_to_cart`
telemetry at all — see below) but this report adds no new evidence either way. Not re-investigated
tonight beyond reconfirming the constant is unchanged in source.

**Founders Mixer's telemetry gap — still open, still unchanged.** $192.93/8 purchases with zero
`view_item` or `add_to_cart` events has now been identical across the 07-29, 07-30, 08-08, 08-15,
and this report — five consecutive pulls with the exact same number, meaning this item likely sold
out once, long ago, entirely outside the window this analysis can see into (or outside the
instrumented `event.html` checkout flow). Grepped the live source (`public/`, `api/`, `lib/`) for
"Founders" and found zero hardcoded references — it's Firestore/event-data driven, not something a
source-only read can resolve further. Still flagged under NEEDS TAYLOR INPUT below, not
re-investigated with new evidence tonight.

## Channels

**Facebook/Instagram paid social is still the site's biggest traffic-to-revenue mismatch.**
Combined `Facebook / paid_social` (707) + `facebook / paid_social` (389, separate
capitalization bucket — still fragmented, flagged in multiple prior reports) + `Instagram /
paid_social` (70) = **1,166 of 1,883 active users this window (61.9% of all traffic)**, against
**$27.49 total revenue** — the single Meta-pixel-confirmed purchase first surfaced in the 08-16
report, still the only one in the whole 90-day lookback. `tiktok / paid_social` (27 users) is
also still $0. As paid social traffic keeps growing relative to the rest of the site, this ratio
gets more lopsided each report, not less.

**`ads_conversion_About_Us_1` is still the dominant "key event," still worth $0.** 97 of 185
sitewide key events (52.4%) this window — a Google-Ads-imported About-Us page-visit action, not a
lead or purchase. `generate_lead` (63, $0) and `purchase` (25, $656.26 — the only key event with
real revenue) round out the total.

**Revenue by source** (`download (21).csv`, 25 transactions / $656.26 total): eventbrite/listing
leads at $262.90/10 txns, followed by (direct)/(none) $109.96/4, email/email $48.98/2,
facebook/social (organic share, not paid) $47.99/2, then eight single-transaction $27.49-or-less
rows across Instagram/paid_social, email/nurture, email/returning, get_tickets_block/(not set),
google/cpc, google/organic, and matches/(not set). This report can't isolate which single row is
the new Tellus AfterDark transaction from this aggregate view — would need transaction-level
export, not available here.

## Checkout funnel — three GA4 Explore reports, three different purchase counts (still broken)

- `download (5).csv` ("Funnel exploration 1"): Session start 1,883 → Begin Checkout 49 (2.6%) →
  **Purchase 8**.
- `download (17).csv` ("Checkout Events Tracking"): Begin Checkout 49 → Checkout Form Started 17
  (35.3% completion, 64.7% abandon) → **Purchase 6**.
- `download (13).csv` ("Segment by Device," 5-step): Session start 1,883 → View product 129 →
  Add to cart 27 → Begin checkout 4 → **Purchase 1**.

Real purchases this window: **25** (from Revenue/Key Events, the reliable source). None of the
three Explore configs comes close — this is now a confirmed pattern across five-plus consecutive
reports (07-29 through today) and is a GA4 Explore-configuration problem, not a live site bug.
Recommend Taylor rebuild or delete these three Explore reports directly in the GA4 UI rather than
trusting their step-level numbers for anything.

**One genuine clarification this run, not a new bug:** the 65% drop-off between "Begin Checkout"
(49) and "Checkout Form Started" (17) in `download (17).csv` looks alarming in isolation, but
tracing the actual `gtag` calls in source explains most of it structurally rather than as a broken
step. `begin_checkout` fires on `index.html` (`get_tickets_block`, `sticky_ticket_bar` — both
soft, low-commitment clicks on the homepage) and on `lp.html`; `checkout_form_started` only fires
on `event.html` once a user focuses an actual field in the reservation form
(`public/event.html:1524-1531`). These are two different funnel moments on two different pages, not
one continuous screen — a homepage "get tickets" click is weaker intent than someone already
typing into the real form, so a real gap here is expected, not necessarily lost revenue. Worth
knowing before treating that 65% as an actionable drop-off number.

**`checkout_error` is rare and not the story.** Only 9 total events this window (8 "(not set)", 1
`card_incomplete`) — the Begin-Checkout → Checkout-Form-Started gap isn't accompanied by visible
in-form errors, consistent with it being mostly page-navigation attrition (per above) rather than a
broken form throwing errors silently.

**Device split, where it's visible:** in `download (13).csv`'s Add-to-cart step, desktop
completion to the next step (60%, 3 of 5) dramatically outperforms mobile (4.5%, 1 of 22) — but
sample sizes here are tiny (5 and 22 users respectively) and the 08-15 report already traced a
similar mobile-checkout-step anomaly to a likely measurement artifact
(`begin_checkout` not firing cleanly on the real checkout page for some mobile paths) rather than a
confirmed live bug. Not enough new volume this window to move that from "likely artifact" to
"confirmed," either direction.

## In-app browser

`in_app_browser_detected` fired 957 times this window (per `download (1).csv`'s event counts,
15.8% of 6,048 page views) and the Path Exploration PDF shows it firing on 738 of 2,830 second-step
sessions right after `page_view` (~26%) — still the single most common "step 2" event in the whole
site, ahead of everything except `scroll`. `in_app_browser_checkout_blocked` (12) and
`in_app_browser_checkout_override` (2) both still appear in this window's totals, but **grepping
the live source confirms neither event name exists in `public/lp.html` or `public/event.html`
anymore** — consistent with, not contradicting, the 08-15 report's finding that PR #165 (Aug 13
22:01 EDT) removed the block. These 14 events are historical residue from before Aug 13, inside
the 90-day lookback window, not evidence the block is still live. Nothing new to add on whether
removing the block recovered revenue — still too soon to tell from this data (same caveat as
08-15/08-16).

## Bot traffic (unchanged pattern)

`(not set)` city: 251 of 1,883 users (13.3%). Known data-center cities — Prineville OR (45),
Council Bluffs IA (23), Lulea Sweden (23), Ashburn VA (19) — total 110 users (5.8%), in the same
~6-7% range every report since 07-29 has shown. Still circumstantial, not confirmed bot traffic,
not chased further.

## Geography

Philadelphia 323 users / $27.49 revenue / 33.1% engagement rate; Lancaster 64 users / $48.98
revenue / 47.3% engagement rate (`download (7).csv`). Lancaster's much smaller traffic converts at
a noticeably higher engagement rate than Philadelphia's — consistent with prior reports' framing of
Lancaster as the smaller-but-stickier market. No Colorado Springs or Wilmington traffic broken out
in this city-level report (would need a fresh city dimension pull to check whether either has
started showing up).

## Meta Ads spend vs. GA4 (Aug 10-16 vs. Aug 9-15) — the actually-fresh Meta pull

`meta-insights-2026-08-16.csv` (source: Meta Marketing API, campaign-level, generated by the local
nightly script at 02:00 EDT tonight) covers **Aug 10-16** across the same 9 campaigns the 08-16
report analyzed for **Aug 9-15**:

| Metric | Aug 9-15 (08-16 report) | Aug 10-16 (tonight) | Change |
|---|---|---|---|
| Spend | $160.43 | $168.59 | +$8.16 |
| Clicks | 479 | 473 | -6 |
| Impressions | 11,787 | 11,392 | -395 |
| Purchase actions (pixel) | 1 | 1 | unchanged |

**Still exactly one `purchase` action, still the same campaign, still no evidence of a second
conversion.** On "Tellus AfterDark: Singles Edition Retargeting" specifically: spend $41.37 → $42.71
(+$1.34), clicks 102 → 110 (+8), `initiate_checkout` 8 → 9 (+1), `add_to_cart` 3 → 3 (unchanged),
`purchase` 1 → 1 (unchanged). Since these two windows overlap on 6 of 7 days (Aug 10-15), the only
genuinely new day is Aug 16 (in) vs. Aug 9 (out) — and the fact that spend/clicks/checkout-starts on
the retargeting campaign ticked up slightly while the purchase count stayed flat at 1 says the
single conversion from the 08-16 report is still the only one on the books; Aug 16 itself doesn't
appear to have produced a new one. Efficiency also moved the wrong way overall (spend up, clicks and
impressions both down across the whole account) — worth watching but one week of a 9-campaign
account is a small sample for a CPC trend.

This directly informs the "NEEDS TAYLOR INPUT" item below about whether the FB/IG revenue recovery
is a real trend: **one week later, it still isn't** — still a single $27.49 transaction against
$168.59 in the current rolling week's spend.

## NEEDS TAYLOR INPUT

1. **Founders Mixer's revenue path** — unresolved for the fifth straight report. $192.93/8
   purchases, zero `view_item`/`add_to_cart` telemetry, ever. No new evidence this run either way;
   flagging again rather than re-guessing. Worth a direct check of how these sales were actually
   processed (manual/comped, a different product config, or a since-retired sale flow).
2. **The three broken GA4 Explore funnel reports** (`download (5)`, `download (17)`,
   `download (13)`) — five-plus reports confirming purchase counts of 8/6/1 against a real 25.
   This is a GA4 UI config fix, not something this automation can touch. Recommend rebuilding them
   from scratch rather than continuing to trust partial numbers.
3. **Whether Loxley's Social's first two sales are a trend or a blip** — re-check in ~1 week
   (see below).
4. **Whether the FB/IG paid-social revenue ratio (61.9% of traffic, $27.49 total revenue) keeps
   getting more lopsided** as paid spend continues. This week's own Meta pull already partly
   answers it: spend rose $160.43 -> $168.59 (Aug 9-15 -> Aug 10-16) while the pixel-confirmed
   purchase count stayed flat at 1 -- see the Meta Ads section above. Keep watching, not yet a
   trend either direction.

## Proposed zero-risk fixes (NOT applied)

None identified this run. Every finding above is a data-attribution or GA4-Explore-configuration
question, not a codebase issue — consistent with the last several GA4-only reports. `SERVICE_FEE`
(`public/event.html:984`) and `SERVICE_FEE_CENTS` (`lib/pricing.js:19`) were spot-checked and
remain in sync at $2.50; no drift found.

## What to re-check in ~1 week (~Aug 24)

- Total revenue and transaction count — is growth still ~1 transaction/1.5 days, or accelerating?
- Loxley's Social — did it convert more sales, or stay at 2?
- Combined FB+IG paid_social revenue — still $27.49 total, or has it moved?
- Tellus AfterDark's view→purchase rate (139 viewed → 6 purchased, 4.3%) — worth comparing against
  Round 2's much stronger 19 viewed → 8 purchased (42%) to see if that gap persists.
- Whether a fresher Meta Ads insights pull (past `20260810-20260816`) shows the pixel purchase
  count finally move off 1, or spend keep rising without a second conversion.

## Caveats / method notes

- Sample remains modest: 25 transactions, $656.26, across a 90-day lookback window. Single-
  transaction swings (like tonight's +$27.49) are visible as real percentage moves at this volume;
  treat night-over-night deltas as directional, not statistically strong.
- This report is source-grounded where it makes a specific claim about `gtag` firing order or
  constant values (cited file:line above), but no live network egress was used — nothing was
  fetched from sparkdate.date, the GA4 UI, or any ad platform. Everything above comes from the CSV/
  PDF files in the Night Tasks folder plus a read-only clone of the repo at commit `03b5cce`
  ("Reorder the Full Report KPIs: revenue first, operational second," #191).
- `meta-insights-2026-08-16.csv` (Aug 10-16) IS a fresh pull, generated tonight at 02:00 EDT by
  the local nightly script (confirmed via `Night Tasks/logs/2026-08-17.log`) -- see the correction
  note near the top of this report and the dedicated Meta Ads section above.
- Did not move, rename, or delete any of the source GA4 CSVs, `data.pdf`, or the Meta insights CSV
  in the Night Tasks folder.
