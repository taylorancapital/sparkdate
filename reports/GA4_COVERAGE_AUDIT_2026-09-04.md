# GA4 coverage audit — what the nightly reads vs. what the property holds

**2026-09-04** · property 536859339 (`sparkdate-philly`) · range 2026-05-19 → 2026-09-04

Asked directly: *"I'm not sure what core GA4 tables we are reviewing vs. what's
available. I want total coverage."*

This is the answer, measured against the property's own metadata endpoint rather
than against the docs.

---

## EVIDENCE — the raw coverage number, and why it is misleading

`properties/536859339/metadata` reports **379 dimensions and 92 metrics**.
`scripts/fetch-ga4-tables.js` referenced **20 dimensions and 17 metrics** across
28 tables. That is 5.3% of dimensions and 18.5% of metrics.

That number overstates the problem badly. Of the 359 unread dimensions:

| Category | Unread | Actually relevant to us |
|---|---:|---|
| Traffic Source | 162 | Almost none — `firstUserCm360*`, `firstUserDv360*`, `firstUserSa360*` |
| Attribution | 83 | Almost none — same CM360 / DV360 / SA360 families |
| Other | 23 | A few (`linkUrl`, `outbound`, `fileName`) |
| Time | 21 | **Yes — `hour`, `dayOfWeekName`** |
| Ecommerce | 19 | Some (`itemCategory`, `itemId`) |
| Page / Screen | 15 | **Yes — `pagePath`, `pageTitle`** |
| Platform / Device | 15 | Marginal |
| Geography | 5 | `country` only |
| User | 5 | **Yes — `newVsReturning`, `audienceName`** |
| Demographics | 3 | **Would be, but returns nothing — see below** |

> ### CORRECTED later the same day — the paragraph below was wrong
>
> It originally read: *"We run Meta ads, not Google's ad stack. The 245
> CM360/DV360/SA360 fields are structurally empty for this property. The real
> gap was seven tables, not 359 dimensions."*
>
> That conclusion came from triaging fields **by category name**. An exhaustive
> sweep that probed all 471 fields individually contradicts it three ways:
>
> 1. **They are not empty.** `sessionSa360Medium` returns the literal `"cpc"`
>    and `sessionDv360Medium` returns `"cpm"` on *every* row — including rows
>    whose real source is `(direct)`, `eventbrite / listing` or
>    `google / organic`. Constant placeholders, which is more dangerous than
>    empty: they look like data.
> 2. **The `googleAds*` family is real.** Those fields carry a genuine account
>    name, campaign id, campaign type and ad network, because a Google Ads
>    account *is* linked to this property.
> 3. **"We run Meta, not Google" is false.** There is live Google Ads spend in
>    the property — $37.91 — that no report has ever read.
>
> The decision to skip the sa360/dv360 fields stands. The reason given for it
> did not survive measurement.

**The measured picture:** 240 of 471 fields carry real data — 173 dimensions and
67 metrics — against the 20 dimensions and 17 metrics the pull read. The gap was
18 tables, not seven, and the pull now stands at 46.

## EVIDENCE — the largest single gap: new vs. returning

`newVsReturning` was never read. It is the most valuable field in the property.

| Segment | Sessions | Users | Key events | Transactions | Revenue | Revenue / user |
|---|---:|---:|---:|---:|---:|---:|
| new | 3,783 | 3,826 | 163 | 24 | $651.76 | **$0.17** |
| returning | 1,233 | 221 | 68 | 15 | $409.36 | **$1.85** |
| (not set) | 212 | 132 | 0 | 0 | $0 | — |
| (blank) | 72 | 72 | 0 | 0 | $0 | — |

**A returning visitor is worth 10.9× a new one per user.** Returning sessions are
23% of all sessions and **39% of all revenue** (15 of 39 transactions,
$409.36 of $1,061.12).

This reconciles exactly, which is why I trust it: 24 + 15 = the 39 `purchase`
events in the event table, and $651.76 + $409.36 = `revenue-daily`'s $1,061.12
grand total. Two independent tables agree.

## MECHANISM — why that matters right now

The memory note *"Website audiences are orphans"* records that all three Meta
website retargeting audiences exist, all report "ready for use", and **none is
attached to an ad set.** This table is the missing half of that finding: the
segment those audiences would reach converts ~11× better per user, and it is
currently reached by nothing.

That is a measurement, not a recommendation — attaching an audience is a spend
decision, and `dont-swap-creatives-under-live-retargeting` applies.

## NOT AVAILABLE — two fields that are simply off

Both were probed live; neither is a code gap.

- **`userGender` / `userAgeBracket` → 0 rows.** The single most business-relevant
  dimension in the property returns nothing. Either Google Signals is disabled or
  volume is under GA4's demographic reporting threshold; the API returns an empty
  result rather than an error, so it cannot distinguish the two from here. Given
  how much of this business turns on the gender ratio at events, **this is worth
  resolving in the GA4 admin console.** It is a settings change, not a code change.
- **`organicGoogleSearch*` (4 metrics) → `ERROR 400: Search Console fields require
  an active link to be used.`** Search Console is not linked to this GA4 property.
  Free SEO data, one-time link, currently unavailable.

## DEAD END — outbound link tracking will not close the Eventbrite blind spot

`ga4-revenue-is-own-site-only` records that ~55% of revenue is invisible because
Eventbrite/Meetup imports fire no analytics. Outbound-click tracking looks like
the obvious fix. It is not.

Every outbound click since 05-19, complete:

| Domain | Clicks |
|---|---:|
| facebook.com | 7 |
| instagram.com | 5 |
| twitter.com | 4 |
| tiktok.com | 1 |
| wa.me | 1 |
| **total** | **18** |

That is 18 clicks, all social profile links in the footer, matching the `click`
event count of 18 exactly. **No eventbrite.com. No tickettailor.** GA4's enhanced
measurement is on and working; the Eventbrite handoff simply does not happen as a
tracked outbound anchor click. Adding `linkDomain` to the pull would add a table
that answers nothing. Not added, deliberately.

## ALREADY CORRECT — one gap that is closed by design

`landingPagePlusQueryString` returns 2,396 rows against `landingPage`'s handful,
and looks like discarded UTM detail. It is not an oversight — the code comment
says so:

> `fbclid` gives nearly every paid session its own URL, so the query-string
> version is 1,533 rows for 1,690 sessions and unreadable.

It was 1,533 rows when that was written and is 2,396 now, so the decision has
aged well. Per-ad attribution is served by the `utm-content` table
(`sessionManualAdContent`) instead. Left alone.

## DECISION — seven tables added (round one; eleven more followed)

`scripts/fetch-ga4-tables.js` goes from 28 to 35 tables.

| Table | Rows | Why |
|---|---:|---|
| `new-vs-returning` | 4 | The 10.9× finding above |
| `by-day-hour` | 168 | 7×24. Nothing else can test whether 1 PM is when anyone is actually here |
| `session-quality-daily` | 97 | `bounceRate`, `averageSessionDuration`, `sessionsPerUser` — no engagement-quality measure existed |
| `users-daily` | 97 | `newUsers` / `activeUsers` split; `totalUsers` alone cannot separate reach from return |
| `page-views` | 72 | `landingPage` only sees entry pages; checkout and `/matches` had no row at all |
| `checkout-error-reasons` | 2 | The literal decline text, which `category` never shows |
| `audiences` | 2 | All Users + Purchasers (393 sessions / 35 users) |

All seven were run against the live API as defined before being committed.

## CORRECTIONS made along the way

- **GA4's own label for `customEvent:reason` is wrong.** It is registered as
  "Fetch failure reason", which sent the first version of the table to filter on
  `next_event_fetch_failed` — where it is set 0 times out of 62. Measured, it is
  set by exactly one event, `checkout_error` (3 of 28). Filter corrected.
- **The `TABLES` docblock said "The twelve tables"** while defining 22. Replaced
  with a non-numeric description so it cannot rot again.

## Sep 3 is not final — do not quote it

Today's pull shows `20260903` with **205 sessions, 0 engaged sessions, 0%
engagement rate**, and `bounceRate` 1.0. That is GA4's settling lag, not a
collapse. Diffing the two pulls of the same days proves it:

| Day | As of the 09-02 pull | As of the 09-04 pull |
|---|---|---|
| Sep 1 | 107 sessions, **2** engaged, 1.9% | 109 sessions, **45** engaged, 41.3% |
| Sep 2 | 5 sessions, **0** engaged, 0% | 85 sessions, **31** engaged, 36.5% |

The file header states the rule: *"the last two dates in any daily series are not
final."* The newest trustworthy day in this pull is **Sep 2**. `bounceRate`
inherits the same lag, since it is `1 - engagementRate`.

## EVIDENCE — the exhaustive sweep (round two)

The first pass judged fields by category. This one probed **all 471
individually** against the live API and recorded whether each returns rows.

| | DATA | ONLY_NOTSET | EMPTY | ERROR |
|---|---:|---:|---:|---:|
| Dimensions (379) | **173** | 195 | 6 | 5 |
| Metrics (92) | **67** | — | 13 | 12 |

`ONLY_NOTSET` — returns rows, every value `(not set)` — is the honest reason to
skip most unread dimensions. Not "structurally empty".

### The find: Google Ads spend nobody reads

The `advertiserAd*` family and `returnOnAdSpend` **error out when queried
alone** — *"Please add sessionCampaignName to make the request compatible"* —
which is exactly why a probe that tests metrics in isolation reports them
unavailable. Paired correctly:

| Campaign | Cost | Clicks | Impr. | Sessions | Revenue | ROAS |
|---|---:|---:|---:|---:|---:|---:|
| Website traffic-Search-1 | $35.35 | 110 | 448 | **0** | $0 | 0 |
| Campaign #1 (PMax) | $2.56 | 4 | 61 | 2 | $27.49 | 10.73 |

**$37.91 of spend excluded from every CAC figure.** And $35.35 of it bought
**zero attributed sessions** — while the 20 sessions GA4 *does* credit to Google
Ads carry no campaign and no cost. A CPA from either half alone is wrong.

Cause is **not** established: auto-tagging disabled, an off-property destination
URL, and gclid stripping are all candidates. Not tested here.

At creative level, one ad costs **12× more per click**: `816106298597` took
$25.71 for 20 clicks ($1.286) against `816738636689`'s $9.64 for 90 ($0.107).

### Three live faults the new tables surface immediately

- **An unreplaced tracking placeholder.** `googleads / paid | <campaign-name>`
  carries **41 key events**. A real link is shipping the literal template text.
- **Suspect traffic inflating every rate.** 118 sessions report country
  `(not set)` / continentId `ZZ`, one session per user, firing **82 key events**
  on $0 revenue — a 58% rate against roughly 3% property-wide.
- **Auto-tagging overwrites `utm_campaign`.** `firstUserCampaignName` reads
  `Campaign #1` where the manual twin reads `week1_math`; `google / cpc` against
  `googleads / offline` (18 sessions). The manual column is the only surviving
  record of what the link was tagged with.

### A code bug that was silently discarding every caveat

`header()` has always accepted a `notes` parameter, but `toCsv()` called it with
four arguments and only `toCsvFunnel()` ever passed notes. **A `notes` array on
a table entry rendered nowhere.** Every "stated in the file header" caveat did
not exist. Fixed.

### Attribution disagrees with itself, and that is expected

GA4's data-driven model returns **fractional** credit — `eventbrite / listing`
gets 22.87 key events and $290.39 — and credits `Campaign #1` **$0.00** where
last-click gives it $27.49. The ROAS 10.73 above is the optimistic end of a
range. Both now ship with that caveat in the file header.

### Method note — the adversarial pass was load-bearing

A 13-agent design-then-challenge fan-out. The challenge stage rejected or
repaired most of what the design stage proposed, **including two of my own
tables**. The clearest save: a proposed `transactions` table with `itemName` in
the dimensions forces the request into *item* scope, which silently swaps the
`transactions` metric for `itemsPurchased` (41 vs 39) and under-reports revenue
by $92.52. It was designed, tested, and rejected on measurement.

**The pull now stands at 46 tables, from 28.**

## What I did not verify

- **Whether Google Signals is off, or demographics are threshold-suppressed.**
  The API returns an empty result for both cases. Someone with GA4 admin access
  has to look.
- **`totalUsers` per `newVsReturning` bucket may double-count.** One person can
  be new in May and returning in August, so 3,826 + 221 does not have to equal
  distinct users, and I have not treated it as a share of the user base. The
  revenue and transaction splits do not have this problem and are what the 39%
  claim rests on.
- **Whether the 62 `next_event_fetch_failed` events matter.** They carry no
  reason, so this pull cannot say what failed. That is a site instrumentation
  gap, unexamined here.
- ~~**The other 15 unread Platform/Device and 19 unread Ecommerce dimensions.** I
  triaged them as low-value by category rather than probing each one.~~
  **Closed in round two** — all 471 fields were probed individually, and that
  triage is exactly what turned out to be wrong.
- **Nothing about the running nightly.** The 09-04 launcher run was mid-analysis
  while this was written; its report is a separate artifact.

Added in round two:

- **Why $35.35 of Google Ads clicks produced zero sessions.** Auto-tagging
  disabled, an off-property destination URL, and gclid stripping at the landing
  page are all consistent with the data. None was tested. The pull states the
  fact and not a cause.
- **Whether the 118 `(not set)` / `ZZ` sessions are bots.** One session per
  user and a 58% key-event rate are *consistent* with automated traffic, not
  proof of it. No IP or user-agent evidence was examined.
- **Whether `transaction_id` reuse is legacy or live.** The range straddles
  PR #200. I did not bisect the fix date, so I cannot say whether purchases
  today still reuse ids.
- **Whether the `<campaign-name>` placeholder is still shipping.** Its 41 key
  events are historical over the whole range; I did not check whether a
  currently-serving ad still carries the unreplaced template.
- **The 195 `ONLY_NOTSET` dimensions were not individually adjudicated.** Each
  returns rows whose values are all `(not set)`; I treated the whole class as
  skippable rather than asking, field by field, whether any deserves
  instrumentation that would make it populate.

---

*Method: `properties/{id}/metadata` for the field inventory, `runReport` probes
for whether each candidate actually returns data, and the seven new definitions
executed live before commit. Full metadata capture available on request.*

---

## APPENDIX — every table the pull writes

Generated by reading the exported `TABLES` and `FUNNELS` arrays out of
`scripts/fetch-ga4-tables.js`, not by hand and not by parsing text. This is the
unambiguous answer to *"it isn't clear if all of this is being done"*: if a
table is on this list it is written to `Business Plan/files/Night Tasks/` as
`ga4-api-<name>-<date>.csv` on every run. If it is not on this list, it is not
pulled.

**46 tables.** 40 standard reports, 5 funnel reports, 1 cohort report.

| # | Table | Endpoint | Dimensions | Metrics |
|---:|---|---|---|---|
| 1 | `daily-trend` | runReport | `date` | `sessions`, `engagedSessions`, `totalUsers`, `engagementRate` |
| 2 | `traffic-by-source` | runReport | `sessionSourceMedium` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 3 | `channel-groups` | runReport | `sessionDefaultChannelGroup` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 4 | `landing-pages` | runReport | `landingPage` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 5 | `events` | runReport | `eventName` | `eventCount`, `totalUsers` |
| 6 | `events-by-source` | runReport | `eventName`, `sessionSourceMedium` | `eventCount`, `totalUsers` |
| 7 | `promotions` | runReport | `itemPromotionName`, `itemPromotionCreativeSlot` | `itemsViewedInPromotion`, `itemsClickedInPromotion` |
| 8 | `daily-by-source` | runReport | `date`, `sessionSourceMedium` | `sessions`, `engagedSessions`, `totalUsers`, `engagementRate` |
| 9 | `landing-by-source` | runReport | `landingPage`, `sessionSourceMedium` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 10 | `revenue-by-source` | runReport | `sessionSourceMedium` | `transactions`, `totalRevenue` |
| 11 | `revenue-by-item` | runReport | `itemName` | `itemsViewed`, `itemsAddedToCart`, `itemsPurchased`, `itemRevenue` |
| 12 | `cities` | runReport | `city`, `region` | `totalUsers`, `sessions`, `keyEvents`, `totalRevenue` |
| 13 | `by-device` | runReport | `deviceCategory` | `sessions`, `engagedSessions`, `keyEvents`, `totalRevenue` |
| 14 | `os-browser` | runReport | `operatingSystem`, `browser` | `sessions`, `engagedSessions`, `totalUsers`, `keyEvents` |
| 15 | `key-events` | runReport | `eventName` | `keyEvents`, `eventValue`, `totalRevenue` |
| 16 | `key-events-daily` | runReport | `date` | `keyEvents`, `eventCount` |
| 17 | `key-events-by-source` | runReport | `eventName`, `sessionSourceMedium` | `keyEvents`, `eventValue` |
| 18 | `revenue-daily` | runReport | `date` | `totalRevenue`, `transactions`, `keyEvents` |
| 19 | `items-daily` | runReport | `date`, `itemName` | `itemsPurchased`, `itemRevenue` |
| 20 | `webview-by-event` | runReport | `customEvent:in_app_browser`, `eventName` | `eventCount`, `totalUsers` |
| 21 | `checkout-errors` | runReport | `customEvent:category` *(event-filtered)* | `eventCount`, `totalUsers` |
| 22 | `utm-content` | runReport | `sessionManualAdContent`, `sessionCampaignName` | `sessions`, `keyEvents`, `totalRevenue` |
| 23 | `new-vs-returning` | runReport | `newVsReturning` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue`, `transactions` |
| 24 | `by-day-hour` | runReport | `dayOfWeekName`, `hour` | `sessions`, `keyEvents` |
| 25 | `session-quality-daily` | runReport | `date` | `bounceRate`, `averageSessionDuration`, `sessionsPerUser` |
| 26 | `users-daily` | runReport | `date` | `newUsers`, `activeUsers`, `totalPurchasers`, `firstTimePurchasers` |
| 27 | `page-views` | runReport | `pagePath`, `pageTitle` | `screenPageViews`, `sessions` |
| 28 | `checkout-error-reasons` | runReport | `customEvent:reason` *(event-filtered)* | `eventCount`, `totalUsers` |
| 29 | `audiences` | runReport | `audienceName` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 30 | `google-ads-cost` | runReport | `sessionCampaignName` | `advertiserAdCost`, `advertiserAdClicks`, `advertiserAdImpressions`, `advertiserAdCostPerClick`, `advertiserAdCostPerKeyEvent`, `returnOnAdSpend` |
| 31 | `google-ads-cost-daily` | runReport | `date`, `sessionCampaignName` | `advertiserAdCost`, `advertiserAdClicks`, `advertiserAdImpressions` |
| 32 | `paid-cost-vs-sessions` | runReport | `sessionCampaignName`, `sessionSourcePlatform`, `sessionSourceMedium` | `advertiserAdCost`, `sessions`, `keyEvents`, `totalRevenue` |
| 33 | `transactions` | runReport | `transactionId`, `date` | `totalRevenue`, `transactions`, `itemsPurchased` |
| 34 | `google-ads-by-network` | runReport | `sessionGoogleAdsAccountName`, `sessionGoogleAdsCampaignName`, `sessionGoogleAdsCampaignType`, `sessionGoogleAdsAdNetworkType` | `advertiserAdCost`, `advertiserAdClicks`, `advertiserAdImpressions` |
| 35 | `google-ads-creatives` | runReport | `sessionGoogleAdsAdGroupId`, `sessionGoogleAdsCreativeId` | `advertiserAdCost`, `advertiserAdClicks`, `advertiserAdImpressions` |
| 36 | `weekly-trend` | runReport | `isoYearIsoWeek` | `sessions`, `activeUsers`, `newUsers`, `keyEvents`, `transactions`, `totalRevenue` |
| 37 | `geo-country-language` | runReport | `continent`, `continentId`, `country`, `countryId`, `language`, `languageCode` | `sessions`, `totalUsers`, `keyEvents`, `totalRevenue` |
| 38 | `utm-ad-detail` | runReport | `sessionManualSourceMedium`, `sessionManualCampaignName`, `sessionManualAdContent`, `sessionManualTerm` | `sessions`, `keyEvents`, `totalRevenue`, `transactions` |
| 39 | `first-user-tagging` | runReport | `firstUserSourceMedium`, `firstUserManualSourceMedium`, `firstUserCampaignName`, `firstUserManualCampaignName`, `firstUserCampaignId`, `firstUserManualCampaignId` | `sessions` |
| 40 | `attribution-credit` | runReport | `sourceMedium`, `campaignName` | `keyEvents`, `totalRevenue` |
| 41 | `funnel-by-device` | runFunnelReport | 4-step funnel, broken down by `deviceCategory` | *(funnel report: active users + completion rate per step)* |
| 42 | `funnel-by-channel` | runFunnelReport | 4-step funnel, broken down by `sessionDefaultChannelGroup` | *(funnel report: active users + completion rate per step)* |
| 43 | `funnel-webview-vs-normal` | runFunnelReport | 4-step funnel | *(funnel report: active users + completion rate per step)* |
| 44 | `funnel-waitlist-sequence` | runFunnelReport | 2-step funnel | *(funnel report: active users + completion rate per step)* |
| 45 | `funnel-checkout-by-landing-page` | runFunnelReport | 3-step funnel, broken down by `landingPage` | *(funnel report: active users + completion rate per step)* |
| 46 | `cohort-retention` | runReport + cohortSpec | `cohort`, `cohortNthWeek` | `cohortActiveUsers`, `cohortTotalUsers` |
