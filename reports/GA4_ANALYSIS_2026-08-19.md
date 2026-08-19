# GA4 Analysis — 2026-08-19 (Nightly Automation, Cowork Session)

**This run made zero code changes.** It is a read-only analysis of the GA4 + Meta exports sitting
in `Business Plan/files/Night Tasks/`. The only file added to the repo is this report. Every
recommendation below is written for a human to apply or reject — nothing was applied.

## What was analyzed

Focus picked: **Prompt 9 (GA4 Analysis → Site Improvement Suggestions)**, per the top-level
`Night Tasks/sparkdate-nightly-claude-code-prompts.md`'s own "ROTATION SUGGESTION" default rule
("run it whenever a fresh GA4 export is sitting there"). A fresh export had landed, so this was
the clear pick — no rotation ambiguity tonight.

Files read (read-only; nothing moved, renamed or deleted):

- All 23 `download*.csv` files in `Business Plan/files/Night Tasks/`. 22 of them carry the window
  `20260519-20260818` in their own `#` metadata header; one (`download (16).csv`, "Checkout Error
  Breakdown") is a stale leftover at window `20260519-20260817` with a lower event count (13 vs
  17) than its fresh duplicate `download (17).csv` — excluded, `download (17).csv` used instead.
  **Report-name-to-file-number mapping was rebuilt from scratch this run** — it does not match
  the 08-18 report's mapping at all (e.g. that report's `download (11).csv` was Item Revenue;
  tonight's `download (11).csv` is Revenue by Source). This confirms the numbering is
  session-specific and must never be assumed stable across exports — every figure below was
  pulled from a file after reading its own `#` title line, not by position.
- `meta-insights-2026-08-18.csv` — Meta Marketing API campaign-level pull, window
  `20260812-20260818`, 12 campaign rows.
- `Night Tasks/logs/2026-08-19.log` — confirms the local PowerShell job pulled that Meta data at
  02:00:06–02:00:10 EDT tonight, then deliberately skipped its own CLI run because
  `TONIGHT_PROMPT.md` is stamped `2026-08-14` ("nothing fresh queued... this is normal; Cowork
  writes its reports directly as PRs now").
- Source in a fresh clone: `public/event.html`, `lib/pricing.js`, `api/purchase-ticket.js`.

**Prior period compared against:** `reports/GA4_ANALYSIS_2026-08-18.md`, which **is merged to
`main`** (unusual — most prior nightly reports live only on their own unmerged branch; this one
made it in, so it was readable directly from this clone without a separate branch fetch). That
report covered window `20260519-20260817` (through Aug 17), $688.75 / 26 transactions.

**Prompt-library fragmentation — still unresolved, now with a new wrinkle.** This automation's
task instructions hardcode `Business Plan\files\Night Tasks\sparkdate-nightly-claude-code-prompts.md`.
That file still does not exist at that path — only at the top-level `Night Tasks\` folder, exactly
as every entry back through 2026-08-10 has documented. This run read GA4 CSVs from
`Business Plan\files\Night Tasks\` (where the fresh export actually is) and is logging this run in
the top-level file (the one with ROTATION SUGGESTION/NIGHTLY RUN LOG/OPEN QUESTIONS), matching
established precedent. **New wrinkle worth flagging directly:** `Business Plan\files\Night
Tasks\TONIGHT_PROMPT.md` has grown its *own*, separate "NIGHTLY RUN LOG" section (entries for
08-14 through 08-18) that has drifted out of sync with the top-level file's log — the top-level
log's most recent entry is 08-17 (plus a same-day correction) and is **missing the entire 08-18
run**, which only appears in `TONIGHT_PROMPT.md`. Two logs, two folders, both live, both
incomplete on their own. This has been raised in five-plus prior entries; still unresolved.

---

## Headline: revenue $688.75 → $743.73 (+$54.98 / +2 transactions), and the Aug-17 attribution gap flagged last time appears to have closed itself

Total revenue by day (`Revenue Analysis-Revenue Trend`, 19 non-zero days in the window) sums
cleanly to **$743.73**, matching the grand total in both `Revenue Analysis-Revenue by Source`
(28 transactions, $743.73) and `Conversion Tracking-Key Events Breakdown` (`purchase` = 28 key
events, $743.73 revenue) — three independent tables agree. The new day in the window, Aug 18
(`Nth day` 0091), contributes exactly **$54.98**, which is precisely 2 × $27.49 — two new
transactions at the standard ticket-plus-fee price, nothing unusual about them individually.

**The more interesting finding is what happened to the *existing* Aug 17 transaction.** The 08-18
report's headline was that a $32.49 Meta-pixel-confirmed purchase (Good Good Campaign-Retargeting)
landed in GA4's Revenue by Source as `(not set)` instead of any Facebook bucket, and it flagged
"re-check in ~1 week: whether `(not set)` shrinks and `facebook / paid_social` becomes non-zero"
as NEEDS TAYLOR INPUT item #1. Tonight, one day later:

| Source (Revenue by Source) | Transactions | Revenue |
|---|---|---|
| `(not set)` | 1 | **$27.49** |
| `Facebook / paid_social` | 1 | **$32.49** |

$32.49 is the *only* $32.49 value anywhere in the 19-day revenue series (verified against the full
daily trend), so this is not a coincidental match — it is the same transaction. It has moved from
`(not set)` to `Facebook / paid_social` between the two reports. The `(not set)` row tonight is a
different, smaller transaction ($27.49, consistent with one of the two new Aug 18 sales landing
unattributed). This is corroborated independently by `Traffic & Events Monitoring-Campaign
Performance`, a full source/medium × revenue table that the 08-18 report's citations didn't
include: it shows **`Facebook / paid_social` (791 users) carrying $32.49 in revenue**, while
**`facebook / paid_social` (389 users, lowercase)** still carries $0. Same-day, this table also
shows **`Instagram / paid_social` (129 users) carrying $27.49** — a second Meta-attributed sale not
mentioned in any prior report.

**Read this cautiously, not triumphantly.** One transaction re-attributing overnight is consistent
with GA4's attribution model finishing a delayed pass, which is a good sign for measurement, but
it is a sample size of one and doesn't yet prove "Facebook converts fine now." Combined Meta paid
(`Facebook / paid_social` + `facebook / paid_social` + `Instagram / paid_social` + `Facebook /
paid` + `tiktok / paid_social` + `pinterest / paid_social` + `reddit / paid_social`) is **1,360 of
2,064 users (65.9%)** but only **$59.98 of $743.73 revenue (8.1%)**. The gap narrowed from
"unmeasured" to "measured and still small," which is progress but not resolution.

---

## The last-day engagement-rate artifact — 4th confirmed instance, and the 3rd instance's prediction landed almost exactly

The 08-18 report predicted that Aug 17's reported 2.3% engagement rate (the lowest in the 91-day
window, on the single highest-traffic day) was a processing artifact and would "expect 45–65%"
once GA4 finished counting engaged sessions for that day. Tonight's export, one day later:

| Day | Sessions | Engaged sessions | Engagement rate reported |
|---|---|---|---|
| Aug 17 (day 0090), per 08-18 report | 130 | 3 | **2.3%** |
| Aug 17 (day 0090), tonight | 147 | 102 | **69.4%** |
| **Aug 18 (day 0091), tonight — new last day** | 93 | 3 | **3.2%** |

The correction landed almost exactly on the predicted range (69.4%, just above the 45–65% band
called), the fourth time this exact shape has appeared (previously: 1.3%→52.4% for Aug 13 in the
08-14 report; 8.3%→64.9% for Aug 14 per the 08-16 log; 2.3%→69.4% for Aug 17 just confirmed).
**Aug 18 — tonight's new last day — shows the identical pattern (3 engaged sessions out of 93
total sessions) and should be expected to correct upward the same way once a future export
includes a day past it.** Internal cross-check: 102÷147 = 0.6939 and 3÷93 = 0.0323, both match the
CSV's own engagement-rate column exactly, so this isn't a parsing error on this end — GA4 itself
reports it this way while the final day is still processing.

---

## Item-level funnel: two unresolved zero-telemetry items, one new borderline anomaly

`Ecommerce purchases: Item name` (View→Cart→Revenue), lifetime totals:

| Item | Viewed | Added to cart | Purchased | Revenue |
|---|---|---|---|---|
| Tellus AfterDark: Singles Edition | 191 | 18 | 8 | $187.92 |
| Good Good Night @ Good Good Things | 81 | 15 | 2 | $59.98 |
| SparkDate: Round 2 — Summer Nights | 19 | 7 | **8** | $199.92 |
| SparkDate: Real People, Real Drinks, Real Court (Marion Court) | 14 | 0 | 0 | $0 |
| Sparkdate: The Loxley's Social | 14 | 5 | 2 | $37.98 |
| Founders Mixer | 0 | 0 | 8 | $192.93 |

**Founders Mixer is unchanged** — $192.93 across 8 purchases with zero `view_item`/`add_to_cart`
telemetry, now flagged in at least seven consecutive reports (this repo's own run log dates it
back to being noted since 07-29). Grepping the fresh clone for "Founders" across `public/`, `api/`
and `lib/` again returns nothing — this is event-data driven, not something visible from source,
and remains unresolvable without Firestore/Eventbrite access.

**Marion Court is still a perfect zero** — 14 people have now viewed "SparkDate: Real People, Real
Drinks, Real Court" (up from 12 in the 08-18 report), and precisely none have added it to cart or
purchased it. Growing interest with zero conversion is a different shape than Founders Mixer's
"no telemetry at all" — this one has telemetry, it's just all zero past step 1.

**New: "SparkDate: Round 2 — Summer Nights" shows more purchases (8) than add-to-carts (7)** on
only 19 views — a completion rate that doesn't make funnel sense (you can't purchase more items
than were added to cart, in a well-instrumented event stream). Checked `public/event.html` for a
concrete hypothesis rather than guessing: `add_to_cart` fires from a single guarded call site
(`addToCartTracked` boolean, set once per page load, gated on `eventData` being ready — line
~1481), while `view_item` fires separately (line ~1102) and the actual purchase is driven by a
third, independent code path in the checkout handler. If a visitor reaches purchase through a path
that never trips the `add_to_cart` gate — e.g., a page state where `eventData` loads after the
button interaction that would normally set the flag — GA4 would record a purchase with no
preceding cart event for that item. This is a plausible, falsifiable explanation, not a confirmed
one; it would need session-level GA4 debugging (DebugView on a live test purchase) to confirm,
which is outside what this export can show. Flagged as NEEDS TAYLOR INPUT rather than guessed at
further or "fixed" blind.

**Item-vs-source revenue gap is unchanged in substance.** Total revenue $743.73 minus item revenue
$678.73 (`Revenue Analysis-Revenue by Item`) = $65.00. At the known `SERVICE_FEE` of $2.50 ×28
transactions, the clean figure would be $70.00 — a **$5.00 shortfall, exactly 2 transactions**
short of the fee, identical in size to the 08-18 report's finding over 26 transactions. Both new
Aug 18 transactions carried their fee correctly; this is the same two legacy transactions as
before, not a growing or live problem. `SERVICE_FEE` reconfirmed at `$2.50` and in sync across
`public/event.html:984`, `public/events.html:1559`, `lib/pricing.js:19` (`SERVICE_FEE_CENTS =
250`), and `api/purchase-ticket.js:639`.

---

## The three GA4 Explore funnels still disagree with each other and with reality — now an 8+ report pattern

Real purchases this window: **28** (agreed by three independent tables, see headline above).

| Explore report | Path | Purchases it claims |
|---|---|---|
| `Checkout Events Tracking-Funnel exploration 1` | Begin Checkout 65 → Form Started 21 → Purchase | **9** |
| `Funnel-Funnel exploration 1` | Session start 2,061 → Begin Checkout 65 → Purchase | **11** |
| `Segment by Device-Abandonment rate` (5-step) | 2,061 → View product 177 → Cart 33 → Begin checkout 5 → Purchase | **2** |

None within 65% of 28, continuing the same pattern documented in every report since 07-29. This
remains a GA4 Explore *configuration* problem (funnel step definitions not matching the real event
schema), not a site bug — step-level completion/abandonment percentages from these three reports
should keep being treated as unusable until someone rebuilds them in the GA4 UI.

**Mobile vs. desktop drop-off, from the same broken-but-directionally-consistent device funnel:**
mobile add-to-cart → begin-checkout is 28 → 2 (7.1%); desktop is 5 → 3 (60.0%). This is the same
direction the 08-18 report flagged (mobile 25→3, 12.0% vs. desktop 5→3, 60.0%) — now a third
consecutive report pointing the same way, on small samples each time. Still not enough n to justify
engineering time alone, but three-for-three on direction is worth noting rather than dismissing.

---

## Checkout errors ticked up: 13 → 17 in one day

`Checkout Error Breakdown` (fresh, `download (17).csv`, 17 total) vs. its own stale same-report
duplicate one day earlier (`download (16).csv`, window ending Aug 17, 13 total) isolates exactly
what changed on Aug 18: **`(not set)` held flat at 8, `card_incomplete` rose 5→8 (+3), and a
brand-new `card_declined` (1) appeared for the first time in this window.** Total checkout errors
(17) roughly matches the last-28-days event count for `checkout_error` (also 17), suggesting nearly
all checkout errors in this property's history happened within the last 28 days.

---

## Meta Ads: spend +21%, CPC +23%, a third campaign now shows a purchase action

`meta-insights-2026-08-18.csv` (Aug 12–18, 12 campaigns) vs. the 08-18 report's `meta-insights-
2026-08-17.csv` (Aug 11–17, 12 campaigns). Windows overlap on 6 of 7 days, so treat deltas as
directional, not two independent weeks:

| Metric | Aug 11–17 (08-18 report) | Aug 12–18 (tonight) | Change |
|---|---|---|---|
| Campaigns | 12 | 12 | — |
| Spend | $219.64 | **$266.55** | **+$46.91 (+21.4%)** |
| Clicks | 511 | 505 | −6 |
| Impressions | 11,924 | 11,820 | −104 |
| Blended CPC | $0.4298 | **$0.5278** | **+22.8%** |

Spend rising while clicks fall pushed CPC up nearly a quarter in one week — worth a direct look at
whether bids or audience targeting changed, not something visible from this export alone.

**A third campaign now carries a `purchase` action.** Previously "every conversion came from
retargeting; nothing else converted at all" (08-18 report, 2 purchases, both retargeting). Tonight,
`purchase=1` appears on: "Tellus AfterDark: Singles Edition Retargeting" ($56.21 spend, was $49.71),
"Good Good Campaign-Retargeting" ($36.22 spend, was $29.05) — both retargeting, consistent with
before — **and, new, "Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All Genders"
($37.30 spend), a non-retargeting campaign.** Because the two 7-day windows overlap on 6 days, this
can't be cleanly separated into "a new conversion" vs. "an existing one Meta re-attributed to a
different campaign" without event-level timestamps, which this export doesn't have — flagged as
worth watching rather than asserted as a new fact. If it holds up in next week's pull as a distinct
non-retargeting conversion, that would be the first evidence retargeting-only conversion isn't a
hard rule.

---

## Datacenter/bot traffic: still ~9% of active users

`Philly vs Lancaster-All Cities (check for bot traffic)`, 2,061 total active users, top rows:
Philadelphia 349, `(not set)` 267, Lancaster 79, New York 63, then known ad-platform/cloud
datacenter cities: Prineville OR 51 (Meta), Lulea SE 29 (Meta), Council Bluffs IA 23 (Google),
Forest City NC 23 (Meta), Dublin IE 22 (AWS/Azure/Google EU), Ashburn VA 21 (AWS us-east-1),
Boardman OR 20 (AWS us-west-2) — **189 users, 9.2% of the total**, consistent with the ~9.1% found
in the 08-18 report. 396 of the roughly 590 city rows have exactly one active user each — still a
long tail that's circumstantially bot-like but not provable from geography alone.

---

## Ad-destination URL duplication is worse than previously quantified

The 08-18 report flagged `fbclid` appearing twice in some ad-destination URLs and estimated "837
distinct landing-page rows collapsing to just 2 real pages" from a qualitative read. Tonight's
`Traffic & Events Monitoring-Free form 4` (912 lines, landing page + query string, paid traffic
only) allows a precise count: **891 of 906 data rows (98.3%) contain a duplicated `fbclid`
parameter**, and several of those also show a literal second `?` mid-URL (e.g.
`/lp?eventId=X&fbclid=Y?eventId=X&fbclid=Y`), meaning the ad destination already carried a full
query string before Meta appended another one on top. `URLSearchParams.get('eventId')` still
returns the right value regardless, so this isn't breaking checkout — but it is destroying the
landing-page dimension in every GA4 report that groups by URL, this one included. Still not
changed by this run — see `public/lp.html:324-330`'s `carry`-string logic, previously identified as
copying the entire inbound query string (including `fbclid`) onto the next hop, which is a
plausible source of the compounding duplication.

---

## Channel fragmentation and small tracking-hygiene items — unchanged, still open

- `Facebook / paid_social` (791) vs. `facebook / paid_social` (389, lowercase) are still two
  buckets for one channel, joined by `Facebook / paid` (22), `Facebook / organic` (14), `facebook /
  social` (39), `facebook.com / referral` (23), `m.facebook.com / referral` (36),
  `eventsmanager.facebook.com / referral` (1), `l.facebook.com / referral` (1) — flagged in at
  least five prior reports, still unfixed (ad-platform URL config, not a code fix).
- `[object Object] / undefined` — still exactly **10 users**, unchanged since the 08-18 report.
  Some link builder somewhere is interpolating a JS object into a string; not located in `public/`,
  `api/`, or `lib/` in this run either.
- `test / test` — still 1 user, still in production data.
- `googleads / paid` (56 users, 51 key events, **$0 revenue**) and every other Google Ads variant
  combined (111 users, 92 key events, **$0 revenue** across all of them) reconfirm the standing
  finding that most Google Ads "key events" are the worthless `ads_conversion_About_Us_1` import,
  not real conversions.
- `ads_conversion_About_Us_1` held flat at **97 key events** while `generate_lead` grew 66→72 and
  `purchase` grew 26→28 — i.e., the meaningless metric contributed zero new "conversions" in the
  last day while the two metrics that matter both grew. Its share of total key events accordingly
  shrank slightly, 51.3%→49.2% (97 of 197 vs. 97 of 189).

## Philadelphia vs. Lancaster — gap wider this report, small base

`Philly vs Lancaster (filtered)` (a scoped comparison view, not sitewide totals — sitewide revenue
is $743.73, this view totals $136.45): Philadelphia 349 users / 5 key events / $27.49 revenue /
33.2% engagement vs. Lancaster 79 users / 13 key events / $108.96 revenue / 52.3% engagement.
Revenue per active user: Philadelphia $0.079, Lancaster $1.379 — **roughly 17.5×**, up from the
08-18 report's ~13×. Both figures rest on a single-digit-to-low-double-digit number of Lancaster
transactions, so treat the exact multiple as noisy; the direction (Lancaster converts far better
per visitor, on far less traffic, and every currently-selling venue is Lancaster-area) has now
repeated across enough reports to be a real pattern rather than noise. Spend allocation is a
business call — see NEEDS TAYLOR INPUT.

---

## NEEDS TAYLOR INPUT (strategy / money / measurement — not for an agent to decide)

1. **The Meta attribution gap looks like it's closing, on one data point.** The Aug 17 sale moved
   from `(not set)` to `Facebook / paid_social` overnight, and Instagram/paid_social now shows its
   own $27.49. Don't treat "Facebook paid = $0" as settled either way yet — it's gone from
   unmeasured to measured-and-small (8.1% of revenue from 65.9% of traffic). *Re-check in ~1 week:*
   whether `(not set)` stays small and combined Meta-paid revenue share moves off 8%.
2. **Meta spend is up 21% week-over-week with CPC up 23%, on the same 12 campaigns.** Was this
   deliberate, or is something scaling budget/bids on its own? *Re-check in ~1 week:* total spend
   vs. $266.55 and CPC vs. $0.528 in the next `meta-insights-*.csv`.
3. **A non-retargeting Tellus campaign shows its first purchase action.** Can't be confirmed as a
   genuinely new conversion vs. a re-attributed existing one given the overlapping 7-day windows.
   *Re-check in ~1 week:* whether "Tellus AfterDark: Singles Edition @ Tellus360 Campaign -All
   Genders" still shows a purchase once this week's data rolls out of the trailing window.
4. **Philadelphia vs. Lancaster allocation, now ~17.5× revenue-per-user in Lancaster's favor** on a
   still-small transaction base. Geo-targeting and market prioritization is a business decision, not
   a code one. *Re-check in ~1 week:* revenue/user by city in the next `Philly vs Lancaster` export.
5. **"SparkDate: Round 2 — Summer Nights" shows 8 purchases against only 7 add-to-carts** — a
   funnel-order impossibility that suggests a gap in `add_to_cart` firing for at least one purchase
   path on that item. A specific, falsifiable hypothesis is in the item-funnel section above (the
   `addToCartTracked` gate in `public/event.html` potentially not tripping on every path to
   purchase), but confirming it needs GA4 DebugView on a live test transaction, not more CSV
   reading. Flagging for someone with checkout access rather than guessing further.
6. **`ads_conversion_About_Us_1` should probably stop being a key event** — same recommendation as
   the 08-18 report, still true: it's 49.2% of all key events and worth $0, diluting the "key
   events" metric. GA4 admin action with reporting-history consequences — your call, not applied.
7. **Founders Mixer's $192.93 / 8 purchases with zero funnel telemetry** — unchanged for a
   seventh-plus consecutive report, unresolvable from source. Needs Firestore/Eventbrite access.
8. **Prompt-library fragmentation, restated with a new detail:** `Business Plan\files\Night
   Tasks\TONIGHT_PROMPT.md` now maintains its own separate run log that's missing the 08-18 entry
   the top-level file's log also doesn't have recorded — two logs, both incomplete, both live.
   Worth Taylor picking one canonical Night-Tasks location and one canonical log before this
   recurs an eighth time.

## Proposed zero-risk fixes — NOT APPLIED, for a human to review

1. **Stop reporting the final day's engagement rate in these reports**, or clearly asterisk it as
   provisional. Four instances now (1.3%→52.4%, 8.3%→64.9%, 2.3%→69.4%, and tonight's fresh 3.2%
   for Aug 18) of the last day being a processing artifact that corrects upward once a later export
   includes another day past it. *Re-check in ~1 week:* what Aug 18 reads in the next export — this
   report predicts 45–70% based on the three prior instances' range.
2. **Normalize `utm_source` capitalization on Meta ad destination URLs** (`Facebook` vs.
   `facebook`, 791 vs. 389 users). Ad-platform URL field change, not a repo change.
3. **Investigate the `fbclid` duplication at its likely source**, `public/lp.html:324-330`'s
   `carry` string, which appends the full inbound query string (including `fbclid` and `eventId`)
   onto the outbound `/events` link whenever a `utm_` param is present. Now quantified at 98.3% of
   paid landing-page rows (891/906) rather than the prior qualitative estimate. Behavioral change to
   attribution carry-through — needs a human decision and a test, explicitly not applied here.
4. **Remove or rebuild the three GA4 Explore funnel reports** (claiming 9, 11, and 2 purchases
   against a real 28). GA4 UI action, no code.
5. **Remove the `test / test` source tag** from production (1 user, unchanged since at least the
   08-18 report).
6. **Locate and fix the `[object Object] / undefined` source** (10 users, unchanged). Likely a link
   builder outside `public/`/`api/`/`lib/` — not found in this repo in two consecutive checks.

## Caveats and method notes

- **File numbering is not stable across export sessions** (see "What was analyzed" above) — every
  number cited in this report was verified against that file's own `# ` title line, not assumed
  from a prior report's mapping. This cost extra read time tonight but avoided misattributing a
  metric to the wrong report type.
- **Meta windows overlap.** Aug 12–18 vs. Aug 11–17 share 6 of 7 days, so week-over-week deltas
  reflect one day in and one day out, not two independent weeks. The campaign-level "third
  converting campaign" finding is flagged as unconfirmed for exactly this reason.
- **Sample sizes are small throughout.** 28 lifetime transactions, 3 Meta pixel-attributed purchase
  actions this week, 5 users reaching "Begin checkout" in the device-segmented funnel. Directional
  observations from counts, not statistically defensible claims.
- **Revenue reconciliation:** the 19 daily revenue values in `Revenue Analysis-Revenue Trend` sum
  to $743.73, matching `Revenue by Source` and `Key Events Breakdown` exactly. Cumulative through
  Aug 17 = $688.75, matching the merged 08-18 report precisely. The daily series is trustworthy.
- **`download (16).csv` (stale Checkout Error Breakdown, window ending Aug 17) was read only to
  diff against its fresh duplicate `download (17).csv` and was otherwise excluded**, per the same
  handling the 07-28 report established for a stale duplicate file.
- `data.pdf` (Path Exploration) was present in the folder but not analyzed this run — nothing in
  tonight's CSVs raised a path-level question the other tables couldn't answer, matching the 08-18
  report's same call.
- This report was written from a clone where `reports/GA4_ANALYSIS_2026-08-18.md` was already
  present on `main` (merged), which is why a direct branch-fetch wasn't needed for the prior-period
  baseline this time — worth noting since most prior nightly branches are still unmerged.
