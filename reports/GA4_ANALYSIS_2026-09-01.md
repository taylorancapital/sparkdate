# GA4 analysis — 2026-09-01

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something that
was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` in the Cowork sandbox
reads **"Last updated: 2026-08-26."** The newest report in `reports/` on `main`
is `GA4_ANALYSIS_2026-08-30.md`, and an unmerged branch carries
`GA4_ANALYSIS_2026-08-31.md`. The stamp is therefore **older than the newest
report and my copy may have forked.** I checked its §3b settled list against
everything I raise below and re-ask nothing from it. This is the **third
consecutive report** to spend a paragraph on that stamp; see the zero-risk list.

**Data.** GA4 Data API, property 536859339, window `20260519-20260901`, **pulled
2026-09-01 06:00 UTC**, read from each file's own `#` header rather than the
filename or the file mtime. Meta: `meta-insights-2026-08-31.csv`, window
`20260825-20260831`, 8 campaigns. The 38 hand-exported `download*.csv` are still
`20260519-20260827` and were correctly skipped as stale. Both nightly run logs
checked (`sparkdate-nightly-claude-code-prompts.md` and `TONIGHT_PROMPT.md`);
the last four nights were all Prompt 9, and GA4 is the right pick again tonight
for the reason in §C — this is the first pull that contains 14 table types that
have never been exported before.

---

## A. HEADLINE — last night's 08-30 tail artifact resolved completely, and reproduced exactly on 08-31. It is a law, not an incident.

The 08-31 report's headline was that 2026-08-30 "reads as the second-busiest day
in the window and is not one": the by-source table over-summed it by +90
(+41.1%), `(not set)` was 105 of 309 source rows against 1–2 on every other day,
and engagement read 1 session in 219. Tonight is the control, and it is clean on
both sides.

**The 08-30 bulge drained to zero.**

| 2026-08-30 | 08-31 pull | 09-01 pull |
|---|---|---|
| sessions (daily-trend) | 219 | 220 |
| engaged sessions | **1 (0.46%)** | **78 (35.5%)** |
| by-source sum vs trend | **+90 (+41.1%)** | **+0 (exact)** |
| `(not set)` sessions that day | **105** | **0** |

**And the identical artifact is now sitting on 08-31 instead.** Tonight
08-31 reads 166 sessions in `daily-trend` while `daily-by-source` sums to 234 —
**+68, or +41.0%** — with **78** of those in `(not set)`. The over-sum
percentage on the final day is **+41.1% one night and +41.0% the next**. That is
not noise; it is a stable property of the export.

**The control is decisive.** I summed the by-source table against `daily-trend`
for all **95 days** in the window. **94 of 95 sum exactly. The one exception is
the final day.** Every day from 08-24 to 08-30 sums to the unit, and `(not set)`
is 0 or 1 on all of them.

**What this means practically.** Session-source attribution backfills over
roughly 24 hours. Read on the day of the pull, the final day both *over*-sums
when you aggregate by source and is *wrong by absence* on the source itself —
~41% of its rows have no source yet. One day later the same day is perfect.

**Consequence: `ANALYTICS_METHOD.md` §1 needs a third tail failure.** §1a is the
engagement lag and §1b is the proportional session undercount. This is neither —
it is an attribution backfill that makes a summed by-source table read ~41% high
on the final day only, and it clears completely within 24h. The remedy is
simply **drop the final day from any by-source table**, the same rule §1 already
gives for engagement. Written up in the zero-risk list; not applied.

---

## B. The 06:00 UTC pull captures about 2 of the final day's 24 hours. Sharpest measurement of §1b yet.

`ANALYTICS_METHOD.md` §1b records pulls at 13:12 (about half the day, 54
sessions) and 23:19 (nearly all of it, 172 sessions) for the same date. Tonight
gives a far more extreme point on the same curve.

**2026-08-31 read 9 sessions in last night's export. It reads 166 tonight — an
18.4x correction.** The pull runs at **06:00 UTC, which is 02:00
America/New_York**, and the property reports in America/New_York (PR #370 made
that explicit). So the final day of every export is roughly **two hours of a
twenty-four hour day, about 8.3%**.

Tonight's own final row is `20260901, 1 session` — one session, for the same
reason.

This is the measured argument behind last night's ask to move the pull; it is
re-raised below as a **2nd ask** with this number attached, and with an
important refinement: **moving the pull later shrinks the problem but does not
remove it**, because the export always ends on the pull date. Dropping the final
day is what actually fixes it. Moving the pull is worth doing anyway so the
*second*-to-last day is fully settled by pull time.

Fifth and sixth consecutive confirmations of §1a in the same table: 08-30 went
0.46% → 35.5% (a 35-point swing), and 08-31 currently reads 2 engaged in 166
(1.2%) and should be ignored.

---

## C. Fourteen table types were exported for the first time tonight (PR #371). This is why GA4 is the pick for a fifth night.

`scripts/fetch-ga4-tables.js` went from 12 tables to 27 in
**`9282127`, 2026-08-31, PR #371** — "The Explorations were never unreachable."
The 08-31 06:00 UTC pull did not contain them; tonight's does. First-ever
exports:

`by-device`, `os-browser`, `key-events`, `key-events-daily`,
`key-events-by-source`, `revenue-daily`, `items-daily`, `webview-by-event`,
`checkout-errors`, `utm-content`, `funnel-by-device`, `funnel-by-channel`,
`funnel-webview-vs-normal`, `funnel-waitlist-sequence`, plus `cohort-retention`.

Sections D–J are all first readings. Everything in them should be treated as a
**baseline to trend against**, not as a movement.

---

## D. The new webview funnel is the biggest number of the night — and it carries a series break nobody has written down.

The naive read of `ga4-api-funnel-webview-vs-normal`:

| step | A — webview | B — normal browser |
|---|---|---|
| session_start | 802 | 282 |
| view_item | **30 (3.74%)** | **101 (35.82%)** |
| add_to_cart | 5 | 24 |
| begin_checkout | 4 | 9 |
| purchase | **0** | **4** |

A 9.6x gap at `view_item` and zero purchases from 802 webview users looks
devastating. **Two things have to be said before anyone acts on it.**

**1. It is not a 95-day measurement. It is a 10-day one.** The segments filter
on `customEvent:in_app_browser`, and that parameter only began riding on *every*
event in **`dcd8528`, 2026-08-23, PR #265 — "Tag in_app_browser on every event,
not five of them."** Before that it rode on five events only. So the `(not set)`
bucket is overwhelmingly pre-08-23 traffic, and the true/false split is
effectively **2026-08-23 onward**.

The arithmetic agrees: the two segments hold **802 + 282 = 1,084 active users**,
against **1,371 sessions from 08-23 to 09-01** and 4,761 sessions in the full
window. A whole-window claim built on these segments would be wrong by a factor
of four in exposure.

**2. The purchase end of it rests on four purchases.** From 08-23 onward the
property recorded **7 transactions** (`revenue-daily`: 08-24, 08-25, 08-26 x2,
08-27, 08-29 x2). Four of them completed the ordered funnel path in the normal
segment. **"Zero purchases from 802 webview users" is really "zero from ~9 days
of webview traffic, against four."** Direction only. Do not build a percentage
on it, and do not compare it to anything before 08-23.

**What IS solid here** is the top of the funnel, where the counts are large: 30
of 802 versus 101 of 282 is not a small-sample artifact. And per
`ANALYTICS_METHOD.md` §4, `view_item` does not fire on `/lp` — so this measures
**click-through off the landing page**, not page quality or checkout. Webview
visitors are not tapping through. Per §6, discrete event counts like this are
the right instrument inside webviews (engagement *time* is not), so the gap is
real even if the purchase tail cannot carry weight yet.

**This series break belongs in `ANALYTICS_METHOD.md` §10** alongside 08-21,
08-22, 08-25 and 08-28. It is exactly the shape of trap that section exists for.
Written up below; not applied.

---

## E. `os-browser` corroborates the webview gap over the WHOLE window, and is not subject to the #265 date problem.

`operatingSystem` and `browser` are GA4 built-ins, collected since day one. So
this table can say what the segment table cannot.

| OS / browser | sessions | engaged | key events |
|---|---|---|---|
| iOS / Safari | 2,341 | 702 (30.0%) | 39 |
| Android / Chrome | 860 | 415 (48.3%) | 60 |
| Windows / Chrome | 844 | 537 (63.6%) | 36 |
| **Android / Android Webview** | **215** | 69 (32.1%) | **0** |
| **iOS / Safari (in-app)** | **91** | 62 (68.1%) | **1** |

**306 sessions in an identifiable in-app browser produced 1 key event between
them.** That is an independent, whole-window corroboration of §D's direction
using a completely different dimension. n = 306 sessions and 1 key event — the
absence is the finding; do not turn it into a rate.

Caveat that cuts the other way: these two rows are only the webviews GA4 can
*name*. Meta's iOS webview frequently reports as plain `iOS / Safari`, which is
why that row is 2,341 sessions with 39 key events while `Windows / Chrome`
manages 36 key events on a third of the sessions. The real in-app population is
larger than 306.

One row to be suspicious of: **`(not set)` / Chrome — 106 sessions, 79 key
events (74.5%)**. Nothing human converts at 74.5%. It is almost certainly the
same historical `ads_conversion_About_Us_1` traffic described in §K; flagged, not
interpreted.

---

## F. Checkout errors, first ever exported: 25 events, 14 users — and the top bucket is not a decline.

| category | events | users |
|---|---|---|
| `card_incomplete` | **15** | **7** |
| `(not set)` | 8 | 7 |
| `card_declined` | 1 | 1 |
| `other` | 1 | 1 |

Read against `public/event.html:2221-2245` and `public/events.html:2574-2580`,
which classify the caught error: **`card_incomplete` is not a payment failure.**
It is the branch for `msg.includes('incomplete')` — Stripe Elements reporting
that the card field was not fully filled in when Pay was pressed. Seven people
hit it fifteen times, so they retried an average of 2.1 times.

Denominator: `checkout_form_started` = **254 events / 155 users**. So **14 of 155
form-starters (9.0%) hit an error and 7 (4.5%) hit `card_incomplete`** — against
**34 users who purchased** in the same window. Card *declines* are 1. The
checkout is not losing people to their banks; it is losing a few to the form.

Two boundaries to state. `checkout_error` shipped **2026-07-03 (#56)** and the
category buckets **2026-07-05 (#63)** for `/event`, **2026-08-05 (#148)** for
`/events` — so the 25 events cover about 61 days, not 95, and the `(not set)`
category is most likely pre-bucketing firings rather than a live instrumentation
gap. I did not verify that to the day. Also: `checkout_error` was flat at
**25 events / 14 users across both the 08-31 and 09-01 pulls** — nothing new
fired in the last two days.

n = 7 users. This is a real, specific, cheap-to-check signal, but it is seven
people. It goes in NEEDS TAYLOR INPUT as a question, not a fix.

---

## G. Funnel by channel: Organic Social is the worst click-through of any channel with volume.

`session_start → view_item → add_to_cart → begin_checkout → purchase`, whole
window. **The `begin_checkout` step mixes two definitions** (§3, redefined
2026-08-21) and the whole window spans it, so treat steps 4 and 5 as indicative
only. Steps 1→2→3 are clean.

| channel | sessions | view_item | rate | cart | checkout | purchase |
|---|---|---|---|---|---|---|
| Paid Social | 2,479 | 207 | 8.35% | 17 | 7 | 2 |
| Direct | 444 | 58 | **13.06%** | 15 | 4 | 1 |
| Unassigned | 136 | 38 | 27.94% | 13 | 3 | 1 |
| **Organic Social** | **136** | **2** | **1.47%** | 1 | 0 | 0 |
| Paid Other | 104 | 5 | 4.81% | 1 | 1 | 0 |
| Organic Search | 73 | 13 | 17.81% | 8 | 1 | 1 |
| Email | 55 | 17 | 30.91% | 2 | 0 | 0 |
| Referral | 11 | 0 | 0% | – | – | – |
| Paid Search | 9 | 0 | 0% | – | – | – |
| **property** | **3,451** | **340** | **9.85%** | 57 | 16 | 5 |

**Organic Social converts to `view_item` at 1.47% — 5.7x worse than paid social
and 8.9x worse than Direct**, on 136 sessions, which is enough volume to mean
something at that step. Since `view_item` does not fire on `/lp`, this says
organic-social visitors are landing and not tapping through. That is the one
channel-level number here with adequate sample and no series break in it.

By device (same funnel): mobile 2,859 → 282 → 47 → 11 → 4; desktop 576 → 58 →
10 → 5 → 1. **Click-through is identical (9.86% mobile, 10.07% desktop)** — the
mobile/desktop split is not where the funnel leaks. Tablet: 16 sessions, 0
view_item.

`funnel-waitlist-sequence` (also new): of **340** users who fired `view_item`,
**15 (4.4%)** later fired `generate_lead`. Consistent with the settled
answer to open question 1 (the waitlist rescues rather than cannibalises); it
does not reopen it.

---

## H. `/event` earns 24x per session what `/lp` does, and Eventbrite still sends 41% of its traffic to pages that produce nothing.

| landing page | sessions | share | key events | revenue | $/session |
|---|---|---|---|---|---|
| `/lp` | 2,744 | 57.6% | 121 | $278.90 | **$0.102** |
| `/event` | 163 | 3.4% | 33 | **$394.35** | **$2.42** |
| `/events` | 476 | 10.0% | 21 | $169.94 | $0.357 |
| `/` | 504 | 10.6% | 22 | $162.95 | $0.323 |
| `/admin` | 310 | 6.5% | 12 | $0 | — |

`/event` is **3.4% of sessions and 39.2% of GA4 revenue.** (GA4 revenue is
own-site only — §7 — so this is funnel shape, not the business's money.)

The Eventbrite split, which last night raised as a new ask, is essentially
unchanged and therefore looks like a static link rather than drift:

| eventbrite / listing lands on | sessions | key events | revenue |
|---|---|---|---|
| `/event` | 88 | 22 | **$290.39** |
| `/events` | **48** | **0** | **$0** |
| `/matches` | **22** | **0** | **$0** |
| `/`, `(not set)`, `/profile` | 12 | 1 | $0 |

**70 of 170 Eventbrite sessions (41.2%) land somewhere that has produced zero
key events and zero revenue**, while the 88 that reach `/event` produced 11 of
the property's 37 transactions and 28.9% of its GA4 revenue at **$3.30/session —
32x what `Facebook / paid_social` returns per session ($97.47 over 1,592 = $0.061)**,
on no paid budget at all. Last night measured 47 sessions on `/events`; tonight
48. `grep -rn "utm_source=eventbrite"` still returns nothing in the repo, so the
link lives in Eventbrite's own listing and cannot be fixed from here.

---

## I. Promotion CTR: the 08-22 CTA move replicates on an independent second window.

Cumulative CTR remains impossible to read (clicks predate `view_promotion`,
which shipped **2026-08-28, #310**), so the two-pull differencing method
established last night is the valid instrument — and §A's control licenses it
again, since every day at or before 08-30 now sums exactly.

Delta, 08-31 pull → 09-01 pull:

| promotion | views | clicks | CTR of the delta |
|---|---|---|---|
| `lp_get_tickets` | +93 | +7 | 7.5% |
| `lp_sticky_bar` | +11 | +2 | 18.2% |
| `get_tickets_block` | +12 | +0 | 0% |
| **total** | **+126** | **+9** | |

The +9 reconciles **exactly** with the events table's `select_promotion`
100 → 109. Independent arithmetic, same answer.

**The replication that matters:** the main CTA took **93 of the 104 `/lp`
promotion impressions in this window — 89.4%**. Last night's independent window
read **89.2%**. Two disjoint windows, two decimal places apart. Reading
`public/lp.html:1113-1139` (one `IntersectionObserver`, the two promotions
mutually exclusive by construction), that is the 08-22 CTA move working: the
main button is on screen for ~89% of `/lp` impressions and the sticky bar only
has to step in on ~11%.

The sticky bar again clicked at a higher rate than the main button off a ninth
of the impressions (2 of 11 vs 7 of 93). **n = 2 and n = 7 — direction only.**
Across the three pulls now available (08-30 → 09-01) it is +27 views / +9 clicks
for the sticky bar and +225 / +14 for the main CTA.

---

## J. Cohort retention, first ever: this property acquires one-visit users.

Weekly cohorts, active users returning in later weeks:

| cohort | size | wk 1 | wk 2 | wk 3 | wk 4 |
|---|---|---|---|---|---|
| wk of 07-27 | 228 | 5 (2.19%) | 1 (0.44%) | 2 (0.88%) | 4 (1.75%) |
| wk of 08-03 | 243 | 4 (1.65%) | 1 (0.41%) | 4 (1.65%) | – |
| wk of 08-10 | 445 | 15 (3.37%) | 10 (2.25%) | 2 (0.45%) | – |
| wk of 08-17 | 536 | 10 (1.87%) | 4 (0.75%) | – | – |
| wk of 08-24 | 891 | **3 (0.34%) — incomplete** | – | – | – |
| wk of 08-31 | 138 | – | – | – | – |

**Week-1 return runs 1.65–3.37%** on the four cohorts with a full week elapsed.
**Do not read the 08-24 cohort's 0.34% as a collapse** — its "week 1" is the
week of 08-31, of which only one and a bit days had elapsed at pull time. Same
trap as §B, one aggregation up.

Two caveats before anyone treats this as a retention problem. First, §2 of
`ANALYTICS_CONTEXT.md`: **7.7–11.9% of "active users" are datacenters**, and
crawlers never return, so every cohort denominator is inflated and every
retention rate here is a floor. Second, cohort size tripled (228 → 891) across
five weeks of heavy paid acquisition while week-1 return did not rise — which is
what you would expect from cold paid social traffic, not necessarily a product
signal. This is a **baseline to trend**, not a conclusion.

---

## K. Key events and revenue are frozen. Fourth consecutive confirmation Google Ads is dark.

| event | 08-31 pull | 09-01 pull |
|---|---|---|
| `ads_conversion_About_Us_1` | 99 | **99** |
| `generate_lead` | 90 | 93 (+3) |
| `purchase` | 37 | **37** |
| total key events | 226 | 229 |
| total revenue | $1,006.14 | **$1,006.14** |

**The last recorded transaction was 2026-08-29.** 08-30 and 08-31 both read $0.

`ads_conversion_About_Us_1` has now been frozen at 99 for four straight
reports, and its by-source decomposition is entirely historical Google Ads
rows (`googleads / paid` 51, `googleads / (not set)` 16, `googleads / offline`
16, `googleads / cpc` 11, `google / cpc` 3, plus 2 strays = 99). Per §3b this
is settled and I am not re-raising it — logging it only because it still
accounts for **43.2% of the property's key events** and will keep distorting any
YTD key-event figure.

Purchases by source (37 total): `eventbrite / listing` 11 ($290.39),
`(direct) / (none)` 6 ($169.94), `Facebook / paid_social` 3 ($97.47),
`Instagram / paid_social` 3 ($82.47), `google / organic` 3 ($82.47),
`Facebook / organic` 2, `email / email` 2, `facebook / social` 2, then singles.
**Paid social's whole contribution is 6 purchases and $179.94** against
2,764 sessions.

**Case and placement fragmentation, updated.** Facebook now splits four ways —
`Facebook / paid_social` 1,592 + `facebook / paid_social` 435 +
`fb / paid_social` 122 + `Facebook / paid` 26 = **2,175 sessions**. Instagram
splits two ways — `Instagram / paid_social` 489 + `ig / paid_social` 53 =
**542**. `th / paid_social` (Threads, from PR #350's `{{site_source_name}}`) has
grown 1 → 3 sessions. Sum before quoting any Facebook figure.

---

## L. Meta, 2026-08-25 → 08-31: $192.02, and the Tellus overspend is resolving itself.

| campaign | spend | clicks | CPC | LP views | purchases |
|---|---|---|---|---|---|
| Event 3 Good Good Campaign | **$74.82** | 434 | $0.172 | 361 | 0 (1 cart) |
| Marion Court \| Traffic | $42.01 | 178 | $0.236 | 136 | 0 |
| Event 4 Good Good — Retargeting | $36.71 | 51 | $0.720 | 24 | 0 (2 carts) |
| Marion Court Retargeting | $22.43 | 24 | $0.935 | 12 | 0 |
| Loxleys \| Traffic | $6.32 | 81 | **$0.078** | 63 | 0 |
| Tellus … -All Genders | $3.57 | 10 | $0.357 | 4 | 0 |
| Tellus … -Sales-Obj-Women | $3.25 | **1** | **$3.250** | 0 | 0 |
| Tellus Retargeting | $2.91 | 19 | $0.153 | 7 | **1** |
| **total** | **$192.02** | **798** | **$0.241** | 607 | 1 |

**No week-over-week comparison is made** — per §9 and the campaign table in
`ANALYTICS_CONTEXT.md` §1, six of seven days overlap the previous window and the
export has no daily granularity. (The two windows both total $192.02 to the
cent, which is coincidence: the composition differs on every line.)

Three things worth naming, all single-window reads:

- **Tellus AfterDark spend after its 2026-08-26 event is falling on its own:
  $29.30 (15.3%) → $19.02 (9.9%) → $9.73 (5.1%).** This was asked twice. It is
  resolving, so I am **not asking a third time**; noting the trajectory instead.
- **`Tellus … -Sales-Obj-Women` at $3.250 CPC — 13.5x blended**, for exactly one
  click and zero landing-page views. Trajectory across three reports: $2.202 →
  $1.805 → $3.250. **n = 1 click**, so the CPC is arithmetically meaningless as
  a rate; what is not meaningless is that $3.25 bought one click. 3rd ask.
- **`Loxleys | Traffic` is the cheapest traffic on the account at $0.078 CPC,
  3.1x cheaper than blended**, with 63 landing-page views on $6.32. Second
  reading (was $2.88 / $0.067). Still too small to conclude from.

The two `| Traffic` campaigns took **$48.33 = 25.2%** of the week (was 22.8%)
for 199 landing-page views, 1 initiate_checkout and 0 purchases. Per
`ANALYTICS_CONTEXT.md` this objective is **deliberate** — it feeds the
retargeting pool — so it is not flagged as a defect. `Event 3 Good Good
Campaign` is left out of that total because it is campaign-level and hides a
traffic ad set.

**The one §3b trigger, checked and NOT moved.** Marion Court
(`SparkDate: Real People, Real Drinks, Real Court`) cart→purchase reads
**46 viewed / 9 carts / 3 seats / $49.97** tonight against **45 / 9 / 3 /
$49.97** last night. Only `itemsViewed` moved, by one. **33.3% in seats,
unchanged.** The venue and ad-set decision is settled per §3b and is **not
reopened**; this is logged so that the earlier 11.1% reading is not acted on.

---

## M. Control and additivity checks

- **Passes.** Key-event decomposition closes exactly on 229 (99 + 93 + 37).
  Revenue by source sums to $1,006.14 across 37 transactions, matching
  `revenue-daily` and `by-device` to the cent. `select_promotion` 100 → 109
  matches the promotions table's clicks 100 → 109. By-source sums match
  `daily-trend` exactly on 94 of 95 days.
- **Fails, with explanations.** Daily sessions sum to **4,905** against a grand
  total of **4,761** (+144, +3.0%) — do not reconcile a daily series to the
  property total to the unit. `itemRevenue` $918.62 against `totalRevenue`
  $1,006.14 (gap **$87.52**): itemRevenue is ex-fee; the per-order deltas are
  consistently $2.50 (e.g. 06-20 items $99.96 vs revenue $109.96 on 4 tickets).
  `itemsPurchased` 39 vs `transactions` 37 is **#205 seat counting**, not two
  extra sales.
- **Not verified.** The `(not set)` checkout-error category (8 events) is
  *probably* pre-bucketing firings; I did not confirm that to the day.

---

## N. Verified closed — deliberately NOT raised as findings

Both of these look alarming in the new `utm-content` and `traffic-by-source`
tables and both are dead. Checked before reporting, per the standing rule.

- **`[object Object] / undefined` — 36 sessions, 10 users, 0 key events.** A
  literal JavaScript stringification in a UTM. `daily-by-source` dates it to
  **2026-06-24 → 2026-07-10 and nothing since (53 days of zero)**. Dead bug,
  already fixed or already gone.
- **`<campaign-name>` — 55 sessions, 41 key events, $0.** Already resolved in
  `GA4_ANALYSIS_2026-08-30.md` §I3: an **archived** 6/6 boosted post whose
  destination carried the unsubstituted placeholder. The new `utm-content` table
  merely quantifies it for the first time (17.9% of all key events, all
  historical, all $0). No action.
- Also present and expected, not defects: `TEST-01 / webview_test` (1 session,
  $27.49 — a test purchase that is inside the $1,006.14) and `clicktest / day2`
  (5 sessions).

---

## NEEDS TAYLOR INPUT

1. **Seven users could not complete the card form, and retried 15 times between
   them.** *(1st ask, new — §F.)* `card_incomplete` is 15 of 25 checkout errors
   and it is a *form-completion* failure, not a decline (declines: 1). 9.0% of
   the 155 users who started the checkout form hit an error. Whether that is
   worth a UI change on `/event` and `/events` is a product judgement, and n = 7.
   **Re-check in ~1 week:** `ga4-api-checkout-errors` — is `card_incomplete`
   still the top bucket, and has the 15/7 grown?
2. **Move the nightly GA4 pull later than 06:00 UTC.** *(2nd ask — §B.)* At
   02:00 America/New_York the export's final day is ~2 of 24 hours: 08-31 read
   **9 sessions** last night and **166** tonight. Moving it later does not fix
   the final day (the export always ends on the pull date) but it does make the
   *second*-to-last day settled by pull time, which is what every trend actually
   uses. Cheap change to a schedule; it is Taylor's cron.
   **Re-check:** the final-day session count in the next export against the same
   day one export later.
3. **Nothing paid points at `eventbrite / listing`, and 41% of the traffic it
   does send lands on pages that have earned $0.** *(3rd ask — §H.)* 88 sessions
   to `/event` produced $290.39 at $3.30/session, 32x what paid social returns
   per session, on no budget. 48 sessions go to `/events` and 22 to `/matches`,
   both at zero. The fix lives in the Eventbrite listing, not this repo. Both a
   spend-allocation call and a five-minute link edit.
   **Re-check:** `ga4-api-landing-by-source`, the `/events` and `/matches` rows
   for `eventbrite / listing` — do they fall toward zero?
4. **`Tellus … -Sales-Obj-Women` spent $3.25 for one click and zero landing-page
   views.** *(3rd ask — §L.)* CPC across three reports: $2.202 → $1.805 →
   $3.250. Small money, but it is the only line on the account that has been an
   outlier three weeks running.
   **Re-check:** next Meta pull, the same campaign's spend and clicks.
5. **Organic Social converts to `view_item` at 1.47% (2 of 136) against paid
   social's 8.35% and Direct's 13.06%.** *(1st ask, new — §G.)* Adequate volume
   at that step and no series break in it. Since `view_item` does not fire on
   `/lp`, this says organic-social visitors arrive and never tap through — which
   is a content/link question about what the organic posts point at, not a site
   defect.
   **Re-check:** `ga4-api-funnel-by-channel`, the Organic Social step-1
   completion rate, in ~1 week.
6. **Week-1 cohort retention is 1.65–3.37%.** *(1st ask, new — §J.)* First time
   this has ever been measured here. Whether that is acceptable for an events
   business — where one purchase per person per event is the normal shape — is a
   business judgement, not an analytics one. Flagged so it is a known baseline
   rather than discovered later as a surprise.
   **Re-check:** the wk-of-08-24 cohort's week-1 cell once that week completes.

**Nothing from `ANALYTICS_CONTEXT.md` §3b was re-asked.** The internal-traffic
filter, `ads_conversion_About_Us_1`, Google Ads, the Marion Court
venue/ad-set configuration and `next_event_fetch_failed` (#299) were all checked
and left alone. The Tellus post-event spend question was retired rather than
asked a third time because the number is falling on its own.

---

## Proposed zero-risk fixes — described only, NOT applied

None of these were made. Every one is a documentation change; no application
code is involved in any of them.

1. **Add a third tail failure to `ANALYTICS_METHOD.md` §1** (§A): the by-source
   attribution backfill. Measured **+41.1% over-sum on the final day one night
   and +41.0% the next**, with `(not set)` at 105 then 78, clearing to **0 and
   an exact sum** within 24 hours, and **94 of 95 days summing exactly**. Remedy:
   drop the final day from any by-source table.
2. **Add `2026-08-23 — PR #265` to `ANALYTICS_METHOD.md` §10 series breaks**
   (§D): `in_app_browser` began riding on every event that day, so the
   `webview-vs-normal` funnel and the `webview-by-event` cross-tab are
   **08-23-onward measurements regardless of the export's date range**, and
   `(not set)` in those tables is "before 08-23", not "untagged page".
3. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp** — still 2026-08-26.
   **3rd ask.** It has now cost three consecutive reports a paragraph to rule out
   as a false fork.
4. **Record in `ANALYTICS_METHOD.md` §1b that the pull runs at 06:00 UTC =
   02:00 America/New_York**, i.e. ~8.3% of the final day, with the 9 → 166
   measurement as the example. The section's existing examples (13:12, 23:19)
   understate the effect by an order of magnitude.
5. **Record the `$2.50`/order fee gap** between `itemRevenue` and `totalRevenue`
   (§M) so the next reader does not treat $918.62 vs $1,006.14 as a tracking
   defect.
6. **Note in `ANALYTICS_CONTEXT.md` §1 that `os-browser` gives a whole-window
   webview read** that the segment tables cannot (§E), and that Meta's iOS
   webview hides inside `iOS / Safari`, so `Android Webview` + `Safari (in-app)`
   is a floor on webview volume, not the whole of it.
7. **Note that `(not set)` / Chrome — 106 sessions, 79 key events (74.5%)** —
   is almost certainly historical Google Ads traffic and should not be read as a
   high-converting segment (§E).

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26, stated at the
  top per its own instruction. `reports/ANALYTICS_METHOD.md` read in full and
  treated as authoritative on every measurement question.
- **Which caveats were load-bearing tonight.** §1a/§1b are the entire content of
  §A and §B. §3 (`begin_checkout` redefined 08-21) is why §G's steps 4–5 are
  marked indicative and why no `begin_checkout` volume trend appears anywhere.
  §4 (`view_item` does not fire on `/lp`) is what turns §D and §G from
  "page quality" into "click-through". §6 is why §D uses discrete event counts
  and quotes no webview engagement *time*. §7 is why no GA4 revenue figure is
  called business revenue. §9 is why §L makes no week-over-week comparison. §10's
  08-25 filter boundary is not crossed by any comparison here. §12 governs every
  small-n statement.
- **Where I contradict a prior report.** Last night reported "paid social engages
  at 17.0%, everything else 57.5%" on 08-26..08-28. Recomputing that window I get
  **16.8% / 57.1%** (grouping choice — I include `Facebook / paid`, `tiktok`,
  `pinterest`, `reddit` in "paid social"). But **extending to 08-26..08-30, now
  that both extra days are finalised, paid social reads 25.9% and everything else
  55.8%.** The direction survives; the 17% figure does not. It was a three-day
  window. Do not quote it.
- **Sample sizes, stated everywhere they matter.** Webview purchases n = 4;
  sticky-bar clicks n = 2; main-CTA clicks n = 7; checkout-error users n = 7 and
  n = 14; `Tellus -Sales-Obj-Women` n = 1 click; Marion Court n = 9 carts / 3
  seats; Organic Social purchases n = 0. **No per-user rate appears anywhere** in
  this report — §2's datacenter denominator (7.7–11.9%) makes them unsafe, and
  it is also why §J's retention rates are called floors.
- **Prior-period comparison.** The 08-31 pull was available for all 12 older
  tables and is used as the control throughout §A, §I and §K. **The 14 new tables
  have no prior period at all** — §D, §E, §F, §G, §J and the `utm-content` and
  `items-daily` reads are single snapshots and are labelled as baselines.
- **Parsing.** Every file parsed from its own real header after the `#` block;
  `Grand total` rows excluded from row-level aggregation and used only as
  independent checks. No column names hardcoded. No CSV was moved, renamed or
  modified.
- **Source reading.** `public/event.html`, `public/events.html`, `public/lp.html`,
  `scripts/fetch-ga4-tables.js`, `reports/ANALYTICS_METHOD.md` and
  `reports/GA4_ANALYSIS_2026-08-30.md` were read from a fresh clone to ground
  §D, §E, §F and §I. `git log -S` was used to date PRs #56, #63, #148, #265,
  #310, #370 and #371. **Nothing outside `reports/` was modified.**
