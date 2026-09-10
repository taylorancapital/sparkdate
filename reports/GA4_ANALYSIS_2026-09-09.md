# GA4 + Meta nightly review — 2026-09-09

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two dates
in every daily series (20260908, 20260909) are dropped as not-yet-final; all
"closed week" figures below use two disjoint 7-day buckets, never a rolling
window. Data provenance: GA4 window `20260519-20260909`, pulled **2026-09-09
06:00 UTC** (property 536859339, dates in America/New_York); Meta campaign
insights for **2026-09-02 to 2026-09-08**, pulled 2026-09-09 02:00 local.
`ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26"; its file mtime is
**2026-08-28 18:25**, i.e. it was edited after that stamp without the stamp
being bumped — the same one-sentence note carried in prior reports, unchanged
since (does not need re-escalating; the mtime hasn't moved).

Unattended run: `scripts/ga4-nightly-summary.js` executed cleanly against all
46 tables; no fallback to hand-parsing was needed. Its full output is
reproduced/summarized below.

## HEADLINE — the week's session collapse is concentrated in the last two closed days (Sun 09-06, Mon 09-07), and it is overwhelmingly a Facebook/Instagram paid_social phenomenon, not a uniform demand decline

**1. The topline numbers.** Recent closed week (09/01–09/07): 648 sessions,
635 users, 2 transactions, $54.98 own-site revenue. Prior closed week
(08/25–08/31): 1109 sessions, 1040 users, 6 transactions, $169.94. That's
-42% sessions, -39% users, -67% transactions, -68% revenue — worse-looking
than last night's -28%/-24%/-71%/-73% because the window rolled forward one
day and picked up two very weak new days at the tail. Per ANALYTICS_METHOD
§12, 2 vs 6 transactions is far too small a base to read as a rate.

**2. Splitting the week by day shows the decline is not spread evenly.**
Matching weekday-for-weekday against the prior closed week:

| weekday | prior (date, sessions) | recent (date, sessions) | change |
| --- | --- | --- | ---: |
| Tue | 08-25, 141 | 09-01, 109 | -23% |
| Wed | 08-26, 172 | 09-02, 85 | -51% |
| Thu | 08-27, 153 | 09-03, 210 | +37% |
| Fri | 08-28, 116 | 09-04, 78 | -33% |
| Sat | 08-29, 138 | 09-05, 85 | -38% |
| **Sun** | **08-30, 220** | **09-06, 39** | **-82%** |
| **Mon** | **08-31, 169** | **09-07, 42** | **-75%** |

Grouping Tue–Sat (five days) against Sun+Mon (two days) separates two
different stories: **Tue–Sat fell 720 → 567 sessions, -21%** — real, but
roughly in line with the day-to-day noise this property has shown all
August (Wed alone accounts for most of it, offset by Thu's +37%). **Sun+Mon
fell 389 → 81 sessions, -79%** — a much sharper, concentrated drop, and both
09-06 and 09-07 are inside the summary script's own "closed" range (three or
more days back from the 09-09 pull), not tail-lag artifacts per §1(a)/(b).

**3. The Sun+Mon drop is not a uniform channel effect — it is almost
entirely Facebook/Instagram paid_social.** Summing every Facebook- and
Instagram-tagged source/medium row (`Facebook / paid_social`, `fb /
paid_social`, `Instagram / paid_social`, `ig / paid_social` — see UTM §4a for
why there are four rows for one advertiser) for just Sun+Mon:

| | prior (08-30 + 08-31) | recent (09-06 + 09-07) | change |
| --- | ---: | ---: | ---: |
| Facebook/Instagram family, combined | 305 | 56 | -82% |
| everything else | 84 | 25 | -70% |
| **total** | **389** | **81** | **-79%** |

The Facebook/Instagram family alone accounts for 249 of the 308-session
Sun+Mon decline (81% of it). Within that family, the proper-case `Facebook /
paid_social` row specifically collapsed from 164 combined sessions
(08-30+08-31) to 11 (09-06+09-07), while the lowercase `fb / paid_social`
variant barely moved (35 → 17) — consistent with one specific
campaign/ad-set's delivery dropping sharply on those two days rather than a
platform-wide Meta outage (which would have hit both taggings equally).
`Instagram / paid_social` (proper-case) went to **zero** on both days,
against 50 combined sessions the prior Sun+Mon.

**4. This could not be confirmed or ruled out against Meta's own delivery
data tonight.** The Windsor.ai connector available to this session has no
Meta/Facebook account connected (`get_data` returned "No facebook account
... was found"), so there is no daily-granularity spend/impressions check
available in unattended mode. The only Meta data on disk is the nightly
7-day rolling pull, which shows no comparable collapse — $158.10 (pull
09-04) → $153.42 (09-05) → $144.94 (09-06) → $135.86 (09-07) → $142.91
(09-08), a gentle decline consistent with normal week-to-week variance, not
a cliff. **A rolling 7-day total cannot rule out a two-day mid-week dip**
(ANALYTICS_METHOD §9) if spend concentrates on other days of each window —
so the flat rolling total does not contradict the GA4 session finding, it
just can't confirm it either. This is the one item below routed to Taylor:
someone with live Ads Manager access needs to check per-day delivery for
the Facebook-tagged campaigns on 09-06/09-07 specifically (paused ad,
exhausted daily budget, audience/learning-phase reset, or a real demand
dip are all consistent with what GA4 shows; only Ads Manager can
distinguish them).

**5. Two carried-forward watch items, both still closed, no new movement.**
Marion Court's "SparkDate: Real People, Real Drinks, Real Court" item is
still 13 carts → 5 purchased (unchanged from 09-08) — not re-opening.
The `<campaign-name>` UTM placeholder is still 2 rows / 69 sessions / 41 key
events window-wide, both source rows still dead (`googleads / paid` last
seen 20260803, `Facebook / paid` last seen 20260609) — still historical
residue, not re-listed as an open worklist item.

## TRAFFIC — standing section

| metric | recent 7d (09/01–09/07) | prior 7d (08/25–08/31) | change |
| --- | ---: | ---: | ---: |
| sessions | 648 | 1109 | -42% |
| engaged sessions | 251 | 382 | -34% |
| engagement rate | 38.7% | 34.4% | +4.3pp |
| users | 635 | 1040 | -39% |
| new users | 587 | 940 | -38% |
| purchasers | 2 | 6 | -67% |
| key events | 3 | 19 | -84% |
| transactions | 2 | 6 | -67% |
| own-site revenue | $54.98 | $169.94 | -68% |

Engagement rate rose even as sessions fell — the same pattern noted in the
last two reports — which continues to argue that whoever does show up is
not less engaged; the missing volume is missing people, concentrated (per
HEADLINE) in two specific days and one channel family. Own-site revenue is a
floor, not total (ANALYTICS_METHOD §7); ~55% of real ticket revenue runs
through Eventbrite/Meetup, invisible here.

### Channels (window-wide, 20260519–20260909)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3160 | 2869 | 27 | 0.9% | $179.94 |
| Direct | 827 | 503 | 25 | 3.0% | $169.94 |
| Unassigned | 667 | 233 | 67 | 10.0% | $345.37 |
| Email | 392 | 215 | 26 | 6.6% | $125.45 |
| Organic Social | 234 | 187 | 10 | 4.3% | $130.46 |
| Organic Search | 150 | 91 | 7 | 4.7% | $82.47 |
| Paid Other | 117 | 109 | 63 | 53.8% | $0.00 |
| Referral | 76 | 16 | 5 | 6.6% | $0.00 |
| Cross-network | 18 | 18 | 6 | 33.3% | $27.49 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Paid Social is 70% of tracked sessions and converts worst of any channel
with real volume (0.9%); Unassigned (mostly Eventbrite) is 5% of sessions
and 31% of revenue. **Paid Other's 53.8% conversion is $0 revenue** — its
63 "key events" are almost entirely `ads_conversion_About_Us_1`
(ANALYTICS_METHOD §8, a landing-page-view pseudo-event, not a real
conversion) — do not read that row as healthy. Cross-network's 33.3%/n=18
and AI Assistant's n=1 are both too small to mean anything (§12).

### Top 15 sources, device, geography

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1621 | 1492 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 827 | 503 | 25 | 3.0% | $169.94 |
| Instagram / paid_social | 636 | 566 | 6 | 0.9% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 247 | 242 | 1 | 0.4% | $0.00 |
| eventbrite / listing | 176 | 82 | 23 | 13.1% | $290.39 |
| ig / paid_social | 169 | 160 | 0 | 0.0% | $0.00 |
| lp / (not set) | 163 | 17 | 1 | 0.6% | $0.00 |
| google / organic | 137 | 82 | 6 | 4.4% | $82.47 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| (not set) | 69 | 59 | 1 | 1.4% | $0.00 |
| m.facebook.com / referral | 64 | 64 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |

Eventbrite is the standout again: 5% of Facebook's raw volume, 13.1%
conversion — ~15x Facebook's own rate. Facebook/Instagram variants dominate
raw volume but convert under 1% everywhere they appear; summing all
variants doesn't materially change that (see UTM §4a).

Mobile: 4196 sessions, 2.7% conv, $904.17 revenue. Desktop: 1413 sessions,
**8.7%** conv, $156.95 revenue — desktop converts ~3x better on a third the
volume, unchanged from every prior report. iOS Safari is the largest
OS/browser cell (2666 sessions, 39 key events). Philadelphia (921 sessions),
West Chester (424), Lancaster (263) lead cities.

**Suspect geography bucket, unchanged mechanism:** `(not set)`/continentId
`ZZ` is 118 sessions with an inverted **69.5%** key-event rate against 2.8%
property-wide excluding it (4.2% including it) — consistent with the
datacenter/bot traffic ANALYTICS_CONTEXT.md documents as an ~8–12%
denominator inflation on active-user counts. No IP/user-agent check was run
tonight to confirm; this is a caveat carried forward, not a verdict.

### New vs returning

| cohort | sessions | users | key events | revenue | revenue / user |
| --- | ---: | ---: | ---: | ---: | ---: |
| new | 4110 | 4111 | 166 | $651.76 | $0.16 |
| returning | 1267 | 236 | 69 | $409.36 | $1.73 |

Returning users are 5.7% of users but convert to revenue at ~11x the
per-user rate of new users — expected for a low-frequency event-ticket
product, not a new finding.

## EVENTS — standing section

34 distinct events fired window-wide (36 raw rows include a header/version
artifact per the script; 34 real events). **Only 3 are configured as GA4 key
events**: `ads_conversion_About_Us_1` (99 events, $0 — a landing-page view
on `/lp?utm_source=googleads`, not an About Us visit, per ANALYTICS_METHOD
§8), `generate_lead` (98, $97 nominal, $0 revenue), and `purchase` (39,
$1,061.12 — the only one that's real money).

Four events carry a dollar VALUE but count zero key events — funnel steps,
not conversions:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $17,159.17 |
| begin_checkout | 0 | $4,261.36 |
| add_to_cart | 0 | $2,578.98 |
| add_payment_info | 0 | $284.90 |

**What moved:** key events fell 19→3 and transactions 6→2 this closed
week. Breaking `keyEvents` out by day for the recent week shows this isn't
concentrated at the Sun/Mon tail the way sessions are — it's a whole-week
drought: 09-01=2, 09-02=0, 09-03=0, 09-04=0, 09-05=0, 09-06=0, 09-07=1. Five
of seven days recorded literally zero key events. At n=3 for the week this
is well inside ordinary noise for a property selling roughly one ticket a
day (§12) — noted, not escalated.

`add_payment_info` (10 events window-wide) continues to trail `purchase`
(39) — the same instrumentation gap noted in the last several reports (some
checkout path, e.g. saved card or Apple Pay, skips whatever fires
`add_payment_info`). n=10, not re-investigated tonight, carried forward.

`lp_visible` (277 events, 246 users) and `checkout_field_started` (44
events, 21 users) continue firing at volumes consistent with `/lp`'s
session share — both are 2026-09-03 paid-funnel-fix instrumentation
(ANALYTICS_METHOD §10), no anomaly.

### Which channels produce which key events (top of the table)

`ads_conversion_About_Us_1` is overwhelmingly `googleads` rows (51 + 16 +
16 + 11 = 94 of its 99 total) — all pseudo-conversions per §8, from a
channel that's been dark since 2026-07-24 (ANALYTICS_CONTEXT §3b, settled).
Real `generate_lead` and `purchase` credit is spread thin: `(direct)`
leads the lead count (19), `eventbrite / listing` leads real purchases (11,
$290.39), `(direct)` next (6, $169.94).

## UTM AND TAGGING GAPS — standing section, ranked by LIVE sessions affected

Tonight's summary script tags every fragmentation row LIVE (fired in the
last closed week, from 20260901), stale (last four closed weeks), or DEAD
(older). Ranking below uses **live sessions only** — a window-wide total
mixes years-old dead rows in with today's problem, which is how the
`<campaign-name>` bug stayed on this list for seven straight reports after
it went dead.

1. **`facebook` fragmented across 11 row variants, 6 still LIVE, 1983 live
   sessions** (2544 combined window-wide, $200.44, 30 key events combined):
   `Facebook / paid_social` (1621, LIVE, last seen 20260908), `fb /
   paid_social` (247, LIVE, 20260908), `m.facebook.com / referral` (64,
   LIVE, 20260905), `facebook.com / referral` (38, LIVE, 20260907),
   `Facebook / social` (9, LIVE, 20260908), `l.facebook.com / referral` (4,
   LIVE, 20260908). Dead/stale: `facebook / paid_social` lowercase (435,
   stale, last 20260811), `facebook / social` (61, stale, 20260818),
   `Facebook / paid` (26, DEAD, 20260609), `eventsmanager.facebook.com /
   referral` (20, stale, 20260812), `Facebook / organic` (19, stale,
   20260819). **Fix, same as last three reports:** normalize source/medium
   casing and the `fb`/`m.facebook.com` variants at the point they're
   written (ad destination URLs, internal referral handling). Not yet
   applied.
2. **`instagram` split across 2 rows, both LIVE, 805 sessions, 6 key
   events, $82.47**: `Instagram / paid_social` (636, LIVE, 20260908) vs
   `ig / paid_social` (169, LIVE, 20260908). One canonical casing needed.
3. **Own-site internal-link tagging, 94 sessions currently LIVE, 292 total
   window-wide.** `get_tickets_block / (not set)` (61, LIVE, 20260904,
   $27.49 attributed away from its real source) and `matches / (not set)`
   (33, LIVE, 20260905, $27.49). The rest (`lp / (not set)` 163, `matches /
   web` 26, and three smaller rows) are stale/dead. **Fix, unchanged from
   prior reports:** strip `utm_source`/`utm_medium` from the
   `get_tickets_block` element and internal `/matches` links — the single
   clearest live, one-call-site fix in this whole worklist.
4. **`email` fragmented across 6 rows, 2 still LIVE, 67 live sessions**
   (259 combined window-wide, $125.45, 26 key events combined): `email /
   newsletter` (48, LIVE, 20260905) and `email / returning` (19, LIVE,
   20260901). `email / email` (117, stale, last 20260826) is the largest
   row by volume but hasn't fired in two weeks; `email / nurture` (53,
   stale, last 20260831) just rolled off LIVE status tonight.
5. **A bare `(not set)` value in `traffic-by-source` itself — 69 sessions,
   1 key event, LIVE as of 20260909 (today).** This is distinct from the
   `<campaign-name>` placeholder below: it's a session with genuinely no
   source/medium recorded at all, not a broken template string, and it's
   live today rather than historical. Not previously broken out as its own
   worklist line; worth someone checking whether this correlates with a
   specific entry point (app webview handoff, a link missing all
   parameters) — not chased further tonight, flagged as new-to-the-list.
6. **`googleads` fragmented across 5 rows, 0 still live, 127 sessions, 94
   key events window-wide** (all `ads_conversion_About_Us_1`, i.e. not real
   conversions per §8) — every row DEAD, oldest since 20260803. Google Ads
   dark since 2026-07-24 (settled, ANALYTICS_CONTEXT §3b); pure historical
   residue.
7. **`<campaign-name>` literal placeholder — still resolved, not
   re-opened.** 69 sessions / 41 key events window-wide, unchanged from
   09-08; both source rows (`googleads / paid`, `Facebook / paid`) remain
   dead (last seen 20260803 and 20260609). No live ad carries this string.
8. **Obfuscated tag, 138 sessions combined, still residual.**
   `Ybadbfgfe | Zbfgfe Yvfg / email` decodes to `Lancaster | Master List /
   email` (129 sessions, 0 key events); plaintext twin `Lancaster | Master
   List / email` carries 9. Same LancasterOnline/Evvnt mechanism the 09-06
   report traced and partially fixed (#461); volume is flat vs. last two
   reports, read as residual historical sessions, not a new leak.
9. **`(data not available)` value, 16 sessions, 1 key event, LIVE as of
   20260908.** Small, but a genuine GA4 attribution-loss signature
   (commonly consent-mode or ITP-related session stitching failure), not
   chased further tonight given size.
10. **`utm_content` shared across campaigns** (violates `content/brand.json`
    uniqueness): `proof_rsa1` spans 7 campaigns; `Tellus+AfterDark:...` spans
    2; `mc_figlancaster` spans 2. Confined to paused/historical ads —
    tonight's Paid Ad UTMs refresh (unattended log) again shows every
    currently ACTIVE ad with a unique `utm_content`.

## ALSO IN THE REPORT

- **The Sun/Mon Facebook-family collapse is HEADLINE, not repeated here —
  see above.**
- **Loxleys campaigns, sale-date check repeated per the prompt's explicit
  warning.** "Sparkdate: The Loxley's Social" item sold its only 2 recorded
  units on **20260814 and 20260815** — unchanged from last report, still
  two weeks before any Loxleys campaign existed (~08-30 launch). Nothing in
  tonight's data credits a Loxleys campaign with a sale; any conversion
  those campaigns produce will show as a new item purchase, not against
  this history.
- **Webview conversion gap, restated at tonight's numbers.** In-app-browser
  sessions convert to purchase at **0.086%** (1 of 1160 session-starts)
  against **1.53%** for normal browsers (9 of 588) — a ~17.8x gap,
  essentially unchanged from the last several reports' 0.09%/1.6% range.
  Same mechanism as ANALYTICS_METHOD §6 (Meta's in-app browser degrading
  checkout). Paid Social is heavily webview-mixed, so this remains a large
  part of why Paid Social underperforms on conversion despite carrying 70%
  of volume.
- **Landing-page × source dead pairings** (≥20 sessions, 0 key events):
  `/lp` × `facebook / paid_social` (419), `/lp` × `ig / paid_social` (168),
  `/event` × the obfuscated Lancaster email tag (129), `/admin` × `lp /
  (not set)` (106, internal-tagging artifact, item 3 above), `/events` ×
  `eventbrite / listing` (49), `/founding` × `facebook / social` (45),
  `/lp` × `m.facebook.com / referral` (28), `/lp` × `tiktok / paid_social`
  (27), `/matches` × `eventbrite / listing` (25), `/lp` × `Facebook / paid`
  (21, dead). The script's cross-tab again surfaces `googleads / paid` as
  the only "converting" source on `/lp` (91.1%, 56 sessions) — **do not
  read that as real**: every one of those 51 "key events" is
  `ads_conversion_About_Us_1`, a page load, not a lead or sale. Once
  excluded, no source converts meaningfully better than another on `/lp`
  this pull; the dead Facebook/Instagram volume there is explained by the
  webview mechanism above, not a page-content problem — no `public/`
  change proposed.
- **Two pages take real traffic and return nothing** (≥15 sessions, 0 key
  events): `(not set)` landing page (40 sessions, 31 users — a missing
  page-path value, not a real route, not investigated further) and
  `/signup` (15 sessions, 11 users — already-settled: membership shelved,
  `sign_up` fires zero times all year per ANALYTICS_CONTEXT §1).
- **New organic listing sources this window** (sources seen for the first
  time in the last 7 closed days): `facebook_event / listing` (12
  sessions), `Facebook / social` (9, new tagging variant, not a listing),
  `Lancaster | Master List / email` (9, plaintext twin of item 8 above),
  `nextdoor_event / listing` (5), `facebook_group / listing` (4),
  `visitlancastercity / listing` (3), `lp /` (3, malformed internal tag,
  trailing-slash typo), `figlancaster / listing` (2), `Flyers / referral`
  (1, new — possibly a print flyer QR code; too small to chase), `matches /`
  (1, same malformed-tag pattern as `lp /`). The `/listing` rows read as new
  free event-listing placements going live (consistent with the
  `syndicate-events` skill's purpose), not tagging defects.
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: $0.00 gap. Revenue-by-item vs transaction
  total: **−$92.52**, the already-documented 2-for-1 item-count effect
  (#205) — expected, not a new discrepancy.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions; 5 ids appear more than once (max 8 on one id), 5 span more
  than one date. Open since PR #200; not investigated further tonight.
- **Checkout errors**: `card_incomplete` 18 events / 8 users window-wide,
  `card_declined` 1, `other` 1. The script's own note flags that
  `card_incomplete` "was 8 users lifetime historically" — tonight's 8 users
  matches that figure exactly, so this reads as flat, not growing; no
  baseline comparison was available from the last report's text to confirm
  trend direction, carried forward as a number to watch rather than an
  active problem.
- **Founders Mixer**: 8 purchases, 0 recorded `view_item`, 0 `add_to_cart`
  — all June sales (0603–0624). Old enough to read as a one-time sales
  mechanism (comped, admin, or a since-retired event page), not a live gap.
- **Google Ads, confirmed still dark.** $0 spend on the last 7 closed days
  (20260901–20260907); lifetime total unchanged at $37.91 + $2.56
  (`Campaign #1`, a near-inactive Performance Max campaign with $2.56
  lifetime spend and a 10.73 ROAS on n=4 clicks — far too small to mean
  anything, §12). `Website traffic-Search-1` still shows $35.35 lifetime
  spend against **zero attributed sessions** — already known, not new.

## NEEDS TAYLOR INPUT (1)

1. **Check Ads Manager for what happened to Facebook-tagged campaign
   delivery on 09-06 (Sun) and 09-07 (Mon).** GA4 shows `Facebook /
   paid_social` sessions collapsing from 164 combined (prior Sun+Mon) to 11
   (recent Sun+Mon), with `Instagram / paid_social` going to zero both
   days, while the lowercase `fb / paid_social` tag barely moved — pointing
   at one specific campaign or ad set rather than a platform-wide outage.
   Windsor.ai's Meta connector has no account attached to this session, so
   there's no daily-spend check available in unattended mode; the only
   on-disk Meta data is 7-day rolling totals ($135–158/week across five
   consecutive pulls, no visible drop) which can't rule out a two-day dip
   inside the window. **What to check:** whether any of the 7 currently-
   serving ads (Marion Court Retargeting, Loxley's Retargeting, Marion
   Court/Loxleys Traffic + Sales — per tonight's Paid Ad UTMs refresh) was
   paused, hit a daily budget cap, or reset into a learning phase on those
   two dates specifically. **Re-check trigger:** if the next 1-2 nightly
   pulls show sessions on this channel family recovering to the ~150-220
   range seen 08-23 through 08-31, this resolves itself and doesn't need an
   answer — the ask is only live while the drop is unexplained.

## Zero-risk fixes, described and not applied

1. **Internal-link UTM stripping** — remove `utm_source`/`utm_medium` from
   the `get_tickets_block` and internal `/matches` link elements (UTM item
   3): 94 sessions of live, ongoing self-misattribution, single clear
   call-site fix. Described in the last three reports; not yet applied.
2. **`facebook`/`instagram` source casing normalization** at the
   destination-URL / referral-tagging level (UTM items 1–2) — highest
   session volume in the worklist (1983 + 805 live sessions), but the fix
   touches however these row variants get produced (ad UTMs, referral
   handling) rather than one call site, so it's flagged, not fully scoped.

## Caveats

- ANALYTICS_METHOD §1: 20260908 and 20260909 excluded from every daily
  figure as not-yet-final; 20260906 and 20260907 (central to the HEADLINE)
  are confirmed inside the script's own closed range, not tail artifacts.
- ANALYTICS_METHOD §8 governs every reading of `ads_conversion_About_Us_1`
  in this report — never treated as a real conversion.
- ANALYTICS_METHOD §12: the recent-week transaction count (n=2), key-event
  count (n=3), `add_payment_info` (n=10), Campaign #1's 10.73 ROAS (n=4
  clicks), and the transaction_id-reuse figures are all small-sample; read
  as direction, not rate.
- ANALYTICS_METHOD §7: all revenue figures above are own-site GA4 only, not
  business revenue.
- ANALYTICS_METHOD §9: no Meta week-over-week comparison drawn — the 09-08
  pull (20260902-20260908) and tonight's implied comparison would overlap
  by 6 of 7 days. The HEADLINE's Meta discussion uses five separate rolling
  totals only to check for a gross spend collapse, explicitly noted as
  unable to confirm or rule out a two-day dip within a window.
- ANALYTICS_METHOD §10: no comparison spans the 08-21, 08-25, 08-28, or
  09-03 series-break dates.

**What I did not verify:** did not log into Meta Ads Manager tonight — the
HEADLINE's Sun/Mon Facebook-collapse finding is built entirely from GA4
session-level tagging, not from Meta's own delivery data; the Windsor.ai
Meta connector returned "no account found" for this session when queried
for daily spend, so that cross-check could not be attempted at all (not
just skipped). Did not open any `public/` page source — no dead-traffic
pattern tonight needed a new page-level hypothesis beyond the
already-established webview mechanism, and the two zero-key-event pages
(`(not set)`, `/signup`) are either not a real route or an already-settled
shelved feature. Did not chase the new bare `(not set)` traffic-by-source
row (UTM item 5, 69 sessions) beyond naming it. Did not independently
re-verify the LancasterOnline/Evvnt obfuscated-tag fix beyond observing
this pull's volume is flat versus the last two reports. Did not chase
`transaction_id` reuse, the Founders Mixer no-view-purchases pattern, or
the `card_incomplete` growth question beyond noting current counts. Did not
check IP or user-agent evidence for the `(not set)`/`ZZ` datacenter-traffic
bucket.

## Coverage

**46 of 46** tables represented in the standing summary (script's own
ledger). No table was skimmed-and-skipped.

| table | rows | in standing summary |
| --- | ---: | --- |
| attribution-credit | 53 | yes |
| audiences | 2 | yes |
| by-day-hour | 168 | yes |
| by-device | 3 | yes |
| channel-groups | 11 | yes |
| checkout-error-reasons | 2 | yes |
| checkout-errors | 4 | yes |
| cities | 1017 | yes |
| cohort-retention | 18 | yes |
| daily-by-source | 780 | yes |
| daily-trend | 103 | yes |
| events | 36 | yes |
| events-by-source | 733 | yes |
| first-user-tagging | 136 | yes |
| funnel-by-channel | 36 | yes |
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
| key-events-by-source | 130 | yes |
| key-events-daily | 103 | yes |
| landing-by-source | 260 | yes |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 30 | yes |
| page-views | 72 | yes |
| paid-cost-vs-sessions | 128 | yes |
| promotions | 8 | yes |
| revenue-by-item | 6 | yes |
| revenue-by-source | 14 | yes |
| revenue-daily | 66 | yes |
| session-quality-daily | 103 | yes |
| traffic-by-source | 71 | yes |
| transactions | 32 | yes |
| users-daily | 103 | yes |
| utm-ad-detail | 315 | yes |
| utm-content | 99 | yes |
| webview-by-event | 80 | yes |
| weekly-trend | 16 | yes |

Cross-referenced additionally against five consecutive nightly Meta pulls
(`meta-insights-2026-09-04.csv` through `-09-08.csv`) to build the rolling-
spend check in the HEADLINE, and attempted (unsuccessfully — no account
connected) a Windsor.ai `facebook` connector query for daily-granularity
spend on 2026-08-30 through 2026-09-08.
