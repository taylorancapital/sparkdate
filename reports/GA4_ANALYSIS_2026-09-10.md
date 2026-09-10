# GA4 + Meta nightly review — 2026-09-10

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two
dates in every daily series (20260908, 20260909) are dropped as not-yet-final;
all "closed week" figures below use two disjoint 7-day buckets, never a
rolling window. Data provenance: GA4 window `20260519-20260910`, pulled
**2026-09-10 06:00 UTC** (property 536859339, dates in America/New_York);
Meta campaign insights for **2026-09-03 to 2026-09-09**, pulled 2026-09-10
02:00 local. `ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26"; its
file mtime is **2026-08-28 18:25**, i.e. it was edited after that stamp
without the stamp being bumped — the same one-sentence note carried in the
last three nights' reports, unchanged since (mtime hasn't moved, not
re-escalating).

Unattended run: `scripts/ga4-nightly-summary.js` executed cleanly against all
46 tables; no fallback to hand-parsing was needed.

## HEADLINE — the closed-week numbers are identical to last night's report by construction, but the raw (non-final) tail shows the Sun/Mon collapse already reversing

**1. Why tonight's "recent 7d" table is byte-for-byte identical to last
night's.** The pull runs at 02:00 America/New_York, when GA4 has essentially
no data yet for the current calendar day — `ga4-api-daily-trend-2026-09-10.csv`
has no row at all for 20260910. So the newest date *in the series* is
20260909, and dropping the last two (20260908, 20260909) per §1 leaves the
same closed window as last night's pull (which also topped out at 20260909):
recent = **20260901–20260907**, prior = **20260825–20260831**. This is a
structural consequence of the pull time relative to GA4 finalization, not a
data problem — flagging it so nobody reads "no change" as "nothing
happened last night" when in fact the closed window simply couldn't advance.
Sessions/users/revenue/key-events/transactions for both buckets are
identical to `GA4_ANALYSIS_2026-09-09.md`; see TRAFFIC below for the table,
carried forward rather than re-derived.

**2. What actually moved: the raw, non-final tail (20260908, 20260909)
shows a sharp rebound from the Sun/Mon collapse the 09-09 report flagged.**
Sessions by day: 09-06 (Sun) = 39, 09-07 (Mon) = 42, **09-08 (Tue) = 97,
09-09 (Wed) = 90**. These two days are excluded from every closed-week
figure and are subject to the §1(a)/(b) tail artifact themselves — 09-08's
engagement rate reads a plausible 70.1% while 09-09's reads 1.1%, exactly
the pattern §1(a) describes (second-to-last day sometimes fine, last day
always near-zero-looking) — so treat the 97/90 as directional, not final,
counts. Cross-checked against `ga4-api-weekly-trend-2026-09-10.csv`'s
ISO-week table: week 202637 (Mon 09-07 onward, 3 days captured so far:
09-07+09-08+09-09) already totals **229 sessions**, matching 42+97+90=229
exactly. **Key events over the same three days: 1, 4, 1 = 6 — but
transactions: 0, 0, 0.** So traffic volume has recovered from the Sun/Mon
low; revenue has not yet, on a 3-day base too small to read as anything
(§12).

**3. This does not resolve last night's open ask, but it changes its
urgency.** The 09-09 report routed one item to Taylor: check Ads Manager for
what happened to Facebook/Instagram-tagged campaign delivery on 09-06/09-07
specifically, since the Windsor.ai Meta connector has no Facebook account
attached in this unattended session (`get_connectors` tonight returns only a
`tiktok` account — confirmed again, unchanged from last night) and the only
on-disk Meta data is a 7-day rolling pull that can't isolate a 2-day dip
(§9). Tonight's GA4-only evidence is consistent with either explanation the
09-09 report offered (paused ad, budget cap, learning-phase reset, or a real
2-day demand dip) — a rebound by Tuesday is compatible with any of them
self-correcting, and does not distinguish "Taylor un-paused something" from
"the platform's own delivery pacing recovered on its own." **Carried to
NEEDS TAYLOR INPUT below as a 2nd ask, downgraded in urgency** since the
volume already recovered without any input needed from Taylor tonight — the
open question is only the mechanism, for if it recurs.

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

Identical to `GA4_ANALYSIS_2026-09-09.md` — see HEADLINE §1 for why. Reading
this table alone (without the HEADLINE's non-final tail) would wrongly imply
a second flat night; it is one night's stale window, not a second decline.
Own-site revenue is a floor, not total revenue (ANALYTICS_METHOD §7); ~55%
of real ticket revenue runs through Eventbrite/Meetup, invisible here.

### Channels (window-wide, 20260519–20260910)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3189 | 2897 | 29 | 0.9% | $179.94 |
| Direct | 871 | 512 | 25 | 2.9% | $169.94 |
| Unassigned | 672 | 229 | 66 | 9.8% | $345.37 |
| Email | 394 | 217 | 26 | 6.6% | $125.45 |
| Organic Social | 237 | 188 | 10 | 4.2% | $130.46 |
| Organic Search | 152 | 92 | 7 | 4.6% | $82.47 |
| Paid Other | 119 | 111 | 63 | 52.9% | $0.00 |
| Referral | 77 | 16 | 5 | 6.5% | $0.00 |
| Cross-network | 17 | 17 | 6 | 35.3% | $27.49 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Paid Social is 71% of window-wide sessions and converts worst of any channel
with real volume (0.9%); Unassigned (mostly Eventbrite/listing referrals) is
5% of sessions and 31% of revenue. **Paid Other's 52.9% conversion is $0
revenue** — its 63 "key events" are almost entirely `ads_conversion_About_Us_1`
(ANALYTICS_METHOD §8, a landing-page-view pseudo-event, not a real
conversion); do not read that row as healthy. Cross-network's 35.3%/n=17 is
too small a base to mean anything (§12).

### Top 15 sources, device, geography

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1625 | 1496 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 871 | 512 | 25 | 2.9% | $169.94 |
| Instagram / paid_social | 636 | 566 | 6 | 0.9% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 263 | 257 | 2 | 0.8% | $0.00 |
| ig / paid_social | 178 | 169 | 1 | 0.6% | $0.00 |
| eventbrite / listing | 176 | 82 | 23 | 13.1% | $290.39 |
| lp / (not set) | 167 | 21 | 1 | 0.6% | $0.00 |
| google / organic | 139 | 83 | 6 | 4.3% | $82.47 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| (not set) | 64 | 47 | 0 | 0.0% | $0.00 |
| m.facebook.com / referral | 64 | 64 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |

Eventbrite is the standout again: 5% of Facebook's raw volume, 13.1%
conversion — roughly 15x Facebook's own rate. Facebook/Instagram variants
dominate raw volume but convert under 1% everywhere they appear (see UTM §4a
— summing all variants doesn't materially change the rate).

Mobile: 4292 sessions, 2.7% conv, $904.17 revenue. Desktop: 1421 sessions,
**8.7%** conv, $156.95 revenue — desktop converts ~3x better on a third the
volume, unchanged from every prior report. iOS Safari is the largest
OS/browser cell (2702 sessions, 39 key events). Philadelphia (927 sessions),
West Chester (424), Lancaster (270) lead cities.

**Suspect geography bucket, unchanged mechanism:** `(not set)`/continentId
`ZZ` is 118 sessions with an inverted **69.5%** key-event rate against 2.8%
property-wide excluding it (4.2% including it) — consistent with the
datacenter/bot traffic ANALYTICS_CONTEXT.md documents as an ~8–12%
denominator inflation on active-user counts. No IP/user-agent check was run
tonight to confirm; carried forward as a caveat, not a verdict.

### New vs returning

| cohort | sessions | users | key events | revenue | revenue / user |
| --- | ---: | ---: | ---: | ---: | ---: |
| new | 4195 | 4153 | 168 | $651.76 | $0.16 |
| returning | 1285 | 243 | 69 | $409.36 | $1.68 |

Returning users are 5.5% of users but convert to revenue at ~10x the
per-user rate of new users — expected for a low-frequency event-ticket
product, not a new finding.

## EVENTS — standing section

34 distinct events fired window-wide (36 raw rows include a header/version
artifact per the script). **Only 3 are configured as GA4 key events**:
`ads_conversion_About_Us_1` (99 events, $0 — a landing-page view on
`/lp?utm_source=googleads`, not an About Us visit, per ANALYTICS_METHOD §8),
`generate_lead` (99, $98 nominal value, $0 revenue), and `purchase` (39,
$1,061.12 — the only one that's real money).

Four events carry a dollar VALUE but count zero key events — funnel steps,
not conversions:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $17,279.13 |
| begin_checkout | 0 | $4,351.33 |
| add_to_cart | 0 | $2,578.98 |
| add_payment_info | 0 | $284.90 |

**What moved:** window-wide `generate_lead` ticked 98→99 and view_item value
rose $17,159→$17,279 — both consistent with the 09-08/09-09 rebound in raw
session volume (HEADLINE §2), not a closed-week change. Key events for the
closed week itself are unchanged at 3 (see TRAFFIC).

`add_payment_info` (10 events window-wide) continues to trail `purchase`
(39) — the same instrumentation gap noted in the last several reports (some
checkout path, e.g. saved card or Apple Pay, skips whatever fires
`add_payment_info`). n=10, not re-investigated tonight, carried forward.

`lp_visible` (311 events, 275 users) and `checkout_field_started` (44
events, 21 users) continue firing at volumes consistent with `/lp`'s session
share — both are 2026-09-03 paid-funnel-fix instrumentation (ANALYTICS_METHOD
§10), no anomaly.

### Which channels produce which key events (top of the table)

`ads_conversion_About_Us_1` is overwhelmingly `googleads` rows (51+16+16+11
= 94 of its 99 total) — all pseudo-conversions per §8, from a channel dark
since 2026-07-24 (ANALYTICS_CONTEXT §3b, settled). Real `generate_lead` and
`purchase` credit is spread thin: `(direct)` leads generate_lead (19),
`eventbrite / listing` leads real purchase revenue (11 purchases, $290.39),
`(direct)` next (6, $169.94).

## UTM AND TAGGING GAPS — standing section, ranked by LIVE sessions affected

**LIVE** = fired a session in the last closed week (from 20260901); **stale**
= last four closed weeks; **DEAD** = older. Window-wide totals below include
the non-final 20260908/20260909 tail (fragmentation/defect counts are not
closed-week figures), so small upticks vs last night's report reflect that
tail, not new leakage.

1. **`facebook` fragmented across 11 row variants, 6 LIVE, ~2567 combined
   sessions, 31 key events, $200.44.** Live: `Facebook / paid_social`
   (1625, last seen 20260909), `fb / paid_social` (263, 20260909),
   `m.facebook.com / referral` (64, 20260905), `facebook.com / referral`
   (38, 20260907), `Facebook / social` (11, 20260909), `l.facebook.com /
   referral` (5, 20260908). Dead/stale: `facebook / paid_social` lowercase
   (435, stale, 20260811), `facebook / social` lowercase (61, stale,
   20260818), `Facebook / paid` (26, DEAD, 20260609), `eventsmanager.
   facebook.com / referral` (20, stale, 20260812), `Facebook / organic`
   (19, stale, 20260819). **Fix, unchanged across at least four reports:**
   normalize source/medium casing and the `fb`/`m.facebook.com` variants at
   the point they're written (ad destination URLs, internal referral
   handling). Not yet applied.
2. **`instagram` split across 2 rows, both LIVE, 814 sessions, 7 key
   events, $82.47**: `Instagram / paid_social` (636, 20260908) vs `ig /
   paid_social` (178, 20260908). One canonical casing needed.
3. **Own-site internal-link tagging, 94 sessions currently LIVE, 298 total
   window-wide.** `get_tickets_block / (not set)` (61, LIVE 20260904,
   $27.49 attributed away from its real source) and `matches / (not set)`
   (34, LIVE 20260908, $27.49). The rest (`lp / (not set)` 167, `matches /
   web` 26, and three smaller rows) are stale/dead. **Fix, unchanged:**
   strip `utm_source`/`utm_medium` from the `get_tickets_block` element and
   internal `/matches` links — still the single clearest live,
   one-call-site fix in the worklist.
4. **`email` fragmented across 6 rows, 2 LIVE, 69 live sessions** (261
   combined window-wide, $125.45, 26 key events combined): `email /
   newsletter` (48, LIVE 20260905) and `email / returning` (21, LIVE
   20260909). `email / email` (117, stale, last 20260826) is the largest
   row by volume but hasn't fired in two weeks; `email / nurture` (53,
   stale, last 20260831).
5. **A bare `(not set)` value in `traffic-by-source` itself — 64 sessions,
   0 key events, LIVE as of 20260909.** Distinct from the `<campaign-name>`
   placeholder below — a session with genuinely no source/medium recorded,
   not a broken template string. Flagged new-to-the-list on 09-09; unchanged
   tonight (64 vs 69 sessions, within tail-day noise). Not chased further.
6. **`googleads` fragmented across 5 rows, 0 still live, 127 sessions, 94
   key events window-wide** (all `ads_conversion_About_Us_1`, not real
   conversions per §8) — every row DEAD, oldest since 20260803. Google Ads
   dark since 2026-07-24 (settled, ANALYTICS_CONTEXT §3b); pure historical
   residue.
7. **`<campaign-name>` literal placeholder — still resolved, not
   re-opened.** 2 rows / ~69 sessions / 41 key events window-wide, unchanged
   from the last two reports; both source rows (`googleads / paid`,
   `Facebook / paid`) remain dead (last seen 20260803 and 20260609). No live
   ad carries this string.
8. **Obfuscated tag, 129 sessions on the ciphertext row, plaintext twin at
   9 (window-wide, so real total ≈138), still residual.** `Ybadbfgfe |
   Zbfgfe Yvfg / email` decodes (a–f shift +1, g–z ROT13) to `Lancaster |
   Master List / email`. Same LancasterOnline/Evvnt mechanism the 09-06
   report traced and partially fixed (#461); volume flat vs. last two
   reports, read as residual historical sessions, not a new leak.
9. **`(data not available)` value, 15 sessions, 1 key event, LIVE as of
   20260909.** Small, a genuine GA4 attribution-loss signature (commonly
   consent-mode or ITP-related session stitching failure); flat vs last
   night's 16, not chased further given size.
10. **`utm_content` shared across campaigns** (violates `content/brand.json`
    uniqueness): `proof_rsa1` spans 7 campaigns; `Tellus+AfterDark:...`
    spans 2; `mc_figlancaster` spans 2. Confined to paused/historical ads —
    tonight's Paid Ad UTMs refresh (unattended log, 7 ACTIVE ads) again
    shows every currently active ad with a unique `utm_content`
    (`lx_rt_patio`, `lx_convert_female_showup`, `lx_convert_male_noplan`,
    `mc_rt_scorecards`, `mc_rt_quang`, `mc_rt_still_thinking`,
    `mc_close_female_bringafriend`).

## ALSO IN THE REPORT

- **Facebook/Instagram Sun/Mon collapse and its rebound — see HEADLINE, not
  repeated here.**
- **Loxleys campaigns, sale-date check repeated per the prompt's explicit
  warning about crediting a campaign before it existed.** "Sparkdate: The
  Loxley's Social" item sold its only 2 recorded units on **20260814 and
  20260815** — unchanged, still two weeks before any Loxleys campaign
  existed (~08-30 launch, per ANALYTICS_CONTEXT's spend table and the
  absence of "Loxleys" rows in `meta-insights-*.csv` before 08-30). Nothing
  in tonight's Meta pull (Marion Court ×3, Loxleys ×3, $136.22 total spend
  over 2026-09-03–09-09) credits a Loxleys campaign with a sale; per
  ANALYTICS_METHOD §9, this week's Meta pull overlaps 6 of 7 days with the
  09-09 report's pull (2026-09-02–09-08), so no week-over-week Meta spend
  comparison is drawn.
- **Webview conversion gap, restated at tonight's numbers.** Purchase
  funnel by webview segment (window-wide): webview session_starts 1180 →
  purchase 1 (0.08%); normal-browser session_starts 610 → purchase 9
  (1.48%) — an ~18x gap, essentially unchanged from the last several
  reports' 0.09%/1.5–1.6% range. Same mechanism as ANALYTICS_METHOD §6
  (Meta's in-app browser degrading checkout). Paid Social is heavily
  webview-mixed, so this remains a large part of why Paid Social
  underperforms on conversion despite carrying 71% of window-wide volume.
- **Landing-page × source dead pairings** (≥20 sessions, 0 key events):
  `/lp` × `facebook / paid_social` (419), `/event` × the obfuscated
  Lancaster email tag (129), `/admin` × `lp / (not set)` (106, internal-
  tagging artifact, item 3 above), `/events` × `eventbrite / listing` (49),
  `/founding` × `facebook / social` (45), `/lp` × `m.facebook.com /
  referral` (28), `/lp` × `tiktok / paid_social` (27), `/matches` ×
  `eventbrite / listing` (25), `/lp` × `Facebook / paid` (21, dead). The
  script's cross-tab again surfaces `googleads / paid` as the only
  "converting" source on `/lp` (91.1% conv, 56 sessions) — **do not read
  that as real**: every one of those 51 "key events" is
  `ads_conversion_About_Us_1`, a page load, not a lead or sale. Once
  excluded, no source converts meaningfully better than another on `/lp`
  this pull; the dead Facebook/Instagram volume there is explained by the
  webview mechanism above, not a page-content problem. No `public/` page
  was opened tonight — no newly-underperforming page surfaced beyond the
  three already-settled zero-key-event pages below, so there was no fresh
  hypothesis to form.
- **Three pages take real traffic and return nothing** (≥15 sessions, 0 key
  events): blank landing-page value (48 sessions, 39 users), `(not set)`
  (42, 33 — a missing page-path value, not a real route, not investigated
  further), and `/signup` (15, 11 — already-settled: membership shelved,
  `sign_up` fires zero times all year per ANALYTICS_CONTEXT §1, expected
  dead weight on a shelved feature).
- **New organic listing sources this window** (from "sources seen for the
  first time in the last 7 closed days," which the script computes against
  the raw series tail rather than strictly closed days — several `first
  seen` dates below fall on 20260908/20260909): `Ybadbfgfe | Zbfgfe Yvfg /
  email` (20260903, 129 sessions since — the obfuscated tag, item 8 above,
  not new tonight), `facebook_event / listing` (20260901, 12), `Facebook /
  social` (20260902, 11), `Lancaster | Master List / email` (20260903, 9,
  plaintext twin of item 8), `nextdoor_event / listing` (20260902, 5), `lp
  /` (20260909, 5 — malformed internal tag, trailing-slash typo, up from 3
  on 09-09), `visitlancastercity / listing` (20260903, 4),
  `facebook_group / listing` (20260904, 4), `figlancaster / listing`
  (20260902, 2), `Flyers / referral` (20260908, 1 — unchanged, possibly a
  print flyer QR code, too small to chase). The `/listing` rows continue to
  read as new free event-listing placements going live (consistent with the
  `syndicate-events` skill's purpose), not tagging defects.
- **Marion Court checkout-stage watch item — still resolved, not
  re-opening.** "SparkDate: Real People, Real Drinks, Real Court" item is
  still 13 carts → 5 purchased, $99.95, unchanged from the last two
  reports.
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: -$0.00 gap. Revenue-by-item vs transaction
  total: **-$92.52**, the already-documented 2-for-1 item-count effect
  (#205) — expected, not a new discrepancy.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions; 5 ids appear more than once (max 8 on one id), 5 span more
  than one date. Open since PR #200; not investigated further tonight,
  carried forward unchanged for the third consecutive report.
- **Checkout errors**: `card_incomplete` 18 events / 8 users window-wide
  (flat vs the last two reports and vs the "8 users lifetime historically"
  baseline the script itself flags — not growing), plus 8 events/7 users
  with no reason category set, `card_declined` 1, `other` 1.
- **Founders Mixer**: 8 purchases, 0 recorded `view_item`, 0 `add_to_cart`
  — all June sales (0603–0624). Old enough to read as a one-time sales
  mechanism (comped, admin, or a since-retired event page), not a live gap.
- **Google Ads, confirmed still dark.** Spend on the last 7 closed days
  (20260901–20260907): **$0.00**. Lifetime total unchanged: `Website
  traffic-Search-1` $35.35 (0 attributed sessions, already known) + `Campaign
  #1` $2.56 (Performance Max, 4 clicks, 10.73 nominal ROAS — far too small
  to mean anything, §12).

## NEEDS TAYLOR INPUT (1)

1. **(2nd ask, downgraded urgency) Check Ads Manager for what caused the
   Facebook/Instagram-tagged session delivery drop on 09-06 (Sun) and 09-07
   (Mon), if it's worth knowing for next time.** The 09-09 report flagged
   an 79–82% two-day collapse concentrated in the `Facebook`/`Instagram`
   paid_social family; tonight's data shows overall session volume already
   recovered by Tue/Wed (39, 42 → 97, 90 sessions on the non-final tail,
   cross-checked against the ISO-week table) without any GA4-visible
   change in tagging or channel mix. **This lowers the urgency** — whatever
   happened was short and self-corrected, so there is no live problem to
   fix tonight. It is still worth two minutes in Ads Manager only if Taylor
   wants to know whether it was a deliberate pause/budget cap (in which
   case it may recur) or a platform-side wobble (in which case it likely
   won't) — Windsor.ai's Meta connector still has no Facebook account
   attached in this unattended session (`get_connectors` returns only
   `tiktok`), so this check cannot be done without Taylor's own Ads Manager
   access. **Re-check trigger:** if a similar single-channel, single-day (or
   two-day) collapse recurs, or if this connector question is resolved
   (Facebook account attached to Windsor.ai), at which point this becomes
   answerable without Taylor.

## Zero-risk fixes, described and not applied

1. **Internal-link UTM stripping** — remove `utm_source`/`utm_medium` from
   the `get_tickets_block` and internal `/matches` link elements (UTM item
   3): 94 sessions of live, ongoing self-misattribution, single clear
   call-site fix, the only currently-live item in the UTM worklist with an
   obvious one-line change. Described in the last three reports as well;
   not yet applied.
2. **`facebook`/`instagram` source casing normalization** at the
   destination-URL / referral-tagging level (UTM items 1–2) — highest
   session volume in the worklist (~2567 + 814 sessions), but the fix
   touches however these six-plus row variants get produced (ad UTMs,
   referral handling) rather than one call site, so it's flagged, not
   fully scoped, here.

## Caveats

- ANALYTICS_METHOD §1: 20260908 and 20260909 excluded from every closed-week
  figure as not-yet-final; both are used only directionally in HEADLINE §2,
  with the tail-lag pattern (09-08 engagement 70.1%, 09-09 engagement 1.1%)
  called out explicitly as expected, not a real behavioral difference.
- ANALYTICS_METHOD §8 governs every reading of `ads_conversion_About_Us_1`
  in this report — never treated as a real conversion.
- ANALYTICS_METHOD §12: `add_payment_info` (n=10), the recent-week
  transaction count (n=2), the 3-day post-collapse key-events/transactions
  figures, and the transaction_id-reuse figures are all small-sample; read
  as direction, not rate.
- ANALYTICS_METHOD §7: all revenue figures above are own-site GA4 only, not
  business revenue.
- ANALYTICS_METHOD §9: no Meta week-over-week comparison drawn — tonight's
  pull (20260903-20260909) overlaps 6 of 7 days with the 09-09 report's
  pull (20260902-20260908).
- ANALYTICS_METHOD §10: no comparison spans the 08-21, 08-25, 08-28, or
  09-03 series-break dates.

**What I did not verify:** did not log into Meta Ads Manager or Google Ads
Manager tonight — the Windsor.ai Meta/Facebook connector has no account
attached in this unattended session (confirmed again via `get_connectors`),
so the 09-06/09-07 session-collapse mechanism remains unconfirmed; see
NEEDS TAYLOR INPUT. Did not open any `public/` page source — no new
underperforming page surfaced beyond the three already-settled zero-key-event
pages, so there was no fresh hypothesis requiring one. Did not independently
re-verify the LancasterOnline/Evvnt obfuscated-tag fix beyond observing this
pull's volume is flat versus the last two reports' account of it. Did not
chase `transaction_id` reuse or the Founders Mixer no-view-purchases pattern
beyond noting them, both carried forward unchanged for a third report. Did
not check the IP or user-agent evidence for the `(not set)`/`ZZ`
datacenter-traffic bucket.

## Coverage

**46 of 46** tables represented in the standing summary (script's own
ledger, reproduced below). No table was skimmed-and-skipped.

| table | rows | in standing summary |
| --- | ---: | --- |
| attribution-credit | 53 | yes |
| audiences | 2 | yes |
| by-day-hour | 168 | yes |
| by-device | 3 | yes |
| channel-groups | 11 | yes |
| checkout-error-reasons | 2 | yes |
| checkout-errors | 4 | yes |
| cities | 1026 | yes |
| cohort-retention | 18 | yes |
| daily-by-source | 788 | yes |
| daily-trend | 103 | yes |
| events | 36 | yes |
| events-by-source | 741 | yes |
| first-user-tagging | 136 | yes |
| funnel-by-channel | 37 | yes |
| funnel-by-device | 13 | yes |
| funnel-checkout-by-landing-page | 34 | yes |
| funnel-waitlist-sequence | 2 | yes |
| funnel-webview-vs-normal | 8 | yes |
| geo-country-language | 64 | yes |
| google-ads-by-network | 4 | yes |
| google-ads-cost | 2 | yes |
| google-ads-cost-daily | 24 | yes |
| google-ads-creatives | 2 | yes |
| items-daily | 30 | yes |
| key-events | 7 | yes |
| key-events-by-source | 130 | yes |
| key-events-daily | 103 | yes |
| landing-by-source | 259 | yes |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 29 | yes |
| page-views | 72 | yes |
| paid-cost-vs-sessions | 127 | yes |
| promotions | 8 | yes |
| revenue-by-item | 6 | yes |
| revenue-by-source | 14 | yes |
| revenue-daily | 67 | yes |
| session-quality-daily | 103 | yes |
| traffic-by-source | 70 | yes |
| transactions | 32 | yes |
| users-daily | 103 | yes |
| utm-ad-detail | 317 | yes |
| utm-content | 100 | yes |
| webview-by-event | 80 | yes |
| weekly-trend | 16 | yes |

Cross-referenced additionally against tonight's Meta pull
(`meta-insights-2026-09-09.csv`, 6 campaigns, 2026-09-03–09-09) and the
`sparkdate-nightly-claude-code-prompts.md` run log's top entries for
continuity with the last two nights' findings. Confirmed via
`mcp__claude_ai_Windsor_ai__get_connectors` that no Facebook/Meta account is
attached to this session's Windsor.ai connector (only `tiktok`), matching
the 09-09 report's finding — this is what keeps the NEEDS TAYLOR INPUT item
open.
