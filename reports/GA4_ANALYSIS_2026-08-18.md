# GA4 Analysis — 2026-08-18 (Nightly Automation, Cowork Session)

**This run made zero code changes.** It is a read-only analysis of the GA4 + Meta exports sitting
in `Business Plan/files/Night Tasks/`. The only file added to the repo is this report. Every
recommendation below is written for a human to apply or reject — nothing was applied.

## What was analyzed

Focus picked: **Prompt 9 (GA4 Analysis → Site Improvement Suggestions)**, per `TONIGHT_PROMPT.md`'s
own default rule ("fresh `download*.csv` present → GA4 analysis"). Note the prompt library the task
instructions name (`sparkdate-nightly-claude-code-prompts.md`) still does not exist in the repo —
only `TONIGHT_PROMPT.md` does, and its header is still stamped `2026-08-14`. This has now been
flagged in the 08-10, 08-14, 08-15, 08-16 and 08-17 entries and remains unresolved; see NEEDS
TAYLOR INPUT.

Files read (read-only; nothing moved, renamed or deleted):

- All 22 `download*.csv` GA4 exports. Every one carries the window `20260519-20260817` in its own
  `#` metadata header — confirmed from the header, not the filename or the mount timestamp.
- `meta-insights-2026-08-17.csv` — Meta Marketing API campaign-level pull, window
  `20260811-20260817`, **12 campaign rows**.
- `Night Tasks/logs/2026-08-18.log` — confirms the local PowerShell job pulled that Meta data at
  02:00:06–02:00:09 EDT today and then deliberately skipped its own CLI run.
- Source in a fresh clone: `public/lp.html`, `public/events.html`, `api/next-event.js`.

**Prior period compared against:** `reports/GA4_ANALYSIS_2026-08-17.md` on branch
`claude/ga4-analysis-2026-08-17` (fetched directly from origin — it is not on `main`). That report
nominally covers the *same* window string `20260519-20260817`, but it was written from an export
taken on the morning of Aug 17, whereas tonight's CSVs were written at 21:57–22:01 on Aug 17.
Tonight's export therefore contains one genuinely new day of data. The arithmetic confirms this
cleanly: $656.26 (08-17 report) + $32.49 (day 0090) = **$688.75** (tonight). This is a legitimate
re-run on newer data, not a duplicate analysis.

---

## Headline: the second-ever Meta-confirmed purchase happened — and GA4 filed it as `(not set)`

Three independent sources agree on a single Aug 17 transaction, and the third one is the finding:

| Source | Evidence |
|---|---|
| Revenue trend, `download (4).csv` | Day `0090` (Aug 17) = **$32.49**, the only $32.49 day in the 91-day series |
| Item revenue, `download (11).csv` | Good Good Night @ Good Good Things: **$59.98 / 2 purchases** — was $29.99 / 1 in the 08-17 report. Delta **+$29.99 / +1** |
| Meta pixel, `meta-insights-2026-08-17.csv` | "Campaign 1 Event 4 Good Good Campaign-Retargeting": `offsite_conversion.fb_pixel_purchase=1`, `purchase=1`, `add_payment_info=1` |

$29.99 ticket + $2.50 `SERVICE_FEE` = **$32.49** exactly. The transaction is fully explained.

**But `download (6).csv` (Revenue by Source) attributes that $32.49 to `(not set)` — 1 transaction,
$32.49 — not to any `facebook / paid_social` bucket.** `Facebook / paid_social` (740 users) and
`facebook / paid_social` (389 users) both still show **$0.00**.

This matters because five-plus consecutive reports (07-30, 08-08, 08-10, 08-14, 08-15, 08-16,
08-17) have led with some version of "Meta paid social drives most of the traffic and produces no
revenue." Tonight is the first night where that claim is demonstrably **an attribution failure
rather than a performance fact**, at least for this one sale. Meta's own pixel fired `purchase` on
a specific retargeting campaign; GA4 recorded the same dollar amount on the same day with no source
at all. The same likely applies to the first pixel-confirmed purchase surfaced in the 08-16 report.

Treat the standing "$0 from Facebook" narrative as **unverified** until the attribution gap is
closed. It is not the same thing as "Meta doesn't convert."

---

## Meta Ads: spend up 30%, three brand-new campaigns, all conversions from retargeting

`meta-insights-2026-08-17.csv` (Aug 11–17) vs. the 08-17 report's `meta-insights-2026-08-16.csv`
(Aug 10–16). The two windows overlap on 6 of 7 days, so read the deltas as directional:

| Metric | Aug 10–16 (08-17 report) | Aug 11–17 (tonight) | Change |
|---|---|---|---|
| Campaigns | 9 | **12** | **+3** |
| Spend | $168.59 | **$219.64** | **+$51.05 (+30.3%)** |
| Clicks | 473 | 511 | +38 |
| Impressions | 11,392 | 11,924 | +532 |
| Pixel `purchase` actions | 1 | **2** | **+1** |

Only $10.36 of the +$51.05 is the three new campaigns. The pre-existing nine went from $168.59 to
$209.28 — **+$40.69 (+24%) on the same campaigns in one week.**

**Every conversion came from a retargeting campaign. Nothing else converted at all.**

| Bucket | Spend | Clicks | `add_to_cart` | `initiate_checkout` | `purchase` |
|---|---|---|---|---|---|
| Retargeting (3 campaigns) | **$82.06** | 184 | 7 | 13 | **2** |
| Everything else (9 campaigns) | **$137.58** | 327 | 2 | 6 | **0** |

Detail on the two that converted: "Tellus AfterDark: Singles Edition Retargeting" — $49.71, 137
clicks, 4 `add_to_cart`, 10 `initiate_checkout`, 1 `purchase`. "Good Good Campaign-Retargeting" —
$29.05, 38 clicks, 3 `add_to_cart`, 3 `initiate_checkout`, 1 `purchase`.

**Blended CPA on the converting campaigns is $39.38** ($78.76 / 2 purchases) against ticket revenue
of $27.49–$32.49 per transaction. At the ad level that is negative contribution margin before any
venue, platform or payment cost. This is a pricing/strategy call, not a site fix — see NEEDS TAYLOR
INPUT.

**Three new "Marion Court" campaigns launched and produced nothing measurable.** $10.36 combined
spend, 471 impressions, 16 clicks, 11 landing-page views, **0 `add_to_cart`, 0 `initiate_checkout`,
0 `purchase`**. This lines up exactly with the item "SparkDate: Real People, Real Drinks, Real
Court" in `download (11).csv`: **12 items viewed, 0 added to cart, 0 purchased, $0 revenue** —
still a perfect zero, unchanged in shape since the 08-15 report. Sample is tiny; the point is only
that nothing has converted yet, not that it can't.

**The "Sales-Obj" campaigns are buying video views, not clicks.** "Tellus…-Sales-Obj-Women": 255
`post_engagement`, 234 `video_view`, but only **20 `link_click`** at a **$0.672 CPC**. "Good Good
Campaign-Sale Obj Women": 223 `post_engagement`, 207 `video_view`, **16 `link_click`**, **$0.807
CPC**. Compare the plain "Good Good Campaign": 64 clicks at **$0.115 CPC** — roughly **7× cheaper
per click**. Whatever the Sales-Obj variants are optimizing toward, it is not site traffic.

---

## Do NOT act on Aug 17's engagement rate — this is the third instance of a known artifact

Tonight's export shows Aug 17 as simultaneously the **highest-traffic day in the entire 91-day
window** and the **lowest engagement day in the entire 91-day window**:

| Day | Active users | Sessions | Engaged sessions | Engagement rate |
|---|---|---|---|---|
| Aug 13 | 72 | 82 | 43 | 52.4% |
| Aug 14 | 63 | 77 | 50 | 64.9% |
| Aug 15 | 66 | 91 | 51 | 56.0% |
| Aug 16 | 41 | 63 | 42 | 66.7% |
| **Aug 17** | **93** (window max) | **130** (window max) | **3** | **2.3%** (window min) |

Taken at face value this reads as a catastrophic site failure on the busiest day. **It is almost
certainly not.** The same shape has now appeared three times, and both prior instances corrected
themselves upward once GA4 finished processing:

| Report | Last day of its export | Rate it reported | Rate that day shows tonight |
|---|---|---|---|
| `GA4_ANALYSIS_2026-08-14.md` | Aug 13 | **1.3%** | **52.4%** |
| 08-16 run-log entry | Aug 14 | **8.3%** | **64.9%** |
| **This report** | **Aug 17** | **2.3%** | *pending — expect 45–65%* |

The 08-14 report was formally corrected and its Finding 1 withdrawn for exactly this reason.
Engaged-session attribution (the `user_engagement` 10-second timer) lags `page_view` in GA4
processing, so the final day of any export systematically under-counts the numerator while the
denominator is already complete. **Recommendation: stop reporting the last day's engagement rate at
all.** See "proposed zero-risk fixes" below.

Underlying traffic on Aug 17 is real and worth noting on its own: 93 active users of which **71 were
paid** (`download (3).csv`, day `0090`) and 4 direct. Weekly cohort sizes (`download (19).csv`):
Aug 2–8 = 177 → Aug 9–15 = **484** → Aug 16–17 (2 days) = 111. The Aug 9–15 week is a genuine
all-time high, roughly 2.7× the week before it.

---

## Roughly 9% of "traffic" is datacenter noise

`download (18).csv` is the report titled "All Cities (check for bot traffic)" — so this is the
question it was built to answer. Sorting its 572 city rows:

| City | Active users | What it is |
|---|---|---|
| Prineville, OR | 49 | Facebook/Meta datacenter |
| Lulea, SE | 27 | Meta datacenter |
| Council Bluffs, IA | 23 | Google datacenter |
| Ashburn, VA | 21 | AWS us-east-1 |
| Dublin, IE | 21 | AWS/Azure/Google EU |
| Forest City, NC | 21 | Meta datacenter |
| Boardman, OR | 17 | AWS us-west-2 |
| **Total** | **179** | **9.1% of the 1,972 active users** |

Additionally **383 of the 572 city rows have exactly 1 active user** and `(not set)` accounts for
256. None of this is conclusive on its own — link-preview crawlers and VPN exits look identical to
bots in GA4 — but a 9% floor of datacenter traffic inflates every denominator in this analysis,
including engagement rate and every funnel completion percentage.

---

## Funnel and item conversion

**The three GA4 Explore funnels still disagree with each other and with reality.** Actual purchases
this window: **26** (`download (21).csv`, Key Events; `download (6).csv`, Revenue by Source).

| Explore report | Path | Purchases it claims |
|---|---|---|
| `download (20).csv` "Funnel exploration 1" | Session start 1,962 → Begin Checkout 59 (3.0%) → Purchase | **9** |
| `download (8).csv` "Checkout Events Tracking" | Begin Checkout 59 → Form Started 20 (33.9%) → Purchase | **7** |
| `download (12).csv` "Segment by Device" (5-step) | 1,962 → View product 154 → Cart 30 → Begin checkout 6 → Purchase | **1** |

None is within 65% of 26. This is now consistent across seven-plus reports (07-29 onward) and is a
GA4 Explore *configuration* problem, not a site bug. Treat the step-level percentages as unusable.

**Device split is worth one flag despite the bad funnels.** `download (12).csv`: mobile is 1,576 of
1,962 sessions (80.3%). Mobile add-to-cart → begin-checkout is **25 → 3 (12.0%)**; desktop is
**5 → 3 (60.0%)**. Same direction as the 08-17 report's observation. n is far too small to be
conclusive, and the funnel it comes from is one of the three broken ones — do not spend engineering
time on this alone, but it is the second consecutive report pointing the same way.

**Tellus AfterDark is getting heavy traffic and has stopped converting.** From `download (9).csv`
(items viewed by day) and `download (11).csv`:

- Views by day: Aug 14 = 38, Aug 15 = 53, Aug 16 = 14, Aug 17 = 22 → **127 views in four days**,
  out of 163 lifetime views for the item.
- Lifetime: 163 viewed → 17 added to cart (10.4%) → **6 purchased**, $137.94.
- The 08-17 report had it at 139 viewed / 6 purchased. **+24 views, +0 purchases.**
- It is also the most expensive item in the account: the four Tellus campaigns account for
  **$123.54 of the week's $219.64 spend (56.2%)**.

**`ads_conversion_About_Us_1` is still 97 of 189 key events (51.3%) and still worth $0.**
`generate_lead` is 66 key events, also $0. `purchase` (26) is the only key event carrying revenue
($688.75). Half of the "conversions" in this property are an imported Google Ads About-Us page
visit.

**Founders Mixer's telemetry gap is unchanged for the sixth consecutive report:** $192.93 across 8
purchases with **0 items viewed and 0 added to cart**. Grepping the fresh clone for "Founders"
across `public/`, `api/` and `lib/` returns nothing — it is event-data driven, not resolvable from
source.

**Item-vs-source revenue gap is stable and fully characterised.** Total revenue $688.75 (`download
(6).csv`) minus item revenue $628.75 (`download (11).csv`) = **$60.00**. At $2.50 `SERVICE_FEE`
× 26 transactions the clean figure would be $65.00, so it is **$5.00 short — exactly 2 transactions
missing the fee**. The 08-17 report found the identical $5.00 shortfall over 25 transactions. The
new Aug 17 sale *did* carry its fee. This is two specific legacy transactions, not a live bug, and
it is no longer growing.

---

## Channels, geography and tracking hygiene

**Lancaster massively out-earns Philadelphia per visitor** (`download (17).csv`):

| City | Active users | Key events | Revenue | Engagement rate | Revenue/user |
|---|---|---|---|---|---|
| Philadelphia | 330 | 5 | $27.49 | 32.8% | **$0.083** |
| Lancaster | 75 | 11 | $81.47 | 43.8% | **$1.086** |

**Lancaster converts at roughly 13× Philadelphia's revenue per active user** on 4.4× less traffic,
with better engagement. The GA4 property is named `sparkdate-philly` and the events actually being
sold (Tellus360, Good Good Things, Loxley's, Marion Court) are Lancaster-area venues. This is a
spend-allocation question, not a code question — NEEDS TAYLOR INPUT.

**Source-name capitalisation is still splitting Meta traffic into separate buckets.** `Facebook /
paid_social` (740 users) and `facebook / paid_social` (389 users) are the same channel in two rows;
`Facebook / paid` (22), `Facebook / organic` (11), `facebook / social` (38), `m.facebook.com /
referral` (35) and `facebook.com / referral` (22) fragment it further. Flagged in at least four
prior reports and still unfixed.

**Two junk source rows are worth a look:** `[object Object] / undefined` (10 active users) is a
JavaScript template-literal bug somewhere in a link builder, and `test / test` (1 user) is a test
tag that reached production.

**Ad destination URLs contain duplicated query strings.** From `download.csv` (landing page +
query string), real rows include:

```
/lp?eventId=8E9WZTat32JyoUjWuIE7&fbclid=IwcGRvZg...&fbclid=IwcGRvZg...
/lp?eventId=8E9WZTat32JyoUjWuIE7&fbclid=PAcGRvZg...?eventId=8E9WZTat32JyoUjWuIE7&fbclid=PAcGRvZg...
```

`fbclid` appears twice, and in the second shape there is a **second `?`** mid-URL — meaning the ad
destination already carried a full query string and Meta appended another. The functional impact is
limited (`URLSearchParams.get('eventId')` still returns the right value), but it shreds GA4's
landing-page dimension: `download.csv` has **837 distinct landing-page rows collapsing to just 2
real pages** — `/lp` (819 sessions) and `/events` (99 sessions).

Related, and worth Taylor's eyes because it is in our own code rather than Meta's: `public/lp.html`
lines 324–330 build the `carry` string by appending the **entire** inbound query string to the
outbound `/events?event=…` link whenever any `utm_` param is present — so `eventId` and `fbclid`
get copied onto the next hop too, fragmenting `/events` the same way. Deliberately **not changed**
by this run.

**Error events still firing:** `next_event_fetch_failed` = 60, `checkout_error` = 13 (of which 5
`card_incomplete`, 8 `(not set)` per `download (7).csv`), `targeted_event_not_found` = 6,
`targeted_event_missing_id` = 1.

**In-app browser instrumentation, post-PR-#165:** `in_app_browser_detected` = 1,018 against 3,020
`session_start` (**33.7% of sessions arrive in a webview**), `in_app_browser_escape_attempt` = 69,
`in_app_browser_checkout_blocked` = **12**, `in_app_browser_checkout_override` = 2,
`in_app_browser_copy_link` = 7, `in_app_browser_banner_dismissed` = 2. The 12 `blocked` events
cannot be dated from a cumulative 91-day count — PR #165 removed the block on Aug 13, so these are
plausibly all pre-Aug-13. **This report cannot confirm that either way**; it needs a day-segmented
GA4 view. The follow-up the code comment in `lp.html` explicitly asks for (compare `begin_checkout`
→ `purchase` for in-app vs. normal browsers) is not answerable from these exports, because no
export here segments by the `in_app_browser` event parameter.

---

## NEEDS TAYLOR INPUT (strategy / money / measurement — not for an agent to decide)

1. **Close the Meta→GA4 attribution gap before making any spend decision.** The $32.49 Aug 17 sale
   landed in GA4 as `(not set)` while Meta's pixel claimed it for Good Good Retargeting. Until this
   is fixed, "Facebook paid = $0" is unmeasured, not zero. Likely candidates: UTMs missing on ad
   destination URLs, or the duplicated-`fbclid` malformation above interfering. *Re-check in ~1
   week:* whether `(not set)` in Revenue by Source shrinks and `facebook / paid_social` becomes
   non-zero.
2. **Retargeting CPA of $39.38 exceeds ticket revenue of $27.49–$32.49.** Every conversion this
   week came from retargeting; every non-retargeting dollar ($137.58) produced zero. The question
   is whether to consolidate spend into retargeting despite the negative unit economics, raise
   ticket price, or accept the loss as audience-building. Pricing and budget = your call.
   *Re-check in ~1 week:* pixel `purchase` count and spend per campaign in the next
   `meta-insights-*.csv`.
3. **Spend is up 24% week-over-week on the existing nine campaigns with one incremental purchase.**
   Was that increase deliberate? If not, something is scaling budget automatically. *Re-check in ~1
   week:* total spend in the next Meta pull vs. $219.64.
4. **Philadelphia vs. Lancaster allocation.** 13× revenue per user in Lancaster, and every venue
   currently selling is Lancaster-area, yet Philadelphia draws 4.4× the traffic. Geo-targeting and
   which market to build is a business decision. *Re-check in ~1 week:* revenue/user by city in
   `download (17).csv`.
5. **The three Marion Court campaigns and the "Real People, Real Drinks, Real Court" item have
   produced 12 product views and zero add-to-carts.** Worth deciding whether to pause, re-creative,
   or give it more runway before spending more. *Re-check in ~1 week:* items added to cart for that
   item in `download (11).csv`.
6. **`ads_conversion_About_Us_1` should probably stop being a key event.** It is 51.3% of all key
   events and worth $0, which makes the "key events" metric meaningless for judging anything.
   Changing key-event config is a GA4 admin action with reporting-history consequences — your call.
7. **The prompt-library file still doesn't exist.** `sparkdate-nightly-claude-code-prompts.md` has
   been referenced by the automation and missing for six-plus consecutive runs; `TONIGHT_PROMPT.md`
   is stamped `2026-08-14` and the local PowerShell job skips its CLI run every night because of
   it. Either create the rotating library or point the task at `TONIGHT_PROMPT.md`. Right now there
   is nothing to rotate through and every run is Prompt 9.
8. **Founders Mixer's $192.93 / 8 purchases with zero funnel telemetry** — unchanged for six
   reports, unresolvable from source. Needs someone with Firestore/Eventbrite access.

## Proposed zero-risk fixes — NOT APPLIED, for a human to review

Listed as recommendations only. **This run changed no code.**

1. **Stop reporting the final day's engagement rate in these reports.** Three instances now
   (1.3% → 52.4%, 8.3% → 64.9%, and tonight's 2.3%) of the last day being a processing artifact
   that corrects to 45–65%. Cheapest fix is a standing note in `TONIGHT_PROMPT.md` telling future
   runs to exclude day *n* from engagement-rate trends. *Re-check in ~1 week:* what Aug 17 reads in
   the next export — this report predicts 45–65%.
2. **Normalise the `utm_source` capitalisation on Meta ad destination URLs** so `Facebook` and
   `facebook` stop being two buckets (740 + 389 users). This is a change in the ad platform's URL
   fields, not in this repo.
3. **Investigate `[object Object] / undefined` (10 users).** Some link builder is interpolating an
   object into a string. Not located in this run; it may live in the ad tooling or the
   UTM spreadsheet rather than in `public/`.
4. **Consider trimming `fbclid` from the `carry` string** in `public/lp.html:324-330` so the
   `/events` hop doesn't inherit the duplicated tracking params. Behavioural change to attribution
   carry-through, so it needs a human decision and a test — explicitly **not** applied here.
5. **Remove or rebuild the three GA4 Explore funnel reports.** They report 9, 7 and 1 purchases
   against an actual 26. Anyone reading them is being actively misled. GA4 UI action, no code.
6. **Remove the `test / test` source tag** from wherever it is being emitted (1 user, production).

## Caveats and method notes

- **Day-index mapping.** The exports label days `0000`–`0090` with no dates. I mapped `0090` =
  Aug 17 (last day of the stated `20260519-20260817` window; 91 days back from Aug 17 is May 19,
  which checks out). Under this mapping Aug 13 = 52.4% and Aug 14 = 64.9% engagement.
  **The 08-14 report's correction table maps 64.9% to Aug 13, one day off from mine.** One of the
  two mappings is wrong by a day. It does not change any conclusion here (the artifact pattern
  holds either way), but the exact date labels on daily figures should be treated as ±1 day until
  someone confirms against the GA4 UI.
- **Grand-total row offset.** In every daily-trend CSV the grand-total row is shifted one column
  right by an appended `Grand total` cell. I parsed the *following* row as the real series and
  verified it independently: Aug 17 engaged sessions 3 ÷ sessions 130 = 2.31%, matching the stated
  engagement rate exactly.
- **Revenue reconciliation.** The 18 daily revenue values in `download (4).csv` sum to $688.75,
  matching the grand total in `download (6).csv` and `download (21).csv`. Cumulative through Aug 15
  = $628.77 (matches the 08-16 report) and through Aug 16 = $656.26 (matches the 08-17 report). The
  daily series is trustworthy.
- **Meta windows overlap.** Aug 11–17 vs. Aug 10–16 share 6 of 7 days, so week-over-week deltas
  reflect one day in and one day out, not two independent weeks. The +3 campaign count and +30%
  spend are still real.
- **Sample sizes are small.** 26 lifetime transactions, 2 pixel purchases this week, 6 begin-checkout
  users in the device funnel. Nothing here supports a statistical claim; these are directional
  observations from counts.
- **Unusable export:** `download (19).csv` (cohort retention). Its `Cohort total users` and
  `Active users` columns are identical on every row, so all retention ratios compute to 1 (100%)
  or nonsense (e.g. "700%"). Retention is **not** analysed in this report — the export needs to be
  rebuilt in GA4. Only the weekly cohort *sizes* were used, which are readable.
- `data.pdf` (Path Exploration) was present but not analysed this run; the 08-17 report covered it
  and nothing in tonight's CSVs suggested a path-level question the deltas couldn't answer.
- **Prior-period baseline** came from `claude/ga4-analysis-2026-08-17`, fetched from origin. That
  branch is unmerged, so these numbers are not reproducible from `main` alone.
