# GA4 Analysis — 2026-07-29 Nightly Run

**This run made zero code changes.** It is a read-only analysis of a fresh GA4 export sitting
in the Night Tasks folder. Nothing in `public/`, `api/`, `lib/`, or any config file was
touched. The only artifact produced is this report.

## What data this covers

16 CSVs + 1 PDF (`data.pdf`, a Path Exploration report) dropped in the Night Tasks folder,
all carrying the date range **2026-05-19 – 2026-07-28** (per each file's own `#` header,
not filename/timestamp — per this file's own lesson from the 2026-07-28 correction). This
is a materially different, larger window than the last analyzed export
(`GA4_ANALYSIS_2026-07-27.md`, window 2026-06-28–2026-07-27), so this is genuinely fresh
data, not a repeat of the last GA4 run.

Report types present: Traffic & Events Monitoring (Active Users Direct-vs-Paid, Events
Counts, Campaign Performance), Monthly Trends (Active Users/Sessions/Engagement
Rate/Engaged Sessions), Revenue Analysis (Trend/by Item/by Source), Retention & Cohorts
(weekly cohort exploration), two purchase-funnel reports ("Segment by Device" and "Funnel
exploration"), Conversion Tracking (Key Events Breakdown), Philly-vs-Lancaster city
comparison (filtered and unfiltered/"check for bot traffic"), and a Path Exploration PDF.
No "Pages and screens" per-page engagement report was included this time, so — same
caveat as the 2026-07-27 report — per-page engagement-rate analysis against specific
`public/*.html` files cannot be done from this export.

## Headline: same root problem, now with harder numbers, plus one new signal

**Facebook/Instagram-tagged traffic is ~61% of sessions but ~12% of revenue; paid
Facebook/Instagram specifically produced zero verified purchases this period.** Summing
every Facebook/Instagram-flavored `source/medium` row in Campaign Performance
(`facebook / paid_social` 385, `Facebook / paid_social` 148, `facebook / social` 38,
`m.facebook.com / referral` 23, `Facebook / paid` 22, `facebook.com / referral` 18,
`Facebook / organic` 2, `eventsmanager.facebook.com / referral` 1 = **637 users, 60.7%**
of the reported 1,050-user total) against **$47.99 of the period's $405.36 total revenue
(11.8%)**. Cross-referencing against Revenue by Source (which lists actual transactions,
not just "key events"): the $47.99 came entirely from **`facebook / social` — 2
transactions** — the organic/shared-post channel, not the two paid rows
(`facebook / paid_social` + `Facebook / paid_social` = 533 users combined, **zero
transactions, zero revenue**). Same for TikTok: `tiktok / paid_social` (27 users) +
`TikTok / social` (1 user) + `tiktok.com / referral` (1 user) = 29 users, zero
transactions. All 15 real transactions this period break down as: Eventbrite listing (7,
$192.43), direct/none (4, $109.96), organic Facebook share (2, $47.99), email nurture (1,
$27.49), Google Ads cpc (1, $27.49). **Every transaction came from an organic, referral,
or search-paid channel — none from paid social.** This is the third consecutive report
with this finding (07-24, 07-26, 07-27/28); the difference this time is a clean,
fully-reconciled per-channel transaction count rather than just a users-vs-revenue ratio.

**New this run: recent traffic growth is real and accelerating, but the surge is
concentrated in paid social and mostly hasn't converted yet.** The weekly cohort table
shows: week of 07/19–07/25 = 216 active users (the highest full week in the whole 10-week
dataset), then just the first **3 days** of the following week (07/26–07/28) already hit
130 users — a daily rate of ~43/day vs. ~31/day the week before, roughly 40% faster. Of
the 11 discrete revenue-days in the whole 70-day window, only one ($27.49, a single
ticket) falls inside this accelerating window (day 69 = Jul 27). Whatever is driving the
Jul 24–28 traffic spike (the campaign-performance data suggests paid social/Google Ads,
consistent with the heavier posting cadence documented in this repo's own nightly social
scheduling work for that week) is bringing volume before it's bringing sales — worth
watching the next cohort week to see if it converts with a lag, or if it's simply more of
the same paid-social pattern that hasn't converted all period.

**GA4's own Key Events are still ~69% a $0 ghost conversion, worse than last report's
65%.** Conversion Tracking → Key Events Breakdown: 138 total key events this window, of
which **95 (68.8%) are `ads_conversion_About_Us_1`** — the Google-Ads-imported "visited
About Us page" action, worth $0 — vs. 28 `generate_lead` and only **15 real `purchase`
events** (which correctly total $405.36, matching Revenue by Source exactly). Segmented
by channel, Google-Ads-tagged rows (`googleads / paid`, `googleads / (not set)`,
`googleads / offline`, `googleads / cpc`, `Google Ads / cpc`) sum to 110 users / 90 key
events / **$0 revenue** — the ghost conversion is overwhelmingly landing on the Google
Ads channel, making that channel's "conversion" numbers look far healthier in any
Ads-platform-side reporting than the GA4 revenue data supports. The one real Google-sourced
sale this period came through **`google / cpc`** (organic Ads click, not the imported
About-Us action), $27.49.

**The two purchase-funnel Explore reports ("Segment by Device" and "Funnel exploration")
are still unusable — they show 0 purchases against this same window's 15 real
purchases.** Both funnels (Session Start → Select/View Item → Begin Checkout → Purchase)
report **0** completed purchases sitewide, while Key Events Breakdown and Revenue by
Source agree on 15. This is the same GA4 Explore-configuration issue flagged in
`GA4_ANALYSIS_2026-07-27.md` (there it was 0-vs-7; this window it's 0-vs-15) — recurring
across two different exports now, which rules out a one-off fluke and points at a
structural problem with how those two Explore reports are built (likely a segment
definition, step-matching, or lookback-window setting that doesn't match how the real
checkout flow fires events). **This is a GA4 UI/report-configuration problem, not a site
bug** — do not use either "funnel" tab's numbers for purchase-conversion decisions until
this is fixed in the GA4 interface directly.

**Revenue-by-item vs. revenue-by-source gap reconfirmed as the known $2.50 service fee,
not a bug.** Revenue by Item totals $367.86 (Founders Mixer $192.93 + "SparkDate: Round 2
— Summer Nights" $174.93); Revenue by Source/Key Events totals $405.36. The $37.50
difference = exactly 15 transactions × the `$2.50` `SERVICE_FEE` constant confirmed live
in `public/event.html:743` (mirrored in `lib/pricing.js`'s `SERVICE_FEE_CENTS`, consumed
in `api/purchase-ticket.js:632`). Also: every observed per-transaction revenue figure is a
clean multiple of $27.49 ($24.99 ticket + $2.50 fee) — $27.49 × 1, $54.98 × 2, $109.96 × 4
— confirming the base ticket price is still $24.99 in this data, consistent with prior
reports.

**New signal worth a second look — possible bot/datacenter inflation in the traffic
mix.** This export included, for the first time, a "Philly vs Lancaster - All Cities
(check for bot traffic)" report. Among the top cities by active users: **Prineville, OR
(28 users)** and **Lulea, Sweden (12 users)** are both well-known Meta/Facebook data
center locations; **Council Bluffs, IA (17 users)** and **Ashburn, VA (17 users)** are
well-known Google Cloud/AWS data center hub cities. Combined, these four cities alone
account for **74 of 1,050 active users (7.0%)**. This is circumstantial, not proof — GA4's
city field is derived from IP geolocation and a data-center IP doesn't guarantee a bot,
just makes one plausible — but it lines up suspiciously well with the paid-social channel
that already shows $0 revenue on hundreds of "active users." Flagging as a data-quality
question rather than asserting it's confirmed bot traffic.

**Lancaster traffic converts and engages notably better than Philadelphia traffic despite
being a fraction of the volume.** Philly-vs-Lancaster (filtered): Philadelphia 160 users /
$27.49 revenue / 32.6% engagement rate; Lancaster 37 users / $27.49 revenue / 46.9%
engagement rate. Lancaster has 4.3x fewer users but identical revenue and a ~44% higher
engagement rate. Since the current live event (per this repo's own marketing docs) is
physically in Lancaster, this is the expected/healthy pattern (local audience closer to
the venue engages harder) rather than a surprise — noted for context, not as a problem.

## Ranked suggestions

1. **NEEDS TAYLOR INPUT — paid social spend allocation.** With 533 users from paid
   Facebook/Instagram and 27 from paid TikTok producing zero verified transactions this
   period (vs. all 15 real sales coming from Eventbrite/direct/organic-share/email/Google
   cpc), and the known in-app-browser Stripe-3DS-checkout issue already mitigated in code
   (`public/lp.html`'s `in_app_browser_detected` / `in_app_browser_checkout_blocked` /
   `in_app_browser_checkout_override` events all present and firing — 336 `in_app_browser_
   detected` events per the Path Exploration PDF, out of 1,673 page_views at that step,
   ~20.1%), the open question is whether ad spend on paid Facebook/Instagram/TikTok is
   worth continuing at current levels given a full quarter of $0 measured return, or
   whether the in-app-browser mitigation itself needs a harder intervention (e.g. an
   explicit "open in browser" prompt) — this is a spend/strategy decision, not a code fix.
   **Re-check in ~1 week:** Campaign Performance report, `facebook / paid_social` +
   `Facebook / paid_social` rows' Key events + Total revenue columns.
2. **NEEDS TAYLOR INPUT — GA4 Explore funnel configuration.** Both "Segment by Device" and
   "Funnel exploration" Explore reports have now shown 0 purchases against a real, non-zero
   purchase count in two consecutive exports (07-27: 0 vs 7; 07-29: 0 vs 15). This needs
   to be opened and fixed directly in the GA4 UI (check the funnel's step event-matching
   and any attached segment/date-range override) — nothing in the codebase to change.
   **Re-check in ~1 week:** open both Explore reports in the GA4 UI directly and confirm
   the Purchase step count is non-zero and roughly matches Key Events Breakdown's
   `purchase` count for the same window.
3. **NEEDS TAYLOR INPUT — bot/datacenter traffic sanity check.** Prineville OR + Lulea
   Sweden (both Meta/Facebook data-center cities) + Council Bluffs IA + Ashburn VA (both
   Google/AWS data-center hub cities) = 74 of 1,050 active users (7.0%) this period. Worth
   a look at whether Meta/Google Ads platforms show unusual click patterns from these
   regions, or whether GA4's bot-filtering setting needs review. Not something to guess at
   from city names alone. **Re-check in ~1 week:** re-run the "All Cities (check for bot
   traffic)" Explore report and see if the same four cities persist at similar volumes.
4. **NEEDS TAYLOR INPUT — Facebook/Instagram UTM fragmentation (ops, not code).** The
   Campaign Performance report still splits Facebook/Instagram traffic across 8 different
   `source/medium` strings (`facebook / paid_social`, `Facebook / paid_social`,
   `facebook / social`, `m.facebook.com / referral`, `Facebook / paid`,
   `facebook.com / referral`, `Facebook / organic`, `eventsmanager.facebook.com /
   referral`) — a capitalization/medium-naming inconsistency at the ad-platform/UTM-tagging
   level (Meta Ads Manager / Business Suite campaign setup), not something fixable in this
   codebase. Flagged again since it was raised in the 07-26 report and doesn't appear to
   have been addressed yet. **Re-check in ~1 week:** same Campaign Performance report,
   count of distinct Facebook-flavored source/medium strings.
5. **Watch, no action yet — traffic acceleration outpacing revenue.** Weekly cohort data
   shows the most recent 3 days (07/26–07/28, 130 users) growing faster than the prior full
   week (07/19–07/25, 216 users) on a per-day basis, but only one $27.49 sale falls inside
   that accelerating window. This may just need more time to convert (purchase lag) rather
   than being a problem — flagging as something to watch, not something to fix. **Re-check
   in ~1 week:** cohort exploration's newest weekly bucket, plus Revenue Trend for any sales
   landing in the 07/26 onward date range.

## Proposed zero-risk fixes (NOT applied — for a human to do)

None identified this run. Unlike the 07-28 SEO/CTA and M1 dead-link sweeps, this export's
findings are entirely data-attribution and ad-spend-allocation questions (GA4 report
config, ad platform UTM tagging, spend strategy) rather than anything in `public/`, `api/`,
or `lib/` that has a mechanical, no-judgment fix. Nothing was changed in this run.

## Caveats / method notes

- **Sample size:** 1,050 active users, 138 key events, 15 transactions over 70 days
  (2026-05-19 to 2026-07-28) — small enough that single transactions materially move
  per-channel revenue percentages; treat channel-level revenue splits as directional, not
  precise, until volume grows.
- **"Active users" doesn't sum across dimensions.** Recomputing the Campaign Performance
  rows gives 1,095 summed active users against a stated grand total of 1,050 — a ~4.3%
  overcount, expected GA4 behavior since a single user can be attributed to more than one
  source/medium within the report window (this is normal for user-scoped metrics sliced by
  a session-scoped dimension). Key events (138) and revenue ($405.36) summed exactly to
  their stated grand totals with no discrepancy, so those figures are trustworthy as-is;
  only the per-channel *user* counts should be read as approximate shares.
  - Facebook/Instagram combined engaged 637 users, Google Ads-tagged rows 110 users, TikTok
    29 users — computed as sums of the individual rows above, all cross-checked
    line-by-line rather than eyeballed.
- **No "Pages and screens" report in this export** — could not repeat the 07-24/07-26
  per-page engagement analysis (which page has weak engagement/CTA) this run; not
  guessed at.
- **Prior-period comparison:** compared against `GA4_ANALYSIS_2026-07-27.md` (the most
  recent prior GA4 report, window 06/28–07/27) for trend continuity on the recurring
  findings (Facebook/paid-social $0 revenue, ghost conversion share, funnel-vs-key-events
  mismatch); this export's much wider 70-day window is not a strict apples-to-apples
  re-run of that narrower window, so "worse" (e.g. 68.8% vs 65% ghost-conversion share) is
  noted as a data point, not asserted as a confirmed trend without more same-window
  comparisons.
- **Bot-traffic finding is circumstantial.** City-level IP geolocation pointing at a known
  data-center city is a plausible bot signal, not proof; flagged as a question for Taylor
  to sanity-check against ad-platform-side data, not treated as confirmed here.
- Verified directly in the cloned repo (read-only, no edits): `SERVICE_FEE = 2.50` at
  `public/event.html:743`, mirrored via `SERVICE_FEE_CENTS` in `lib/pricing.js` and consumed
  in `api/purchase-ticket.js:632`; and the in-app-browser detection/override event calls
  (`in_app_browser_detected`, `in_app_browser_checkout_blocked`,
  `in_app_browser_checkout_override`) all present and gtag-firing in `public/lp.html`.
