# GA4 Analysis — 2026-08-10 (Nightly Automation)

**This run made zero code changes.** It is a read-only analysis of a fresh GA4 export sitting
in the Night Tasks folder. Nothing in `public/`, `api/`, or `lib/` was touched. The only change
in this branch is this report.

## Data used

19 CSVs (`download.csv`, `download (1).csv` … `download (18).csv` — 3 pairs are exact-size
duplicate re-exports of the same report, so 16 distinct tables) + 3 PDFs (`data.pdf`,
`data (1).pdf` — identical Path Exploration exports — and `data (2).pdf`, a chart screenshot of
the Active Users Direct-vs-Paid report), all in `Night Tasks/`, property `sparkdate-philly`, each
carrying its own `# 20260519-20260808` header — confirmed fresh (9 days wider than the
`…-20260730` window used in the last GA4 report on 2026-07-30) by reading each file's own
date-range line, not filenames or mount timestamps. No prompt-library file
(`sparkdate-nightly-claude-code-prompts.md`) was found in the Night Tasks folder this run — only
`TONIGHT_PROMPT.md`, dated 2026-07-24 and stale (a separate local `run-nightly-claude-code.ps1`
process has been logging "BLOCKED: stale prompt" every night since 2026-08-02 for this same
reason). Per this task's own default rule — fresh `download*.csv` files present → GA4 analysis
is the default pick — I proceeded with GA4 analysis rather than treating the missing library
file as a stop condition; TONIGHT_PROMPT.md's underlying instructions (read whatever GA4 CSVs
are present, don't assume filenames/dates) match this task's Step 1 exactly, so I followed them.
Report titles this pull: Traffic & Events Monitoring (Active Users Direct vs Paid, Events Counts
Last 28 Days, Campaign Performance), Monthly Trends (Active Users / Sessions / Engagement Rate /
Engaged Sessions), Funnel exploration (two variants — plain and Segment-by-Device), Retention &
Cohorts, Philly vs Lancaster (filtered + All Cities bot-check), Conversion Tracking (Key Events
Breakdown), Revenue Analysis (by Source / by Item / Trend), and a Path Exploration PDF. No "Pages
and screens" report is in this export — same gap noted in the 07-27/07-30 reports — so per-page
engagement/bounce analysis (the core page-level ask this task usually wants) still can't be run.

## Headline

Total revenue this window is **$481.83 from 18 real purchases** (Revenue by Source and Key
Events Breakdown agree exactly), up from **$432.85 / 16 purchases** in the 2026-07-30 report —
**+$48.98 over the ~9-day gap**. That increase traces entirely to two *new* revenue lines that
didn't exist in the 07-30 item breakdown: "Good Good Night @ Good Good Things" ($29.99) and
"Tellus AfterDark: Singles Edition" ($18.99), summing to $48.98 — an exact match to the
period-over-period revenue delta. The two previously-established items ("SparkDate: Round 2 —
Summer Nights" $199.92, "Founders Mixer" $192.93) did not grow at all in this window. Meanwhile
paid social continues to produce effectively zero direct ticket revenue: combined Facebook/Meta
paid traffic (`facebook / paid_social` 389 users + `Facebook / paid_social` 352 users — same
channel, capitalization-split — + `Facebook / paid` 22 users) totals **763 active users, 5 key
events, $0.00 revenue** this window, up from 580 users at the same $0 in the 07-30 report. This
is at least the sixth consecutive GA4 report flagging this exact pattern (07-24 through 07-30,
now 08-08).

## New finding: revenue growth is coming from new inventory, not the existing funnel converting better

The $48.98 revenue increase mapping exactly onto two brand-new item names is worth separating
from "the site is converting better" — it isn't; it's selling two additional events. Worth
checking whether "Good Good Night @ Good Good Things" and "Tellus AfterDark: Singles Edition"
are SparkDate-run events or partner/cross-listed events sold through a different path — the
source breakdown shows `eventbrite / listing` at 7 transactions / $192.43, close to (but $0.50
under) the Founders Mixer item total, which raises the question of whether ticketing route
differs by event. NEEDS TAYLOR INPUT, not something this analysis can resolve from GA4 data alone.

## Reconfirmed from prior reports (same conclusion, fresh numbers)

- **`ads_conversion_About_Us_1` ghost conversion, still dominant.** 97 of 166 sitewide key
  events (58.4%) this window — consistent with the 07-30 report's ~64% finding, still the
  largest single "key event" category, still $0 revenue attached (Key Events Breakdown:
  `ads_conversion_About_Us_1` 97 / $0, `generate_lead` 51 / $0, `purchase` 18 / $481.83). This
  export doesn't include a per-channel-by-event-name cross-tab (07-30's `download (15).csv` had
  one; this pull's Campaign Performance table only gives per-channel *totals* of key events, not
  broken out by event name), so I can't re-confirm this window's ~95%-from-Google-Ads finding
  the way 07-30 could — flagging the data gap rather than asserting the channel split held.
  Still the same open question for Taylor: check the Google Ads conversion-action config for
  `About_Us` and whether it's being treated as a real "key event" alongside actual purchases.
- **Source/medium fragmentation, still not a code bug.** `download (2).csv` (Campaign
  Performance) lists 49 distinct `Session source / medium` rows for what should be ~4-5 real
  channels — Facebook split across `facebook / paid_social` (389), `Facebook / paid_social`
  (352), `Facebook / paid` (22), `facebook / social` (38, organic — the one FB row that *does*
  carry $47.99 in real revenue), `m.facebook.com / referral` (24), `facebook.com / referral`
  (19), `Facebook / organic` (3), `eventsmanager.facebook.com / referral` (1); Google Ads split
  across `googleads / paid` (56), `googleads / (not set)` (15), `googleads / offline` (14),
  `googleads / cpc` (11), `Google Ads / cpc` (15), `google / cpc` (9), `google / organic` (33),
  `Google / (not set)` (1). Grepped this session's fresh clone for `paid_social` across
  `public/`, `api/`, `lib/` — zero matches, confirming (again) this is an ad-platform UTM-tagging
  issue, not a site-side bug. Same NEEDS TAYLOR INPUT as prior reports: standardize casing in
  each ad platform's own campaign settings.
- **GA4 Funnel Explore still undercounts purchases, and now the two funnel variants in this
  export actively disagree with each other.** `download (7).csv` ("Funnel exploration 1": Session
  start → Begin Checkout → Purchase) shows 5 purchases. `download (12).csv` ("Segment by Device":
  Session start → View product → Add to cart → Begin checkout → Purchase) shows **1** purchase,
  and only on desktop (mobile shows 0 at every step from Add-to-cart onward). Both are far below
  the real total of 18 (confirmed via Key Events Breakdown and Revenue by Source, which agree
  with each other exactly). Given the two Explores disagree with each other by 5x on the same
  underlying data, I'd caution against reading the mobile-vs-desktop step numbers in
  `download (12).csv` as a real mobile-checkout problem yet — it's more likely the same
  known-broken Funnel Explore configuration flagged in the 07-27/07-28/07-29/07-30 reports,
  now a fifth confirmation, compounded by a second, differently-configured Explore that's even
  further off. Recommend fixing the Explore config first, then re-pulling both funnels to see if
  the mobile-completion gap is real or an artifact.
- **In-app-browser rate — can't cleanly trend this window, window-length mismatch caught.**
  `download (1).csv` ("Events Counts **Last 28 days**") shows `in_app_browser_detected` at 621 of
  2,250 `session_start` events (27.6%), but that report's own title says it's scoped to a rolling
  28-day window even though it carries the same `20260519-20260808` header as every other table
  in this export — likely GA4's per-report internal date override, not the full ~82-day window.
  The Path Exploration PDF (`data.pdf`, which does show "Date: May 19, 2026 - Aug 8, 2026"
  explicitly in its own UI) gives `session_start` 2,220 and `in_app_browser_detected` 473 at the
  second step (path-based, not a direct ratio). These two session_start counts (2,250 vs 2,220)
  come from differently-scoped reports and shouldn't be treated as the same denominator — I'm
  not going to force a single "in-app-browser %" number this time the way the 07-30 report did
  (20.5%), because I can't confirm apples-to-apples windows in this pull. What is comparable: the
  mitigation code (in-app-browser banner + copy-link fallback) still exists in both
  `public/lp.html` and `public/event.html` (confirmed by grep this session), and of the users who
  hit it, `in_app_browser_checkout_blocked` fired 8 times this window against only
  `in_app_browser_checkout_override` firing 2 times — meaning at least 6 of 8 people who hit the
  blocked-checkout warning did not use the override to continue. That's a small-sample but
  concrete signal that the current banner isn't converting blocked users into completed
  checkouts. Worth a decision from Taylor on whether the intervention needs to be stronger.
- **Item vs. source revenue gap — no longer a clean multiple of the known $2.50 fee.**
  `lib/pricing.js` (`SERVICE_FEE_CENTS = 250`) and `public/event.html:865`
  (`SERVICE_FEE = 2.50`) are still in sync — confirmed by grep, not a code bug. But the gap
  between Revenue by Item ($441.83) and Revenue by Source ($481.83) is **$40.00 flat**, same
  dollar figure as the 07-30 report's gap — except that report had 16 transactions (16 × $2.50 =
  $40.00 exactly) and this window has **18** transactions (18 × $2.50 would be $45.00). The two
  new transactions since 07-30 appear to have added $0 combined service fee. Possible
  explanations I can't confirm from GA4 data alone: the two new items (Good Good Night, Tellus
  AfterDark) route through a different checkout path that doesn't charge the standard fee, or
  they're fee-exempt/comped. Flagging as a data curiosity for Taylor rather than asserting a cause.

## Traffic — last report's "watch" item resolved, new week is down

The 07-30 report flagged the partial week of Jul 26–30 (192 users across 5 days) as "on track to
match or exceed" the prior best full week (Jul 19–25, 216 users) and said to watch it. This
export's weekly cohort table (`download (8).csv`) now shows that week completed at **270 active
users** (Jul 26–Aug 1) — yes, it exceeded the prior best, by 25%. The following week (Aug 2–8,
the most recent complete week in this export) dropped to **171** — below even the Jul 19–25
week. Whether that's a real pullback or an artifact of Aug 8 being the last day in the export
(a partial final day would understate that week's total the same way Jul 26–30 was understated
in the last report) isn't something I can tell from this data alone. Re-pull next week to see if
Aug 2–8 firms up or if it's the start of a real decline.

## Zero-risk fixes

None identified this run. This pass was scoped to the GA4 numbers, not a full site sweep (dead
links, alt text, and CTA presence were already covered by the `DEAD_LINK_ASSET_SWEEP_2026-07-28`
and `SEO_CTA_HEALTH_CHECK_2026-07-28` reports). As a sanity check against this window's traffic
mix, I did confirm both `public/about.html` (the page behind the `ads_conversion_About_Us_1`
ghost conversion) and `public/lp.html` (the paid-traffic landing page) have working, visible
`/events` CTAs — "Claim Your Spot" and "🎟️ Get Tickets" respectively — so a missing-CTA
explanation for the $0-revenue paid-social pattern is ruled out; the gap is upstream of the site
(ad platform targeting/audience quality) or in the in-app-browser checkout friction noted above,
not a missing call-to-action.

## NEEDS TAYLOR INPUT (ranked)

1. **Google Ads conversion-action config** — `ads_conversion_About_Us_1` is still 58.4% of
   sitewide key events with $0 revenue attached. Same open item since 07-27; this export can't
   re-confirm the ~95%-from-Google-Ads channel split from 07-30 (data gap, see above), but the
   raw ghost-conversion volume hasn't moved. Check the conversion action's value/counting
   settings in Google Ads.
2. **New revenue items' checkout/fee path** — "Good Good Night @ Good Good Things" and "Tellus
   AfterDark: Singles Edition" are new $48.98 combined revenue this window with no visible
   service fee attached (see item-vs-source gap above). Confirm whether these route through the
   standard SparkDate checkout or a different path (e.g., a partner's own Eventbrite listing).
3. **In-app-browser checkout blocker conversion** — 8 blocked vs. 2 overridden this window
   (small sample, but consistent direction with prior reports flagging this friction point).
   Decide whether the current banner/copy-link UX needs to be more assertive.
4. **Standardize UTM tagging across ad platforms** — same 40+ distinct source/medium variants
   for ~4-5 real channels, reconfirmed for the fourth+ consecutive report. Reporting-cleanliness
   fix at the ad-platform level, not urgent.
5. **Fix the GA4 Funnel Explore configuration** — now showing two different, both-wrong purchase
   counts (5 and 1) against a real 18. Fifth+ consecutive report with this discrepancy. Until
   fixed, don't trust the mobile-vs-desktop step breakdown in `download (12).csv` as a real
   signal about mobile checkout.

## What to re-check in ~1 week

- Whether the Aug 2–8 traffic dip (171 users, down from 270 the prior week) firms up as a real
  decline or was a partial-week artifact.
- Whether combined Facebook/Meta paid traffic (763 users this window) ever produces revenue
  above $0, or whether ad spend there should be reconsidered.
- Whether the item-vs-source revenue gap returns to a clean multiple of $2.50 × transaction
  count, or stays broken now that new item types are in the mix.
- Whether `ads_conversion_About_Us_1`'s share of key events moves at all — it's been flat/rising
  (64.4% → 58.4%, but off a larger total) across every report since 07-27.

## Caveats / method notes

- Sample size remains modest (18 total transactions, $481.83) — single-transaction channel rows
  (`email / nurture`, `email / returning`, `google / cpc`, `google / organic`,
  `matches / (not set)`, each 1 transaction) are not statistically meaningful individually.
- Three of the 19 CSVs in the folder are exact byte-size duplicates of three others (Funnel
  exploration, Retention & Cohorts, Philly vs Lancaster filtered) — treated as one table each,
  not double-counted.
- The "Events Counts Last 28 days" table's actual date scope doesn't clearly match the
  `20260519-20260808` header on the file — flagged above rather than papered over.
- No "Pages and screens" report was present in this export, so per-page engagement/bounce
  analysis (the most direct way to answer "which pages get traffic but underperform") still
  can't be run. This has now been missing from at least three consecutive exports (07-27, 07-30,
  08-08) — worth asking whoever pulls the CSVs to add that report to the export set.
- This is a source-level, no-live-network-egress analysis — no requests were made to
  sparkdate.date or any ad platform API; everything above comes from the CSVs/PDFs in the Night
  Tasks folder and a read-only grep of a fresh clone of this session's repo.
