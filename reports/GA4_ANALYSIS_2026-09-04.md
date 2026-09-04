# GA4 analysis — 2026-09-04

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something
that was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last updated:
2026-08-26."** The newest report already on this branch's history is
`GA4_ANALYSIS_2026-09-02.md` (no report exists for 2026-09-03 — the last
report before this one is two nights back, not one), so the stamp is older
than the newest report and may have forked. I checked its §3b settled list
against everything raised below and re-ask nothing already settled there.
This is the **fifth consecutive report** to spend a sentence on that stamp.

**Data.** GA4 Data API, property 536859339, window `20260519-20260904`,
**pulled 2026-09-04 05:31 UTC** (01:31 America/New_York), read from each
file's own `#` header. There is no `20260904` row in any daily table — the
property's day was ~1.5 hours old at pull time and GA4 had nothing to report
yet, not a data fault. Meta: `meta-insights-2026-09-03.csv`, window
`20260828-20260903`, 6 campaigns (2 more from last week's 8 have stopped
spending — see Meta section). No hand-exported `download*.csv` is newer than
the API set; those are still dated `20260519-20260827` and were skipped.

---

## HEADLINE — Marion Court's two 09-01 purchases have resolved out of `(not set)`. Neither lands on a retargeting ad; the likely channels are email and a Facebook Event listing.

`ANALYTICS_CONTEXT.md` §3b's Marion Court trigger condition (cart→purchase
moving) fired in the 2026-09-02 report: two new 09-01 orders, $54.98, landed
in `revenue-by-source` as a brand-new `(not set) / 2 / $54.98` row, with the
channel unresolved. That report flagged it as "re-check tomorrow's pull for
whether the `(not set)` row resolves."

Tonight's `ga4-api-revenue-by-source` has **no `(not set)` row at all**, and
total transactions (39) and total revenue ($1,061.12) are byte-for-byte
identical to the 09-02 pull — so nothing new was sold; only attribution
shifted. Diffing the two pulls row by row, exactly two rows changed:

| row | 09-02 pull | 09-04 pull | delta |
|---|---|---|---|
| `(not set)` | 2 txns / $54.98 | *(gone)* | −2 / −$54.98 |
| `email / returning` | 1 txn / $21.49 | 2 txns / $48.98 | **+1 / +$27.49** |
| `facebook_event / listing` | *(absent)* | 1 txn / $27.49 | **+1 / +$27.49 (new row)** |

+$27.49 +$27.49 = the exact $54.98 that vanished from `(not set)`, and no
other row moved at all. This is arithmetic, not inference, for the *fact*
that the two orders resolved into these two rows. **What is inference, not
verified:** there is no item-by-source cross-tab in this pull, so I cannot
directly confirm these two specific transactions are the Marion Court seats
rather than some other pair of $27.49 orders that happened to resolve the
same night. The circumstantial case is strong — item-level data shows no
other item gained a sale on 09-01, `items-daily`'s last dated row is still
2026-09-01 for "SparkDate: Real People, Real Drinks, Real Court" ($49.98 item
revenue, $54.98 with the documented ~$2.50/order fee), and no other unresolved
row of that size existed to reassign — but say plainly that it is circumstantial.

**Neither resolved channel is a Marion Court retargeting ad.** All three
`mc_rt_*` `utm_content` tags still show zero revenue in `ga4-api-utm-content`
tonight, same as both prior pulls. If tonight's attribution holds, the answer
to last report's open question is: **the two purchases that reopened the §3b
discussion did not come from the retargeting spend under review** — one
traces to a returning-visitor email click, one to a Facebook Event page
listing (organic engagement with the event's own Facebook Event, not an ad).

This is a judgment call for Taylor, not an analytics one — see NEEDS TAYLOR
INPUT below.

---

## ALSO IN THE REPORT

### 1. Nothing else in the funnel moved — and that is expected, not a null result.

Key events (231: 99 About_Us + 93 `generate_lead` + 39 `purchase`), checkout
errors (28: 18 `card_incomplete`/8 users, 8 `(not set)`/7, 1 `card_declined`,
1 `other`), and revenue are **identical** between the 09-02 and 09-04 pulls.
The only two calendar dates added since the last report — 09-02 and 09-03 —
both fall inside the mandatory two-day tail-exclusion window (`ANALYTICS_METHOD.md`
§1), and there is no 09-04 row at all yet. So the only date this pull adds
*usable* information for is **09-01**, which is now three-plus days back and
safe to read. Do not read "flat since 09-02" as "nothing happened" — it means
"nothing has finished loading yet."

### 2. 09-01 itself is an unremarkable Tuesday, once you check it against other Tuesdays.

Sessions ran 220 (Sun 08-30) → 169 (Mon 08-31) → 109 (Tue 09-01), which reads
like a decline if you don't correct for day-of-week. Checked against the
three prior Tuesdays in the window: 08-12 (73), 08-19 (60), 08-25 (141 —
filter-activation day), 08-11/08-18 both 101. 109 sits inside that range.
**No signal here, logged so the shape isn't mistaken for a trend next time.**

### 3. By-source additivity artifact reproduced again, on the opposite day from last time.

| date | position | trend sessions | by-source sum | diff | `(not set)` sessions |
|---|---|---|---|---|---|
| 2026-08-31 | 4th from last | 169 | 169 | 0 | — |
| 2026-09-01 | 3rd from last | 109 | 109 | 0 | — |
| 2026-09-02 | 2nd from last | 85 | 86 | +1 | — |
| 2026-09-03 | final | 205 | 267 | **+62 (+30.2%)** | **73** |

09-02 (second-to-last) is essentially exact tonight; 09-03 (the final day)
carries nearly all of the artifact. Last report's version of this table had
the opposite shape — the *second*-to-last day carried the artifact (+35.5%)
while the final day was small (+3). Two data points now show the artifact can
land on either of the last two days, which is exactly why the existing
recommendation is to drop **both**, not just the final one. `ANALYTICS_METHOD.md`
§1 still only names engagement lag and the proportional undercount explicitly;
folding in by-source additivity has been a described zero-risk fix since
2026-09-02 and is still not applied (see below).

### 4. The 2026-09-03 `/lp` checkout instrumentation is live but too new to read.

Per `ANALYTICS_METHOD.md` §10's 2026-09-03 entry, `/lp` began selling inline
that day and four new event/parameter types shipped. Tonight's `ga4-api-events`
confirms two of them are firing: `checkout_field_started` (2 events, 1 user)
and `lp_visible` (58 events, 53 users). Both are inside the excluded tail
window (the change is ~36 hours old at pull time) and `checkout_field_started`
in particular is far below any usable sample size per §12. Noted as a live
baseline, not analysed — there is no landing-page dimension on
`ga4-api-events-by-source` to isolate `/lp`'s before/after shape, and the
whole-window `funnel-checkout-by-landing-page` table necessarily mixes the old
and new `/lp` shapes per §10's own warning. Re-check once a few more days of
post-09-03 data clear the tail.

### 5. Cohort retention: wk-of-08-24 week-1 still open; a new cohort baseline appeared.

`wk of 2026-08-24`'s week-1 cell (Mon 08-31–Sun 09-06) reads unchanged at
**4/891 (0.45%)**, now roughly 4 of 7 days elapsed. Still not comparable to
the four closed cohorts (1.65%–3.37%) per the rule in `ANALYTICS_METHOD.md`
§1(c) — not re-raising this as a finding, just tracking it. **`wk of
2026-08-31`'s week-0 baseline appeared for the first time** (513 users) — a
new cohort entering the table, not a change in an existing one. Re-check due
2026-09-07, when 08-24's week-1 cell actually closes.

### 6. Meta: `20260828-20260903`, $161.19 across 6 campaigns. No week-over-week comparison — 5 of 7 days overlap the prior pulled window, per §9.

| campaign | spend | impressions | clicks | CPC |
|---|---|---|---|---|
| Marion Court \| Traffic | $50.38 | 8,158 | 191 | $0.2638 |
| Campaign 1 Event 3 Good Good Campaign | $45.87 | 7,745 | 255 | $0.1799 |
| Marion Court Retargeting | $28.54 | 1,507 | 22 | $1.2973 |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | $21.72 | 1,026 | 29 | $0.7490 |
| Loxleys \| Traffic | $14.68 | 2,289 | 184 | $0.0798 |
| Campaign 1 Tellus AfterDark: Singles Edition Retargeting | $0 | 0 | 0 | — |

The two `…Sales-Obj-Women` / `…Sales-Obj-All-Genders` Tellus variants whose
CPC anomaly self-corrected and was retired in the 09-02 report are **absent
from this window entirely** — they show as `PAUSED` in tonight's Paid Ad UTM
refresh log, consistent with "self-corrected and done," not a new finding.
`Loxleys | Traffic` remains the cheapest traffic on the account at $0.0798
CPC (was $0.078 two reports ago — essentially flat). The Marion Court
Retargeting frequency watch signal (from HANDOFF) still cannot be checked:
`meta-insights-<date>.csv` still carries no `reach` or `frequency` column,
same gap flagged 09-02.

---

## NEEDS TAYLOR INPUT

1. **Marion Court's two 09-01 purchases very likely trace to `email / returning`
   and `facebook_event / listing`, not to any retargeting ad.** *(Continuation
   of the 09-02 headline, not a fresh ask — but it changes the shape of that
   question.)* If this attribution holds on a future pull, the §3b "cart→purchase
   moved" trigger that reopened the venue/ad-set discussion was driven by organic
   engagement, not the paid spend under review. Whether that changes anything
   about the Marion Court ad-set decision is a business call. **Re-check:**
   whether these two rows stay put on the next pull (attribution can still
   shift for a few days per §1), and whether a future item-by-source table
   would let this be confirmed rather than inferred.
2. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp.** Still 2026-08-26.
   **5th ask.** Five consecutive nightly reports have now spent a sentence
   ruling it out as a fork.

**Nothing from `ANALYTICS_CONTEXT.md` §3b was re-asked** beyond the Marion
Court item above, which §3b itself names as the one condition that reopens
it. Internal-traffic filter, `ads_conversion_About_Us_1` (frozen at 99),
Google Ads (dark), and `next_event_fetch_failed` (#299) were all checked
against §3b and left alone.

---

## Zero-risk fixes — described only, NOT applied

1. **Extend `ANALYTICS_METHOD.md` §1 to explicitly name by-source additivity
   as a two-day tail artifact.** Carried from 09-02, still not applied.
   Tonight's data (§3 above) adds a second data point showing the artifact
   can land on either of the last two days, not reliably the same one —
   stronger reason to fold it into the existing "drop the last two days" rule
   rather than leave it implicit.
2. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp** (5th ask, also
   listed above as it needs a person, not code).
3. **Add a `reach`/`frequency` field to the Meta insights pull.** Carried
   from 09-02; still blocks the Marion Court Retargeting frequency watch
   signal from HANDOFF.
4. **Note in `ANALYTICS_METHOD.md` §9 that `meta-insights-<date>.csv` is
   named for the window's last day, one day behind the pull date.** Carried
   from 09-02 as a minor callout to prevent a future reader from mistaking
   the newest file for stale data — tonight's fresh pull is again named for
   the day before the pull ran (`-2026-09-03`, pulled 2026-09-04).

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26, stated at
  the top per its own instruction. `reports/ANALYTICS_METHOD.md` read in full
  and treated as authoritative on every measurement question.
- **Which caveats were load-bearing tonight.** §1 is why 09-02 and 09-03 are
  excluded from every trend and why the headline's attribution is stated as
  "very likely" rather than "confirmed" — the underlying rows themselves are
  still inside the backfill window even though the *dollar total* is stable.
  §7 is why revenue figures are never called business revenue. §9 is why the
  Meta section makes no week-over-week claim (5 of 7 days overlap). §10 is
  why the checkout-by-landing-page and channel funnels are not used to
  measure the 09-03 `/lp` change — the whole-window tables necessarily mix
  pre- and post-change shapes, and the post-change days are too few and too
  fresh regardless. §12 governs every small-n statement here (n=2 for
  `checkout_field_started`, n=1 new `facebook_event / listing` transaction,
  n=4/891 for the open cohort cell).
- **Additivity and control checks.** Key-event decomposition closes exactly:
  99 + 93 + 39 = 231, matching `ga4-api-events` and `ga4-api-key-events`.
  `revenue-by-source` sums to $1,061.12 across 39 transactions, matching
  `revenue-daily` and `key-events` to the cent, identical to the 09-02 pull.
  `itemsPurchased` 41 vs `transactions` 39 is the documented #205 2-for-1
  seat count. By-source sums match `daily-trend` on 95 of 97 dated rows; the
  two exceptions are the last two days, discussed in §3 above.
- **What I did not verify.** Which specific transactions resolved into
  `email / returning` and `facebook_event / listing` — no item-by-source
  cross-tab exists in this pull, so the Marion Court link is circumstantial,
  stated as such above. Whether the 09-03 `/lp` instrumentation is producing
  the intended funnel shape — the data is real but far too thin (§4 above) to
  say anything about it yet. The Marion Court Retargeting frequency watch
  signal — still no `reach` field in `meta-insights`.
- **Parsing.** Every file parsed from its own real header after the `#`
  block; `Grand total` rows excluded from row-level aggregation and used only
  as independent checks. No column names hardcoded. No CSV was moved,
  renamed, or modified. The scratch parsing helper lived in the system temp
  directory, not in this checkout, and is not part of this commit.
- **No report exists for 2026-09-03** on this branch's history — the last
  report before this one is `GA4_ANALYSIS_2026-09-02.md`, two nights back.
  Not investigated further; out of scope for a report-only run.
