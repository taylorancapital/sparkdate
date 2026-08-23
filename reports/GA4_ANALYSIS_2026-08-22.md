# GA4 + Meta Analysis — 2026-08-22 (Nightly Automation, Cowork Session)

**This run made zero code changes.** The only file added on this branch is this report. Every
recommendation below is written for a human to apply or reject — nothing was applied, not even a
one-character fix.

**`ANALYTICS_CONTEXT.md` was read in full before any number below was computed**, per the new
STEP 1. Where its caveats bear on a figure, that is stated inline rather than left implicit. Two
of its traps changed what this report says: the `begin_checkout` redefinition, and the Meta
rolling-window artifact.

---

## What was analyzed

- **37 `download*.csv` files.** 36 carry window `20260519-20260822` in their own `#` header;
  `download 35.csv` carries `20260524-20260821` and is the previous pull of the same Webview
  exploration, which makes it a useful one-day baseline rather than a stale file.
- **Deduplicated first.** `download (7).csv` == `download.csv`; `download (8).csv` ==
  `download (9).csv`; `download (10)`, `(12)`, `(13)`, `(15)` are four copies of one file (md5).
  `download (1).csv` is a near-duplicate of `download.csv` taken moments earlier (1,123 vs 1,124
  paid sessions) — the larger was used.
- **`data.pdf`** (Key Events Breakdown). **`data (1).pdf` — the Path Exploration — is missing from
  this drop.** The 08-20 report noted it "carries a finding no CSV surfaces." Worth re-exporting.
- **Meta**, pulled today via the Windsor connector: `meta-insights-2026-08-21.csv` (Aug 15–21),
  `meta-insights-2026-08-22.csv` (Aug 16–22, partial today), and
  `meta-insights-daily-2026-08-22.csv` (daily × campaign, Aug 15–22).
- **Source** from a fresh clone of `main`, HEAD `14e55fd` (#250, 2026-08-22) — this is the first
  nightly report whose clone actually contains the Aug 22 changes.
- **Prior period:** `reports/GA4_ANALYSIS_2026-08-20.md` (window `…-20260819`, $743.73 / 28).

**Two filenames are malformed:** `download (38.csv` (missing closing paren) and `download 35.csv`
(missing both). They still match a `download*.csv` glob so nothing broke, but a parser splitting on
parens would mishandle them. Worth renaming at the source.

---

## Headline

**Revenue $743.73 / 28 → $803.71 / 30, and both new transactions are Meta paid social — the first
time that has happened.** `Facebook / paid_social` went 1 → 2 ($32.49 → $64.98) and
`Instagram / paid_social` 1 → 2 ($27.49 → $54.98). Meta-paid share of GA4 revenue rose from
**8.1% to 14.9%**.

Read carefully, because two things temper it. First, only **one** of the two is genuinely new:
the day-level revenue trend shows the $32.49 landed on **Aug 19**, a day the 08-20 report
explicitly flagged as provisional because the CSVs were exported that evening. It is a backfill,
not a new sale. The genuinely new one is **$27.49 on Aug 22**. Second, **Aug 20 and Aug 21 both
recorded $0.00.** So the three complete new days produced one sale, not two.

Per `ANALYTICS_CONTEXT.md`: GA4 revenue is own-site only and misses the ~55% arriving through
Eventbrite and Meetup. None of the figures above are total revenue.

---

## Findings

### F1 — About 7% of GA4 transactions are attributed to internal UI element names, not channels

`Revenue by Source` (`download (19).csv`) contains two rows that are not acquisition channels:

| Session source / medium | Transactions | Revenue |
|---|---|---|
| `get_tickets_block / (not set)` | 1 | $27.49 |
| `matches / (not set)` | 1 | $27.49 |

That is **2 of 30 transactions and $54.98 of $803.71 (6.8%)** filed under strings that name parts of
our own interface. `matches` is the known, already-fixed bug (#237) and this is its residue.
**`get_tickets_block` is not documented anywhere and is new to this analysis.**

It is a `promotion_name`, not a source — `public/index.html:1098` fires
`gtag('event','select_promotion', { promotion_name: 'get_tickets_block', … })`. I checked whether a
link ever carried it as a UTM: **`utm_source=get_tickets_block` appears nowhere in the current
source and nowhere in the full git history** (`git log -S` across `public/`, after
`fetch --unshallow`). Same for `utm_source=lp`.

The attribution-model table (`download (28).csv`, fractional data-driven credit) shows the same
shape more strongly — `purchase / lp` carries **3.85 credited purchases / $111.32**, and
`purchase / get_tickets_block` **2.14 / $58.73**. That is a different basis from the session-source
table and must not be added to it, but it points the same way.

**I could not determine from source how a `promotion_name` becomes a session source.** Stating that
plainly rather than guessing. It matters because it silently removes real channel credit: whatever
actually drove those two sales is being under-counted by exactly that amount.

### F2 — `targeted_event_landing`'s 64%-vs-16% gap is *not* a missing parameter

`ANALYTICS_CONTEXT.md` open question 3 hypothesises that non-webview paid traffic "is arriving
without the parameter." **The landing-page data rules that out.** Parsing all 999 landing-page rows
in `download.csv`:

- **1,123 of 1,123 paid sessions (100%) carry a non-blank `eventId`.** Zero blank.
- `/lp` took 984 of them (87.6%), `/events` 139 (12.4%).

Meanwhile `download (38.csv` confirms the gap is real: `targeted_event_landing` fired in **617 of
954** webview sessions (64.7%) against **92 of 576** direct-browser sessions (16.0%).

The likelier explanation is **denominator composition, not instrumentation**. The event only fires
on `/lp`. The two segments total 1,530 paid-social-mobile sessions while only 984 paid sessions
landed on `/lp` at all — so roughly 546 segment sessions never touched the page that fires it, and
direct-browser traffic has both the higher pages-per-session (1.31 vs 1.22) and all 139 `/events`
landings available to it.

**To settle it:** re-run the A/B comparison restricted to sessions whose landing page is `/lp`. If
the gap collapses, it was composition. Also worth re-checking because `ANALYTICS_CONTEXT.md`
section 2 documents that GA4's default "Exclude temporarily" does not partition segments — the
original 64/16 split may carry that error.

### F3 — The webview problem is converting, not click-through

From `download (38.csv`, paid social mobile. **Counts given raw — these are single digits and
must not be read as rates** (`ANALYTICS_CONTEXT.md` §5):

| | A — Webview | B — Direct browser |
|---|---|---|
| Sessions | 954 | 576 |
| `view_item` (sessions) | 101 | 54 |
| `add_to_cart` (users) | **5** | **7** |
| `purchase` | **1** | **2** |
| `lead_form_started` | 13 | **48** |
| `checkout_error` | **0** | 5 |
| `scroll` (sessions) | 140 (14.7%) | 66 (11.5%) |

Reaching the product page is roughly equal — 10.6% of webview sessions against 9.4% of
direct-browser. What diverges is everything after: **5 add-to-carts from 90 webview viewers against
7 from 43 direct-browser viewers**, and 1 purchase against 2 from half the traffic.

The `lead_form_started` figure is the sharpest and has adequate volume: **48 in direct browser
against 13 in webview, from 60% fewer sessions.** That runs opposite to the assumption that webview
users fall back to the waitlist — it is the *direct-browser* users filling in the form. This bears
directly on `ANALYTICS_CONTEXT.md` open question 1 ("is the waitlist rescuing or cannibalising?")
and suggests the answer differs by browser context.

`checkout_error` being **0 in webview and 5 in direct browser** is worth a second look: webview
users are not hitting card errors because too few of them reach the card at all.

### F4 — `fbclid` duplication is now essentially universal

**1,072 of 1,073 paid sessions carrying an `fbclid` carry it twice (99.9%)**, up from the 08-19
report's 891 of 906 (98.3%). Still unfixed, and now near-total.

A second instance of the same class is visible in this export and has not been reported before:
`/events` paid landings arrive as
`/events?event=<id>&eventId=<id>&eventId=<id>` — the event id **three times across two different
parameter names**. Since `lp.html:686` builds `/events?event=<id>&checkout=1` + carried params, the
duplicate `eventId` is being appended somewhere on top of the carry.

### F5 — Three error/noise counters froze completely, and one of them is good news

Unchanged to the event across all three new days (vs the Aug 19 export):

| Event | Aug 19 export | Aug 22 export |
|---|---|---|
| `next_event_fetch_failed` | 60 | **60** |
| `checkout_error` | 18 | **18** |
| `ads_conversion_About_Us_1` | 97 | **97** |
| `getaway_interest` | 203 | **203** |

`next_event_fetch_failed` holding at 60 means **zero new `/lp` degraded landings in three days**,
after the 08-21 report measured 67 of 824 (8.1%). That is a real improvement, on a short window.

`ads_conversion_About_Us_1` frozen at 97 alongside `google / cpc` revenue unchanged at $27.49
suggests **Google Ads has stopped delivering** — worth confirming, since that conversion action has
dominated the key-event count in every report since 07-26 and is worth $0.

### F6 — The Aug 22 changes are one partial day old; do not judge them yet

`select_promotion` = **9 events sitewide**, `add_payment_info` = **1**. Both are working — they are
non-zero for the first time, which is the correct expectation given they shipped 2026-08-21/22 and
not a tracking gap (`ANALYTICS_CONTEXT.md`).

**The `promotion_name` breakdown is not in this export**, so open question 2 — the `lp_sticky_bar`
share — cannot be answered. Of the 9, `download (38.csv` places 7 in paid-social-mobile (4 webview,
3 direct browser). A Free-form with `promotion_name` as a dimension would close this.

### F7 — The three funnel explorations still disagree, and now they cannot be trusted at all

Purchases reported: **10** (`download (8).csv`), **13** (`download (10).csv`), **2**
(`download (16).csv`) — against a real **30**. Tenth-plus consecutive report.

New this run: per `ANALYTICS_CONTEXT.md`, all three span 2026-08-21, so their `begin_checkout` step
mixes two incompatible definitions, and `download (16).csv` includes a step that did not exist
before Aug 21. **These funnels are uninterpretable on any window spanning that date.** The earliest
clean rebuild window starts **2026-08-22**.

### F8 — Standing items, reconfirmed not re-guessed

- **Founders Mixer**: 0 viewed / 0 carted / **8 purchased / $192.93**. Unchanged since 07-29.
- **Source/item revenue gap**: $803.71 − $733.71 = **$70.00** = exactly 28 × $2.50 against 30
  transactions. Both new transactions carried the service fee; the same 2 legacy fee-free ones
  persist. Reconciles cleanly.
- **Engagement-rate last-day artifact, 6th confirmation**: Aug 22 reads **4.1%** against 43.5%,
  45.8% and 55.0% on the three prior days. Also — the 08-19 report predicted Aug 18 would correct
  from 3.2% into 45–65%. It corrected to **40.6%**: right direction, band slightly optimistic.
  Worth recording so the prediction is not treated as confirmed at face value.
- **`Facebook` / `facebook` case split** persists: `Facebook / paid_social` $64.98,
  `facebook / social` $47.99, `Facebook / organic` $54.98. Sum before reporting.
- **Philadelphia vs Lancaster**: 474 users, $136.45 — revenue unchanged from the prior export
  despite +33 users. Lancaster still carries $108.96 of it on 91 users against Philadelphia's
  $27.49 on 387.

---

## Meta — corrected framing

`ANALYTICS_CONTEXT.md`'s rolling-window trap was applied here, so this section deliberately reports
**daily** figures.

**Daily spend is falling steeply:** $62.38 (Aug 17) → $57.48 → $43.56 → $37.64 → $30.91 (Aug 21) →
$19.26 (Aug 22, partial). Roughly −50% across five complete days, across every campaign. A 7-day
window comparison hides this entirely — Aug 14–20 vs Aug 15–21 reads $289.50 → $287.11, "flat."

**Purchases by day:** Aug 15, 17, 18, 19 — one each. **Aug 20, 21 and 22: zero**, on ~$88 of spend.

**Marion Court's "spend increase" was an artifact and is now documented as such.** It launched
2026-08-17; daily spend has been flat at $10–14/day. It has 0 purchases and 0 add-to-carts on
$58.50 over six days, and the account's three worst CPCs ($1.29 / $1.45 / $0.99 against a $0.64
blended average) — those remain true and are the real concern.

**Good Good Retargeting is the only efficient line:** $32.93 → 2 purchases (**$16.47**, below the
$18.99–$29.99 ticket), and 6 of the account's 10 add-to-carts. It is also the smallest non-Marion
budget. **Good Good "Sale Obj Women" is the largest sink:** $51.89 across eight days, 0 purchases,
0 add-to-carts, and 45% of today's spend ($8.65 of $19.26) while everything else winds down.

---

## Recommendations

### NEEDS TAYLOR INPUT

1. **Why is the account winding down?** Daily Meta spend halved over five days and no one has said
   whether that is a billing cap, budget exhaustion, or campaign end dates. Everything else in this
   section is moot if delivery is stopping on its own.
   *Re-check in ~1 week:* daily spend from `meta-insights-daily-*.csv`.
2. **Confirm whether Google Ads is still running.** `ads_conversion_About_Us_1` frozen at 97 and
   `google / cpc` revenue frozen at $27.49 across three days both point at stopped delivery.
   *Re-check in ~1 week:* whether either number has moved.
3. **Explain `get_tickets_block` as a session source (F1).** Not resolvable from the codebase —
   needs someone in the GA4 UI. It is quietly removing channel credit from real sales.
   *Re-check in ~1 week:* whether `get_tickets_block / (not set)` gains a second transaction.
4. **Kill or rebuild Marion Court.** Six days, $58.50, zero purchases, zero add-to-carts, worst CPCs
   in the account. The earlier "spend went up 40%" framing was wrong; this recommendation does not
   depend on it. Budget/strategy, so it is your call.
   *Re-check in ~1 week:* its `add_to_cart`, which has never been non-zero.
5. **Shift budget toward Good Good Retargeting.** $16.47 CPA against a blended $71.78. Small n
   (2 purchases) — stated per §5 — but it is the only line under ticket price two windows running.

### Proposed zero-risk fixes — **NOT APPLIED**

1. **Stop double-appending `fbclid` and `eventId` (F4).** 99.9% duplication, and `/events` landings
   carry the event id three times across two parameter names. Mechanical, but it touches the
   attribution carry in `lp.html` and is not a one-liner, so it is written up rather than attempted.
   *Re-check in ~1 week:* duplicated-`fbclid` share in the landing-page report.
2. **Rename `download (38.csv` → `download (38).csv` and `download 35.csv` → `download (35).csv`**
   at the export step.
3. **Re-export the Path Exploration PDF** (`data (1).pdf`), absent from this drop.

### Analysis to run, not code to change

4. **Rebuild the three funnel explorations with a start date of 2026-08-22** (F7). They are
   uninterpretable across the `begin_checkout` boundary.
5. **Add `promotion_name` as a dimension** to close open question 2 (F6).
6. **Re-run the webview A/B restricted to `/lp` landings** to settle open question 3 (F2), using
   "Exclude permanently".

---

## Caveats and method

- **Only one complete new day of site changes.** The Aug 22 work shipped the same day this export
  ends, so `select_promotion` (9) and `add_payment_info` (1) reflect a partial day. No conclusion
  about whether the CTA move worked is drawn here, and none should be until 2026-08-29.
- **Aug 22 is partial in both datasets** — GA4's last day and the Meta pull. The engagement-rate
  artifact (F8) is the visible symptom.
- **Small numbers stated as counts.** Every figure at or below `add_to_cart` is single digit and is
  reported as a count, per `ANALYTICS_CONTEXT.md` §5.
- **GA4 revenue is own-site only** — roughly 55% of real ticket revenue arrives via Eventbrite and
  Meetup and fires nothing here. The admin dashboard is revenue truth.
- **Meta came via the Windsor connector, not `scripts/fetch-meta-insights.js`** — no
  `META_ADS_ACCESS_TOKEN` and no route to `graph.facebook.com` from this sandbox. Action data
  arrives as discrete columns rather than the packed `actions` string, so it is not a byte-for-byte
  like-for-like with earlier `meta-insights-*.csv` files, though spend and click figures reconcile
  against the Aug 14–20 file.
- **Engagement time inside webviews was not used** for any conclusion (`ANALYTICS_CONTEXT.md`).
- **File-number-to-report mapping was rebuilt from each file's own `#` title line**, for the fourth
  consecutive run. It changed again — this export's `download (11).csv` is the Key Events Breakdown
  where the Aug 19 export's was Revenue by Source.
- **Nothing in the Night Tasks folder was moved, renamed or deleted.**
- **Housekeeping, now resolved:** the prompt library has moved to
  `Business Plan/files/Night Tasks/`, which is the path this task's instructions have always
  hardcoded. The two-folder split flagged in eleven consecutive reports is closed. The library is
  also no longer gitignored at that path and **should be committed** — it was briefly deleted
  earlier today and, being untracked, was unrecoverable from git.

---

## Verification of this run's own constraint

`git diff --cached --name-only` was checked before commit and lists exactly one path:
`reports/GA4_ANALYSIS_2026-08-22.md`. No file under `public/`, `api/`, `lib/`, `scripts/`,
`content/`, `vercel.json`, `package.json` or `firestore.rules` was modified, added or deleted.
