# GA4 analysis — 2026-09-05

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something
that was applied.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last
updated: 2026-08-26."** Its own file-modified time is **2026-08-28 18:25**,
after that stamp — the file was edited (the "SPLIT 2026-08-28" and "SHIPPED
2026-08-28" passages are visibly from after the stamp date) without the
stamp being bumped. That is the only thing worth saying about it; per the
2026-09-04 rewrite of this instruction, it is not a re-ask and is not listed
under NEEDS TAYLOR INPUT below.

**Data.** GA4 Data API, property 536859339, window `20260519-20260905`,
pulled **2026-09-05 06:00 UTC**, read from each file's own `#` header. Meta:
`meta-insights-2026-09-04.csv`, window `20260829-20260904`, 5 campaigns,
**$158.10** total spend. That window overlaps last night's
(`20260828-20260903`) by five of six days, so no week-over-week claim is
made about Meta per `ANALYTICS_METHOD.md` §9. All 46 tables from last
night's pull are present again tonight in the same shape; nothing in GA4's
revenue, transaction, or funnel tables moved beyond ordinary same-day
accrual — see "Additivity and control checks" below for the exact
byte-for-byte comparison.

---

## HEADLINE — GA4's own numbers are static since last night. The real movement since the last report happened outside these CSVs, and this pull demonstrates live why that matters: a campaign with real spend and real traffic reads "zero" in GA4 for a reason that has nothing to do with demand.

Commit `c5d1cfd4` (PR #446, 2026-09-04 21:45 ET) **retracted the previous
night's Meta headline** ("the sales stopped nine days ago") after finding
that every "sales" figure quoted about Meta ads was Meta's own **attributed
conversions**, not real sales — Meta's pixel sees only 6 of 53 real tickets
sold in that window. A join that already existed in Firestore
(`ad_spend.byEvent` × `tickets.eventId`, never previously read) puts real
gross ROAS at **1.79**, not the **0.23** Meta's own numbers implied. The same
commit fixed two site bugs: a cookie-read regex that silently dropped
`_fbp`/`_fbc` for most buyers (degrading every Meta CAPI purchase match), and
an unbounded first-touch attribution record that let a single June
Eventbrite visit override every later ad click for the life of a browser
(now capped at 30 days). None of that is GA4 data and none of it is this
report's to verify — it is cited here because it changes how tonight's Meta
CSV has to be read.

**Read in isolation, tonight's Meta CSV would invite exactly the mistake
that was just retracted.** None of the 5 campaigns in this window report a
`purchase` action at all — only clicks, impressions, and engagement (and, for
Loxleys, two `initiate_checkout` pixel fires). A reader who treated that
absence as "no sales" would be repeating PR #446's exact error at a smaller
scale. This report demonstrates the mechanism directly: `ga4-api-utm-ad-
detail` shows **~236 sessions** tagged with the Loxleys campaign name
(`LX_202609`, across `ig/fb/th × paid_social` plus `facebook_event/listing`
and `nextdoor_event/listing`) and **zero key events, zero revenue, zero
transactions on every single one of those rows.** Meanwhile the Firestore
join in PR #446 already credits Loxleys with the **best gross ROAS on the
account — 5.75, on 4 tickets / $92.96.** `ANALYTICS_METHOD.md` §7 (GA4
revenue is own-site only) is the standing explanation for exactly this shape
of gap, and this is a clean live instance of it, not a new trap. See ALSO #1
for the one nuance GA4 does confirm.

---

## ALSO IN THE REPORT

### 1. GA4 does show 2 Loxley's tickets sold this window — just not attributed to any `LX_202609`-tagged session.

`ga4-api-revenue-by-item` (own-site only, window-wide): **"Sparkdate: The
Loxley's Social" — 2 items purchased, $37.98.** So the product did sell
through a GA4-tracked own-site session somewhere in the window; it is only
the *campaign-tagged* traffic (`LX_202609`) that converts to zero. I did not
attempt to join item name to session source — the nightly pull has no table
that carries both dimensions together, so I cannot say which source/medium
those 2 sessions actually landed under. `ga4-api-revenue-by-source` sums to
the same $1,061.12 / 39 transactions as every other revenue table (see
additivity below), so the 2 Loxley's units are in there, just not
separable from the other 37 by item. This is the same shape of question
Marion Court's attribution raised twice before (09-01, 09-02 reports) —
worth the same joined table this time rather than re-deriving it ad hoc a
third time. See zero-risk fixes.

### 2. Two closed days (09-02, 09-03) recorded zero GA4 key events — normal for this property, not an anomaly, and independently corroborated by PR #446's own numbers.

`ga4-api-key-events-daily`: 09-02 and 09-03 both read **0** (`generate_lead`,
`purchase`, and `ads_conversion_About_Us_1` combined), despite sessions of
85 and 210 respectively on those days — so this is not a traffic drop, and
per `ANALYTICS_METHOD.md` §1 those two days are old enough to trust (09-04
and 09-05 are the excluded two-day tail; 09-04 shows `engagementRate=0` on
**every single row** of `daily-by-source`, the textbook signature of the
processing-lag artifact, so I am not drawing anything from it). A 2-day
zero-key-event stretch has happened several times in the last 30 days
(08-08/08-09, 08-11/08-12) without turning into anything, and PR #446's own
Firestore-based ticket count independently states **"the longest zero-sale
run since 08-05 is three days"** — so a 2-3 day gap is this property's
normal cadence, not a new signal. I am not opening this as a trend; flagging
only so a future report does not rediscover the same non-event.

### 3. Meta, `20260829-20260904`: $158.10 across 5 campaigns, one fewer than last night's list — the missing one was paused deliberately, not lost data.

| campaign | spend | impressions | clicks |
|---|---:|---:|---:|
| Marion Court \| Traffic | $54.85 | 9,149 | 203 |
| Campaign 1 Event 3 Good Good Campaign | $37.85 | 6,409 | 208 |
| Marion Court Retargeting | $32.18 | 1,625 | 20 |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | $16.17 | 721 | 21 |
| Loxleys \| Traffic | $17.05 | 2,580 | 212 |

Last night's report listed a sixth line, "Campaign 1 Tellus AfterDark:
Singles Edition Retargeting," at $0/0/0. It does not appear at all tonight.
PR #446 (same commit as the headline above) ran `meta-pause-stale.js`,
which paused five campaigns whose `stop_time` had already passed while they
still read ACTIVE — Tellus's stop date was 08-26, so this is very likely
that campaign leaving the active set by deliberate action, not a pull
failure. I did not independently verify its current status against the Ads
API; noting the coincidence rather than confirming it.

Loxleys' own pixel actions include `initiate_checkout=2` /
`offsite_conversion.fb_pixel_initiate_checkout=2` — Meta's own side records
two checkout starts this window. GA4 shows zero `begin_checkout` under the
`LX_202609` tag (see HEADLINE). The two measurement systems disagree on a
single-digit count; per §12, n=2 is not enough to call this a mismatch worth
chasing, only enough to note it exists.

### 4. Home page's ticket promo click-through is far higher than `/lp`'s, but this is very likely channel mix, not a page defect.

`ga4-api-promotions` (window-wide click-through on promo item impressions):

| promotion | surface | viewed | clicked | rate |
|---|---|---:|---:|---:|
| `get_tickets_block` | homepage | 60 | 26 | **43.3%** |
| `lp_sticky_bar` | `/lp` sticky | 92 | 19 | 20.7% |
| `lp_get_tickets` | `/lp` main CTA | 585 | 69 | 11.8% |
| `sticky_ticket_bar` | homepage sticky | 22 | 2 | 9.1% |

`/lp` is overwhelmingly where cold paid-social traffic lands (2,804 of 3,903
total session-starts, per `funnel-checkout-by-landing-page`); the home page
gets a small, mostly warm/direct audience. A 4x gap in per-impression
click-through between a warm, low-volume surface and a cold, high-volume one
is the expected shape of a channel-mix difference, not evidence `/lp`'s CTA
is broken — `/lp`'s CTA has already been the subject of extensive, separate
investigation (CTA position, sticky-bar behavior, the 08-22 redesign). Flagging
the number for the record, not proposing anything new here.

### 5. The scrambled email UTM string is still live and still at $0 — second time this has been worth a line. (2nd ask below.)

`ga4-api-daily-by-source` for 09-03: `Ybadbfgfe | Zbfgfe Yvfg / email` — 129
sessions, 36 engaged (27.9%), reconfirmed in `first-user-tagging`
(`f60ccdc363-FZBVY_DBZCBVTA_5359_32_35_36_85` as the matching scrambled
campaign id, 129 sessions). It does not appear anywhere in
`ga4-api-attribution-credit` because it carries **zero key events** — 129
sessions, zero conversions, two-plus days later. This was first surfaced in
the 09-04 11:56 report as new; the 12:32 report noted it as unchanged and
did not re-list it. Tonight's numbers are identical, so this is the second
explicit ask.

### 6. Additivity and other tables — closed, consistent, nothing new.

- `revenue-by-source` sums to $1,061.12 / 39 transactions, matching
  `revenue-daily`'s grand total exactly.
- `items-daily` and `revenue-by-item` close with each other exactly (41
  items, $968.60). The $92.52 gap against the $1,061.12 transaction total
  mirrors the already-documented #205 2-for-1 item-count effect (itemsPurchased
  overcounts seats relative to transactions in the other direction elsewhere
  in the window) — not a new discrepancy.
- `checkout-errors` (28 events: 18 `card_incomplete`, 8 `(not set)`, 1
  `card_declined`, 1 `other`) and `checkout-error-reasons` (same 28, 25
  `(not set)` / 3 "your postal code is incomplete.") are unchanged from the
  last several pulls.
- `google-ads-cost` lifetime totals ($37.912513 / 114 clicks / 509
  impressions) are unchanged and still match `ANALYTICS_CONTEXT.md` §3b's
  Ads-Manager figures to the cent — Google Ads remains dark, not re-opening
  §3b.
- `audiences` (Purchasers $1,061.12 against a $2,122.24 grand total —
  audience membership overlaps rather than partitions) and `new-vs-returning`
  (returning $1.844/user vs new $0.169/user, ~10.9x) are byte-identical to
  last night's report.
- `geo-country-language`'s suspect `(not set)`/`ZZ` bucket is unchanged: 118
  sessions, 82 key events (~69%), $0 revenue.
- `cohort-retention`'s `wk of 2026-08-24` week-1 cell reads 5/891 (0.56%) —
  this is the exact open cell `ANALYTICS_METHOD.md` §1(c) already documents
  as a false-conclusion trap (its week spans Aug 31–Sep 6, roughly 5 of 7
  days elapsed at this pull). It is still open, still not comparable to the
  four closed week-1 cells running 1.65%–3.37%. Not a new finding — confirming
  the trap is still live and correctly excluded.
- `<campaign-name>` (`googleads / paid`, 41 key events, $0) is unchanged and
  remains the already-resolved legacy artifact from an archived June 2026 ad
  (`META_ADS_REVIEW_2026-09-02.md`) — not re-opened.
- `transaction_id` reuse (PR #200, surfaced 09-04) — not re-investigated
  tonight; still an open item for zero-risk fixes below, unchanged.

---

## NEEDS TAYLOR INPUT

1. **The scrambled email UTM string** (`Ybadbfgfe | Zbfgfe Yvfg / email`,
   129 sessions on 09-03, $0 conversions) needs someone with the email
   platform's send history to identify which campaign this was and fix the
   merge-tag failure at the source — I can see the GA4 symptom but not the
   email vendor side. **(2nd ask.)**

Nothing else tonight rises to a judgment call. `ANALYTICS_CONTEXT.md` §3b was
checked and nothing on it reopens; Google Ads, the internal-traffic filter,
`ads_conversion_About_Us_1`, and Marion Court's kill-or-keep decision all
stay settled.

---

## Zero-risk fixes — described only, NOT applied

1. **Add a new `ANALYTICS_METHOD.md` §10 entry for 2026-09-04 ~21:45 ET**:
   the `_fbp`/`_fbc` cookie-regex fix and the new 30-day first-touch TTL
   (PR #446). Any future comparison of "direct" attribution share, or of
   Meta CAPI event-match quality, across that timestamp mixes two different
   measurement regimes — the exact shape of every other entry in that table.
2. **Add a worked Loxleys example to `ANALYTICS_METHOD.md` §7** (GA4 revenue
   is own-site only): `LX_202609` reads zero conversions in GA4 while
   Firestore's spend-to-ticket join credits it the account's best ROAS. A
   campaign-level version of the exact mistake PR #446 just retracted at the
   account level, caught before it was made rather than after.
3. **Add an item-name × session-source/medium joined table to the nightly
   GA4 pull** (or note that GA4 Data API's Free Form exploration can do this
   even though the current REST-pulled tables cannot). This is now the
   second time (Marion Court, then Loxleys) that "which channel actually
   sold this specific event's tickets" needed an ad hoc join this report
   could not complete from the tables on disk.
4. **Investigate `transaction_id` reuse** (PR #200, surfaced 09-04, not
   re-investigated tonight) — still unresolved whether it is legacy data or
   a live regression.
5. Carried, unchanged, from the last two reports: fold the `geo` `(not
   set)`/`ZZ` suspect-traffic bucket and the `audiences` non-additivity trap
   into `ANALYTICS_METHOD.md`; add `reach`/`frequency` to the Meta pull; note
   that `meta-insights-<date>.csv` is named for the window's last day, one
   day behind the pull date. None of these have been applied yet.

---

## Caveats and method

- **`ANALYTICS_CONTEXT.md` read in full first**, stamp 2026-08-26 vs. mtime
  2026-08-28 noted above. `reports/ANALYTICS_METHOD.md` read in full and
  treated as authoritative on every measurement question; where the two
  files could be read as disagreeing, none of tonight's numbers turned on
  the difference.
- **Which caveats were load-bearing tonight.** §1 excludes 09-04 and 09-05
  outright (09-04's `engagementRate=0` on every `daily-by-source` row is the
  named processing-lag signature; 09-05 is a two-hour partial day at 4
  sessions). §1(c) governs the still-open `wk of 2026-08-24` week-1 cohort
  cell. §7 is the entire mechanism behind the HEADLINE and ALSO #1. §9 is
  why the Meta section makes no week-over-week claim against an overlapping
  window. §12 governs the Loxleys-vs-Meta-pixel n=2 comparison in ALSO #3
  and the postal-code n=3 in checkout errors.
- **Additivity and control checks performed:** `revenue-by-source`,
  `revenue-daily`, and `key-events` all sum to $1,061.12 / 39 transactions /
  231 key events; `items-daily` and `revenue-by-item` close with each other
  at 41 items / $968.60; `checkout-errors` and `checkout-error-reasons`
  close at 28 events each; Google Ads GA4-derived lifetime totals match
  `ANALYTICS_CONTEXT.md` §3b's Ads-Manager figures to the cent.
- **What I did not verify.** Which source/medium the 2 GA4-tracked Loxley's
  ticket sales actually came through (ALSO #1) — no table on disk joins item
  and source. Whether "Campaign 1 Tellus AfterDark: Singles Edition
  Retargeting" dropping off the Meta pull is actually the `meta-pause-
  stale.js` action from PR #446 — plausible from the timing and the $0
  history, not confirmed against the Ads API directly. Whether
  `transaction_id` reuse (PR #200) is live or legacy — flagged, not
  investigated, per the 09-04 report. The remaining tables not discussed
  above (`by-day-hour`, `users-daily`, `page-views`, `weekly-trend`,
  `session-quality-daily`, `os-browser`, `paid-cost-vs-sessions`) were
  skimmed for anything alarming and none was found, but were not analysed in
  depth.
- **Parsing.** Every file parsed from its own real header after the `#`
  block; Grand total rows excluded from row-level aggregation and used only
  as independent checks. No column names hardcoded. No source CSV was moved,
  renamed, or modified. No scratch files were left in this checkout.
- **Source reading.** `c5d1cfd4`, `256e09e4`, and `fc792219` were read via
  `git show` and `git log` for continuity and context only — none of that
  commit's Firestore-based findings were re-derived or re-verified here;
  they are cited as background for how to read tonight's GA4/Meta numbers,
  not restated as this report's own conclusions.
