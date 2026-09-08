# GA4 + Meta nightly review — 2026-09-08

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two dates
in every daily series (20260907, 20260908) are dropped as not-yet-final; all
"closed week" figures below use two disjoint 7-day buckets, never a rolling
window. Data provenance: GA4 window `20260519-20260908`, pulled **2026-09-08
06:00 UTC** (property 536859339, dates in America/New_York); Meta campaign
insights for **2026-09-01 to 2026-09-07**, pulled 2026-09-08 02:00 local.
`ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26"; its file mtime is
**2026-08-28 18:25**, i.e. it was edited after that stamp without the stamp
being bumped — the same one-sentence note carried in the last two nights'
reports, unchanged since.

Unattended run: `scripts/ga4-nightly-summary.js` executed cleanly against all
46 tables (output reproduced below); no fallback to hand-parsing was needed.

## HEADLINE — sessions and revenue both down this closed week, but the drop is not evenly spread across the week and the two flagship watch items from prior reports both moved favorably

**1. Traffic and revenue.** Recent closed week (08/31–09/06): 775 sessions,
756 users, 2 transactions, $54.98 own-site revenue. Prior closed week
(08/24–08/30): 1075 sessions, 996 users, 7 transactions, $202.43. That's
-28% sessions, -24% users, -71% transactions, -73% revenue. Per
ANALYTICS_METHOD §12, 2 vs 7 transactions is far too small a base to call a
trend, and the session drop is not uniform across the week: comparing the
same weekday across the two weeks, Sunday collapses from 220 sessions
(08/30) to 39 (09/06) — an 82% single-day swing — while Thursday actually
*rises* 153→210. The 08/30 Sunday spike was itself concentrated in one
channel (`Facebook / paid_social` alone put up 107 of that day's 220
sessions, roughly 3x its neighboring days), so a large share of the
week-over-week "decline" is one unusually high paid-social Sunday in the
prior bucket, not a demand cliff in the recent one. Genuinely down
day-for-day: Wed (172→85), Fri (116→78), Sat (138→85) — real but each within
normal single-digit-percent-of-total-traffic noise on a property this size.

**2. Two items §3b flagged as "still open, watch this number" both moved
since they were last checked, and both moved in the direction that closes
the question rather than reopening it.**

- The 08-26 report's open Marion Court watch item ("6 carts → 0 purchases…
  that number moving is the only thing that re-opens the discussion") has
  moved: tonight's item table shows **SparkDate: Real People, Real Drinks,
  Real Court** (the Marion Court event item) at 13 carts, **5 purchased**,
  $99.95. Cart→purchase is no longer zero. This does not need to go to
  Taylor — the number named as the re-open trigger has moved in the healthy
  direction, so the watch item is resolved, not escalated.
- The `<campaign-name>` literal-placeholder UTM defect — carried as the
  single largest key-event-volume item in the UTM worklist across at least
  three consecutive reports (41 key events on 09-07, same 41 tonight) — was
  run down tonight instead of re-listed. It resolves entirely to two source
  rows: `googleads / paid` (46 sessions, 41 key events — all
  `ads_conversion_About_Us_1`, a pseudo-conversion per ANALYTICS_METHOD §8,
  not a real conversion) and `Facebook / paid` (23 sessions, 0 key events).
  Cross-checking tonight's fragmentation table (§4a below): `googleads /
  paid` is **DEAD, last seen 20260803**, and `Facebook / paid` is **DEAD,
  last seen 20260609**. Neither row appears in tonight's "Sources seen for
  the first time in the last 7 closed days" table either. No ad currently
  serving carries this placeholder — the 21-ad live inventory in tonight's
  Paid Ad UTMs refresh (see log) shows real per-ad `utm_content` values
  (`lx_convert_female_showup`, `mc_rt_quang`, etc.), not the placeholder.
  **This is closed as historical residue with no live ad to fix** — moved
  out of the worklist below; re-open only if a `<campaign-name>` row appears
  with a `last seen` date inside a closed week again.

Neither finding changes what Taylor should do tonight. See TRAFFIC and UTM
sections for full detail.

## TRAFFIC — standing section

| metric | recent 7d (08/31–09/06) | prior 7d (08/24–08/30) | change |
| --- | ---: | ---: | ---: |
| sessions | 775 | 1075 | -28% |
| engaged sessions | 289 | 382 | -24% |
| engagement rate | 37.3% | 35.5% | +1.8pp |
| users | 756 | 996 | -24% |
| new users | 708 | 895 | -21% |
| purchasers | 2 | 7 | -71% |
| key events | 5 | 20 | -75% |
| transactions | 2 | 7 | -71% |
| own-site revenue | $54.98 | $202.43 | -73% |

Engagement rate held (even ticked up slightly) while sessions fell, which
argues against a quality problem in whoever did show up — the missing
traffic is missing volume, not missing intent. Own-site revenue is a floor,
not total revenue (ANALYTICS_METHOD §7); roughly 55% of real ticket revenue
runs through Eventbrite/Meetup, invisible here.

### Channels (window-wide, 20260519–20260908)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3122 | 2839 | 26 | 0.8% | $179.94 |
| Direct | 798 | 486 | 22 | 2.8% | $169.94 |
| Unassigned | 627 | 206 | 68 | 10.8% | $345.37 |
| Email | 391 | 214 | 26 | 6.6% | $125.45 |
| Organic Social | 232 | 185 | 10 | 4.3% | $130.46 |
| Organic Search | 146 | 89 | 7 | 4.8% | $82.47 |
| Paid Other | 117 | 109 | 63 | 53.8% | $0.00 |
| Referral | 74 | 14 | 5 | 6.8% | $0.00 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| Cross-network | 6 | 6 | 6 | 100.0% | $27.49 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Paid Social is 70% of all tracked sessions and converts worst of any
channel with real volume (0.8%); Unassigned — mostly Eventbrite and organic
event-listing referrals — is 5% of sessions and 31% of revenue. **Paid
Other's 53.8% conversion is $0 revenue** — its 63 "key events" are almost
entirely `ads_conversion_About_Us_1` (a landing-page view mislabeled as a
key event, ANALYTICS_METHOD §8), not real conversions; don't read that row
as healthy. Cross-network's 100% conv / $27.49 on 6 sessions is too small a
base to mean anything (§12).

### Top 15 sources, device, geography

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1620 | 1492 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 798 | 486 | 22 | 2.8% | $169.94 |
| Instagram / paid_social | 635 | 566 | 6 | 0.9% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 228 | 223 | 0 | 0.0% | $0.00 |
| eventbrite / listing | 175 | 82 | 23 | 13.1% | $290.39 |
| lp / (not set) | 163 | 17 | 1 | 0.6% | $0.00 |
| ig / paid_social | 156 | 149 | 0 | 0.0% | $0.00 |
| google / organic | 134 | 81 | 6 | 4.5% | $82.47 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| m.facebook.com / referral | 64 | 64 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |
| resend.com / referral | 57 | 2 | 4 | 7.0% | $0.00 |

Eventbrite is the standout: 5% of Facebook's session volume, 13.1%
conversion — 15x Facebook's own rate. Facebook and its variants dominate raw
volume but convert under 1% everywhere they appear (see UTM fragmentation
below — summing all Facebook rows doesn't change the rate materially).
`Ybadbfgfe | Zbfgfe Yvfg / email` is the still-open obfuscated-tag row, see
§4d.

Mobile: 4107 sessions, 2.8% conv, $904.17 revenue. Desktop: 1398 sessions,
**8.6%** conv, $156.95 revenue. Desktop converts 3x better on a third of the
volume — consistent with every prior report, not a new finding. iOS Safari
is the single largest OS/browser cell (2626 sessions, 39 key events).
Philadelphia (911 sessions), West Chester (424), Lancaster (251) lead
cities. **The `(not set)`/continentId `ZZ` bucket is 118 sessions with an
inverted 69.5% key-event rate** against 4.3% property-wide — consistent
with the datacenter/bot traffic ANALYTICS_CONTEXT.md already documents as an
~8–12% denominator inflation, not real users; no IP-level check was run
tonight to confirm.

## EVENTS — standing section

34 distinct events fired window-wide (33 non-key + 3 key — 36 rows in the
raw table include a header/version artifact; the summary script counts 34
real events). **Only 3 are configured as GA4 key events**:
`ads_conversion_About_Us_1` (99 events, $0 — this is a landing-page view on
`/lp?utm_source=googleads`, not an About Us visit, per ANALYTICS_METHOD §8),
`generate_lead` (95, $94 nominal value, $0 revenue), and `purchase` (39,
$1,061.12 — the only one that's real money).

Four events carry a dollar VALUE but count zero key events — funnel steps,
not conversions, per the prompt's standing warning:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $16,804.30 |
| begin_checkout | 0 | $4,111.41 |
| add_to_cart | 0 | $2,578.98 |
| add_payment_info | 0 | $284.90 |

**Instrumentation gap, not a new finding but worth restating with tonight's
count:** `purchase` fired 39 times against `add_payment_info`'s 10 — more
completed purchases than recorded payment-info-add events, only possible if
some checkout path (saved card, Apple Pay, autofill) skips whatever fires
`add_payment_info`. n=10, don't build a rate on it (§12); worth an
engineering look at the call site against Stripe's actual payment-element
flow, but this has been true for at least two prior reports and isn't
escalating.

What moved: key events fell 20→5 and transactions 7→2 this closed week — see
HEADLINE for why this reads as noisy rather than alarming.

Two events worth naming that don't fit elsewhere: `lp_visible` (223 events,
202 users) and `checkout_field_started` (40 events, 19 users) are both part
of the 2026-09-03 paid-funnel-fix instrumentation (ANALYTICS_METHOD §10) and
are firing at volumes consistent with `/lp`'s session share — no anomaly.

## UTM AND TAGGING GAPS — standing section, ranked by sessions affected

1. **`facebook` fragmented across 11 row variants (6 still live), 2522
   sessions, 29 key events, $200.44 combined.** Live: `Facebook /
   paid_social` (1620), `fb / paid_social` (228), `m.facebook.com /
   referral` (64), `facebook.com / referral` (38), `Facebook / social` (8),
   `l.facebook.com / referral` (3). No single row shows what Facebook
   actually did. **Fix:** normalize source/medium casing and the
   `fb`/`m.facebook.com` variants at the point they're written (ad
   destination URLs, internal referral handling), not after the fact. Same
   fix named in the last two reports; not yet applied.
2. **`instagram` split across 2 rows, both live, 791 sessions, 6 key
   events, $82.47**: `Instagram / paid_social` (635) vs `ig / paid_social`
   (156). One canonical casing needed.
3. **Own-site internal-link tagging, 94 sessions currently live, 292
   total across the window.** `get_tickets_block / (not set)` (61 sessions,
   live as of 20260904, $27.49 attributed away from its real source) and
   `matches / (not set)` (33, live as of 20260905, $27.49). The rest
   (`lp / (not set)` 163, `matches / web` 26, and four smaller rows) are
   stale/dead. **Fix:** these are internal navigation elements and
   shouldn't carry `utm_source` at all — strip the tags from
   `get_tickets_block` and any internal `/matches` links. This is the
   highest-value **currently live**, single-call-site fix in the whole
   worklist.
4. **`email` fragmented across 6 rows (3 live), 259 sessions, 26 key
   events, $125.45**: `email / nurture` (53, live), `email / newsletter`
   (48, live), `email / returning` (19, live); `email / email` (117, stale)
   is actually the largest row by volume but hasn't fired since 20260826.
5. **Obfuscated tag, 137 sessions combined.** `Ybadbfgfe | Zbfgfe Yvfg /
   email` decodes (a–f shift +1, g–z ROT13) to `Lancaster | Master List /
   email` — 129 sessions, 0 key events, plaintext twin already exists at 8
   sessions. This is the LancasterOnline/Evvnt obfuscation the 09-06 report
   traced and partially fixed (#461); tonight's volume (129, up from 09-07's
   137-combined-but-similarly-split figure) is consistent with residual
   historical sessions still surfacing under the old tag, not a new leak —
   not chased further tonight.
6. **`googleads` fragmented across 5 rows, 127 sessions, 94 key events**
   (all `ads_conversion_About_Us_1`, i.e. not real conversions per §8) —
   every row DEAD, oldest since 20260803. Google Ads has been dark since
   2026-07-24 (settled, ANALYTICS_CONTEXT §3b); this is historical residue
   only.
7. **~~`<campaign-name>` literal placeholder~~ — RESOLVED tonight, see
   HEADLINE.** Both source rows carrying it are DEAD (last seen 20260803
   and 20260609). Retired from this worklist.
8. **Campaigns spending sessions and returning zero key events** (≥20
   sessions): `Augweek3_lancaster` (471), `Augweek1_philly` (358),
   `summer2026_philly` (273), `Augweek1_lancaster` (223), `week2_Solution`
   (212+49), `LX_202609/lx_prime_male_noplan` (156),
   `LX_202609/lx_prime_female_showup` (81). **New this pull:** the two
   `LX_202609`/`lx_prime_*` rows (237 sessions combined, 0 key events) are
   the **paused** Loxleys creative — tonight's Paid Ad UTMs refresh (see
   unattended log) shows `lx_prime_female_showup` and `lx_prime_male_noplan`
   as `CAMPAIGN_PAUSED`, already superseded by the live
   `lx_convert_female_showup` / `lx_convert_male_noplan` pair. So this is a
   dead creative generation already retired by Taylor, not a live leak — no
   action needed, noted for completeness. Everything else in this row is
   July/August spend already stopped, matching prior reports; none of these
   campaign names match any of the 5 campaigns actually live in tonight's
   Meta pull (Marion Court ×3, Loxleys ×2).
9. **`utm_content` shared across multiple campaigns** (violates
   `content/brand.json`'s uniqueness requirement): `proof_rsa1` spans 7
   campaigns; `mc_figlancaster` spans 2. Per-ad attribution stays impossible
   for these until rebuilt with unique values. Contrast: every currently
   **ACTIVE** ad in tonight's Paid Ad UTMs refresh already carries a unique
   `utm_content` (`lx_convert_female_showup`, `mc_rt_quang`,
   `mc_rt_still_thinking_v2`, etc.) — the uniqueness fix from the ad-ladder
   work (#479/#480) appears to be holding for new/live creative; this
   defect is confined to paused/historical ads.

## ALSO IN THE REPORT

- **Loxleys campaigns launched ~2026-08-30** (first appeared in
  `meta-insights-2026-08-30.csv`, window 20260824-20260830; absent from
  `meta-insights-2026-08-29.csv` and every earlier pull checked back to
  08-19). **Sale-date check, per the prompt's explicit warning about
  crediting a campaign before it existed:** "Sparkdate: The Loxley's Social"
  item — the only item plausibly tied to the Loxleys venue — sold its only
  2 recorded units on **20260814 and 20260815**, two weeks *before* any
  Loxleys campaign existed. Nothing in tonight's data credits Loxleys
  campaigns with a sale, but flagging this so nobody makes that inference
  from the item name alone in a future report — the item's real sales
  predate the campaign entirely and any conversion Loxleys campaigns
  produce going forward will show up as a *new* item purchase, not against
  this history.
- **Webview conversion gap, restated at tonight's numbers, not a new
  finding:** in-app-browser sessions convert to purchase at **0.09%** (1 of
  1127 session-starts) against **1.62%** for normal browsers (9 of 556) — a
  ~18x gap, essentially unchanged from the 09-07 report's 0.09%/1.66%. Same
  mechanism as ANALYTICS_METHOD §6 and multiple prior reports (Meta's
  in-app browser degrading checkout). Paid Social is heavily webview-mixed,
  so this continues to be a large part of why Paid Social underperforms on
  conversion despite carrying 70% of volume.
- **Landing-page × source dead pairings** (≥20 sessions, 0 key events):
  `/lp` × `facebook / paid_social` (419), `/lp` × `fb / paid_social` (211),
  `/lp` × `ig / paid_social` (155), `/event` × the obfuscated Lancaster
  email tag (129), `/admin` × `lp / (not set)` (106 — internal-tagging
  artifact, item 3 above). The script's cross-tab again surfaces
  `googleads / paid` as the only "converting" source on `/lp` (91.1%, 56
  sessions) — **do not read that as real**: every one of those 51 "key
  events" is `ads_conversion_About_Us_1`, a page load, not a lead or sale.
  Once that pseudo-event is excluded, no source converts meaningfully
  better than another on `/lp` this pull; the dead Facebook/Instagram
  volume is explained by the webview mechanism above, not a page-content
  problem — no `public/` change proposed.
- **Two pages take real traffic and return nothing** (≥15 sessions, 0 key
  events): `(not set)` landing page (40 sessions, 31 users — a missing
  page-path value, not a real route; not investigated further, low
  priority given no page to actually fix) and `/signup` (15 sessions, 11
  users — already-settled: membership is shelved, `sign_up` fires zero
  times all year per ANALYTICS_CONTEXT §1, this is expected dead weight on
  a shelved feature, not a defect).
- **New organic listing sources this window** (from "sources seen for the
  first time in the last 7 closed days"): `facebook_event / listing` (12
  sessions), `nextdoor_event / listing` (4), `facebook_group / listing`
  (4), `figlancaster / listing` (2), `visitlancastercity / listing` (2).
  These read as new free event-listing placements going live (consistent
  with the `syndicate-events` skill's purpose), not tagging defects —
  worth someone confirming they're deliberate, but not urgent and not
  something only Taylor can check (the listings themselves are public
  URLs).
- **Marion Court checkout-stage watch item — RESOLVED, see HEADLINE.**
  Cart→purchase for "SparkDate: Real People, Real Drinks, Real Court" is
  now 13→5, not 6→0. Closing this out of the standing watch list.
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: $0.00 gap. Revenue-by-item vs transaction
  total: **−$92.52**, the already-documented 2-for-1 item-count effect
  (#205) — expected, not a new discrepancy.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions; 5 ids appear more than once (max 8 on one id), 5 span more
  than one date. Open since PR #200; not investigated further tonight,
  carried forward.
- **Founders Mixer**: 8 purchases, 0 recorded `view_item`, 0 `add_to_cart`
  — all June sales (0603–0624). Old enough that this reads as a one-time
  sales mechanism (comped, admin, or a since-retired event page) rather
  than a live gap; not chased further.
- **Google Ads, confirmed still dark.** $0 spend on the last 7 closed days
  (20260831–20260906); lifetime total unchanged at $37.91. This is the
  correct reading tonight — `scripts/ga4-nightly-summary.js`'s recency
  window bug that produced a false "$14.46 accruing" figure on 09-06 and
  09-07 was fixed in PR #478 (merged, in `git log` above) and tonight's
  script run reports `$0.00` correctly with no manual correction needed.
  `Website traffic-Search-1` still shows $35.35 lifetime spend against
  **zero attributed sessions** — already known, not new.

## NEEDS TAYLOR INPUT (0)

Nothing tonight clears the bar in §7 of the prompt. Every open item above is
either resolvable in code (the UTM fragmentation worklist), already a
decided/settled item (§3b), or a watch item that resolved itself favorably
this pull (Marion Court cart→purchase, the `<campaign-name>` placeholder).
Matches the last two nights' count (0).

## Zero-risk fixes, described and not applied

1. **Internal-link UTM stripping** — remove `utm_source`/`utm_medium` from
   the `get_tickets_block` and internal `/matches` link elements (UTM item
   3): 94 sessions of live, ongoing self-misattribution, single clear
   call-site fix, the only currently-live item in the UTM worklist with an
   obvious one-line change. Described in the last two reports as well; not
   yet applied.
2. **`facebook`/`instagram` source casing normalization** at the
   destination-URL / referral-tagging level (UTM items 1–2) — highest
   session volume in the worklist (2522 + 791 sessions), but the fix
   touches however these six-plus row variants get produced (ad UTMs,
   referral handling) rather than one call site, so it's flagged, not
   fully scoped, here.

## Caveats

- ANALYTICS_METHOD §1: 20260907 and 20260908 excluded from every daily
  figure as not-yet-final.
- ANALYTICS_METHOD §8 governs every reading of `ads_conversion_About_Us_1`
  in this report — never treated as a real conversion.
- ANALYTICS_METHOD §12: `add_payment_info` (n=10), the recent-week
  transaction count (n=2), and the transaction_id-reuse figures are all
  small-sample; read as direction, not rate.
- ANALYTICS_METHOD §7: all revenue figures above are own-site GA4 only, not
  business revenue.
- ANALYTICS_METHOD §9: no Meta week-over-week comparison drawn — the
  09-07 pull (20260901-20260907) and tonight's would overlap by 6 of 7 days.
- ANALYTICS_METHOD §10: no comparison spans the 08-21, 08-25, 08-28, or
  09-03 series-break dates.

**What I did not verify:** did not log into Meta Ads Manager or Google Ads
Manager tonight — the Loxleys launch-date inference rests on the absence of
"Loxleys" rows across seven consecutive daily `meta-insights-*.csv` pulls
plus its presence in the first pull after that gap, not a fresh Ads Manager
check of the campaign's actual start date. Did not open any `public/` page
source — no dead-traffic pattern tonight needed a page-level hypothesis
beyond the already-established webview mechanism, and the two zero-key-event
pages (`(not set)`, `/signup`) are either not a real route or an
already-settled shelved feature. Did not independently re-verify the
LancasterOnline/Evvnt obfuscated-tag fix beyond observing this pull's volume
is consistent with the 09-06/09-07 reports' account of it. Did not chase
`transaction_id` reuse or the Founders Mixer no-view-purchases pattern
beyond noting them, both carried forward unchanged. Did not check the IP or
user-agent evidence for the `(not set)`/`ZZ` datacenter-traffic bucket.

## Coverage

**46 of 46** tables represented in the standing summary (script's own
ledger, reproduced below). No table was skimmed-and-skipped.

| table | rows | in standing summary |
| --- | ---: | --- |
| attribution-credit | 51 | yes |
| audiences | 2 | yes |
| by-day-hour | 168 | yes |
| by-device | 3 | yes |
| channel-groups | 11 | yes |
| checkout-error-reasons | 2 | yes |
| checkout-errors | 4 | yes |
| cities | 994 | yes |
| cohort-retention | 18 | yes |
| daily-by-source | 762 | yes |
| daily-trend | 102 | yes |
| events | 36 | yes |
| events-by-source | 706 | yes |
| first-user-tagging | 134 | yes |
| funnel-by-channel | 35 | yes |
| funnel-by-device | 13 | yes |
| funnel-checkout-by-landing-page | 34 | yes |
| funnel-waitlist-sequence | 2 | yes |
| funnel-webview-vs-normal | 8 | yes |
| geo-country-language | 61 | yes |
| google-ads-by-network | 4 | yes |
| google-ads-cost | 2 | yes |
| google-ads-cost-daily | 24 | yes |
| google-ads-creatives | 2 | yes |
| items-daily | 30 | yes |
| key-events | 7 | yes |
| key-events-by-source | 127 | yes |
| key-events-daily | 102 | yes |
| landing-by-source | 251 | yes |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 29 | yes |
| page-views | 72 | yes |
| paid-cost-vs-sessions | 125 | yes |
| promotions | 7 | yes |
| revenue-by-item | 6 | yes |
| revenue-by-source | 14 | yes |
| revenue-daily | 66 | yes |
| session-quality-daily | 102 | yes |
| traffic-by-source | 68 | yes |
| transactions | 32 | yes |
| users-daily | 102 | yes |
| utm-ad-detail | 307 | yes |
| utm-content | 95 | yes |
| webview-by-event | 80 | yes |
| weekly-trend | 16 | yes |

Cross-referenced additionally against tonight's Meta pull
(`meta-insights-2026-09-07.csv`, 5 campaigns) and seven days of prior Meta
pulls (`meta-insights-2026-08-19.csv` through `-08-30.csv`) to establish the
Loxleys launch date in ALSO IN THE REPORT.
