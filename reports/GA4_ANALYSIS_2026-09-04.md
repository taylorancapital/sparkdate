# GA4 analysis — 2026-09-04 (third pull of the day)

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something
that was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last updated:
2026-08-26."** The newest report already on *this branch's* history is
`GA4_ANALYSIS_2026-09-02.md`, so the stamp is older and may have forked. I
checked its §3b settled list against everything below and re-ask nothing
already settled there.

**Operational note.** This is the **third** `nightly-ga4` run today. Two
earlier same-day reports already exist on unmerged sibling branches, both
also targeting `reports/GA4_ANALYSIS_2026-09-04.md`: PR #427 (pulled 05:31
UTC / 01:31 ET) and the branch behind PR #433 (pulled 15:55 UTC / 11:55 ET,
headlined "Marion Court's Facebook-Event sale is now confirmed"). This
pull ran at **16:31 UTC / 12:31 ET, 36 minutes after the second one.** I
diffed this pull directly against the preserved 11:55 pull
(`Night Tasks/_preserved/2026-09-04T1155-cited-by-PR433/`, kept there for
exactly this reason) rather than re-deriving everything from scratch, and
confirmed: `revenue-by-source`, `revenue-daily`, `key-events`,
`checkout-errors`, `items-daily`, and `funnel-by-channel` are **byte-identical**
except for the pull timestamp. Only the still-open current day (2026-09-04)
ticked from 24 to 25 sessions — fully inside the excluded tail per §1 anyway
— and the still-filling `wk of 2026-08-31` cohort baseline ticked 550 to 551
users, expected for an open cohort week, not a change to a closed one. **So
the funnel and revenue picture is unchanged from this morning's two reports**,
and this report does not re-litigate it. What tonight's pull adds instead: it
is the first pull today — and the first on record in this repo's report
history — to include roughly 18 brand-new GA4 tables (46 files written
tonight vs. 28 in both of this morning's runs), most visibly Google Ads cost
detail and a per-transaction table. That is this report's focus.
**Whoever reviews these PRs should merge one of the three and expect a
conflict on the other two, not three separate reports living side by side.**

**Data.** GA4 Data API, property 536859339, window `20260519-20260904`,
pulled **2026-09-04 16:31 UTC**, read from each file's own `#` header. Meta:
`meta-insights-2026-09-03.csv`, window `20260828-20260903`, 6 campaigns —
the identical window both earlier reports today already covered (re-pulled
~40 min and ~11h later respectively), not a new week.

---

## HEADLINE — Tonight's pull is the first to carry Google Ads and per-transaction detail from GA4 itself. The Google Ads numbers confirm the account is still dark; the transaction table exposes a pre-existing ID-reuse issue (PR #200) that was invisible until now.

Four new Google Ads tables appeared for the first time
(`ga4-api-google-ads-cost`, `-cost-daily`, `-by-network`, `-creatives`). Their
lifetime totals — **$37.912513 spend, 114 clicks, 509 impressions** — match
`ANALYTICS_CONTEXT.md` §3b's Ads-Manager-sourced figures ($37.91 / 114 /
509) to the cent, and `ga4-api-google-ads-cost-daily`'s last dated row is
**2026-07-24** (`Website traffic-Search-1`, $4.12), consistent with the
account going dark that date. **This is confirmation from a second,
independent source (GA4's own advertiser-linked dimensions, not the Ads
Manager UI), not a new finding — Google Ads is still settled per §3b and this
does not reopen it.**

The second new table, `ga4-api-transactions` (transaction_id × date), carries
its own header note flagging that **`transaction_id` is being reused**: the
Firestore-style doc id `8E9WZTat32JyoUjWuIE7` appears on 08-15 (3
transactions, $82.47) and again on 08-18 (2 transactions, $54.98) and again
on 08-16 and 08-07/08-14 — one id covering up to 8 orders across four
different dates. Stripe payment-intent ids (`pi_...`) carry exactly one
transaction each. Across the whole window, **16 distinct ids account for 39
transactions**, so GA4's own de-duplication is not operating on most
purchases here. The file's note states plainly this was not established as
either legacy data or a live regression — that's PR #200, still open. I did
not investigate further; it belongs in NEEDS TAYLOR INPUT / zero-risk fixes
below, not this report's scope to resolve. **It does not put any number in
this report in doubt** — `revenue-by-source`, `revenue-daily`, and
`key-events` all independently sum to the same $1,061.12 / 39 transactions
already cross-checked in the last two reports, so the aggregate figures are
unaffected; this is a data-quality flag on the newly-visible per-transaction
table specifically, not on the totals.

One direct, useful thing the transactions table does confirm: the two
2026-09-01 purchases central to PR #427/#433's Marion Court discussion are on
two distinct Stripe ids (`pi_3UAspoRsTCYDr2LL1PSccXsa`,
`pi_3UAxgVRsTCYDr2LL09rl5qU2`), each appearing exactly once — genuinely two
separate orders, not one reused id double-counted. It still does not carry a
source/medium column, so it does not resolve which channel each came from;
that stays circumstantial per the prior two reports.

---

## ALSO IN THE REPORT

### 1. `new-vs-returning` (new table) independently corroborates the "returning visitor worth ~10.9x" finding from #428, from a GA4-native dimension this time.

| segment | sessions | users | key events | revenue | revenue/user |
|---|---|---|---|---|---|
| returning | 1,233 | 222 | 68 | $409.36 | $1.844 |
| new | 3,857 | 3,864 | 163 | $651.76 | $0.169 |

$1.844 / $0.169 ≈ **10.9x**, matching #428's figure — now confirmed via
GA4's own `newVsReturning` dimension rather than site-side computation, on a
respectable n (222 returning users). Separately, **216 sessions / 134 users
file under `(not set)`, $0 revenue** — an untagged bucket worth a look if
this table gets used again, not flagged as urgent tonight.

### 2. `audiences` (new table) is non-additive by construction — a trap worth documenting before someone reports it as incremental revenue.

`Purchasers` reads 393 sessions / 35 users / 56 key events / **$1,061.12** —
matching the property's *entire* revenue for the window, not a purchaser
segment's share of it. The file's own Grand total row sums to **$2,122.24**,
exactly 2× real revenue, because GA4 audience membership is evaluated across
a user's whole history: a purchaser's *pre-purchase* sessions also count
toward `Purchasers`, so `All Users` and `Purchasers` overlap rather than
partition. Nobody has misread this yet — it's new tonight — but it has the
same shape as the by-source additivity trap already in `ANALYTICS_METHOD.md`
§1, so it belongs there before it causes one. See zero-risk fixes.

### 3. `geo-country-language` (new table) flags its own suspect-traffic bucket.

Its header note: **118 sessions report country `(not set)` / continent `ZZ`
and fire 82 key events — a 58% rate against roughly 3% property-wide, all on
$0 revenue.** That is a hard anomaly (58% "conversion" to key events with
zero dollars behind it reads like automated traffic, not real visitors) and
it's the pull script's own annotation, not something I derived — worth
carrying into `ANALYTICS_METHOD.md` as a named trap (see zero-risk fixes)
rather than re-discovering it next time this table gets used for an
engagement or conversion rate.

### 4. Checkout error reasons (new table) adds no new signal — same 28 events, one has readable text.

`checkout-error-reasons`: 25 `(not set)`, 3 `"your postal code is incomplete."`
— sums to the same 28 events already reported (18 `card_incomplete` + 8
`(not set)` + 1 `card_declined` + 1 `other`) across the last three pulls. The
postal-code reason is legible and specific; n=3 per §12, not a pattern yet.

### 5. Meta: `20260828-20260903`, $161.21 across 6 campaigns — one cent above this morning's $161.20, two cents above 01:31's $161.19. No week-over-week comparison; identical window to both earlier reports today, per §9.

| campaign | spend | impressions | clicks |
|---|---|---|---|
| Marion Court \| Traffic | $50.39 | 8,161 | 191 |
| Campaign 1 Event 3 Good Good Campaign | $45.87 | 7,745 | 255 |
| Marion Court Retargeting | $28.54 | 1,508 | 22 |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | $21.72 | 1,026 | 29 |
| Loxleys \| Traffic | $14.69 | 2,290 | 184 |
| Campaign 1 Tellus AfterDark: Singles Edition Retargeting | $0 | 0 | 0 |

Movement since 11:55 is one more cent of accrued Marion Court \| Traffic
spend and single-digit impression/click drift elsewhere — noise, consistent
with both earlier reports today, not a decision.

---

## NEEDS TAYLOR INPUT

1. **`ANALYTICS_CONTEXT.md`'s "Last updated" stamp is still 2026-08-26.**
   This is the **seventh** report to spend a sentence on it. *(7th ask.)*
2. **Nothing else new.** Marion Court attribution, the scrambled email UTM
   string, and the frequency-field gap were all raised in the last two
   reports today and are unchanged — not re-asked here. Nothing from
   `ANALYTICS_CONTEXT.md` §3b was reopened.

---

## Zero-risk fixes — described only, NOT applied

1. **Add the `audiences` table's non-additivity to `ANALYTICS_METHOD.md`**
   (§3 above) — audience membership spans a user's whole history, so
   `Purchasers` vs. `All Users` overlap rather than partition, and any sum
   across audience rows double-counts purchaser revenue.
2. **Add the geo `(not set)`/`ZZ` suspect-traffic bucket to
   `ANALYTICS_METHOD.md`** (§3 above) — 118 sessions, 58% key-event rate,
   $0 revenue, flagged by the pull script itself but not yet in the
   standing method file.
3. **Investigate whether `transaction_id` reuse (PR #200, surfaced tonight
   by the new `transactions` table) is legacy data or a live regression** —
   the file's own note says this is unresolved. Does not affect any revenue
   figure quoted in this or prior reports, since those are independently
   cross-checked, but it undermines using the new per-transaction table for
   anything that assumes one id = one order.
4. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp** (7th ask, listed
   above too since it needs a person).
5. Carried, unchanged, from PR #427/#433: fold by-source additivity into
   `ANALYTICS_METHOD.md` §1 as a same-day-clearing tail artifact; add a
   `reach`/`frequency` field to the Meta pull; note that
   `meta-insights-<date>.csv` is named for the window's last day, one day
   behind the pull date.

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26, stated at
  the top. `reports/ANALYTICS_METHOD.md` read in full and treated as
  authoritative on every measurement question.
- **Which caveats were load-bearing tonight.** §1 excludes 2026-09-04
  outright (partial day, 25 sessions) and governs the open `wk of 2026-08-31`
  cohort cell (551 users, not comparable to a closed cohort). §7 is why no
  GA4 revenue figure here is called business revenue. §9 is why the Meta
  section makes no week-over-week claim against an identical window. §12
  governs every small-n statement: n=3 postal-code errors, n=1 for each
  distinct Stripe id in the transactions spot-check.
- **Additivity and control checks.** `revenue-by-source`, `revenue-daily`,
  and `key-events` all independently sum to $1,061.12 / 39 transactions / 231
  key events, byte-identical to the 11:55 pull and matching both prior
  reports today. `itemsPurchased` (41) vs. `transactions` (39) is the
  documented #205 2-for-1 seat count. Google Ads' GA4-derived lifetime
  totals ($37.91 / 114 clicks / 509 impressions) match `ANALYTICS_CONTEXT.md`
  §3b's Ads-Manager-derived figures exactly — an independent-source
  cross-check that passed. `checkout-error-reasons` (28 events) sums to the
  same total as `checkout-errors`, different dimension, same total.
- **What I did not verify.** Which channel each of the two 2026-09-01
  transactions actually came from — the new transactions table confirms they
  are two distinct orders but carries no source/medium column, so that stays
  circumstantial per PR #427/#433. Whether `transaction_id` reuse (§ above)
  is a live regression or legacy-only — flagged, not investigated, per PR
  #200. The 14 other newly-arrived tables not discussed above
  (`by-day-hour`, `users-daily`, `page-views`, `weekly-trend`,
  `utm-ad-detail`, `first-user-tagging`, `session-quality-daily`) were
  skimmed for anything alarming and found none, but were not analysed in
  depth — flagging their existence for a future report rather than claiming
  full coverage tonight.
- **Parsing.** Every file parsed from its own real header after the `#`
  block; Grand total rows excluded from row-level aggregation and used only
  as independent checks. No column names hardcoded. No source CSV was moved,
  renamed, or modified. No scratch files were left in this checkout.
- **Source reading.** PR #427's and PR #433's report content were read via
  `git show origin/claude/nightly-ga4-2026-09-04` and
  `git show origin/claude/nightly-ga4-2026-09-04-1156` for continuity only.
  Nothing outside `reports/` was modified.
