# GA4 + Meta nightly review — 2026-09-12

This run made ZERO code changes. Per ANALYTICS_METHOD.md §1, the last two
dates in every daily series (20260910, 20260911) are dropped as not-yet-final;
every "closed week" figure below uses two disjoint 7-day buckets, never a
rolling window. Data provenance: GA4 window `20260519-20260912`, pulled
**2026-09-12 06:00 UTC** (property 536859339, dates in America/New_York);
Meta campaign insights for **2026-09-05 to 2026-09-11**, pulled 2026-09-12
02:00 local; Eventbrite Ads spend for the trailing 30 days, pulled the same
run. `ANALYTICS_CONTEXT.md` states "Last updated: 2026-08-26"; its file mtime
is **2026-08-28 18:25**, later than the stamp — it was edited without the
stamp being bumped. This has been true and unchanged for several nights
(the mtime itself hasn't moved); not re-escalating, per this prompt's own
instruction not to treat "newer than tonight's report" as evidence, since
that condition is permanently true by construction.

`scripts/ga4-nightly-summary.js` ran cleanly against all 46 GA4 tables; no
fallback to hand-parsing was needed. This report also reads the Eventbrite
Ads CSV and tonight's Paid Ad UTM refresh log directly, since neither is part
of the 46-table GA4 pull the summary script covers.

## HEADLINE — the GA4 zero-purchase gap from last night's report is still here, and it is a known measurement hole, not a new outage — but the fix that would stop the false alarm has not been deployed on a closed day yet

**Do not read this as "sales stopped."** Last night's report opened with
exactly that headline, then a same-day CORRECTION withdrew it: Firestore's
`tickets` collection showed **two real Stripe sales on 2026-09-08** (Marion
Court, $27.49 each) that GA4's `purchase` event never recorded, while Meta's
raw pixel receipts (not its ad-attribution table) independently confirmed the
same two sale minutes. The mechanism identified was that GA4's `purchase` and
`add_payment_info` fire only from the buyer's browser, and both buyers'
browsers delivered nothing to GA4 — cause unknown, but not a stopped
checkout. Four fixes were decided from that correction; **none has had a
chance to prove itself yet**, which is what tonight's data shows:

1. **GA4 transactions are still zero for every day this report can see.**
   `ga4-api-transactions-2026-09-12.csv`'s maximum transaction date is still
   **20260901** — the same ceiling as last night. `ga4-api-revenue-daily-
   2026-09-12.csv` has no row at all for 20260902–20260906 (zero of every
   metric that day) and explicit `0,0` rows for 20260907–20260909. This
   report's own closed week (20260903–20260909, see TRAFFIC below) reads 0
   purchasers / 0 transactions / $0.00 for the sixth night running. **This
   is not new evidence of a problem** — it is the same GA4-side blind spot
   the correction already explained, extended by one more day.
2. **The server-side fix (decision item 3) merged mid-week, too recently to
   have a closed day behind it.** `lib/ga4-mp.js` and its wiring into
   `api/stripe-webhook.js` shipped in `e808411b` (#531, "Send GA4 purchase
   server-side from the Stripe webhook, the way Meta already gets one"),
   merged **2026-09-11 08:52 ET**. Both days since then (09-11, 09-12) are
   inside the excluded non-final tail (§1). There is no closed day yet in
   which this fix could have produced a `purchase` row GA4 was previously
   missing — the earliest possible test is **tomorrow night's report**,
   once 09-11 or 09-12 closes. Whether `GA4_MP_API_SECRET` is actually set
   in the Vercel production env (required for the code to do anything, per
   ANALYTICS_METHOD §7) is **not verifiable from this session** — no Vercel
   connector is attached here.
3. **Decision item 1 (pull real ticket counts into the nightly summary) has
   not been implemented.** No `tickets-by-day-*.csv` or equivalent exists in
   `Night Tasks/` tonight. Until it is, every night this GA4 gap persists,
   an unattended run has no way to tell "sales stopped" from "sales
   happened and GA4 missed them again" — exactly the ambiguity last night's
   correction had to resolve by hand, with tools this run does not have
   (no Stripe, Firestore, or Vercel-log access in this unattended session;
   `mcp__claude_ai_Windsor_ai__get_connectors` returns only `tiktok`).
4. **Decision item 4 (withdraw the "run a test purchase" ask) stands.** Not
   re-raising it — the question it asked was answered by last night's
   correction, and nothing in tonight's data reopens it.

**So: no urgent ask tonight, but a concrete, dated thing to check next
time.** If tomorrow's closed-week transactions are still zero after a full
closed day post-#531, that would be the first real signal since 09-08 that
either the secret is not set or the fix did not close the gap — worth
escalating then, not before.

## TRAFFIC — standing section

| metric | recent 7d (09/03–09/09) | prior 7d (08/27–09/02) | change |
| --- | ---: | ---: | ---: |
| sessions | 642 | 990 | -35% |
| engaged sessions | 293 | 337 | -13% |
| engagement rate | 45.6% | 34.0% | +11.6pp |
| users | 584 | 954 | -39% |
| new users | 524 | 879 | -40% |
| purchasers | 0 | 5 | -100% |
| key events | 6 | 15 | -60% |
| transactions | 0 | 5 | -100% |
| own-site revenue | $0.00 | $142.45 | -100% |

The purchaser/transaction/revenue rows are the HEADLINE's GA4-measurement gap
restated at closed-week granularity, not a fresh finding — see above. Sessions
fell 35% but engagement *rate* rose 11.6 points, so this is a volume drop, not
an attention collapse; raw daily sessions in the non-final tail (09-10: 44,
09-11: 25) sit even lower, but 09-11's engagement rate of 4% is exactly the
tail artifact ANALYTICS_METHOD §1(a) describes (near-zero engagement on the
newest day), not evidence of a second collapse. 09-08 and 09-09, both inside
this closed week, actually recovered to 97 and 91 sessions with 68 and 50
engaged — the "prior week was inflated, this week is a return to baseline"
read from recent reports still holds; this is not accelerating.

### Channels (window-wide, 20260519–20260912)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3247 | 2937 | 29 | 0.9% | $179.94 |
| Direct | 891 | 520 | 25 | 2.8% | $169.94 |
| Unassigned | 634 | 201 | 66 | 10.4% | $345.37 |
| Email | 396 | 219 | 26 | 6.6% | $125.45 |
| Organic Social | 244 | 196 | 10 | 4.1% | $130.46 |
| Organic Search | 155 | 94 | 7 | 4.5% | $82.47 |
| Paid Other | 119 | 111 | 63 | 52.9% | $0.00 |
| Referral | 78 | 17 | 5 | 6.4% | $0.00 |
| Cross-network | 11 | 11 | 6 | 54.5% | $27.49 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Paid Social is the largest channel by far (45% of sessions) and converts
worst of any channel with real volume, unchanged from every prior report.
**Paid Other's 52.9% conversion is $0 revenue** — almost entirely
`ads_conversion_About_Us_1` (ANALYTICS_METHOD §8, a landing-page-view
pseudo-event on `/lp?utm_source=googleads`, from an account dark since
07-24, ANALYTICS_CONTEXT §3b settled). Do not read that row as healthy.
Unassigned (mostly Eventbrite-listing referrals) is 6% of sessions and 33%
of revenue — the highest-value channel on the sheet, and per the HEADLINE
its purchases still run through the same own-site checkout as everyone
else's, so it is exposed to the same GA4-recording gap, not immune to it.

### Top 15 sources (window-wide)

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1628 | 1499 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 891 | 520 | 25 | 2.8% | $169.94 |
| Instagram / paid_social | 636 | 566 | 6 | 0.9% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 289 | 279 | 2 | 0.7% | $0.00 |
| ig / paid_social | 197 | 184 | 1 | 0.5% | $0.00 |
| eventbrite / listing | 176 | 82 | 23 | 13.1% | $290.39 |
| lp / (not set) | 168 | 21 | 1 | 0.6% | $0.00 |
| google / organic | 142 | 85 | 6 | 4.2% | $82.47 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| m.facebook.com / referral | 64 | 64 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |
| resend.com / referral | 57 | 2 | 4 | 7.0% | $0.00 |

Eventbrite is the standout again — 5% of Facebook's raw sessions at ~15x its
conversion rate. Every Facebook/Instagram casing variant converts under
1.1%; summing them (see UTM section) doesn't change that.

### Device

| device | sessions | engaged | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| mobile | 4354 | 1742 | 114 | 2.6% | $904.17 |
| desktop | 1432 | 897 | 123 | 8.6% | $156.95 |
| tablet | 19 | 4 | 0 | 0.0% | $0.00 |

Desktop converts 3.3x better than mobile on a third of the sessions —
unchanged from every prior report. Not related to the checkout-recording
gap: both device rows include the same affected week.

### Geography

| city | region | sessions | users | key events | revenue |
| --- | --- | ---: | ---: | ---: | ---: |
| Philadelphia | Pennsylvania | 941 | 807 | 16 | $114.96 |
| West Chester | Pennsylvania | 424 | 53 | 19 | $82.47 |
| Lancaster | Pennsylvania | 272 | 209 | 18 | $136.45 |
| New York | New York | 202 | 178 | 1 | $0.00 |
| (not set) | (not set) | 179 | 158 | 83 | $0.00 |
| Exton | Pennsylvania | 157 | 7 | 10 | $0.00 |
| (not set) | Pennsylvania | 146 | 119 | 3 | $54.98 |
| Prineville | Oregon | 112 | 112 | 0 | $0.00 |
| Harrisburg | Pennsylvania | 88 | 69 | 2 | $27.49 |
| Ashburn | Virginia | 78 | 26 | 6 | $27.49 |

**Suspect geography bucket, unchanged:** `(not set)`/continentId `ZZ` is 118
sessions with a **69.5%** key-event rate against **2.7%** property-wide
excluding it — consistent with the datacenter/bot traffic ANALYTICS_CONTEXT
documents as an ~8–12% denominator inflation on active-user counts
(Prineville OR and Ashburn VA are both known Meta/hyperscale datacenter
towns per that file). No IP/user-agent check was run tonight; carried as a
caveat, not a verdict, same as every prior report.

### New vs returning

| cohort | sessions | users | key events | revenue | revenue / user |
| --- | ---: | ---: | ---: | ---: | ---: |
| new | 4206 | 4204 | 168 | $651.76 | $0.16 |
| returning | 1338 | 248 | 69 | $409.36 | $1.65 |

Returning users are 6% of users but convert at ~10x the per-user revenue
rate — expected for a low-frequency event-ticket product, unchanged.

### When traffic arrives, and when it converts

Traffic peaks Thursday 10:00 (158 sessions) and Saturday 19:00 (122); key
events cluster hardest on Tuesday (12:00→23, 11:00→13, 14:00→11 — 47 of the
top-8 converting hour-slots land on one weekday), a window-wide pattern that
predates and is unaffected by this week's recording gap.

## EVENTS — standing section

36 distinct events fired window-wide. **Only 3 are configured as GA4 key
events**: `ads_conversion_About_Us_1` (99 events, $0 — the About_Us-named
pseudo-conversion, ANALYTICS_METHOD §8, dark since Google Ads went dark
07-24), `generate_lead` (99, $98 nominal value, $0 revenue), and `purchase`
(39, $1,061.12 — the only one that's real money, still frozen at its
20260901 ceiling per the HEADLINE).

Four events carry a dollar VALUE but are counted as **zero** key events —
funnel steps, not conversions, by GA4's own configuration:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $17,599.02 |
| begin_checkout | 0 | $4,556.26 |
| add_to_cart | 0 | $2,608.97 |
| add_payment_info | 0 | $284.90 |

This week's 6 key events (recent-7d row above) are confirmed to contain
**zero purchases** — the transaction ledger's own max date is 09-01, before
this window opens. The pulled tables do not break key events down by both
event name and date together (only by event name window-wide, or by date
window-wide), so this report cannot say tonight how the remaining 6 split
between `generate_lead` and the dead `ads_conversion_About_Us_1` pseudo-event
without diffing two cumulative pulls against each other — which last night's
own DECISION item 2 rules out as a method, so it is left unsplit rather than
guessed at.

### Which channels produce which key events (top of the table)

`ads_conversion_About_Us_1` is overwhelmingly `googleads` rows (51+16+16+11 =
94 of 99) — all pseudo-conversions per §8, from a channel dark since
2026-07-24 (settled). Real `generate_lead` credit: `(direct)` (19),
`Facebook / paid_social` (12), `eventbrite / listing` (12). Real `purchase`
credit — window-wide, none of it from this week — is led by `eventbrite /
listing` (11, $290.39) and `(direct)` (6, $169.94).

## UTM AND TAGGING GAPS — standing section, ranked by sessions affected

**LIVE** = fired a session in the last closed week (from 20260903); **stale**
= last four closed weeks; **DEAD** = older. Unchanged in shape from the last
several reports; restated because this is a standing section, not because
anything new was found here tonight.

1. **`facebook` fragmented across 11 row variants (6 LIVE), 2601 sessions,
   31 key events, $200.44 combined.** LIVE: `Facebook / paid_social` (1628,
   last seen 20260911), `fb / paid_social` (289, 20260911), `m.facebook.com
   / referral` (64, 20260905), `facebook.com / referral` (40, 20260910),
   `Facebook / social` (12, 20260911), `l.facebook.com / referral` (7,
   20260910). Dead/stale: lowercase `facebook / paid_social` (435, DEAD,
   20260811), lowercase `facebook / social` (61, stale, 20260818),
   `Facebook / paid` (26, DEAD, 20260609), `eventsmanager.facebook.com /
   referral` (20, DEAD, 20260812), `Facebook / organic` (19, stale,
   20260819). **Fix, unchanged across at least six reports now:** normalize
   source/medium casing and the `fb`/`m.facebook.com` variants at the point
   they're written. Who: engineering (ad destination URLs + referral
   handling, not a single call site).
2. **`instagram` split across 2 rows, both LIVE, 833 sessions, 7 key
   events, $82.47**: `Instagram / paid_social` (636, 20260908) vs `ig /
   paid_social` (197, 20260911). One canonical casing needed.
3. **Own-site internal-link tagging — 263 LIVE sessions, 298 total
   window-wide** — the single clearest one-line fix in the worklist, unchanged
   across at least five reports. `lp / (not set)` (168, LIVE 20260909),
   `get_tickets_block / (not set)` (61, LIVE 20260904, $27.49 attributed
   away from its real source), `matches / (not set)` (34, LIVE 20260908,
   $27.49). Stale/dead: `matches / web` (26), `lp / (none)` (3), `lp /
   paid_social` (3), `matches / (none)` (2), `sticky_ticket_bar / (not set)`
   (1). **Fix:** strip `utm_source`/`utm_medium` from the `get_tickets_block`
   element and the internal `/matches` links. Who: engineering, one call
   site each. See Zero-risk fixes.
4. **`lp` fragmented across 3 rows, 1 LIVE, 168 LIVE sessions (174
   combined)** — the LIVE row is the same as item 3's `lp / (not set)`.
   `lp / (none)` (3, stale) and `lp / paid_social` (3, stale) are the other
   two.
5. **`google` fragmented across 3 rows, 1 LIVE, 142 LIVE sessions (154
   combined), 11 key events, $109.96**: `google / organic` (142, LIVE
   20260910) is the healthy row; `google / cpc` (11, stale, 20260825) and
   `Google / (not set)` (1, DEAD, 20260724) are residue from the dark
   Google Ads account (settled).
6. **`email` fragmented across 6 rows, 2 LIVE, 100 LIVE sessions (263
   combined, $125.45, 26 key events)**: `email / newsletter` (50, LIVE
   20260910) and `email / returning` (21, LIVE — folded into the "top
   sources" list above as part of the combined email total). `email /
   email` (117, stale, last 20260826) is the largest row by volume but
   hasn't fired in over two weeks; `email / nurture` (53, stale, last
   20260831). Who: whoever configures the ESP's UTM presets — Taylor's call
   on canonical medium label, not a code bug.
7. **`googleads` fragmented across 5 rows, 0 LIVE, 127 sessions
   window-wide, 94 key events** (all `ads_conversion_About_Us_1`, not real
   conversions per §8) — every row DEAD, oldest since 20260803. Pure
   historical residue; no action needed.
8. **Broken/placeholder values — sessions affected vary by row.**
   `traffic-by-source` value `(not set)` (24 sessions, 0 key events, LIVE
   20260911); `(data not available)` (9, 1 key event, LIVE 20260911 — a
   genuine attribution-loss signature, too small to chase further); `lp /`
   (1, LIVE 20260911, a malformed internal tag). The `<campaign-name>`
   literal placeholder (2 rows, 69 sessions, 41 key events window-wide) and
   bare `undefined` (36 sessions) are both DEAD — last seen 20260710/20260803,
   no live ad carries either string; carried for the record only.
9. **Obfuscated tag, 129 sessions on the ciphertext row, plaintext twin at
   9 (combined ≈138).** `Ybadbfgfe | Zbfgfe Yvfg / email` decodes (a–f
   shift +1, g–z ROT13) to `Lancaster | Master List / email` — the same
   LancasterOnline/Evvnt mechanism a prior report traced and partially
   fixed (#461). First seen this specific window on 20260903 per tonight's
   "sources seen for the first time" check; treat as ongoing until it stops
   appearing in a fresh pull.
10. **`utm_content` shared across campaigns** (`content/brand.json` requires
    uniqueness): `proof_rsa1` spans 7 campaigns, `Tellus+AfterDark:...`
    spans 2, `mc_figlancaster` spans 2 — all confined to paused/historical
    ads. Tonight's Paid Ad UTMs refresh (02:01 local) lists **8 ACTIVE
    ads**, one more than last night's 7 — `lx_close_male_patio` ("Loxleys |
    male | close patio video") is new — and all 8 carry distinct
    `utm_content`. No action needed on live ads.
11. **Campaigns with recorded sessions and zero key events (≥20 sessions)**:
    `Augweek3_lancaster` (471), `Augweek1_philly` (363), `summer2026_philly`
    (273) — all August-dated, already dead per the fragmentation clusters
    above. Historical dead weight.
12. **Auto-tagging overwriting a manual campaign — `Campaign #1` replaced
    `week1_math`, 18 sessions.** Small, one-time, not re-investigated.

## ALSO IN THE REPORT

- **A new Loxleys ad went live tonight and it targets exactly the weak spot
  the last two nightly PRs (#550, #551) flagged.** Tonight's Paid Ad UTMs
  refresh shows `lx_close_male_patio` ("Loxleys | male | close patio video")
  ACTIVE for the first time — the prior male-facing ad in this campaign was
  `lx_prime_male_noplan`, which the UTM defect table above (§4e) shows has
  spent 157 sessions and 0 key events. This is the "second ad added" #550's
  commit message describes; too early for any GA4 or Meta conversion signal
  tonight (it started serving inside the excluded tail), but worth watching
  in the next report specifically against `lx_prime_male_noplan`'s
  zero-conversion baseline.
- **Meta spend this week: $120.79 across 6 campaigns, 315 clicks, 7,948
  impressions — no `purchase` or `offsite_conversion.fb_pixel_purchase`
  action recorded on any campaign.** Marion Court (Retargeting $20.09 +
  Traffic $4.94 + Sales $41.74 = $66.77) and Loxleys (Retargeting $13.00 +
  Traffic $1.22 + Sales $39.80 = $54.02) split the spend roughly evenly.
  Per ANALYTICS_METHOD §9 this is a snapshot from an overlapping rolling
  window, not a week-over-week trend. **Marion Court's event happened
  2026-09-08** (per last night's Firestore check) — "Marion Court | Sales"
  still shows $41.74 of spend inside this 09-05–09-11 window, and this
  script's Meta pull has no daily breakdown, so whether that spend landed
  before or after the event date can't be determined from tonight's data.
  Worth a daily-granularity check if that campaign is still live: retargeting
  spend against a past event's audience is not obviously useful.
- **Eventbrite Ads spend, 30-day view (`eventbrite-ads-2026-09-12.csv`):
  $290.63 total, 16 tickets by Eventbrite's own attribution (its count, not
  GA4's or Stripe's, per CLAUDE.md).** The campaign-name column tracks event
  succession cleanly: "Good Good Night" ran 08-14 through 09-01, "SparkDate:
  Real People, Real Drinks, Real Court" (Marion Court) took over 09-02
  through 09-09, and "Sparkdate: The Loxley's Social" has run alone since
  09-10 at $0.40–$2.21/day — a steep step-down from the $10–14/day the prior
  two events ran, consistent with this being a smaller or later-stage push
  rather than a problem to chase.
- **Marion Court checkout-stage watch item — still resolved, not
  reopening.** "SparkDate: Real People, Real Drinks, Real Court" item is
  still 13 carts → 5 purchased, $99.95, unchanged from the last several
  reports.
- **Loxleys sale-date check, repeated per this prompt's explicit warning
  about crediting a campaign before it existed — unchanged, still
  resolved.** "Sparkdate: The Loxley's Social" item's only 2 recorded sales
  are 20260814 and 20260815; the first Loxleys campaign row in any Meta
  pull is `meta-insights-2026-08-30.csv` (window 20260824–20260830) — two
  weeks after those sales. Nothing in tonight's Meta pull credits a Loxleys
  campaign with a sale that predates it.
- **Webview conversion gap, restated at tonight's numbers.** Purchase funnel
  by webview segment (window-wide): webview session_starts 1205 → purchase 1
  (0.08%); normal-browser session_starts 636 → purchase 9 (1.41%) — an ~17x
  gap, essentially unchanged. Same mechanism as ANALYTICS_METHOD §6.
- **Purchase funnel ratios, window-wide.** `add_to_cart ÷ begin_checkout` =
  35.8% (103/288); `add_payment_info ÷ begin_checkout` = 3.5% (10/288);
  `purchase ÷ begin_checkout` = 13.5% (39/288). Benchmarks before the
  2026-09-03 form rebuild were 24% and 10% respectively on the first two
  ratios — `add_to_cart` conversion is up, `add_payment_info` conversion is
  down, both window-wide figures that predate and postdate the rebuild
  mixed together (ANALYTICS_METHOD §10 boundary), so this comparison is
  informational, not a clean before/after.
- **Additivity is clean.** Revenue-by-source vs revenue-daily: $0.00 gap.
  Revenue-by-item vs items-daily: -$0.00 gap. Revenue-by-item vs transaction
  total: **-$92.52**, the already-documented 2-for-1 item-count effect
  (#205) — expected.
- **`transaction_id` reuse still open**: 16 distinct ids carry 39
  transactions; 5 ids appear more than once (max 8 on one id), 5 span more
  than one date. Open since PR #200; not investigated further tonight.
- **Checkout errors, window-wide totals** (all pre-date the 09-01 recording
  ceiling): `card_incomplete` 18 events/8 users, `(not set)` category 8
  events/7 users, `card_declined` 1, `other` 1. Reasons: `(not set)` 25,
  "your postal code is incomplete." 3. `card_incomplete` was 8 users
  lifetime historically; it should not grow faster than checkout form
  views do — no growth to report tonight, it's frozen at the same ceiling
  as everything else purchase-adjacent.
- **Founders Mixer**: 8 purchases, 0 recorded `view_item`, 0 `add_to_cart` —
  all June sales. Old enough to read as a one-time sales mechanism, not a
  live gap.
- **Google Ads, confirmed still dark.** Spend on the last 7 closed days
  (20260903–20260909): **$0.00**. Lifetime total unchanged: `Website
  traffic-Search-1` $35.35 (0 attributed sessions) + `Campaign #1` $2.56
  (Performance Max, 4 clicks, 10.73 nominal ROAS — too small to mean
  anything, §12).
- **New organic/listing sources first seen in the last 7 closed days**:
  `visitlancastercity / listing` (4 sessions since 20260903),
  `facebook_group / listing` (4, since 20260904), `Flyers / referral` (1,
  since 20260908), `lp /` (1, since 20260911, the malformed-tag defect in
  §4c above, not a new listing). Consistent with new free event-listing
  placements going live, not tagging defects, except the last one.
- **Pages taking real traffic and returning nothing** (≥15 sessions, 0 key
  events, window-wide): `(not set)` (43, 34) and `/signup` (15, 11).
  Unchanged from prior reports; `/signup` is already-settled (membership
  shelved, `sign_up` fires zero times all year, ANALYTICS_CONTEXT §1). No
  `public/` page source was opened tonight for either — investigation
  effort went to confirming the HEADLINE's fix-timing instead, which is the
  larger open item. Landing-page × source dead pairings (≥20 sessions, 0
  key events) are unchanged in shape: `/lp` × `facebook / paid_social`
  (419), `/event` × the obfuscated Lancaster email tag (129), `/admin` ×
  `lp / (not set)` (106), `/events` × `eventbrite / listing` (49),
  `/founding` × `facebook / social` (45). The cross-tab again surfaces
  `googleads / paid` as the only "converting" source on `/lp` (91.1%, 56
  sessions) — **not real**, every one of those "key events" is
  `ads_conversion_About_Us_1` (§8).

## NEEDS TAYLOR INPUT (0)

Nothing rises to "only Taylor can act on this" tonight. The HEADLINE's open
thread (whether `GA4_MP_API_SECRET` is set, and whether #531 closes the
recording gap) is self-resolving from data the next unattended run will have
— once 09-11 or 09-12 becomes a closed day — and is not re-raised as an ask
here per this prompt's rule against re-asking without new evidence. If
tomorrow's closed week still reads zero transactions with a full closed day
behind #531, that is new evidence and belongs here next time.

**Retired, not re-asked:** the "run a test purchase / check Stripe directly"
ask from the 09-11 report (already withdrawn same-day by that report's own
CORRECTION). The Facebook/Instagram session-delivery collapse from
09-06/09-07 (retired 09-11, no recurrence since).

## Zero-risk fixes, described and not applied

1. **Internal-link UTM stripping** — remove `utm_source`/`utm_medium` from
   the `get_tickets_block` element and the internal `/matches` links (UTM
   item 3): 263 LIVE sessions of ongoing self-misattribution, the single
   clearest one-call-site fix in the worklist. Described in at least the
   last five reports; not yet applied.
2. **`facebook`/`instagram` source casing normalization** at the
   destination-URL / referral-tagging level (UTM items 1, 2, 4) — highest
   combined session volume in the worklist, but the fix touches however
   these variants get produced rather than one call site.
3. **Pull real ticket counts (Firestore `tickets`) into the nightly
   summary script**, per last night's DECISION item 1 — not a code change
   to the site, but the single change that would stop this GA4 gap from
   generating a false alarm (or a missed real one) on any future night.
   Not applied here; this run is report-only.

## Caveats

- ANALYTICS_METHOD §1: 20260910 and 20260911 excluded from every closed-week
  figure as not-yet-final.
- ANALYTICS_METHOD §7: all revenue figures are own-site GA4 only, not
  business revenue, and — per last night's correction — GA4's own-site
  `purchase` count is itself known to be an incomplete floor this specific
  week (two confirmed real sales on 09-08 are not in it). Do not read $0.00
  as proof nothing sold; also do not assume something did — this report has
  no way to check further tonight.
- ANALYTICS_METHOD §8 governs every reading of `ads_conversion_About_Us_1`
  — never treated as a real conversion.
- ANALYTICS_METHOD §9: no Meta week-over-week comparison drawn — the
  Meta spend figures above are a current-state snapshot from an overlapping
  rolling window.
- ANALYTICS_METHOD §12: `add_payment_info` (n=10), this week's purchase
  count (n=0), and `transaction_id`-reuse figures are small-sample or
  exactly-zero; read as direction/fact, not rate.
- Per last night's DECISION item 2, this report did not diff cumulative
  `ga4-api-events-*.csv` pulls against each other to manufacture a trend
  claim — the one place that method would have been useful (splitting this
  week's 6 key events into purchases/leads) was left unsplit instead (see
  EVENTS section).

**What I did not verify:** whether `GA4_MP_API_SECRET` is set in the Vercel
production env — no Vercel connector attached to this session. Whether
`#531`'s server-side call actually reaches GA4 successfully once the secret
is set — no closed day exists yet to test it. The IP/user-agent evidence for
the `(not set)`/`ZZ` datacenter-traffic bucket — not re-checked tonight, same
as every prior report. Any `public/` page source for the standing
zero-key-event pages (`/signup`, blank landing value) — already settled,
not re-opened. Whether "Marion Court | Sales" spend inside this week's
window landed before or after the 09-08 event date — the Meta pull has no
daily granularity in this script's output. The exact split of this week's 6
key events between `generate_lead` and `ads_conversion_About_Us_1` — see
EVENTS section for why.

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
| cities | 1033 | yes |
| cohort-retention | 18 | yes |
| daily-by-source | 804 | yes |
| daily-trend | 105 | yes |
| events | 36 | yes |
| events-by-source | 747 | yes |
| first-user-tagging | 138 | yes |
| funnel-by-channel | 36 | yes |
| funnel-by-device | 13 | yes |
| funnel-checkout-by-landing-page | 35 | yes |
| funnel-waitlist-sequence | 2 | yes |
| funnel-webview-vs-normal | 8 | yes |
| geo-country-language | 65 | yes |
| google-ads-by-network | 4 | yes |
| google-ads-cost | 2 | yes |
| google-ads-cost-daily | 24 | yes |
| google-ads-creatives | 2 | yes |
| items-daily | 30 | yes |
| key-events | 7 | yes |
| key-events-by-source | 132 | yes |
| key-events-daily | 105 | yes |
| landing-by-source | 259 | yes |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 30 | yes |
| page-views | 74 | yes |
| paid-cost-vs-sessions | 129 | yes |
| promotions | 8 | yes |
| revenue-by-item | 7 | yes |
| revenue-by-source | 14 | yes |
| revenue-daily | 67 | yes |
| session-quality-daily | 105 | yes |
| traffic-by-source | 70 | yes |
| transactions | 32 | yes |
| users-daily | 105 | yes |
| utm-ad-detail | 315 | yes |
| utm-content | 100 | yes |
| webview-by-event | 80 | yes |
| weekly-trend | 16 | yes |

Beyond the standing summary: `meta-insights-2026-09-11.csv` (6 campaigns,
Marion Court and Loxleys, for the Meta section and the sale-date
cross-checks); `eventbrite-ads-2026-09-12.csv` (30-day Eventbrite Ads spend,
for the campaign-succession note in ALSO); tonight's Paid Ad UTMs refresh
log (02:01 local, for the new `lx_close_male_patio` ad and the ACTIVE-ad
count); `git log` against `lib/ga4-mp.js` for the #531 merge timestamp used
in the HEADLINE; `reports/GA4_ANALYSIS_2026-09-11.md` in full, including its
same-day CORRECTION, which this report continues from rather than
re-deriving.
