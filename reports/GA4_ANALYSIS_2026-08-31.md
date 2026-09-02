# GA4 analysis — 2026-08-31

**This run made ZERO code changes.** The only file it adds to the repo is this
report. Everything below that reads like a fix is a *proposal* for Taylor, in §J.

**Staleness check, as the prompt requires.** `ANALYTICS_CONTEXT.md` reads
**"Last updated: 2026-08-26."** That is older than the newest report in
`reports/` (`GA4_ANALYSIS_2026-08-30.md`), so it trips the file's own fork
check. **Investigated, and it is the same FALSE POSITIVE the 08-30 report
recorded:** the body contains `SPLIT 2026-08-28`, the #311 getaways note and the
2026-08-27 `lead_form_started` cause, so only the *stamp* lags. Bumping the
stamp is now a **2nd ask** (§J1). Tracked `reports/ANALYTICS_METHOD.md` also
read in full.

---

## A. What tonight's data actually is

| set | window | pulled | status |
|---|---|---|---|
| 12 × `ga4-api-*-2026-08-31.csv` | `20260519-20260831` | **2026-08-31 06:00 UTC** | **fresh — tonight's basis** |
| 12 × `ga4-api-*-2026-08-30.csv` | `20260519-20260830` | **06:00 UTC (9 files) and 12:51 UTC (3 files)** | prior — used as a control |
| 38 × `download*.csv` (GA4 UI) | `20260519-20260827` | — | **STALE.** Identical drop the 08-28 report analysed; skipped. |
| `meta-insights-2026-08-30.csv` | `20260824-20260830` | — | fresh; 9 campaigns |

Windows and pull times read from each file's own `#` header, never from
filenames or mtimes. Both run logs checked (the prompt library's and
`TONIGHT_PROMPT.md`'s); the last GA4 run was 08-30, and the three tables that
carry tonight's headline did not exist when it ran.

**Focus: Prompt 9 (GA4 → site improvements),** because a fresh Data API export is
present. The specific reason it is worth a second GA4 night in a row: PR #342
shipped `promotions`, `landing-by-source` and `daily-by-source` at **12:51 UTC on
08-30, after** that night's 06:00 report was written. Tonight is the first run
with a full-day view of all three.

---

## B. HEADLINE — 2026-08-30 looks like the biggest traffic day since 08-22. It is not. About 105 of its 219 sessions are an attribution bucket that drains.

`ga4-api-daily-trend-2026-08-31.csv` reads **2026-08-30 = 219 sessions**, against
116–172 on each of the four days before it. It would be the second-busiest day in
the whole 94-day window. **Do not report that.**

Three independent measurements say the day is not finished being processed:

**1. The by-source table over-sums, and only on the last two days.** Summing
`ga4-api-daily-by-source-2026-08-31.csv` per day and comparing to
`ga4-api-daily-trend-2026-08-31.csv`:

| day | daily-trend | sum over source rows | difference |
|---|---|---|---|
| every day 05-30 → 08-29 (92 days) | — | — | **0, exactly** |
| 2026-08-30 | 219 | 309 | **+90 (+41.1%)** |
| 2026-08-31 (partial) | 9 | 11 | +2 (+22.2%) |

**2. The excess is a `(not set)` source row that appears on no other day.**
Sessions with `sessionSourceMedium = (not set)`, by day, in tonight's pull:

| day | `(not set)` | that day's total | share |
|---|---|---|---|
| 07-24, 07-29, 08-03, 08-08, 08-11, 08-14, 08-26, 08-27 | 1 each | 24–172 | 0.6–4.2% |
| 08-23 | 2 | 129 | 1.6% |
| **2026-08-30** | **105** | **309** | **34.0%** |
| 2026-08-31 (partial) | 4 | 11 | 36.4% |

**3. Those sessions have no landing page either.** In
`ga4-api-landing-by-source-2026-08-31.csv` there is exactly one row with a blank
`landingPage`: **`(not set)` / 104 sessions / 103 users / 0 key events / $0.00.**
So 104 of the 105 have neither a source nor a landing page — the signature of a
session GA4 has recorded but not yet resolved, not of a hundred real visitors.

### The control that settles it: `(not set)` drains, and it was measured draining

The 08-30 folder is **two snapshots**, 6h45m apart (§C). Both cover the identical
date range `20260519-20260830`:

| pulled | table | `(not set)` sessions |
|---|---|---|
| 2026-08-30 **06:00** UTC | `traffic-by-source` (cumulative) | **95** |
| 2026-08-30 **12:51** UTC | `daily-by-source` (same range, summed) | **19** |

**76 sessions left the `(not set)` bucket in under seven hours, with no new days
added.** Tonight's cumulative table also shows `(not set)` key events going
**3 → 0** while its session count rose — key events being reassigned out of the
bucket to real sources, which is what a draining holding-pen looks like and not
what real traffic looks like.

And the stability control holds in the other direction: comparing the 08-30 12:51
and 08-31 06:00 by-source tables **row by row**, **0 of the 92 days at or before
2026-08-29 differ in any cell.** The churn is confined to the tail.

**Why this matters beyond one day.** `ANALYTICS_METHOD.md` §1 documents two tail
failures — engagement lag (§1a) and proportional session undercount (§1b). This
is a **third, and it runs the other way**: the tail can also carry sessions that
are *over*-counted when a table is summed, and whose *source* is wrong-by-absence
until it resolves ~24–36 hours later. A 06:00 UTC pull is the worst moment in the
day to read attribution, because the previous local day (property is on Eastern —
08-31 shows 9 sessions at 06:00 UTC = 02:00 ET) has had two hours, not a day.

**What is real on 08-30, and what is not.** Real: new source *spellings* appeared
(§D). Not real, or at least not yet: the session count, the day's source mix, and
any rate computed from either.

---

## C. The "2026-08-30 export" is two different pulls in one folder

Read from the files' own headers:

| pulled 06:00 UTC (9 files) | pulled 12:51 UTC (3 files) |
|---|---|
| channel-groups, cities, daily-trend, events, events-by-source, landing-pages, revenue-by-item, revenue-by-source, traffic-by-source | **promotions, landing-by-source, daily-by-source** |

The three 12:51 files are the ones PR #342 added that morning. This is a live
parsing trap: **two files with the same date in the name are 6h45m apart**, and
`ANALYTICS_METHOD.md` §1b says explicitly that comparing the same day across two
pulls taken at different clock times shows growth that is only elapsed time.
Cross-table arithmetic inside "the 08-30 export" is therefore not guaranteed to
reconcile — and in fact does not: `(not set)` reads 95 in one and 19 in the other.
Tonight's 08-31 set is internally consistent (all twelve say 06:00 UTC).

---

## D. `{{site_source_name}}` went live on 08-30 and Meta is filling it — including `th` (Threads)

Three source rows that have never existed before appear on 2026-08-30:

| source / medium | first seen | sessions (window) | key events | revenue |
|---|---|---|---|---|
| `ig / paid_social` | **2026-08-30** | 26 | 0 | $0.00 |
| `th / paid_social` | **2026-08-30** | 1 | 0 | $0.00 |
| `fb / paid_social` | 2026-08-22 | 113 (25 of them on 08-30) | 0 | $0.00 |

`content/brand.json:320` sets the UTM convention to
`"source": "{{site_source_name}}"`, and `:324` explains why: *Meta fills it per
placement, lowercase (fb/ig/msg/an); hardcoding it is how four ads spelled it
`facebook` and fourteen `Facebook`.* `git log -S` dates that line to
**`ff83440`, 2026-08-30, PR #350** — the same day the rows appear. So this is the
convention landing, working as designed, and visible in GA4 for the first time.

Two things follow that are worth writing down:

1. **`th` is Threads, and the convention note does not list it.** `brand.json:324`
   enumerates `fb/ig/msg/an`. The live data has a fourth value. One session, so
   nothing turns on it — but any code or workbook that whitelists the four
   documented values will silently mis-bucket Threads.
2. **Fragmentation has not been fixed, it has been re-based.** Old ads still emit
   `Facebook`/`Instagram`; new ads emit `fb`/`ig`/`th`. Facebook-family rows
   tonight (from `traffic-by-source`): `Facebook / paid_social` 1,532 +
   `facebook / paid_social` 435 + `fb / paid_social` 113 + `Facebook / paid` 26 =
   **2,106 sessions across four rows**, and Instagram is now
   `Instagram / paid_social` 463 + `ig / paid_social` 26 = **489 across two.**
   Sum before quoting either. The split will persist for
   as long as any pre-#350 ad keeps delivering.

**Volume caveat, and it is a big one:** every one of the new rows' sessions falls
on 08-30/08-31, i.e. entirely inside the unreliable tail of §B. **The existence of
the spellings is solid; their counts are not final.**

---

## E. First valid promotion-CTR window since `view_promotion` shipped — and the sticky bar is earning its place

`view_promotion` only began firing **2026-08-28** (`ANALYTICS_METHOD.md` §10,
PR #310), while `select_promotion` has fired since May. So the cumulative
promotions table cannot produce a CTR — two of its rows read *more clicks than
views*. The 08-30 report said so and stopped there.

**There is a way through: difference the two pulls.** Both are cumulative from
05-19; §B proved no day at or before 08-29 changed a single cell between them; so
the difference is new activity only, and all of it is after 08-28. That makes the
delta the first window in which numerator and denominator have the same
definition.

| promotion (slot) | 08-30 12:51 v/c | 08-31 06:00 v/c | **delta v/c** | delta CTR |
|---|---|---|---|---|
| `lp_get_tickets` (lp) | 159 / 49 | 291 / 56 | **+132 / +7** | **5.3%** |
| `lp_sticky_bar` (lp_sticky) | 8 / 10 | 24 / 17 | **+16 / +7** | **43.8%** |
| `get_tickets_block` (homepage_block) | 19 / 22 | 27 / 24 | +8 / +2 | 25.0% |
| `sticky_ticket_bar` (homepage_sticky) | 6 / 2 | 12 / 2 | +6 / 0 | 0% |
| `careers_events_callout` (events) | 4 / 1 | 6 / 1 | +2 / 0 | 0% |
| `careers_footer`, `careers_about_section` | 4/0, 1/0 | 4/0, 1/0 | 0 / 0 | — |
| **total** | 201 / 84 | 365 / 100 | **+164 / +16** | **9.8%** |

The +16 clicks reconcile **exactly** with the events table's `select_promotion`
delta (84 → 100). Read `public/lp.html:1113-1139` before interpreting the two
`/lp` rows: one `IntersectionObserver` at `threshold: 0.5` on `#lpTicketBtn`
fires `sdViewPromotion('lp_get_tickets','lp')` when the CTA is on screen and
`sdViewPromotion('lp_sticky_bar','lp_sticky')` when it is not, deduped per page
load by `seen{}`. **They are mutually exclusive by construction** — the comment
at :1122 says that is deliberate, precisely so each has the right denominator.

Two readings, both of which bear on `ANALYTICS_CONTEXT.md` §4 open question 2
("Did the CTA move work?"), open across three reports:

- **The CTA move worked.** 132 of 148 `/lp` promotion impressions (**89.2%**) were
  logged with the main Get Tickets button *on screen*. Before 08-22 it sat 655px
  down in a browser and 833px inside a webview against ~650–700px of usable
  height; it is now at 558px. The bar only had to step in on **10.8%** of
  impressions.
- **When the bar does appear, it converts hard.** 7 clicks on 16 impressions
  against 7 on 132. **It produced half of all `/lp` promotion clicks in the window
  from a ninth of the impressions.**

**Sample size, stated plainly as §12 requires: n = 7 and n = 7.** Direction only.
Do not put "43.8%" in a deck. The delta window also sits inside the §B tail, so
these counts are a **floor** (tails undercount, they do not invent) — which is why
the *ratio* is quoted with both raw counts attached.

---

## F. Paid social engages at 17.0%. Everything else engages at 57.5%.

Using only days **three or more back** from the 08-31 export — 08-26, 08-27,
08-28 — which is also entirely on the post-filter side of the 2026-08-25
internal-traffic cliff, so it is a legitimate one-sided window:

| cohort | sessions | engaged | rate |
|---|---|---|---|
| `Facebook / paid_social` + `Instagram / paid_social` + `Nextdoor / cpc` | 288 | 49 | **17.0%** |
| every other source | 153 | 88 | **57.5%** |
| property | 441 | 137 | 31.1% |

Per-row, same three days: `(direct) / (none)` 54/24 = 44.4%; `eventbrite /
listing` 36/20 = 55.6%; `google / organic` 21/16 = 76.2%; `email / newsletter`
17/10 = 58.8%.

**This reframes a number the 08-30 report deliberately refused to conclude on.**
That report saw the property rate move 54.9% → 31.1% across the 08-25 filter and
correctly called the comparison invalid. Tonight's table says the level is not
mainly a filter artifact or a time trend at all — it is **composition**. Paid
social is 288 of 441 sessions (65.3%) in this window, and it engages at roughly
a third of everything else's rate. The property rate is a weighted average that
moves when the paid share moves.

**08-29 is deliberately excluded** and is worth its own line, because it is the
fifth independent confirmation of §1a: it read **133 sessions / 2 engaged
(1.5%)** in the 08-30 12:51 pull and reads **138 / 57 (41.3%)** tonight. Anyone
who had quoted 1.5% would have been wrong by 40 points. Including 08-29
provisionally would lift paid social to 403/93 = 23.1% and leave everything else
at 57.4% — the gap is not sensitive to the choice.

---

## G. Where the money lands — and it is not where the money is spent

`ga4-api-landing-by-source-2026-08-31.csv` is new, and it is the first table that
can answer "which source, landing on which page, produced revenue". Cumulative
window, GA4 revenue only (**§7: this is own-site revenue, roughly 45% of real
ticket revenue — the admin dashboard is the truth**):

| source → landing page | sessions | key events | GA4 revenue | rev/session |
|---|---|---|---|---|
| `eventbrite / listing` → **`/event`** | 88 | 22 | **$290.39** | **$3.30** |
| `eventbrite / listing` → `/events` | 47 | **0** | **$0.00** | $0.00 |
| `eventbrite / listing` → `/matches` | 20 | 0 | $0.00 | $0.00 |
| `email / returning` → `/event` | 13 | 2 | $21.49 | $1.65 |
| `Instagram / paid_social` → `/lp` | 269 | 1 | $27.49 | $0.10 |
| `Instagram / paid_social` → `/events` | 190 | 4 | $54.98 | $0.29 |
| `Facebook / paid_social` → **`/lp`** | **1,472** | 12 | $64.98 | **$0.044** |
| property | 4,615 | 226 | $1,006.14 | $0.218 |

**The single sharpest row: 88 sessions — 1.9% of the property — produced 28.9% of
all GA4 revenue.** `eventbrite / listing` landing on `/event` runs at **$3.30 per
session, 75× `Facebook / paid_social` → `/lp` at $0.044**, and it carries no paid
budget at all.

**And the same source splits three ways by destination.** Of 166
`eventbrite / listing` sessions, the 88 that land on `/event` (a specific event)
carry **all 22 key events and all $290.39**; the 47 that land on `/events` (the
index) carry **zero of each**; 20 land on `/matches`. That is a 47-session slice
of the best-converting source on the property arriving at a page that has
converted nothing. Whether those 47 are a fixable link or just browsing is not
answerable from GA4 — it is a question about what URL the Eventbrite listings put
in their organiser/website fields, which lives in Eventbrite, not in this repo
(`grep` for `utm_source=eventbrite` across the repo returns nothing). §I2.

**Two cautions on this table before anyone acts on it.** (1) The 20 `/matches`
and the `/admin` rows elsewhere are signed-in member pages; per §1, sessions
landing there deserve internal-traffic suspicion, and the window starts
2026-05-19, long before the 08-25 filter. (2) `/lp`'s 121 key events are mostly
not real: `ads_conversion_About_Us_1` is defined as a page load on
`/lp?utm_source=googleads`, so **all 99 of them sit inside `/lp`**. Netting them
out leaves at most 22 real leads-or-sales on 2,624 `/lp` sessions.

**The key-event decomposition still closes exactly**, now on 226:
`ads_conversion_About_Us_1` **99** + `generate_lead` **90** + `purchase` **37** =
**226**, no residual. The retired $0 event is **43.8%** of this property's key
events (was 44.2% on 224). It has not moved a single count since the 08-30 pull
(99 → 99), and channel group `Paid Other` is likewise frozen at 63 key events and
$0.00 — the third consecutive confirmation that Google Ads has been dark since
~07-24 and that `keyEvents` cannot be used as a denominator without netting this
out first.

---

## H. The Meta week: 22.8% of spend bought 163 landing-page views and nothing else

`meta-insights-2026-08-30.csv`, window `20260824-20260830`, 9 campaigns,
**$192.02 total spend, 22,813 impressions, 771 clicks, blended CPC $0.2491.**

**No week-over-week comparison is made.** Per §9 and `ANALYTICS_CONTEXT.md`, the
08-29 and 08-30 pulls overlap **6 of 7 days**, and `Marion Court All Genders`
dropped out of the 9-row list entirely (it was $0.00 last week), so a
campaign-count or spend delta would be arithmetic, not a decision. Within-window
facts only:

| campaign | spend | clicks | CPC | LPV | carts | purch | leads |
|---|---|---|---|---|---|---|---|
| Event 3 Good Good Campaign | $72.12 | 423 | $0.1705 | 350 | 1 | 0 | 0 |
| **Marion Court \| Traffic** | **$40.93** | 175 | $0.2339 | **133** | **0** | **0** | **0** |
| Event 4 Good Good — Retargeting | $33.08 | 50 | $0.6616 | 27 | 3 | 0 | 1 |
| Marion Court Retargeting | $23.99 | 27 | $0.8885 | 12 | 0 | 0 | 0 |
| Tellus — Sales-Obj-Women | $7.22 | 4 | **$1.8050** | 1 | 0 | 0 | 0 |
| Tellus — All Genders | $6.80 | 17 | $0.4000 | 8 | 2 | 0 | 0 |
| Tellus Retargeting | $5.00 | 32 | $0.1562 | 12 | 2 | **1** | 5 |
| **Loxleys \| Traffic** (new) | **$2.88** | 43 | **$0.0670** | 30 | 0 | 0 | 0 |
| Event 4 Good Good — Sale Obj Women | $0.00 | 0 | — | 0 | 1 | 1 | 0 |

Three things stand out, and only the first is new:

1. **The two campaigns explicitly named `| Traffic` took $43.81 (22.8% of the
   week) and produced 163 landing-page views, 0 carts, 0 leads and 0 purchases
   between them.** That is the same shape as §F: a traffic objective optimises for
   the click, and the click is what arrives. **`Loxleys | Traffic` is brand new**
   (not in `ANALYTICS_CONTEXT.md`'s campaign table) and its **$0.0670 CPC is 3.7×
   cheaper than blended** — on $2.88, so treat it as a first reading, not a result.
   *Caveat: `Event 3 Good Good Campaign` is campaign-level and contains a
   documented `Good Good | Female | Traffic` ad set; it cannot be split here, so
   it is left out of the $43.81 rather than assumed in.*
2. **$19.02 (9.9% of the week) went to the three Tellus AfterDark campaigns, for
   an event `brand.json` dates 2026-08-26** — day three of a seven-day window.
   Campaign-level weekly totals cannot say how much fell after the event, which is
   exactly why this needs a daily pull. **2nd ask** (§I3); it was $29.30 / 15.3%
   last week.
3. `Tellus — Sales-Obj-Women` remains the CPC outlier at **$1.8050, 7.2× blended,
   for 4 clicks and 1 landing-page view.** **2nd ask** (§I4).

For context on where the week's money should be pointing: `brand.json` dates
**Good Good Night = 2026-08-31 (today)**, Marion Court = 09-08, Loxley's = 09-22,
Tellus = 08-26 (past).

---

## I. NEEDS TAYLOR INPUT

1. **Move or add a GA4 pull later than 06:00 UTC.** *(1st ask, new.)* Measured in
   §B: the 06:00 pull on 08-30 carried **95** `(not set)` sessions and the 12:51
   pull of the same date range carried **19**. Tonight's 06:00 pull carries **105**
   on a single day. A second pull at ~13:00 UTC, or moving the nightly one, would
   remove the largest remaining source of wrong numbers in this pipeline. This is a
   schedule/quota decision (`.github/workflows/`), so it is here and not in §J.
2. **The 47 `eventbrite / listing` sessions landing on `/events` instead of
   `/event`.** *(1st ask, new.)* The 88 that land on `/event` carry every one of
   that source's 22 key events and all $290.39; these 47 carry zero. The fix, if
   there is one, is the website/organiser URL on the Eventbrite listings — outside
   this repo. Worth ten minutes in the Eventbrite dashboard to check which listings
   point at the index.
3. **The $19.02 on Tellus AfterDark campaigns after a 2026-08-26 event.**
   *(2nd ask — $29.30 / 15.3% last week, $19.02 / 9.9% this week.)* Needs
   `level=campaign,time_increment=1` to say how much is post-event; ask (5) below
   would answer it permanently.
4. **`Tellus — Sales-Obj-Women` at $1.8050 CPC, 7.2× blended.** *(2nd ask.)*
   Money, so not a §J item.
5. **Add `time_increment=1` (daily) to the Meta insights pull.** *(1st ask, new.)*
   Every Meta question in the last four reports — rolling-window artefacts, spend
   after an event date, when a campaign actually launched — has died on the same
   missing dimension. `scripts/fetch-meta-insights.js` is one parameter away, but
   it changes API cost and file shape, so it is a decision, not a fix.
6. **Is `th` (Threads) a placement you want?** *(1st ask, new.)* It appeared on
   08-30 with 1 session, `brand.json:324` does not list it among the values Meta
   fills, and nothing downstream knows the value exists. One session — flagging the
   category, not the number.
7. **Nothing paid still points at `eventbrite / listing`.** *(2nd ask — raised
   08-30.)* Re-raised only because tonight's landing-page split sharpens it from
   "best row" to "best row, and we now know which destination does the work".

**No settled question re-asked.** Checked against `ANALYTICS_CONTEXT.md` §3b: the
internal-traffic filter (Active 08-25), `ads_conversion_About_Us_1` (retired
08-25), Google Ads (dark since ~07-24), the Marion Court venue/ad-set
configuration (decided 08-25) and `next_event_fetch_failed` (#299) are all
referenced where the data touches them and **none is reopened**.

### The one §3b trigger that did fire — and it moved the right way

§3b names exactly one number that reopens the Marion Court discussion:
cart→purchase for that event. From `ga4-api-revenue-by-item-*`:

| pull | items viewed | added to cart | **purchased** | revenue |
|---|---|---|---|---|
| 08-29 22:04 and 08-30 06:00 (identical) | 44 | 9 | **1** | $24.99 |
| **08-31 06:00** | 45 | 9 | **3** | **$49.97** |

Carts held at 9; purchased seats went 1 → 3 and revenue +$24.98. Per
`ANALYTICS_METHOD.md` §10 (#205), `purchase` has sent real seat counts since
08-21, so **+2 seats for +$24.98 is one order delivering two seats — the 2-for-1
mechanic, not two buyers.** The trajectory the 08-30 report tracked (27/6/0 →
40/7/1 → 44/9/1 = 11.1%) now reads **45/9/3 = 33.3% in seats**, back above the
22–27% the other events run at. **n = 9 carts and 3 seats — stated, not
percentage-first.** The event is 2026-09-08, so this is mid-sale, not final.
**Nothing needs deciding; this is here so the 11.1% is not acted on.**

---

## J. Proposed zero-risk fixes — described only, NOT APPLIED

Every one of these is a documentation or comment change. None was made. This run
touched no file in `public/`, `api/`, `lib/`, `scripts/`, `content/`,
`vercel.json` or `package.json`.

1. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp to 2026-08-28.**
   *(2nd ask — the 08-30 report proposed the same thing.)* Its body already holds
   the 08-27/08-28 content; only the stamp lags, and the stamp is what the fork
   check reads, so it has now cost two consecutive reports a paragraph to rule out.
2. **Add the `(not set)` drain to `ANALYTICS_METHOD.md` §1 as a third tail
   failure**, with tonight's control: 95 → 19 in 6h45m on an unchanged date range;
   105 of 309 sessions on 08-30 in a 06:00 pull; 0 of 92 days at or before 08-29
   differing between pulls. Rule: *never read source mix, or sum a by-source table,
   for the last two days.*
3. **Record in §1 that a `ga4-api-*-<date>.csv` filename does not identify a
   pull.** The 08-30 set is 06:00 (9 files) and 12:51 (3 files). Always read the
   `# pulled` line before comparing two tables from the same date.
4. **Record the delta method for post-#310 promotion CTR** in §1 or §10 — two
   cumulative pulls differenced, valid only because days ≤ the tail are provably
   identical — so the next run does not re-derive it or, worse, quote the invalid
   cumulative CTR.
5. **Add `th` (Threads) to the `_source_why` list at `content/brand.json:324`,**
   which currently reads `fb/ig/msg/an`. One line, no behaviour change — but a
   `brand.json` edit is a content-source edit, so it is proposed, not made.
6. **Record that Facebook is now FOUR rows and Instagram TWO**, with tonight's
   counts (2,106 and 489), in the §3 case-fragmentation note — the note predates
   #350 and describes a two-row problem that is now a six-row one.

---

## K. Caveats, method, and what to re-check

**Which `ANALYTICS_CONTEXT.md` / `ANALYTICS_METHOD.md` caveats actually bound
tonight's numbers:**

- **§1 two-day tail — load-bearing everywhere.** It is the headline (§B), it is
  why §F drops 08-29, and it is why §E's CTR is called a floor. Confirmed a fifth
  time: 08-29 read 133/2 engaged in the 08-30 pull and 138/57 tonight.
- **§1 internal-traffic cliff (08-25) — respected.** Every engagement figure in §F
  is computed inside 08-26…08-28, one side of the boundary. No comparison spans it.
- **§3 `begin_checkout` (08-21) — not trended.** The event is quoted nowhere in
  this report; the window spans the boundary, so any movement would be the deploy.
- **§10 series breaks — `view_promotion` (#310, 08-28) is the reason §E exists**
  and is handled by differencing rather than by ignoring. `lead_form_started`
  (#311, 08-28) is quoted only as a raw delta (283 → 304) and never as a rate; §5
  of the context file says to count `generate_lead` instead, which §G does.
- **§7 GA4 revenue is own-site only** — ~55% of real ticket revenue comes through
  Eventbrite and Meetup and fires nothing on our side. Every dollar figure here is
  labelled GA4 revenue. The admin dashboard is the truth.
- **§9 Meta rolling windows** — no week-over-week Meta comparison is made at all
  (6 of 7 days overlap).
- **§1 datacenter denominators (7.7–11.9% of "active users")** — **no per-user rate
  is quoted anywhere in this report.** Every rate is sessions-based or computed
  inside a single row.
- **§12 / §5 sample size** — n is stated inline for every small count: 7 and 7
  clicks (§E), 9 carts and 3 seats (§I), 43 clicks on $2.88 (§H), 1 session (§D).
- **§1 server-rendered routes** — no claim is made about any page's `<head>`, and
  no live fetch was needed, because nothing here proposes a meta-tag change.

**Additivity, checked and partly failing.** `keyEvents` decomposes exactly
(99+90+37 = 226) and `Unassigned`'s $345.37 = $290.39 + $27.49 + $27.49 to the
cent. But: the by-source table over-sums sessions on the last two days only
(+41.1%, +22.2%); `itemsViewedInPromotion` moved **+164** while the events table's
`view_promotion` moved **+187** for the same interval (item-scope vs event-scope —
they are not the same metric, do not mix them); and revenue grand totals differ by
scope ($1,006.14 event-scoped vs $918.62 item-scoped, a $87.52 gap that is
expected, not a bug). One more, small but worth knowing: the cumulative
`traffic-by-source` and the summed `daily-by-source` disagree by a few sessions on
some rows within the same pull (`facebook / paid_social` reads 435 and 438
respectively), so **name which table a source figure came from.** Every source
total in this report is from `traffic-by-source`. **Parsing trap re-confirmed:** `ga4-api-landing-pages` has
**two** rows with an empty first column — a real blank-landing-page row (now
104/103/0/$0, was 81/81/2) and `Grand total`. Take the last.

**No browser and no GA4 UI access on this run.** Everything is CSV plus read-only
source and `git log` on an unshallowed clone (631 commits). The `(not set)`
mechanism in §B is inference from three consistent measurements, not a DebugView
observation — it should be confirmed there before it is written into
`ANALYTICS_METHOD.md`.

**Prior-period files were available and used as controls,** not just as a trend:
`ga4-api-*-2026-08-29` (22:04 UTC) and `-2026-08-30` (06:00 and 12:51 UTC).

### Re-check in ~1 week

| finding | metric to re-check | what would confirm / refute |
|---|---|---|
| §B `(not set)` drains | `(not set)` sessions on **2026-08-30** in any pull dated 09-02 or later | Confirmed if it falls from 105 toward ~1; refuted if it stays, which would make 08-30 a real event needing its own investigation |
| §B 08-30 "spike" | `daily-trend` sessions for 08-30 in a later pull | Should settle near the 116–172 band, not 219 |
| §E sticky bar | promotions table differenced across two pulls **both dated ≥ 09-01**, so no day in the window is inside a tail | `lp_sticky_bar` impression share staying ~10% and its click share staying materially above its impression share |
| §E CTA move | share of `/lp` promotion impressions logged as `lp_get_tickets` | Holding ≥ 85% means the 558px CTA is still landing above the fold |
| §F engagement composition | paid-social vs other engagement on a fresh 3-day final window | Gap holding near 17% vs 57% means it is composition, not a trend |
| §G Eventbrite | `eventbrite / listing` → `/events` sessions and key events | If the listing URLs change, `/events` sessions should fall and `/event` rise |
| §H traffic objective | carts and leads attributed to `Marion Court \| Traffic` and `Loxleys \| Traffic` | Still 0 after another week of spend is a budget conversation |
| §I Marion Court | `SparkDate: Real People, Real Drinks, Real Court` items purchased ÷ added to cart | Event is 09-08; read it once after the event, not before |

**One thing deliberately not concluded.** `Facebook / paid_social` engagement
swings 21% → 10% → 16% across 08-26/27/28 on 55–86 sessions a day. That is a wide
swing on thin daily cells and there is no ad-set dimension in GA4 to attribute it
to — `utm_content` is shared across ads (the `proof_rsa1` defect; #350 fixes it
going forward, from 08-30). **Not reported as a trend.** It is the reason ask
§I5 (daily Meta) matters.
