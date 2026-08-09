# GA4 Analysis — 2026-08-08 (Nightly Automation)

**This run made zero code changes.** It is a read-only analysis of a fresh GA4 export sitting
in the Night Tasks folder. No files in `public/`, `api/`, or `lib/` were touched. The only
change in this branch is this report.

## Method note on tonight's focus selection

The task library file this workflow normally reads (`Night Tasks/sparkdate-nightly-claude-code-prompts.md`,
with its "ROTATION SUGGESTION" and "NIGHTLY RUN LOG" sections) does not exist in the repo —
confirmed by direct path check, not a search miss. The only prompt-related file present is
`Night Tasks/TONIGHT_PROMPT.md`, which is a different, stale (dated 2026-07-24) artifact tied to
a separate local Windows script (`run-nightly-claude-code.ps1`); its own logs
(`Night Tasks/logs/2026-08-0*.log`) show it has been self-skipping every night since because that
file never got refreshed. That local mechanism is unrelated to this Cowork scheduled task and was
left untouched. Per this task's own fallback instruction — "if fresh GA4 CSV exports are in the
Night Tasks folder, the GA4 analysis is the default pick" — that condition is clearly met (24
`download*.csv` files + 3 PDFs, all dated tonight, 2026-08-08), so GA4 analysis was run without
needing the missing library file. Step 5 (append to that file's "NIGHTLY RUN LOG") is skipped for
the same reason — there is no such section anywhere in the repo to append to; inventing one was
judged out of scope for a report-only run. Flagged here plainly rather than silently guessed.

## Data used

19 unique CSVs (`download.csv` through `download (18).csv`; `download (8).csv` and
`download (14).csv` are byte-identical duplicates, both "Retention & Cohorts-Cohort exploration
1") + 3 PDFs (`data.pdf` and `data (1).pdf` are duplicate single-page Path Explorations;
`data (2).pdf` is a 3-page Traffic & Events Monitoring dashboard export), all in `Night Tasks/`,
each independently confirmed via its own `# 20260519-20260808` header line to cover May 19 – Aug
8, 2026 — 9 days wider than the `…-20260730` window in the last GA4 report (2026-07-30, which is
also the most recent prior GA4 report; the automation gap between then and now means no GA4
report has run in over a week). Report titles this pull: Traffic & Events Monitoring (Active
Users Direct vs Paid, Events Counts Last 28 Days, Campaign Performance), Monthly Trends (Active
Users / Sessions / Engagement Rate / Engaged Sessions), Funnel Exploration, Retention & Cohorts,
Segment by Device, Philly vs Lancaster (filtered + All Cities), Conversion Tracking (Key Events
Breakdown), Revenue Analysis (Trend / by Item / by Source), and Path Exploration. No "Pages and
screens" report is in this export — same gap noted in the 07-27/07-30 reports — so per-page
engagement/bounce analysis (the core of Prompt 9's page-level ask) still can't be run against this
data drop.

## Headline

Paid social traffic is still converting at effectively zero revenue, now for at least a 7th
straight nightly report (07-24, 07-26, 07-27, 07-28, 07-29, 07-30, now 08-08). Combined Facebook/
Meta paid_social+social+paid+referral variants (`facebook / paid_social` 389, `Facebook /
paid_social` 352, `facebook / social` 38, `Facebook / paid` 22, `m.facebook.com / referral` 24,
`facebook.com / referral` 19, `Facebook / organic` 3 = **847 users, ~62% of the site's 1,361
active users this window**) produced just **$47.99** in revenue, all of it from the one
`facebook / social` row — both `paid_social` rows (741 users combined) show **$0.00**. Meanwhile
`eventbrite / listing` — only 33 users — drove **$192.43**, the single highest-revenue channel in
the entire Campaign Performance table, a revenue-per-user rate roughly 100x the paid-social
buckets. Total revenue this window is **$481.83 from 18 real purchases**, up from $432.85 / 16
purchases in the 07-30 report — two new transactions landed since then: $27.49 on Aug 5 and
$21.49 on Aug 7 (Revenue Trend, `download (16).csv`; the 14 daily entries sum exactly to
$481.83, confirming the mapping).

## New finding: weekly traffic hit a new peak, but revenue hasn't followed proportionally

The weekly cohort table (`download (8).csv` / `download (14).csv`, `Weekly cohort = 0000`,
`date_range_0` rows) gives clean week-over-week totals:

| Week | Active users |
|---|---|
| May 24–30 | 7 |
| May 31–Jun 6 | 60 |
| Jun 7–13 | 97 |
| Jun 14–20 | 43 |
| Jun 21–27 | 60 |
| Jun 28–Jul 4 | 149 |
| Jul 5–11 | 154 |
| Jul 12–18 | 133 |
| Jul 19–25 | 216 |
| **Jul 26–Aug 1** | **270 (new peak)** |
| Aug 2–8 (partial, through today) | 171 |

The 07-30 report caught the Jul 26–30 partial week already accelerating (192 users through 5
days); it has now closed out at **270**, a new full-week high — up 25% from the prior best (216,
Jul 19–25). Revenue has not moved proportionally: only the two transactions above ($48.98 total)
landed in the ~9 days since the 07-30 pull, against roughly 441 new active users (270 + 171) in
that same span. Same "watch, not yet a problem" framing as 07-29/07-30, now with a confirmed new
peak and still-flat revenue conversion.

## Reconfirmed from prior reports (same conclusion, fresh numbers)

- **In-app-browser rate is still climbing.** The Path Exploration PDF (`data.pdf`) shows
  `page_view` (2,174, following `session_start` 2,220) branching to `in_app_browser_detected`
  (473) at the very next step — **21.8%**, up from 20.5% (07-30) and 17.1% (07-26). Read the
  actual mitigation code this session (`public/event.html`, the `isInAppBrowser()` block around
  line 745): it is still a **non-blocking, dismissible banner** ("a non-blocking nudge; the card
  form below is never gated" per the code's own comment) — not a forced external-browser redirect.
  This is the same open question from 07-30, now with the underlying rate a full 4.7 points higher
  and Facebook (still ~62% of traffic) still converting near-$0. The correlation between rising
  in-app-browser detection and flat Facebook revenue is getting harder to read as coincidence.
- **Bot-traffic city signal, still stable, not growing.** `download (10).csv` ("All Cities, check
  for bot traffic") shows Prineville OR (33) + Council Bluffs IA (19) + Ashburn VA (18) + Lulea
  Sweden (14) = 84 of 1,362 active users (**6.2%**) geolocating to known Meta/Google/AWS
  data-center cities — in the same ~6–7% band as every prior report (07-29: ~7%, 07-30: 6.7%).
  Still circumstantial, still not confirmed either way, but consistently a non-trivial share of
  reported traffic.
- **Item vs. source revenue gap, same $2.50 service-fee pattern, still exact.** `download (17).csv`
  (Revenue by Item) totals $441.83 across four items this window — two returning
  ("SparkDate: Round 2 — Summer Nights" $199.92, "Founders Mixer" $192.93) and **two new since
  07-30** ("Good Good Night @ Good Good Things" $29.99, "Tellus AfterDark: Singles Edition"
  $18.99). `download (18).csv` (Revenue by Source) totals $481.83 across 18 transactions. The
  $40.00 gap is exactly 16 × $2.50 — reconfirmed live in this session's clone,
  `public/event.html:865` (`const SERVICE_FEE = 2.50;`) and `lib/pricing.js:19`
  (`SERVICE_FEE_CENTS = 250`), still documented as required to stay in sync and still in sync.
  Grepped `public/`, `api/`, `lib/`, and `data/` for the two new item names and found no
  hardcoded reference anywhere in the codebase — they're not defined in the repo (likely
  Firestore-stored event docs, out of scope for a source-only read). Best-supported read: those
  two new items are the 2 of 18 transactions that didn't carry the $2.50 fee, consistent with
  being Eventbrite-imported tickets (`source: 'eventbrite_import'` handling already exists in
  `public/admin.html`) that never passed through the site's own fee-adding checkout — not
  confirmed against ticket-level admin data this session, flagged as inference, not fact.
- **Facebook/Meta channel fragmentation, still present, still not a code bug.** Same 7+ variant
  pattern as 07-30 (`facebook / paid_social`, `Facebook / paid_social`, `facebook / social`,
  `Facebook / paid`, `m.facebook.com / referral`, `facebook.com / referral`, `Facebook /
  organic`). Re-grepped `paid_social` across `public/`, `api/`, `lib/` this session — zero
  matches, confirming again the fragmentation originates from Meta Ads Manager's own UTM tagging,
  not site code.

## New finding: GA4's Funnel Explores now register *some* purchases, still far short of the real 18

Both funnel views moved off the flat "0 purchases" result that persisted across the 07-27/28/29/30
reports:
- `download (7).csv` (Funnel exploration 1): Session start (1,359) → Begin Checkout (35) →
  **Purchase (5)**.
- `download (12).csv` (Segment by Device): Session start (1,359) → View product (45) → Add to
  cart (14) → Begin checkout (2) → **Purchase (1)**.

Both are still well under the real 18 purchases from the Key Events Breakdown, so the underlying
GA4 Explore-configuration gap flagged in four straight prior reports isn't resolved — but this is
the first report where it isn't a flat zero either. One plausible, unverified factor: `git log`
on this session's clone shows exactly one commit touching `public/`/`api/`/`lib/` since the 07-30
pull — `d3b686c`, "Add persistent bottom ticket bar (from Landing Page mockup) (#155)", merged
Aug 7, the day before this data pull. It adds a scroll-triggered sticky CTA bar
(`#stickyTicketBar`) that wasn't on the site during any prior GA4 report. It's plausible a new,
more persistent checkout entry point changed enough of the click path for GA4's Explore step
definitions to start catching some sessions — but this is one day of post-deploy data against a
sample of 5 and 1 respectively, so treat as an observation to keep watching next week, not a
conclusion.

## Zero-risk fixes

None identified this run. Confirmed via grep: no `paid_social` string in codebase, no drift
between `SERVICE_FEE` (`public/event.html`) and `SERVICE_FEE_CENTS` (`lib/pricing.js`), no dead
links or missing-CTA pattern found in the one file that changed since the last report
(`public/event.html`'s sticky-bar addition looked complete on read, not a partial/broken ship).
Every finding this pass is a data-attribution, ad-platform-config, or GA4-Explore-config question
— nothing mechanical in the codebase to fix.

## NEEDS TAYLOR INPUT (ranked)

1. **Facebook/Meta paid spend vs. actual return.** 847 users (62% of traffic) from Facebook/Meta
   channels combined produced $47.99 this window; `eventbrite / listing` produced $192.43 off
   just 33 users. Worth a direct conversation about whether ad spend allocation matches what's
   actually converting — this is now a 7-report-consistent pattern, not noise.
2. **In-app-browser checkout mitigation.** The banner-only approach (confirmed in code this
   session, not just inferred) hasn't changed as the detection rate climbed from 17.1% → 20.5% →
   21.8% across three reports. Decide whether to test a forced external-browser redirect for
   Instagram/Facebook in-app browsers specifically, where the $0 conversion is concentrated.
3. **Standardize UTM tagging across Meta ad sets** — same recommendation as 07-30, still
   unaddressed, still fragmenting channel reporting into 7+ rows for one platform.
4. **Rebuild/verify the GA4 Funnel Explorations** — improved from 0 to partial capture this
   report (possibly linked to the Aug 7 sticky-bar ship, unconfirmed); still undercounts real
   purchases by more than half. Worth a look at the Explore's step/segment definitions while the
   change is fresh.
5. **Confirm the "Good Good Night" / "Tellus AfterDark" fee-skip inference.** If these are
   Eventbrite-imported tickets that bypass the site's $2.50 service fee by design, that's
   expected and fine; if not, worth a quick check against admin ticket records since this
   report couldn't verify it from source code alone.

## What to re-check in ~1 week

- Whether revenue catches up to the Jul 26–Aug 1 traffic peak (270 users), or the gap between
  user growth and revenue growth widens further.
- Whether `in_app_browser_detected` keeps climbing past 21.8%, and whether Facebook conversion
  stays at ~$0 as it does.
- Whether the Funnel Explorations' purchase counts keep improving toward the real total (18) or
  regress back to 0 — a useful signal on whether the Aug 7 sticky-bar ship is actually the cause.
- Whether the bot-traffic city share stays in the 6–7% band or moves meaningfully.

## Caveats / method notes

- Minor grand-total variance between reports (1,361 in Campaign Performance vs. 1,362 in All
  Cities vs. 1,359 in the Funnel Explores) is normal GA4 segment/sampling variation between
  different Explore configurations pulling the same underlying window — not a data-quality flag
  on its own.
- Sample size is still modest (18 total transactions, $481.83) — single-transaction channel
  splits (e.g. `email / nurture`, `matches / (not set)`) are directional, not statistically
  meaningful.
- The "Good Good Night" / "Tellus AfterDark" fee-skip explanation is inference from matching a
  $40.00 gap to 16×$2.50, not a verified lookup against transaction-level data — flagged as such
  above.
- No "Pages and screens" report was present in this export, so no per-page engagement/bounce
  analysis could be run (same gap as 07-27/07-30).
- This is a source-level, no-live-network-egress analysis — no requests were made to
  sparkdate.date or any ad platform API; everything above comes from the CSVs/PDFs in the Night
  Tasks folder and a read-only grep/git-log of this session's repo clone.
