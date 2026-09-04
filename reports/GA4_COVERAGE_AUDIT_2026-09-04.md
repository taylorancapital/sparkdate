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

We run Meta ads, not Google's ad stack. The 245 CM360/DV360/SA360 fields are
structurally empty for this property. **The real gap was seven tables, not 359
dimensions.**

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

## DECISION — seven tables added

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
- **The other 15 unread Platform/Device and 19 unread Ecommerce dimensions.** I
  triaged them as low-value by category rather than probing each one.
- **Nothing about the running nightly.** The 09-04 launcher run was mid-analysis
  while this was written; its report is a separate artifact.

---

*Method: `properties/{id}/metadata` for the field inventory, `runReport` probes
for whether each candidate actually returns data, and the seven new definitions
executed live before commit. Full metadata capture available on request.*
