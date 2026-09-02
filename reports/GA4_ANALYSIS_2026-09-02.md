# GA4 analysis — 2026-09-02

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something that
was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last updated:
2026-08-26."** The newest report already on this branch's history is
`GA4_ANALYSIS_2026-09-01.md`, so the stamp is **older than the newest report and
may have forked.** I checked its §3b settled list against everything raised below
and re-ask nothing already settled there. This is the **fourth consecutive
report** to spend a sentence on that stamp.

**Data.** GA4 Data API, property 536859339, window `20260519-20260902`, **pulled
2026-09-02 05:23 UTC**, read from each file's own `#` header. Meta:
`meta-insights-2026-09-01.csv` (filename reflects the window's last day, not the
pull date — confirmed fresh via file mtime and tonight's run log), window
`20260826-20260901`, 8 campaigns. No hand-exported `download*.csv` is newer than
the API set. One operational note: an earlier `-AnalysisOnly` dry run tonight
(00:35–00:41, before the real 01:23 data pull) committed a report to this same
branch name against yesterday's stale data; the real run then re-cut the branch
from `origin/main`, so that commit is not in this history — confirmed via
`git log`. It was a rehearsal, not a duplicate report.

---

## HEADLINE — Marion Court's cart→purchase signal moved. This is the exact metric `ANALYTICS_CONTEXT.md` §3b named as the only thing that reopens the venue discussion, and it just moved for the first time since that rule was written.

`ANALYTICS_CONTEXT.md` §3b: *"Marion Court (kill or rebuild): DECIDED
2026-08-25 ... Track cart→purchase for this event specifically; that number
moving is the only thing that re-opens the discussion."* Last night's report
(§L) read it as **9 added to cart / 3 seats sold / $49.97**, unchanged from the
night before, and explicitly logged that as *not* reopening anything.

Tonight it reads **11 added to cart / 5 seats sold / $99.95**
(`ga4-api-revenue-by-item`, item `SparkDate: Real People, Real Drinks, Real
Court`).

**These columns are `itemsAddedToCart` and `itemsPurchased` — seats, not
orders.** The same distinction this report's own caveats draw property-wide
(`itemsPurchased` 41 vs `transactions` 39) applies here: the 5 seats are **4
orders**, reconstructed against `revenue-daily`'s `transactions` column —
08-27, 1 order / 1 seat / $24.99; 08-29, 1 order / 2 seats at $12.49 each (the
documented #205 2-for-1 signature); 09-01, 2 orders / 1 seat each. Read as
seats-to-seats, cart→purchase went 3/9 (33.3%) to 5/11 (45.5%). Do not compare
either figure against a `transactions` count.

`ga4-api-items-daily` dates the move precisely: **2 seats sold on 2026-09-01,
$49.98 item revenue** (the $54.98 in `revenue-daily` for that date includes the
~$2.50/order fee already documented for this property). Two independent orders,
not one multi-seat order — `revenue-by-source` shows two $27.49 transactions,
`revenue-daily` reads `20260901,54.98,2,2`, and Marion Court was the only item
sold that day.

**What I cannot yet say: which channel drove them.** The two new transactions
land in `revenue-by-source` as **`(not set)` / 2 / $54.98** — a brand-new row
that did not exist in last night's pull. None of the four Marion Court
retargeting `utm_content` tags (`mc_rt_still_thinking`, `mc_rt_quang`,
`mc_rt_scorecards`, `mc_rt_thinking`) show any revenue or key events in
`ga4-api-utm-content`, tonight or last night. This is consistent with — not
contradicted by — the attribution-backfill artifact documented below (§1):
2026-09-01 is tonight's second-to-last day, and its session-source rows are
still ~35% unresolved. **The purchases are real; the attribution is not
finished loading.** Re-check tomorrow's pull for whether the `(not set)` row
resolves into a specific source.

**Timing matters here.** Per the handoff notes, four Marion Court ad changes
went live **2026-09-02** — after these two 09-01 purchases. This movement is a
*pre-change* data point, not a result of those changes, and should not be read
as validating or complicating them. The account is also newly back in Meta's
learning phase per those changes; no further tuning is due before 2026-09-08
regardless of what this number does next.

This goes to NEEDS TAYLOR INPUT as a judgment call: §3b's own trigger condition
has now fired for the first time. Whether "2 more seats, still n=5 total" is
enough to actually reopen anything, or just a data point to keep tracking, is
not an analytics question.

---

## ALSO IN THE REPORT

### 1. The by-source additivity artifact hits the last TWO days of a pull, not just the final day — refines last night's §A framing.

Last night's report characterized the by-source over-sum artifact as affecting
only "the final day" of an export, clearing within ~24 hours. Tonight's data
adds a data point that narrows this: summing `ga4-api-daily-by-source` against
`ga4-api-daily-trend` for every dated row in tonight's pull, **94 of 96 sum
exactly. The two exceptions are the last two days**, matching the same
two-day boundary `ANALYTICS_METHOD.md` §1 already gives for engagement.
(`daily-trend` carries 96 dated rows, `20260530`–`20260902`. The header window
reads `20260519-20260902`, which is 107 calendar days, but the property has no
rows at all before 05-30 — do not read the header window as a row count.)

| date | position | trend sessions | by-source sum | diff | `(not set)` |
|---|---|---|---|---|---|
| 2026-08-31 | 3rd from last | 169 | 169 | **0 (exact)** | — |
| 2026-09-01 | 2nd from last | 107 | 145 | **+38 (+35.5%)** | 48 |
| 2026-09-02 | final | 5 | 8 | +3 | 3 |

08-31 (which carried the artifact in last night's pull, +68/+41.0%) is now
exact, one pull later — consistent with the "clears within ~24h" claim. But
09-01 still carries it tonight despite being one full day old, because it is
the *second*-to-last day, not the final one. **Recommend treating this exactly
like §1's engagement-lag rule: drop the last two days from any by-source
table, not just the last one.** This is also the mechanism behind the
headline's unresolved `(not set)` attribution above.

### 2. Checkout errors: `card_incomplete` keeps climbing. *(2nd ask, re-check from last night.)*

| category | 09-01 pull | 09-02 pull |
|---|---|---|
| `card_incomplete` | 15 events / 7 users | **18 events / 8 users** |
| `(not set)` | 8 / 7 | 8 / 7 |
| `card_declined` | 1 / 1 | 1 / 1 |
| `other` | 1 / 1 | 1 / 1 |

One more user hit the form-completion error (not a decline) since last night,
retrying an average of 2.25 times now instead of 2.1. Still n=8 users against
39 transactions in the window (`transactions`, not distinct purchasers — the
two are not the same column) — a real, cheap-to-check signal, still small.

### 3. Meta, `20260826-20260901`: $172.72 across 8 campaigns. No week-over-week comparison — per §9, six of seven days overlap the prior window.

Two single-window items worth logging, not asking about a third/fourth time:

- **`Tellus … -Sales-Obj-Women`'s CPC anomaly self-corrected**: $3.250 → **$0.81**
  this week, still on n=1 click. This was a 3rd ask across three straight
  reports; it is now resolved on its own and I am not asking a 4th time.
- **`Loxleys | Traffic` spend rose to $9.85** (126 clicks, CPC $0.078) from
  $6.32 (81 clicks, CPC $0.078) — still the cheapest traffic on the account,
  CPC unchanged to the thousandths place. Per the standing handoff note,
  Loxleys decisions are held for their own review; this is logged, not flagged.
- **Marion Court Retargeting's frequency** (the watch signal expecting a fall
  from 13.8 toward ~2.5) **cannot be checked from this file** — `meta-insights`
  carries spend/impressions/clicks/actions but no `reach` or `frequency`
  column. Noted under "what I did not verify," not silently skipped.

### 4. Cohort retention: the wk-of-08-24 cohort's week-1 cell is STILL INCOMPLETE and cannot be compared yet. *(Corrects an error in the first version of this report.)*

**The first version of this section said this cell was "now fully elapsed" and
called 0.45% "the lowest complete reading yet." That was wrong**, and the
comparison it invited was invalid. Recording the mistake rather than deleting
it, because the mechanism is the reusable part.

`scripts/fetch-ga4-tables.js:556-561` anchors every cohort to a **Monday**:

```js
monday.setUTCDate(monday.getUTCDate() - ((endDate.getUTCDay() + 6) % 7));
```

So for `wk of 2026-08-24`, week 0 is Mon 08-24 → Sun 08-30 and **week 1 is Mon
08-31 → Sun 09-06**. This pull ran 2026-09-02 05:23 UTC (01:23 ET), so week 1
has **~2.2 of 7 days elapsed**. It closes 09-06 and is not readable until the
09-07 pull at the earliest.

| cohort | week-1 | rate | cell complete? |
|---|---|---|---|
| wk of 07-27 | 5 / 228 | 2.19% | yes |
| wk of 08-03 | 4 / 243 | 1.65% | yes |
| wk of 08-10 | 15 / 445 | 3.37% | yes |
| wk of 08-17 | 10 / 536 | 1.87% | yes |
| **wk of 08-24** | **4 / 891** | **0.45%** | **NO — ~2.2 of 7 days** |

The four comparison cohorts are all full 7-day cells. A partial cell measured
against full ones will always read lowest, so **0.45% is not evidence of
anything** — not a retention decline, and not support for §J's "cohort size
tripled while return did not rise." The counts themselves are right (3/891 in
last night's pull, 4/891 tonight); only the completeness claim was wrong.

Last night's report was correct to flag the cell as incomplete. It was not "one
day short of a full week" — it was five.

**Re-check:** the 09-07 pull, for the 08-24 cohort's week-1 cell once it
actually closes. Datacenter-user inflation (§2 of `ANALYTICS_CONTEXT.md`,
7.7–11.9%) will still apply then, so even the closed number is a floor.

**Generalized and written down** so this does not recur: a cohort's newest
`cohortNthWeek` cell is partial until that Monday–Sunday week closes, which is
a bucket-boundary problem, not the daily-tail lag §1 describes. Filed as a
proposed addition to `ANALYTICS_METHOD.md` §1 below.

### 5. Promotion CTR delta over the ~23h since last pull reads near-zero — likely a tail-maturity artifact, not a behavior change.

| promotion | 09-01 pull | 09-02 pull | delta |
|---|---|---|---|
| `lp_get_tickets` | 384 / 63 | 442 / 63 | +58 views / **+0 clicks** |
| `lp_sticky_bar` | 35 / 19 | 56 / 19 | +21 views / **+0 clicks** |
| `get_tickets_block` | 39 / 24 | 48 / 25 | +9 views / +1 click |

Every prior delta in this series read 7.5–18.2% CTR; tonight's reads ~1.1%
overall. Given §1 above — the sessions generating these views are
disproportionately from 09-01 and 09-02, the two days whose data is still
settling — this reads as an artifact of comparing a mostly-complete pull to a
barely-started one, not a real drop in click-through. Not trending it; flagging
so it is not mistaken for one next time this method is used.

### 6. `/founding` — already fixed, not a new finding.

`ga4-api-funnel-checkout-by-landing-page` shows 48 cumulative sessions to
`/founding` across the whole window. `vercel.json:98` and commit `f1af682`
("Repoint /founding to /lp, and stop caching it as permanent," merged
**2026-09-02 00:52 ET**, on `main` before this run started) confirm this is
already resolved — the 48 sessions predate the fix. Noting this explicitly
because tonight's earlier discarded dry run (see provenance note above) had
independently rediscovered it as if new; it is not.

---

## NEEDS TAYLOR INPUT

1. **Marion Court's cart→purchase moved: 3 seats of 9 added to cart (33.3%) →
   5 of 11 (45.5%); $49.97 → $99.95.** *(New — HEADLINE.)* Seats, not orders —
   the 5 seats are 4 orders. This is the exact number `ANALYTICS_CONTEXT.md`
   §3b names as the sole trigger for reopening the venue/ad-set discussion, and
   it has moved for the first time. The two new orders predate the 2026-09-02 ad changes and
   are not attributable to a specific channel yet (session source still reads
   `(not set)`, consistent with the attribution-backfill lag in §1). Whether
   this is enough to reopen anything is a business call, not an analytics one.
   **Re-check:** tomorrow's pull, for (a) whether the `(not set)` row resolves
   into `mc_rt_*` or elsewhere, and (b) whether the count keeps moving.
2. **`card_incomplete` checkout errors: 15/7 → 18/8 users.** *(2nd ask — also
   in.)* Still small, still a form-completion issue rather than a decline.
   **Re-check:** same table, in another week.
3. ~~**wk-of-08-24 cohort's week-1 return is 0.45%, the lowest complete cohort
   reading yet.**~~ **WITHDRAWN — this ask was built on an incomplete cell and
   should not have been raised.** See §4: week 1 of that cohort runs 08-31 →
   09-06 and was ~2.2 of 7 days elapsed at pull time. There is no retention
   question to answer yet. **Re-check:** the 09-07 pull, when the 08-24 and
   08-31 cohorts' week-1 cells both close. Nothing for you to decide here now.

**Nothing from `ANALYTICS_CONTEXT.md` §3b was re-asked** except the Marion
Court item above, which §3b itself names as the one condition that reopens it.
The internal-traffic filter, `ads_conversion_About_Us_1` (still frozen at 99),
Google Ads (still dark), and `next_event_fetch_failed` were all checked and
left alone.

---

## Proposed zero-risk fixes — described only, NOT applied

0. **Add a cohort-completeness rule to `ANALYTICS_METHOD.md` §1.** *(APPLIED
   SEPARATELY — this is the one fix on this list that is being made, on its own
   branch, because it is what caused §4's error.)* A cohort's newest
   `cohortNthWeek` cell is partial until its Monday–Sunday week closes, and
   comparing it against closed cells manufactures a decline. This is a
   bucket-boundary problem, distinct from §1's daily-tail lag, and §1 currently
   says nothing about it.
1. **Extend `ANALYTICS_METHOD.md` §1's "drop the last two days" rule to
   explicitly cover by-source additivity**, not just engagement. Currently §1
   only names engagement lag (1a) and the proportional undercount (1b); last
   night's §A described the additivity artifact as hitting only the final day.
   Tonight's measurement (§1 above: 08-31 exact, 09-01 +35.5%, 09-02 +3) shows
   it is a two-day tail artifact like the others. Folding it into the existing
   rule avoids a fourth semi-duplicate trap description.
2. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp.** Still 2026-08-26.
   **4th ask.** Four consecutive nightly reports have now spent a sentence
   ruling it out as a fork.
3. **Record the Meta `meta-insights-*.csv` schema gap** (§3 above): no
   `reach`/`frequency` column, which blocks the Marion Court Retargeting
   frequency watch signal from HANDOFF entirely. If that signal matters,
   `scripts/fetch-meta-insights.js` (or wherever the field list lives) needs
   `reach` added to the requested fields.
4. **Note in `ANALYTICS_METHOD.md`** that `meta-insights-<date>.csv` is named
   for the window's *last day*, one day behind the pull date — tonight's fresh
   pull is `meta-insights-2026-09-01.csv`, not `-09-02`. Worth a one-line
   callout so a future reader doesn't mistake the newest file for stale data.

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26, stated at
  the top per its own instruction. `reports/ANALYTICS_METHOD.md` read in full
  and treated as authoritative on every measurement question; where the two
  disagreed on framing (the additivity artifact's day count), I said so
  explicitly rather than picking one silently.
- **Which caveats were load-bearing tonight.** §1 (both halves) is the entire
  content of the "also in the report" §1 and is what makes the headline's
  attribution unresolved rather than wrong. §7 is why the headline's revenue
  figures are never called business revenue. §9 is why the Meta section makes
  no week-over-week claim. §10 (the funnel step redefinition on 2026-09-01) is
  why no funnel step count is quoted as a purchase total — `revenue-daily` and
  `items-daily` were used instead, per that section's own instruction. §12
  governs every small-n statement (n=8 checkout-error users, n=2 new Marion
  Court transactions, n=1 Tellus click).
- **Additivity and control checks.** Key-event decomposition closes exactly:
  99 + 93 + 39 = 231, matching the events table and `revenue-daily`'s
  transaction count. `revenue-by-source` sums to $1,061.12 across 39
  transactions, matching `revenue-daily` and `key-events` to the cent.
  `itemsPurchased` 41 vs `transactions` 39 is the documented #205 2-for-1 seat
  count, not two extra sales. `itemRevenue` $968.60 vs `totalRevenue` $1,061.12
  (gap $92.52) is in the range of the documented ~$2.50/order fee gap across 39
  orders, not verified to the order. Daily sessions sum to 5,019 against a
  grand total of 4,911 (+108, +2.2%) — per method, not reconciled to the unit.
  By-source sums match `daily-trend` on 94 of its 96 dated rows; the two
  exceptions are discussed above and are not a new failure mode.
- **Correction applied after review.** Three errors in the first version of this
  report were caught by re-deriving its figures from the pull files: §4 called
  an incomplete cohort cell complete and drew a retention conclusion from it
  (the substantive one — §4 is rewritten and NEEDS TAYLOR INPUT #3 withdrawn);
  the headline labelled `itemsAddedToCart`/`itemsPurchased` as "carts" and
  "purchases" when they are seats, not orders; and §1's day count read "95 of
  97" against a file holding 96 dated rows. Every other figure in this report
  was re-checked against the same files and verified unchanged — Meta's $172.72
  across 8 campaigns, the promotion deltas, the checkout-error counts, the
  additivity table's +38/+3, and the 48 `/founding` sessions.
- **What I did not verify.** The Marion Court Retargeting frequency watch
  signal (HANDOFF) — no `reach` field in `meta-insights`. Which specific
  channel drove the two new Marion Court purchases — session source is still
  `(not set)` and will not resolve until attribution backfills. The `(not
  set)` checkout-error category's exact pre-bucketing date boundary, same as
  last night — not re-investigated.
- **Parsing.** Every file parsed from its own real header after the `#` block;
  `Grand total` rows excluded from row-level aggregation and used only as
  independent checks. No column names hardcoded. No CSV was moved, renamed, or
  modified. Scratch parsing helper lived in the system temp directory, not in
  this checkout, and is not part of this commit.
- **Source reading.** `vercel.json` and `git log` were read to confirm the
  `/founding` fix's merge time relative to this run. Nothing else outside
  `reports/` was modified.
