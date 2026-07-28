# SparkDate GA4 Analysis — 2026-07-27 pull (analyzed 2026-07-28)

**This run made ZERO code changes.** Report-only.

**Data window:** 2026-06-28 → 2026-07-27 (30 days), GA4 property `sparkdate-philly`.
**Source:** 20 of the 21 GA4 CSVs currently in the Night Tasks folder share this window
(`download.csv`, `download (1).csv` … `download (10).csv`, `download (12).csv` …
`download (20).csv`). **`download (11).csv` is a leftover from the prior pull** — it still
carries the old `20260519-20260725` window and was excluded from this analysis; its
report type ("Philly vs Lancaster filtered") has a fresh duplicate at
`download (12).csv`, which was used instead. `data.pdf` (a Path Exploration screenshot)
is also stale — it's dated `Jun 1, 2026 - Jul 25, 2026`, not this pull's window — so it
was not used as a source for this report; see Caveats.

**Correction to the prior nightly log entry:** an earlier run tonight (and the two before
it) concluded this data was unchanged from `GA4_ANALYSIS_2026-07-26.md` based on matching
filenames and mount timestamps. That was wrong — the user deleted the old files and
re-pulled a fresh 30-day export on 2026-07-27; the file *names* follow the same browser
download convention (`download.csv`, `download (1).csv`, ...) regardless of pull date, so
filename matching was never a valid staleness signal. Confirmed by reading each CSV's own
`# 20260628-20260727` date-range header line, which differs from the prior report's
`# 20260519-20260725` window. Content, not filenames or mtimes, is the only reliable
freshness check — noting this for future nightly runs.

**Prior run for comparison:** `GA4_ANALYSIS_2026-07-26.md` (67-day window, 2026-05-19 →
2026-07-25). That window mostly *overlaps* tonight's narrower 30-day window rather than
preceding it cleanly, so this isn't a clean week-over-week diff — treat it as directional
context per that report's own same caveat about the 07-24 comparison.

---

## The finding that matters most tonight — unchanged from the last two reports

**65% of "key events" this window are still the zero-revenue `ads_conversion_About_Us_1`
ghost conversion, not a lead or a sale.** This is the third consecutive GA4 pull (07-24,
07-26, and now this one) where the same issue shows up:

| Event name | Key events | Revenue |
|---|---|---|
| `ads_conversion_About_Us_1` | **35** (64.8%) | $0 |
| `generate_lead` | 12 | $0 |
| `purchase` | 7 | $192.43 |
| **Total** | **54** | **$192.43** |

As before, `ads_conversion_About_Us_1` doesn't exist anywhere in `public/*.html` or
`api/*.js` — it's a Google-Ads-imported page-visit conversion action, not something
SparkDate's code fires, and it has no revenue value. It's still being counted as a "key
event" on equal footing with real purchases and leads, which inflates the apparent
conversion count of any Google-Ads-attributed traffic.

## Channel performance — Facebook still dominant, still not converting

772 total active users this window. Session source/medium breakdown (top rows):

| Source / medium | Active users | Key events | Revenue |
|---|---|---|---|
| `facebook / paid_social` | 370 | 5 | $0 |
| `Facebook / paid_social` (capitalized variant) | 133 | 0 | $0 |
| `(direct) / (none)` | 116 | 2 | $54.98 |
| `tiktok / paid_social` | 27 | 0 | $0 |
| `googleads / paid` | 24 | 24 | $0 |
| `google / organic` | 18 | 1 | $0 |
| `eventbrite / listing` | 16 | 4 | $109.96 |
| `Google Ads / cpc` | 15 | 0 | $0 |
| `googleads / offline` | 10 | 10 | $0 |

**Facebook (both capitalization variants combined) = 503 of 772 users (65.2% of all
traffic) and $0 revenue.** This corroborates the Facebook-in-app-browser-checkout theory
from the 07-24/07-26 reports with a third data point. Supporting event counts this
window: `in_app_browser_detected` fired 422 times (20.1% of the 2,095 `page_view` events),
and the mitigation code already shipped in `lp.html` (per CLAUDE.md) is visibly firing —
`in_app_browser_checkout_blocked` (5), `in_app_browser_checkout_override` (2), and
`in_app_browser_copy_link` (5) all appear in the event counts — but Facebook traffic still
converts at $0 this window, same as the last two. This keeps the open question exactly
where the 07-28 SEO/CTA report left it: **the code-side mitigation exists and fires, but
whether users act on the in-app-browser warning is still unknown** — that needs either a
GA4 event-sequence check (does `in_app_browser_copy_link` precede an eventual purchase in
a different session?) or direct user research, not another code change.

**`googleads / paid` (24 users) and `googleads / offline` (10 users) again show 100% of
their "key events" as the same $0 About-Us ghost conversion** (24/24 and 10/10
respectively) — Google Ads traffic isn't actually converting either, its apparent
conversions are the same instrumentation artifact flagged above.

**Every dollar of real revenue this window came from three channels that together are
only 18.4% of traffic:**

| Source / medium | Transactions | Revenue |
|---|---|---|
| `eventbrite / listing` | 4 | $109.96 |
| `(direct) / (none)` | 2 | $54.98 |
| `email / nurture` | 1 | $27.49 |

`eventbrite / listing` is 2.1% of traffic (16/772 users) but 57.1% of revenue — the
highest-converting channel by a wide margin, same conclusion as both prior reports.

## Item revenue vs. transaction revenue — traced to a known cause, not a bug

`Revenue by Item` shows $174.93 total item revenue for "SparkDate: Round 2 — Summer
Nights" against $192.43 total transaction revenue — a $17.50 gap. Checked this against
`public/event.html`: line 665 defines `const SERVICE_FEE = 2.50;` (mirrored server-side
per the comment at line 660-664 warning both locations must stay in sync). $17.50 ÷ 7
transactions = exactly $2.50 — **the gap is the service fee, charged per-transaction but
not represented as GA4 item-level revenue.** This reconciles cleanly ($174.93 + $17.50 =
$192.43) and isn't a bug; noting it here only because the two GA4 reports don't visually
match without this context.

## Data-quality flag: GA4's own Funnel Explorations show 0 purchases — contradicts the Key Events / Revenue reports

Both funnel exploration reports in this export (`download (15).csv`, 4-step
Select-Item→Begin-Checkout→Purchase; `download (16).csv`, 5-step View-product→Add-to-
cart→Begin-checkout→Purchase) show **`Purchase` completions at 0** across all device
categories, for the entire 772-user session pool. This directly contradicts the Key
Events Breakdown and Revenue reports above, which show 7 real purchases and $192.43 in
the same 30-day window using the same GA4 property.

This is very likely a **GA4 Explore-report configuration issue** (a funnel step matched
to the wrong event name/parameter, or a funnel type — "open" vs "closed" — that excludes
conversions happening outside the funnel's session window) rather than a website bug —
the `purchase` event itself is clearly firing and being counted correctly elsewhere in
the same export. This isn't something fixable in the codebase; it needs a check inside
the GA4 UI's Explore report configuration, flagged below under NEEDS TAYLOR INPUT.

## Traffic geography (bot-traffic sanity check)

`download (13).csv` (All Cities) shows 772 total users across a very long tail of
cities, including several with only 1-2 users each spanning international/unlikely
locations (Kabul, Dubai, Hyderabad, Chongqing, Xiamen, Manila, Buenos Aires, etc. — all
at 1-4 users). None of these individually exceed a handful of users, so nothing here
rises to a level worth flagging as clear bot traffic requiring action, but it's worth
Taylor's eyes if ad spend is being wasted on geographically implausible clicks — see
NEEDS TAYLOR INPUT.

## Retention

`download (17).csv` cohort data shows week-1 return rate in the 0.7%-1.5% range across
weekly cohorts — consistent with a single recurring-event business model where most
traffic is one-time, ticket-purchase-driven rather than habitual return visits. Not
flagged as a problem; noted as expected-shape data.

## What this export does NOT let me check

Unlike the 07-24 and 07-26 pulls, **this export has no "Pages and screens" or
landing-page-level report** — no per-URL engagement rate, average engagement time, or
bounce data. Prompt 9's core ask (which specific pages underperform on engagement, cross-
referenced against page source) cannot be answered from this data. If a page-level report
is dropped in a future pull, that analysis should be run then rather than guessed at now.

---

## NEEDS TAYLOR INPUT

1. **GA4 Explore funnel configuration appears broken** (shows 0 purchases when 7 real
   purchases exist in the same window) — needs checking inside the GA4 UI's Explore
   report builder, not the codebase. Re-check: open both funnel explorations in GA4 and
   confirm the "Purchase" step's event/parameter match.
2. **`ads_conversion_About_Us_1` Google Ads conversion action** continues to inflate
   apparent Google Ads performance with a $0-value page-visit metric, for the third
   consecutive report. This is a Google Ads/GA4 account-settings decision (which
   conversion actions are imported and counted as GA4 Key Events), not a code change —
   worth deciding whether to stop importing it as a Key Event, or at minimum exclude it
   from key-event totals when evaluating Google Ads channel performance.
3. **Facebook (65% of traffic) still converting at $0 for the third straight report.**
   The code-side in-app-browser mitigation is confirmed firing (`in_app_browser_checkout_
   blocked`/`_override`/`_copy_link` events all present), so this is now a behavioral or
   UX question (are users seeing the workaround and not using it?) rather than a missing
   code fix — recommend either a GA4 funnel look at what happens after
   `in_app_browser_copy_link` fires, or direct user testing in the FB/IG in-app browser.
4. **Long-tail international/geographically implausible traffic** in the All-Cities
   report (Kabul, Dubai, Hyderabad, Chongqing, etc., each at low single-digit users) —
   worth a look if ad spend is targeting these, though no individual city's volume is
   large enough here to call it confirmed bot traffic.

## Proposed zero-risk fixes (NOT applied — for a human to do)

None identified this run — everything found either traces to a known, already-documented
cause (the service fee revenue gap) or requires a GA4-account-side decision rather than a
code change.

## What to re-check in ~1 week

- `ads_conversion_About_Us_1`'s share of Google Ads key events, if the account-settings
  decision in item 2 above gets made.
- Facebook / paid_social revenue — still the single biggest lever if the in-app-browser
  checkout friction gets resolved (65% of traffic driving $0 is the largest gap in this
  data).
- Whether a "Pages and screens" report is included in the next pull, so the page-level
  engagement analysis Prompt 9 asks for can actually be run.

## Caveats / method notes

- **`download (11).csv` (stale, old window) was explicitly excluded** from every
  aggregate number in this report; `download (12).csv` (same report type, fresh window)
  was used in its place.
- **`data.pdf` (Path Exploration) was not used** — it's dated `Jun 1 - Jul 25, 2026`, a
  different pull than this 30-day CSV batch, so combining it with fresh CSV numbers
  would have mixed two different sampling windows without saying so.
- **Four pairs of "Monthly Trends" CSVs are exact duplicates** (`download (3)`/`(10)`,
  `(4)`/`(9)`, `(5)`/`(8)`, `(6)`/`(7)` — confirmed byte-identical via `diff`), apparently
  double-downloaded from GA4. Only one of each pair was used; this doesn't affect any
  number above.
- **No page-level engagement data in this export** — see "What this export does NOT let
  me check" above.
- **Window comparison to the 07-26 report is directional only**, not a clean
  week-over-week diff, since the two windows mostly overlap rather than being sequential
  (same caveat pattern as the 07-24→07-26 comparison in the prior report).
- Sample size: 772 active users, 6,002 total events, 54 key events, 7 purchases over 30
  days — small enough that single-digit swings in any category (e.g. `email / nurture`'s
  one transaction) can move percentages a lot; treat channel-level percentages as
  directional, not statistically definitive.
