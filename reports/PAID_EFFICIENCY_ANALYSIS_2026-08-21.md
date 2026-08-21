# Paid Efficiency Analysis — 2026-08-21 (Nightly Automation, Cowork Session)

**This run made ZERO code changes.** The only file added to this branch is this report. No file
under `public/`, `api/`, `lib/`, `vercel.json`, `package.json`, or any Firestore rule was created,
edited, or deleted. Every fix suggested below is a recommendation for Taylor to approve, not
something that has been applied.

**Focus:** paid-media efficiency (prospecting vs. retargeting) and the source-level coverage of the
`ViewContent` / `view_item` instrumentation that all per-campaign conversion reporting depends on.

**Why this focus and not "GA4 analysis" again:** the GA4 CSV exports in the Night Tasks folder are
**unchanged** since the 2026-08-20 run — all 18 files still carry the window header
`# 20260519-20260819`, and `download (11).csv` still reads `28` transactions / `$743.73`, identical
to the figures in `reports/GA4_ANALYSIS_2026-08-20.md`. Re-running the same GA4 read would have
produced the same report two nights running, which the rotation logic explicitly says not to do.
The only genuinely new data tonight is `meta-insights-2026-08-20.csv` (written 2026-08-21 03:41,
window Aug 14–20), so the analysis is led by that and uses GA4 only as a fixed baseline.

---

## What was analyzed

| Source | Window | Notes |
|---|---|---|
| `meta-insights-2026-08-20.csv` | Aug 14–20 | **NEW tonight.** 9 campaigns, `level=campaign` |
| `meta-insights-2026-08-19.csv` | Aug 13–19 | Prior pull, 12 campaigns — used for differencing |
| `logs/2026-08-21.log` | — | Confirms the 03:41 Meta API pull and the skipped CLI run |
| 18 × `download*.csv` | `20260519-20260819` | **Unchanged since 08-20.** Baseline only |
| `/tmp/sparkwork` (fresh clone of `main`) | — | Read-only, to ground hypotheses in source |

Not re-analyzed tonight because the underlying files did not change: cohort retention, in-app
webview escape behaviour, the `matches.html` self-referral UTM bug, and the `begin_checkout`
ordering defect. All four are covered in `reports/GA4_ANALYSIS_2026-08-20.md` and remain open.

---

## Headline 1 — 61% of Meta spend goes to prospecting, which produces 25% of the purchases

Splitting the account by campaign name (`*Retargeting*` vs. everything else) has not been done in
any prior report, and it separates the account cleanly.

**Aug 14–20 (`meta-insights-2026-08-20.csv`, 9 campaigns, $289.50 total):**

| | Campaigns | Spend | Share | Clicks | CPC | Pixel purchases | Cost per purchase |
|---|---|---|---|---|---|---|---|
| Retargeting | 3 | $113.23 | 39.1% | 251 | **$0.4511** | **3** | **$37.74** |
| Prospecting | 6 | $176.27 | 60.9% | 211 | $0.8354 | 1 | $176.27 |

**Aug 13–19 (`meta-insights-2026-08-19.csv`, 12 campaigns, $299.76 total) — same shape:**

| | Campaigns | Spend | Share | Clicks | CPC | Pixel purchases | Cost per purchase |
|---|---|---|---|---|---|---|---|
| Retargeting | 3 | $115.99 | 38.7% | 240 | $0.4833 | 3 | $38.66 |
| Prospecting | 9 | $183.77 | 61.3% | 252 | $0.7292 | 1 | $183.77 |

The 08-18 report recorded the same pattern one window earlier ("$82.06 → 2 purchases vs. $137.58 →
0"), so this is the **third consecutive overlapping window** in which retargeting carries the
conversions. Prospecting CPC is also drifting the wrong way: $0.7292 → $0.8354 (+14.6%) while
retargeting CPC improved $0.4833 → $0.4511 (−6.7%).

**Both halves are still underwater against the product.** Item revenue per ticket from
`download (14).csv` runs $18.99–$29.99 (Loxley's $37.98/2; Round 2 $199.92/8 = $24.99; Tellus
$187.92/8 = $23.49; Good Good $59.98/2 = $29.99), with a `SERVICE_FEE = 2.50`
(`public/event.html:1014`, `public/events.html:1559`) on top. Blended Meta CPA for Aug 14–20 is
$289.50 / 4 = **$72.38** — 2.4×–3.8× the ticket. Even the good half, retargeting at $37.74, exceeds
every ticket price on the calendar.

**Caveat that keeps this honest:** the two non-video campaigns in the account are *exactly* the two
retargeting campaigns that produced all 3 purchases (Tellus Retargeting, video_view=1, CPC $0.3350;
Good Good Retargeting, no video_view, CPC $0.6683), while all 7 video-creative campaigns average
CPC $0.8431 and produced 1 purchase on $198.13. Audience type and creative format are perfectly
confounded here except for Marion Court Retargeting. With n=9 campaigns this data **cannot** tell
you whether retargeting or non-video creative is doing the work. See NEEDS TAYLOR INPUT.

---

## Headline 2 — On Aug 20 the budget moved *toward* the campaign with zero conversions

The two Meta pulls overlap on six of seven days (Aug 13–19 vs. Aug 14–20), so subtracting them
isolates a single day: **Aug 20 minus Aug 13**. This is the cleanest per-day read available from
these files.

| Δ spend | Δ clicks | Δ purchases | Campaign |
|---|---|---|---|
| **+$6.69** | +5 | 0 | Marion Court Retargeting |
| **+$3.58** | +4 | 0 | Marion Court Female |
| **+$3.54** | +4 | 0 | Marion Court All Genders |
| +$2.11 | +12 | 0 | Tellus AfterDark Retargeting |
| −$0.57 | −2 | 0 | Good Good — Sale Obj Women |
| −$3.05 | −2 | 0 | Good Good — Sale Obj All Genders |
| −$3.86 | −11 | 0 | Tellus @ Tellus360 — Sales-Obj-Women |
| −$4.63 | −14 | 0 | Tellus @ Tellus360 — All Genders |
| **−$11.56** | −6 | 0 | Good Good Retargeting |
| −$1.03 / −$0.80 / −$0.68 | −9 / −7 / −4 | 0 | 3 campaigns that dropped out of the window entirely |
| **−$10.26 net** | −30 | **0** | Account total ($299.76 → $289.50) |

All three Marion Court campaigns went **up** (+$13.81 combined), and the single largest decrease in
the account was Good Good Retargeting (−$11.56), one of only two campaigns that has ever produced a
pixel purchase. That is close to a straight $12–14 transfer from the converting half of the account
to the non-converting one.

**Marion Court, week over week, with every conversion counter frozen:**

| | Aug 13–19 | Aug 14–20 | Change |
|---|---|---|---|
| Spend | $34.60 | **$48.41** | **+39.9%** |
| Impressions | 1,437 | 1,971 | +37.2% |
| Clicks | 31 | 44 | +41.9% |
| CPC | $1.1161 | $1.1002 | −1.4% (still 1.76× the $0.6266 account blended CPC) |
| Landing page views | 18 | 21 | +3 |
| `view_content` | 4 | **4** | **0** |
| `add_to_cart` | 0 | **0** | **0** |
| `initiate_checkout` | 1 | **1** | **0** |
| `purchase` | 0 | **0** | **0** |

37% more impressions bought exactly zero additional conversion signal of any kind. The 08-20 report
recommended "kill or rebuild the three Marion Court campaigns" at $34.60/week; a week later they are
at $48.41/week. Its GA4 item, `SparkDate: Real People, Real Drinks, Real Court`, is still at
**14 views / 0 added to cart / 0 purchased / $0.00** in `download (14).csv` — a fourth consecutive
report with the same three zeros.

`Marion Court All Genders` is the worst single line in the account: **$13.52 for 572 impressions,
10 clicks, 2 link clicks, and 1 landing page view.** Eight of its ten clicks were video/post
engagement, not traffic.

---

## Headline 3 — `ViewContent` fires on 2 of 17 pages, so Meta's per-campaign conversion columns are not comparable across campaigns

This is a second instance of the same class of defect the 08-20 report found in `begin_checkout`:
an event whose *name* implies one thing and whose *firing location* means another.

Grepped across the whole site (`public/*.html`, 17 pages):

| Page | `fbq('track','ViewContent')` | `gtag('event','view_item')` |
|---|---|---|
| `public/event.html` | line 1116 — once per page load | line 1132 |
| `public/events.html` | line 1753 — **every dialog open** | line 1756 |
| `lp.html`, `index.html`, `city.html`, and the other 12 pages | **none** | **none** |

`lp.html` fires only `PageView` (line 125) and `Lead` (line 624). `index.html` fires `PageView`
(863), `Contact` (1289), `Lead` (1355). `city.html` fires `PageView` (39) and `Lead` (999).

Two consequences:

**(a) The dedup is asymmetric.** `events.html:1750` says so in a comment — *"Fires on every open
(not deduped like AddToCart below) since each open is a genuine new detail view"* — while
`AddToCart` is gated by a `Set` at `events.html:1586` / `:1851` and by a boolean at
`event.html:1510`. So one visitor opening the same event dialog three times logs 3 `view_content`
and 1 `add_to_cart`. Every views-to-cart ratio in `download (13).csv` is therefore **structurally
deflated** for events.html traffic: `Tellus AfterDark 198 views / 20 carts = 10.1%` is not a real
10.1%, and it is not comparable to `Round 2 — Summer Nights 19 views / 7 carts = 36.8%` if the two
got different amounts of dialog re-opening.

**(b) The Meta `view_content` column measures destination page, not campaign quality.** Aug 14–20,
`view_content` ÷ `landing_page_view` by campaign:

| Ratio | `landing_page_view` | `view_content` | Campaign |
|---|---|---|---|
| **138%** | 80 | 110 | Tellus AfterDark Retargeting |
| 40% | 20 | 8 | Tellus @ Tellus360 — All Genders |
| 39% | 18 | 7 | Good Good — Sale Obj All Genders |
| 38% | 24 | 9 | Good Good Retargeting |
| 35% | 20 | 7 | Good Good — Sale Obj Women |
| 25% | 12 | 3 | Marion Court Retargeting |
| 12% | 8 | 1 | Marion Court Female |
| 9% | 22 | 2 | Tellus @ Tellus360 — Sales-Obj-Women |
| 0% | 1 | 0 | Marion Court All Genders |

A ratio above 100% is only reachable via the non-deduped `events.html` dialog path. A ratio near 0%
is what you get when the ad lands somewhere `ViewContent` does not exist at all. **These nine
numbers are not measuring the same thing as each other**, which means the 14× spread between
Tellus Retargeting and Marion Court Female is partly a routing artifact — and the recurring
"Marion Court converts nothing" reading across four reports may be partly a measurement gap rather
than purely an audience failure. It cannot be settled from this repo: campaign destination URLs are
held in Meta Ads Manager, not in source.

I checked the most obvious alternative explanation and it is **not** the cause: `lp.html` does
correctly deep-link into the event dialog. Line 169 ships a static `href="/events"`, but line 537
rewrites it to `/events?event=<id>` once `/api/next-event` resolves, and lines 544–551 prefetch that
destination and preload Stripe.js. That path is sound.

---

## Headline 4 — 67 of 824 campaign-targeted landings (8.1%) hit a degraded or misrouted `/lp`

From `download (1).csv` (28-day event counts), cross-referenced against the three purpose-built
diagnostics in `lp.html`:

| Event | Count | Fires at | What it means |
|---|---|---|---|
| `targeted_event_landing` | 824 | `lp.html:468` | Campaign-targeted `/lp?eventId=` landings |
| `next_event_fetch_failed` | **60** | `lp.html:574` | `/api/next-event` failed → button stayed on the static `/events` fallback, and the page kept generic dual-city copy: no event title, no price, no early-bird or "Filling up" eyebrow, and no prefetch |
| `targeted_event_not_found` | **6** | `lp.html:497` | Campaign link pointed at an `eventId` the API does not know |
| `targeted_event_missing_id` | **1** | `lp.html:458` | The blank-`?eventId=` bug the code comment at `lp.html:444–458` warns about — confirmed live |

60 + 6 + 1 = 67, or **8.1% of all targeted landings.** The 60 fetch failures are the expensive ones:
per `lp.html:529–532` the visitor loses the price on the button entirely, which on a
$18.99–$29.99 product is the whole offer. `download (2).csv` shows `lp / (not set)` at 12 users, 1
key event, $0.00 revenue.

This event trio appears in the 08-18 and 08-20 reports, but as a passing mention; the 8.1% rate,
the per-visitor consequence traced to `lp.html:529–532`, and the confirmed live
`targeted_event_missing_id` have not been quantified before.

---

## Everything else — moving and not moving

- **Three campaigns went dark.** `Campaign 1 Event 3 Good Good Campaign` ($1.03), `... - Women
  Campaign` ($0.80), and `Campaign 1 Event 3 Tellus AfterDark: Singles Edition @ Tellus360
  Campaign` ($0.68) appear in the Aug 13–19 pull and not in Aug 14–20 — so their entire weekly
  spend ($2.51 combined, 20 clicks at $0.126 blended CPC) landed on Aug 13 alone. Worth noting
  they had the **cheapest clicks in the account by 3×** before being switched off.
- **Prospecting is buying leads, not tickets.** The 6 prospecting campaigns produced 14 `lead`
  actions on $176.27 ($12.59/lead) and 1 purchase. `Good Good Campaign-Sale Obj Women` is named for
  a sales objective but returned 6 leads, 7 `view_content`, **0 add_to_cart, 0 purchases** on
  $38.67. GA4 shows `generate_lead` at 77 against `purchase` at 28.
- **Account CPM is rising.** $26.10 → $27.78 (+6.4%) w/w; CTR essentially flat, 4.28% → 4.43%.
- **Unchanged, re-flagged, not re-analyzed** (GA4 files are stale, so these are byte-identical to
  the 08-20 report, not confirmations): revenue $743.73 / 28 transactions; `Facebook / paid_social`
  (803 users) and `facebook / paid_social` (389) still split by capitalization, alongside
  `Facebook / paid` (22); five separate Google Ads buckets (`googleads / paid` 56 users → 51 key
  events → **$0.00**, `googleads / (not set)` 15 → 16, `googleads / offline` 14 → 14,
  `googleads / cpc` 11 → 11, `Google Ads / cpc` 15 → 0) totalling 92 key events and no revenue,
  which lines up with `ads_conversion_About_Us_1` at 97 events; `[object Object] / undefined`
  (10 users) and `test / test`; Founders Mixer's 0 views / 8 purchases / $192.93 telemetry gap
  (eighth report); `matches / (not set)` still miscrediting $27.49.
- **Prompt library still missing.** `sparkdate-nightly-claude-code-prompts.md` does not exist
  (tenth run). `TONIGHT_PROMPT.md` remains the de facto library and is still stamped `2026-08-14`,
  so `logs/2026-08-21.log` again ends with *"TONIGHT_PROMPT.md is dated 2026-08-14, not today
  (2026-08-21) — nothing fresh queued. Skipping the CLI run."*

---

## NEEDS TAYLOR INPUT (strategy / money / measurement — not an agent's call)

1. **Marion Court: decide, then act.** It went from $34.60 to $48.41/week after the 08-20 report
   recommended killing it, with all four conversion counters frozen at 4 / 0 / 1 / 0 and a fourth
   straight report of 14 GA4 views / 0 carts / 0 purchases. At $48.41/week it burns roughly two
   tickets' worth of margin every week. Either pause it or, if it is deliberately running as
   awareness for a later on-sale, say so in the prompt file so the nightly stops re-flagging it.
   *Re-check in ~1 week:* Marion Court spend in the next `meta-insights-*.csv`, and whether
   `SparkDate: Real People, Real Drinks, Real Court` in `download (14).csv` has moved off 14/0/0.
2. **Rebalance prospecting vs. retargeting — but run a real test, not a reallocation.** Retargeting
   is 3.7× cheaper per purchase across two windows, but retargeting volume is capped by the size of
   the audience prospecting builds, so moving all $176.27 into retargeting will not produce 4.7
   purchases. The confound (both converting campaigns are also the only non-video ones) has to be
   broken before drawing a creative conclusion. Suggested cheap test: run one prospecting campaign
   with the static/non-video creative from Tellus Retargeting, hold everything else constant.
   *Re-check in ~1 week:* CPC and purchases for that campaign vs. the $0.8431 video-cohort CPC.
3. **Meta CPA is above the ticket price on both halves of the account.** Blended $72.38 vs. a
   $18.99–$29.99 item. Whether that is acceptable depends on repeat-attendance LTV, which is not in
   any GA4 export here — and the 08-20 report found week-1 cohort retention at 0.65–2.27%, which
   argues LTV is not rescuing it. This is a pricing/budget decision, not an agent's.
   *Re-check in ~1 week:* blended CPA in the next Meta pull vs. item revenue in `download (14).csv`.
4. **Decide what `view_content` is supposed to mean, then make it consistent.** Right now
   `events.html` counts every dialog re-open and `event.html` counts one per page load, and neither
   fires on `/lp`. Deduping `ViewContent` to match `AddToCart` would make campaigns comparable but
   would break continuity with all historical Meta data and could disturb pixel optimization on
   live campaigns. That trade-off is Taylor's, and it touches active ad delivery.
   *Re-check in ~1 week:* the `view_content ÷ landing_page_view` table above — the 0%–138% spread
   should compress.
5. **Confirm the campaign destination URLs in Ads Manager.** Not knowable from source. If Marion
   Court's ads point anywhere other than `/lp?eventId=<id>` or `/events?event=<id>`, its zeros are
   partly instrumentation and the "kill it" call in item 1 should be revisited first.
6. **Google Ads is optimizing toward an About-Us conversion.** 92 key events across five buckets,
   $0.00 revenue, matching `ads_conversion_About_Us_1` (97). Changing the conversion action affects
   live bidding and spend — explicitly out of scope for this task.

---

## Proposed zero-risk fixes — NOT APPLIED, for a human to do

None of these were made. Each is small and self-contained, but this task is report-only.

1. **Investigate the 60 `next_event_fetch_failed` events** (`lp.html:574`, `api/next-event.js`).
   7.3% of targeted landings losing the price on the CTA is a real conversion cost. Root cause is
   not determinable from CSVs — needs Vercel function logs for `/api/next-event` over Aug 13–19.
   *Re-check in ~1 week:* `next_event_fetch_failed` count in the next `download (1).csv`; target
   under ~10 for a comparable traffic volume.
2. **Fix the 6 `targeted_event_not_found` links.** Some campaign is pointing at a dead `eventId`.
   Cross-reference `SparkDate_UTM_Campaign_Links.xlsx` against live event IDs.
   *Re-check in ~1 week:* `targeted_event_not_found` should be 0.
3. **Fix the 1 blank `?eventId=`** — `lp.html:444–458` names the cause: the UTM spreadsheet emits
   `/lp?eventId=&utm_source=...` on any row with a blank Event ID column.
   *Re-check in ~1 week:* `targeted_event_missing_id` should be 0.
4. **Normalize `utm_source` capitalization on Meta destination URLs** to lowercase, per the
   convention recorded in `CLAUDE.md`. Carried over unresolved from the 08-20 report; the split is
   still 803 / 389 / 22 users across three Facebook paid buckets.
   *Re-check in ~1 week:* one `facebook / paid_social` row in `download (2).csv`, not three.

---

## Caveats and method notes

- **The GA4 data is not new.** All 18 `download*.csv` files carry `# 20260519-20260819`, the same
  window the 08-20 report used, and the totals match it exactly ($743.73 / 28 transactions; 328
  `view_item`; 47 `add_to_cart`). Nothing in this report should be read as a GA4 week-over-week
  movement. Where I cite a GA4 number it is a fixed baseline for the Meta figures.
- **The two Meta windows overlap 6 of 7 days.** Differencing them yields exactly one day
  (Aug 20 minus Aug 13) and nothing else. The three "Aug 13–19 vs. Aug 14–20" comparisons in this
  report are therefore mostly the *same* six days re-counted; the w/w percentages (e.g. Marion
  Court +39.9%) are driven entirely by that one-day swap and should not be extrapolated to a trend
  from two points. The 08-18 report's independent window is what makes it three observations rather
  than two.
- **Do not sum the retargeting/prospecting tables across windows.** They overlap; adding them
  double-counts six days of spend.
- **n=9 campaigns.** Purchase counts are 3 and 1. These are far too small for significance testing;
  the retargeting/prospecting gap is suggestive and consistent across three windows, not proven.
- **Retargeting/prospecting was classified by campaign name** (`*Retargeting*` = retargeting). If
  any campaign is misnamed relative to its actual audience setup in Ads Manager, the split is wrong.
- **Meta pixel purchases (4) and GA4 transactions (28) count different things over different
  windows** and are not reconciled here. The 08-20 report established GA4 attribution is unreliable
  for paid (a confirmed pixel purchase filed as `(not set)`).
- **Aug 20 is provisional** — the Meta API pull ran at 03:41 on Aug 21, so the final day may still
  be settling. The same last-day caution applies as with GA4.
- **Line numbers** are from the fresh `main` clone taken at run time on 2026-08-21.
- **Source CSVs were read only.** Nothing in the Night Tasks folder was moved, renamed, or deleted.
