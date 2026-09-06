# GA4 analysis — 2026-09-06

**This run made ZERO code changes.** The only file it adds is this report. Every
fix described below is a recommendation for a human to apply, not something
that was applied.

**Why this report exists.** The 02:00 unattended run pulled tonight's data
successfully (all 46 GA4 tables plus the Meta insights file, confirmed below)
but the analysis step never ran — `Business Plan\files\Night Tasks\logs\2026-09-06.log`
shows Claude Code exiting immediately at 02:13:57 with "You've hit your session
limit · resets 5:30am (America/New_York)." No branch was pushed, no PR opened.
This is that analysis, run by hand in an interactive worktree session per
CLAUDE.md, against the same data the failed run would have used.

**Staleness check, as required.** `ANALYTICS_CONTEXT.md` reads **"Last updated:
2026-08-26"**; its file-modified time is **2026-08-28 18:25**, after the stamp.
Per the 2026-09-04 rewrite of this instruction, that is the only thing worth
saying about it — not a re-ask, not listed under NEEDS TAYLOR INPUT. It has
read this way in every report since 09-05; nothing has changed.

**Data.** GA4 Data API, property 536859339, window `20260519-20260906`, pulled
**2026-09-06 06:12 UTC**, read from each file's own `#` header. Meta:
`meta-insights-2026-09-05.csv`, window `20260830-20260905`, 7 campaigns,
**$153.42** total spend. That window overlaps the last report's
(`20260829-20260904`, from the unmerged PR #449) by 6 of 7 days, so no
week-over-week Meta claim is made, per `ANALYTICS_METHOD.md` §9.
`scripts/ga4-nightly-summary.js` ran cleanly against tonight's pull; one of its
derived figures (Google Ads "last 7 closed days" spend) is contradicted by the
underlying daily CSV and is called out and corrected in §6 below rather than
trusted.

**Continuity note.** The most recent *merged* report on `origin/main` is
`GA4_ANALYSIS_2026-09-04.md`. PR #449 (`claude/nightly-ga4-2026-09-05`) ran the
night after that but is still open, unmerged. I read it anyway for continuity
— its headline (Loxleys reading zero in GA4 against a Firestore-derived 5.75
ROAS) is directly addressed by same-day commits below and should not be acted
on as written; see HEADLINE.

---

## HEADLINE — Conversion fell by a third this closed week while sessions and users held. Two dated, verifiable mechanisms account for a real chunk of it; neither is a demand collapse.

**The numbers.** Two disjoint closed weeks (`ga4-nightly-summary.js`, §1 rule:
drop 20260905 and 20260906 as unfinished):

| metric | recent (08/29–09/04) | prior (08/22–08/28) | change |
| --- | ---: | ---: | ---: |
| sessions | 1,009 | 1,021 | −1% |
| users | 993 | 900 | +10% |
| new users | 941 | 795 | +18% |
| engaged sessions | 364 | 426 | −15% |
| engagement rate | 36.1% | 41.7% | |
| purchasers | 4 | 6 | −33% |
| key events | 11 | 16 | −31% |
| transactions | 4 | 6 | −33% |
| own-site revenue | $114.96 | $169.94 | −32% |

Sessions were flat and users/new users actually *grew* — this is not a traffic
story. Purchasers, key events, transactions and revenue all fell by roughly a
third. No series break from `ANALYTICS_METHOD.md` §10 falls inside this window
(the nearest, the 09-03 paid-funnel change, affects funnel *step* shapes, not
whether `purchase` fires or is counted), so the decline itself is real. Two
specific, dated mechanisms explain a meaningful piece of it:

**Mechanism 1 — a brand-new, zero-converting campaign is diluting paid social, and it has already been rebuilt.** `ga4-api-daily-by-source` shows `Facebook / paid_social` falling from 432 to 260 sessions week-over-week — read alone, that looks like a real paid-social decline. It is not. Day-by-day, the drop is a cliff exactly at 2026-09-01 (86→107→57→**3→0→1→4→2**), and two new lowercase-tagged rows appear from 2026-08-30 with almost the same combined volume: `fb / paid_social` (recent week: 102 sessions) and `ig / paid_social` (127 sessions). `ga4-api-utm-ad-detail` attributes the large majority of both — 216 of the ~231 window-wide `fb`+`ig` sessions — to `LX_202609` / `lx_prime_male_noplan` and `lx_prime_female_showup`: **Loxleys' prime-rate Traffic ads, which the commit history confirms went live 2026-08-30.** Added together, properly-cased + lowercase Facebook/Instagram sessions actually *grew* week-over-week (642 → 689, +7%); the apparent decline is pure UTM-casing fragmentation from a new campaign, not lost reach. But every one of those `fb`/`ig` rows carries **zero key events** — this specific new traffic converts at 0%, which is exactly why it drags the aggregate rate down even though volume didn't fall. This is not a live open question: commit `600a0646` (2026-09-05 14:02 ET, PR #450) independently found the same thing — "$18.04, 183 link clicks, zero tickets in seven days" — and paused Loxleys' Traffic campaign in favor of a rebuilt Sales-objective one the same afternoon (see ALSO #1). I did not re-verify the Meta/Firestore side of that commit; I cite it only to explain why tonight's GA4 numbers look the way they do.

**Mechanism 2 — Eventbrite listing traffic fell off a cliff on 09-01, and nothing in this pull explains why.** `eventbrite / listing` is one of the property's best-converting channels (window-wide: 13.2% conversion, $290.39 revenue, 11 of 39 transactions — see TRAFFIC below). Day-by-day it goes 4→4→3 (08/29–08/31) then **2→1→0→1** (09/01–09/04), a 77% week-over-week session drop (66→15) with the same 09-01 cliff date as Mechanism 1, but no tagging-fragmentation explanation fits — there is no new Eventbrite-adjacent row absorbing the missing sessions (`facebook_event / listing` and `nextdoor_event / listing` are new but tiny, +9 and +3 sessions). Total site sessions did not fall on 09-01 (109 that day per `daily-trend`, in line with neighboring days), so this looks like a real, specific drop in whichever Eventbrite listing(s) are currently live, not a measurement artifact. I have no Eventbrite listing URL on disk to check directly (none is hardcoded in `public/` or `content/`; ticket URLs live in Firestore, out of scope for this pull) — recommend checking the live listing(s) directly. See zero-risk fixes.

---

## TRAFFIC

Closed days in series: **98** (20260530 → 20260904). Excluded as not final:
20260905, 20260906.

### Channels (window-wide, 20260519–20260906)

| channel group | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paid Social | 3,078 | 2,781 | 26 | 0.8% | $179.94 |
| Direct | 789 | 478 | 22 | 2.8% | $169.94 |
| Unassigned | 646 | 224 | 66 | 10.2% | $345.37 |
| Email | 388 | 212 | 26 | 6.7% | $125.45 |
| Organic Social | 222 | 176 | 10 | 4.5% | $130.46 |
| Organic Search | 141 | 85 | 7 | 5.0% | $82.47 |
| Paid Other | 117 | 109 | 63 | 53.8% | $0.00 |
| Referral | 74 | 14 | 5 | 6.8% | $0.00 |
| Cross-network | 12 | 12 | 6 | 50.0% | $27.49 |
| Paid Search | 9 | 9 | 0 | 0.0% | $0.00 |
| AI Assistant | 1 | 1 | 0 | 0.0% | $0.00 |

Read this table with §12 in mind: Paid Other (53.8%) and Cross-network (50.0%)
convert at high *rates* on volumes too small to mean anything (117 and 12
sessions), and Paid Other's 63 key events carry **$0 revenue** — almost
certainly `ads_conversion_About_Us_1` page-load events, not sales. At real
volume, the honest read is: **Unassigned is the best-converting channel that
matters** (646 sessions, 10.2%, $345.37 — driven substantially by
`eventbrite / listing`'s 174 sessions / 13.2% / $290.39, per the source table
below), and **Paid Social is both the largest channel by far and the worst
meaningful converter** (3,078 sessions, 0.8%). Note also: a custom GA4 Channel
Group shipped *today* (commit `a3f78cb5`, 17:35 ET, after this 06:12 UTC pull)
moves `medium=listing` traffic out of Unassigned into its own group — Taylor's
own investigation there measured 123 sessions / $97.96 moving. Tonight's pull
predates that change; expect Unassigned to shrink and a new listings-labeled
row to appear starting with tomorrow's pull. Not a finding of mine — flagging
so the shift isn't mistaken for demand movement.

### Top 15 source/medium (window-wide)

| source / medium | sessions | users | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook / paid_social | 1,610 | 1,482 | 15 | 0.9% | $97.47 |
| (direct) / (none) | 789 | 478 | 22 | 2.8% | $169.94 |
| Instagram / paid_social | 625 | 558 | 6 | 1.0% | $82.47 |
| facebook / paid_social | 435 | 390 | 5 | 1.1% | $0.00 |
| fb / paid_social | 209 | 204 | 0 | 0.0% | $0.00 |
| eventbrite / listing | 174 | 82 | 23 | 13.2% | $290.39 |
| lp / (not set) | 163 | 17 | 1 | 0.6% | $0.00 |
| Ybadbfgfe \| Zbfgfe Yvfg / email | 129 | 129 | 0 | 0.0% | $0.00 |
| google / organic | 129 | 77 | 6 | 4.7% | $82.47 |
| ig / paid_social | 129 | 127 | 0 | 0.0% | $0.00 |
| email / email | 117 | 12 | 6 | 5.1% | $48.98 |
| m.facebook.com / referral | 63 | 63 | 0 | 0.0% | $0.00 |
| facebook / social | 61 | 39 | 3 | 4.9% | $47.99 |
| get_tickets_block / (not set) | 61 | 6 | 1 | 1.6% | $27.49 |
| resend.com / referral | 57 | 2 | 4 | 7.0% | $0.00 |

Two sentences: the top four rows alone are three different casings of
"facebook" (§ UTM below), and `eventbrite / listing` at 13.2% is the highest
real-volume conversion rate on the property — which is exactly the channel
that just cratered (HEADLINE, Mechanism 2).

### Device and geography

| device | sessions | engaged | key events | conv rate | revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| mobile | 4,000 | 1,548 | 111 | 2.8% | $904.17 |
| desktop | 1,394 | 862 | 120 | 8.6% | $156.95 |
| tablet | 19 | 4 | 0 | 0.0% | $0.00 |

Desktop is 26% of sessions but 52% of key events and converts 3x mobile's
rate — consistent with every prior report; not a new finding.

Top cities: Philadelphia (893 sessions, $114.96), West Chester (424, $82.47),
Lancaster (237, $136.45), New York (189, $0), Exton (157, $0). The suspect
`(not set)`/continent `ZZ` bucket is **118 sessions, 82 key events (69.5%),
$0 revenue** against a property-wide 4.3% (2.8% excluding this bucket) — the
same bot/datacenter-shaped signature flagged since 08-26; no new evidence
gathered on it tonight, still a caveat not a verdict.

New vs returning: new 3,931 sessions / $651.76 / $0.166 per user; returning
1,238 / $409.36 / $1.84 per user — returning users convert **~11x** better per
user, consistent with every prior report (not re-verified in depth tonight).

---

## EVENTS

**Every event in the property (window-wide), ranked. Key events marked ★.**

| event | count | users | key event? |
| --- | ---: | ---: | --- |
| page_view | 9,750 | 3,977 | |
| session_start | 5,470 | 3,975 | |
| first_visit | 4,006 | 3,974 | |
| scroll | 2,947 | 822 | |
| user_engagement | 2,730 | 625 | |
| in_app_browser_detected | 2,361 | 1,987 | |
| targeted_event_landing | 2,200 | 1,939 | |
| view_promotion | 835 | 674 | |
| view_item | 657 | 385 | |
| lead_form_started | 326 | 301 | |
| checkout_form_started | 299 | 196 | |
| getaway_interest | 297 | 30 | |
| form_start | 294 | 154 | |
| in_app_browser_escape_attempt | 274 | 190 | |
| begin_checkout | 263 | 187 | |
| lp_visible | 153 | 145 | |
| select_item | 153 | 47 | |
| select_promotion | 127 | 90 | |
| add_to_cart | 100 | 59 | |
| ads_conversion_About_Us_1 | 99 | 96 | ★ |
| generate_lead | 93 | 45 | ★ |
| profile_complete | 66 | 62 | |
| next_event_fetch_failed | 62 | 42 | |
| purchase | 39 | 35 | ★ |
| checkout_field_started | 30 | 15 | |
| checkout_error | 28 | 14 | |
| click | 18 | 12 | |
| select_content | 18 | 13 | |
| in_app_browser_checkout_blocked | 12 | 9 | |
| add_payment_info | 10 | 10 | |
| in_app_browser_copy_link | 10 | 8 | |
| share | 6 | 3 | |
| targeted_event_not_found | 6 | 6 | |
| in_app_browser_banner_dismissed | 3 | 3 | |
| in_app_browser_checkout_override | 2 | 1 | |
| targeted_event_missing_id | 1 | 1 | |

**Only 3 events are configured as key events:**

| key event | count | value | revenue |
| --- | ---: | ---: | ---: |
| ads_conversion_About_Us_1 | 99 | $0.00 | $0.00 |
| generate_lead | 93 | $92.00 | $0.00 |
| purchase | 39 | $1,061.12 | $1,061.12 |

Carrying a real event **value** but zero key-event count — funnel steps, not
conversions, per `ga4-nightly-summary.js`'s standing warning:

| event | key events | event value |
| --- | ---: | ---: |
| view_item | 0 | $16,479.43 |
| begin_checkout | 0 | $3,861.51 |
| add_to_cart | 0 | $2,529.00 |
| add_payment_info | 0 | $284.90 |

### Which channels actually produce which key events (top 10)

| key event | source / medium | count | value |
| --- | --- | ---: | ---: |
| ads_conversion_About_Us_1 | googleads / paid | 51 | $0.00 |
| ads_conversion_About_Us_1 | googleads / (not set) | 16 | $0.00 |
| ads_conversion_About_Us_1 | googleads / offline | 16 | $0.00 |
| generate_lead | (direct) / (none) | 16 | $16.00 |
| generate_lead | Facebook / paid_social | 12 | $12.00 |
| generate_lead | eventbrite / listing | 12 | $12.00 |
| ads_conversion_About_Us_1 | googleads / cpc | 11 | $0.00 |
| purchase | eventbrite / listing | 11 | $290.39 |
| generate_lead | email / newsletter | 7 | $7.00 |
| purchase | (direct) / (none) | 6 | $169.94 |

`ads_conversion_About_Us_1` — retired as a key event 2026-08-25 but still
collected (§3b, settled) — is **still 99 of the property's 231 window-wide key
events (43%)**, all $0-value `googleads`-tagged landing-page loads on a Google
Ads account that has been dark since 07-24 (see §6). This is historical
accrual, already documented, not a new problem; restating because it is worth
one sentence any time key-event totals get quoted headline-style, so nobody
reads 231 as "231 leads or sales."

---

## UTM AND TAGGING GAPS

Ranked by sessions affected. LIVE = produced a session in the last closed week
(from 20260829); stale = within the last four closed weeks; DEAD = older.

### 1. Fragmentation — one advertiser, many GA4 rows (largest first)

**facebook — 11 variants (5 still live), 2,484 sessions, 29 key events,
$200.44 combined:**

| raw row | sessions | key events | revenue | status | last seen |
| --- | ---: | ---: | ---: | --- | --- |
| `Facebook / paid_social` | 1,610 | 15 | $97.47 | LIVE | 20260906 |
| `facebook / paid_social` | 435 | 5 | $0.00 | stale | 20260811 |
| `fb / paid_social` | 209 | 0 | $0.00 | LIVE | 20260906 |
| `m.facebook.com / referral` | 63 | 0 | $0.00 | LIVE | 20260905 |
| `facebook / social` | 61 | 3 | $47.99 | stale | 20260818 |
| `facebook.com / referral` | 37 | 0 | $0.00 | LIVE | 20260905 |
| `Facebook / paid` | 26 | 0 | $0.00 | DEAD | 20260609 |
| `eventsmanager.facebook.com / referral` | 20 | 3 | $0.00 | stale | 20260812 |
| `Facebook / organic` | 19 | 2 | $54.98 | stale | 20260819 |
| `Facebook / social` | 3 | 0 | $0.00 | LIVE | 20260902 |
| `l.facebook.com / referral` | 1 | 1 | $0.00 | stale | 20260817 |

**The `fb / paid_social` row above is not old fragmentation — it started
2026-08-30 and is ~90% Loxleys' new prime-rate Traffic ads** (HEADLINE,
Mechanism 1). Everything else in this cluster predates it.

**instagram — 2 variants (both live), 754 sessions, 6 key events, $82.47
combined:** `Instagram / paid_social` (625, LIVE 20260905) and `ig /
paid_social` (129, LIVE 20260905) — the latter is essentially 100% Loxleys,
same mechanism, same 08-30 start date.

**email — 6 variants (3 still live), 257 sessions, 26 key events, $125.45
combined:** `email / email` (117, stale), `email / nurture` (53, LIVE),
`email / newsletter` (46, LIVE), `email / returning` (19, LIVE), `email /
postevent` (18, DEAD), `Email / organic` (4, stale).

**lp — 3 variants (0 still live), 169 sessions, 1 key event, $0 combined:**
all stale-or-dead; this is the internal self-referral pattern (§2 below), not
an ad channel.

**google — 3 variants (1 still live), 141 sessions, 11 key events, $109.96
combined:** `google / organic` (129, LIVE), `google / cpc` (11, stale),
`Google / (not set)` (1, DEAD).

**googleads — 5 variants (0 still live), 127 sessions, 94 key events, $0
combined:** all DEAD (last seen 20260611–20260824) — this is the retired
`ads_conversion_About_Us_1` accrual from the "which channels produce key
events" section above, not live spend. Google Ads itself has been dark since
07-24; see ALSO #2.

### 2. Our own site tagging its own internal links (291 sessions, 2 still live)

| row | sessions | key events | revenue | status | last seen |
| --- | ---: | ---: | ---: | --- | --- |
| `lp / (not set)` | 163 | 1 | $0.00 | stale | 20260827 |
| `get_tickets_block / (not set)` | 61 | 1 | $27.49 | LIVE | 20260904 |
| `matches / (not set)` | 32 | 4 | $27.49 | LIVE | 20260831 |
| `matches / web` | 26 | 0 | $0.00 | stale | 20260812 |
| `lp / (none)` | 3 | 0 | $0.00 | stale | 20260816 |
| `lp / paid_social` | 3 | 0 | $0.00 | stale | 20260822 |
| `matches / (none)` | 2 | 0 | $0.00 | stale | 20260827 |
| `sticky_ticket_bar / (not set)` | 1 | 0 | $0.00 | stale | 20260820 |

Two rows still live (93 sessions); the rest is history carried for the record,
not a live action item.

### 3. Broken and placeholder values

| where | value | rows | sessions | key events | status |
| --- | --- | ---: | ---: | ---: | --- |
| utm-content (content) | `(empty string)` | 5 | 76 | 0 | — |
| utm-content (campaign) | `<campaign-name>` | 2 | 69 | 41 | — |
| traffic-by-source | `(not set)` | 1 | 54 | 0 | LIVE 20260906 |
| traffic-by-source | `[object Object] / undefined` | 1 | 36 | 0 | DEAD 20260710 |
| utm-content (campaign) | `undefined` | 1 | 36 | 0 | — |
| traffic-by-source | `(data not available)` | 1 | 10 | 1 | LIVE 20260905 |

`<campaign-name>` (41 key events, $0) is the already-resolved legacy artifact
from an archived June ad, documented in `META_ADS_REVIEW_2026-09-02.md` — not
reopening it.

### 4. Obfuscated tags — the scrambled email string, third time

| raw | decoded | sessions | key events | revenue |
| --- | --- | ---: | ---: | ---: |
| `Ybadbfgfe \| Zbfgfe Yvfg / email` | `Lancaster \| Master List / email` | 129 | 0 | $0.00 |

Same 129 sessions, same 2026-09-03 date, same $0 result as the 09-04 and 09-05
reports — this is the identical historical batch, not a new occurrence
recurring weekly (my "recent week" bucket happens to include 09-03, which is
why it shows up in this report's weekly deltas too). See NEEDS TAYLOR INPUT
(3rd ask).

### 5. Campaigns spending sessions and returning nothing (≥20 sessions, 0 key events)

| campaign | utm_content | sessions |
| --- | --- | ---: |
| Augweek3_lancaster | proof_rsa1 | 462 |
| Augweek1_philly | proof_rsa1 | 358 |
| summer2026_philly | week1_rsa1 | 273 |
| Augweek1_lancaster | proof_rsa1 | 223 |
| week2_Solution | 120249507097940542 | 212 |
| LX_202609 | lx_prime_male_noplan | 153 |
| f60ccdc363-... (scrambled) | zd_avtybadbfgfe | 129 |
| week3_Women | 120250119018970542 | 116 |
| LX_202609 | lx_prime_female_showup | 80 |

`LX_202609` appears twice here — 233 combined sessions, 0 key events — the
same Loxleys Traffic mechanism as the HEADLINE, now visible from the
campaign-name side rather than the source/medium side.

### 6. utm_content shared across campaigns (violates `content/brand.json`)

`proof_rsa1` spans 7 different named campaigns; `Tellus+AfterDark:+Singles+
Edition+Retargeting` spans 2; `mc_figlancaster` spans 2. Unchanged from prior
reports.

### 7. Auto-tagging overwrote a manual campaign tag

`Campaign #1` (Google auto-tag) replaced `week1_math` on 18 sessions — carried
from prior reports, not re-investigated tonight.

---

## ALSO IN THE REPORT

### 1. Meta this week: $153.42 across 7 campaigns — two are brand new, built the day after PR #449's headline

| campaign | spend | impressions | clicks |
| --- | ---: | ---: | ---: |
| Marion Court \| Traffic | $54.20 | 8,953 | 201 |
| Campaign 1 Event 3 Good Good Campaign | $28.15 | 4,588 | 152 |
| Marion Court Retargeting | $34.75 | 1,669 | 18 |
| Loxleys \| Traffic | $18.28 | 2,736 | 219 |
| Campaign 1 Event 4 Good Good Campaign-Retargeting | $12.65 | 521 | 16 |
| Marion Court \| Sales *(new)* | $4.12 | 289 | 5 |
| Loxleys \| Sales *(new)* | $1.27 | 133 | 6 |

Window `20260830-20260905`; no week-over-week claim per §9 (overlaps last
report's window by 6 of 7 days). The two new rows are tiny here only because
they were built mid-window: commit `600a0646` (2026-09-05 14:02 ET) rebuilt
Loxleys onto a Sales objective — paused Traffic, created a new campaign from
scratch because objective, optimization_goal, attribution_spec and url_tags
are all creation-only fields — and `f047ecf8` (14:46 ET, same day) started it
live at a budget-ladder-derived rate and added a T-3 "hail mary" Marion Court
Sales campaign for the 09-08 event. Both commits explicitly retract PR #449's
5.75-ROAS Loxleys headline as measuring pre-ad organic/Eventbrite sales
credited to ads that didn't exist yet — "same error class as the headline
#446 retracted." I am citing this as background for why tonight's Meta table
looks the way it does; I did not re-verify the Meta/Firestore side myself,
and none of tonight's GA4 numbers depend on it. **`Loxleys | Traffic` is still
showing $18.28 of spend this window** (per this same CSV) even though the
commits describe it as paused starting 09-05 — consistent with a mid-window
pause, not a discrepancy.

### 2. Google Ads: the standing-summary script's "$14.46 in the last 7 closed days" is wrong — verified against the raw daily file, and it is still dark

`ga4-nightly-summary.js` reports "Spend on the last 7 CLOSED days: $14.46 —
the account is still accruing cost." That would reopen a settled §3b question,
so I checked it against `ga4-api-google-ads-cost-daily-2026-09-06.csv`
directly: **the last dated row in the entire file is 2026-07-24**
(`Website traffic-Search-1, $4.121984`). Every row after that is the
lifetime-total "Grand total" line (`,,37.91251299999999,114,509,Grand total`)
— which has 6 comma-separated fields against the header's 5, so whatever the
script's "last 7 days" logic is doing with it, it is not reading real recent
spend. **Real conclusion: nothing has changed. Google Ads has now been dark
44 consecutive days (07-24 → 09-06), longer than any prior report stated. §3b
stays settled, not reopened.** See zero-risk fixes for the script bug.

### 3. Landing pages taking traffic and returning nothing

| landing page | sessions | users |
| --- | ---: | ---: |
| *(blank)* | 41 | 40 |
| (not set) | 39 | 30 |
| /signup | 15 | 11 |

The blank and `(not set)` rows are almost certainly missing-parameter
sessions, not real pages. `/signup` is real — I read `public/signup.html`
directly: it fires `lead_form_started`/`generate_lead` correctly (line
974/986) and is not broken; it is a **de-emphasized membership page** whose
own copy tells visitors "Monthly memberships are coming soon... for now, grab
a ticket above" because membership is shelved (per `ANALYTICS_CONTEXT.md`
§3b). Zero conversions on 15 sessions of a page actively steering people away
from its own primary action is expected, not a defect — and too small a
sample to read a rate from regardless (§12).

### 4. Same landing page, a source that DOES convert — so the page isn't the problem

| landing page | dead source | its sessions | converting source (same page) | its sessions | its key events |
| --- | --- | ---: | --- | ---: | ---: |
| /lp | facebook / paid_social | 419 | googleads / paid | 56 | 51 |
| /lp | fb / paid_social | 191 | googleads / paid | 56 | 51 |
| /event | scrambled email row | 129 | eventbrite / listing | 90 | 22 |
| /admin | lp / (not set) | 106 | facebook / paid_social | 13 | 5 |

This is the same conclusion prior reports reached: `/lp`'s CTA has already
been extensively redesigned (08-22) and isn't the explanation for paid
social's low conversion — the traffic quality is. Not re-investigating the
page itself again tonight.

### 5. Funnels — window-wide, spans two instrumentation eras, read as shape not trend

`session_start → view_item → begin_checkout → purchase`: 3,974 → 384 (24.0%
of the 9.7% overall) → 92 (15.2%) → 14 (100% of those who got that far).
**Caveat carried from `ANALYTICS_METHOD.md` §4:** `/lp` (2,858 of the 3,974
session-starts in the checkout-by-landing-page cut) did not fire `view_item`
at all before 2026-09-03 — so this funnel blends a regime where the single
largest landing page contributed zero `view_item` with four days where it
started contributing. Read the 24.0% figure as "the current definition
applied to the whole window," not as a stable rate. The two checkout ratios:
add_to_cart÷begin_checkout 38.0% (100/263), purchase÷begin_checkout 14.8%
(39/263) — both roughly in line with the post-09-03 benchmarks noted in prior
reports. Checkout errors unchanged: 28 events (18 card_incomplete, 8 not-set,
1 declined, 1 other) — flat for several pulls running.

### 6. transaction_id reuse — still open, still not investigated

16 distinct ids carry 39 transactions; 5 ids appear more than once (max 8 on
one id), 5 span more than one date. Surfaced 09-04 (PR #200), carried
unexamined through 09-05 and tonight. Still flagged, not a new number.

### 7. Additivity — closes cleanly

`revenue-by-source` and `revenue-daily` both total $1,061.12 / 39 transactions
— $0.00 gap. `items-daily` and `revenue-by-item` close with each other at 41
items / $968.60. The $92.52 gap against the $1,061.12 transaction total is the
documented 2-for-1 item-count effect (#205), not a new discrepancy. Coverage:
**46 of 46 tables represented**, see Coverage section below.

---

## NEEDS TAYLOR INPUT

1. **The scrambled email UTM string** (`Ybadbfgfe | Zbfgfe Yvfg / email`, 129
   sessions, all dated 2026-09-03, $0 conversions) needs someone with the
   email platform's send history to identify which campaign this was and fix
   the merge-tag failure at the source. I can see the GA4 symptom, not the
   email-vendor side. **(3rd ask — 1st on 09-04, 2nd on 09-05/PR #449, still
   unresolved.)**

Nothing else tonight rises to a judgment call. `ANALYTICS_CONTEXT.md` §3b was
checked in full: internal-traffic filter, `ads_conversion_About_Us_1`, Google
Ads (reconfirmed dark, see ALSO #2), and Marion Court's keep-as-configured
decision all stay settled — the new Marion Court Sales campaign is a factual
update to that item, not a reopening of the decision itself.

---

## Zero-risk fixes — described only, NOT applied

1. **Check the live Eventbrite listing(s)** for whatever event(s) are
   currently promoted there. `eventbrite / listing` sessions fell 66→15
   (−77%) with a clean cliff on 09-01 (HEADLINE, Mechanism 2) and this pull
   has no Eventbrite URL on disk to check directly — the property's
   best-converting real channel may have gone stale, sold out, or been
   unpublished. This is a two-minute check for whoever has the Eventbrite
   dashboard open, not a judgment call.
2. **Fix `ga4-nightly-summary.js`'s "last 7 closed days" Google Ads spend
   calculation.** It reports $14.46 of recent spend that does not exist in
   the underlying daily CSV (ALSO #2) — almost certainly mis-parsing the
   malformed 6-field "Grand total" row against the 5-column header. Left
   as-is, a future unattended run could report this number without the
   manual cross-check this report did, and wrongly reopen a settled §3b
   question.
3. **Fix the `Facebook`/`Instagram` vs `fb`/`ig` UTM casing on Loxleys' ads.**
   Whatever generates `utm_source` for the `lx_prime_male_noplan` /
   `lx_prime_female_showup` ad set pair uses lowercase `fb`/`ig` where every
   other live campaign uses `Facebook`/`Instagram` — this is what makes
   Mechanism 1 in the HEADLINE look like a traffic collapse instead of the
   flat-to-growing reality. (Moot if the Traffic campaign stays paused per
   the 09-05 rebuild, but worth fixing at the source if it or a similar
   campaign is rebuilt again.)
4. **Add an item-name × session-source/medium joined table to the nightly
   pull.** Carried from the 09-05 report — this is now the second time
   (Marion Court, then Loxleys) that "which channel actually sold this
   specific event's tickets" needed a join the current tables can't do.
5. Carried, unchanged: investigate `transaction_id` reuse (PR #200); add a
   worked Loxleys/§7 example to `ANALYTICS_METHOD.md`; add `reach`/`frequency`
   to the Meta pull; note that `meta-insights-<date>.csv` is named for the
   window's last day, one day behind the pull date. None applied yet.

---

## Caveats

- **Which `ANALYTICS_METHOD.md` sections were load-bearing tonight:** §1
  excludes 09-05/09-06 from every trend; §4 governs the funnel-shape caveat
  above (`/lp` not firing `view_item` before 09-03); §7 is why GA4 revenue is
  never called total revenue; §9 is why no Meta week-over-week claim is made;
  §10's 09-03 entry is why the funnel numbers are read as shape-not-trend;
  §12 is why Paid Other/Cross-network's high conversion rates and the
  /signup sample are not treated as findings.
- **What I did not verify.** The Meta/Firestore side of PR #449's retraction
  (commits `600a0646`/`f047ecf8`) — cited for context only, not re-derived.
  Which source/medium the Eventbrite-listing sessions that DID convert this
  window actually came through — no table joins item or listing to
  source/medium. Whether the live Eventbrite listing(s) are actually down —
  flagged, not checked, no URL on disk. The remaining tables not discussed
  above (`by-day-hour`, `users-daily`, `page-views`, `weekly-trend`,
  `session-quality-daily`, `os-browser`, `paid-cost-vs-sessions`,
  `cohort-retention`, `audiences`) were present in the standing summary and
  skimmed; nothing alarming found, not analysed in depth.
- **Parsing.** Every file read from its own real header after the `#` block;
  Grand-total rows excluded from row-level aggregation except where explicitly
  used as an independent additivity check. No source CSV was moved, renamed,
  or modified. No scratch files were left in this checkout (the weekly-delta
  aggregation script ran from the session's own scratchpad directory, outside
  the repo).

---

## Coverage

**46 of 46 tables represented**, per `ga4-nightly-summary.js`:

| table | rows | in report |
| --- | ---: | --- |
| attribution-credit | 50 | yes (window totals) |
| audiences | 2 | yes (skimmed) |
| by-day-hour | 168 | skimmed, nothing alarming |
| by-device | 3 | yes |
| channel-groups | 11 | yes |
| checkout-error-reasons | 2 | yes |
| checkout-errors | 4 | yes |
| cities | 986 | yes (top rows) |
| cohort-retention | 21 | skimmed, §1(c) open cell still correctly excluded |
| daily-by-source | 742 | yes (weekly-delta mechanism analysis) |
| daily-trend | 100 | yes |
| events | 36 | yes, in full |
| events-by-source | 700 | yes (top 20 key-event rows) |
| first-user-tagging | 131 | yes (Loxleys campaign attribution) |
| funnel-by-channel | 37 | yes |
| funnel-by-device | 13 | skimmed, consistent with by-channel |
| funnel-checkout-by-landing-page | 36 | yes |
| funnel-waitlist-sequence | 2 | skimmed, unchanged shape |
| funnel-webview-vs-normal | 8 | skimmed, nothing alarming |
| geo-country-language | 61 | yes (suspect ZZ bucket) |
| google-ads-by-network | 4 | skimmed, matches google-ads-cost |
| google-ads-cost | 2 | yes (§3b reconciliation) |
| google-ads-cost-daily | 24 | yes, in full (ALSO #2 verification) |
| google-ads-creatives | 2 | skimmed, unchanged |
| items-daily | 30 | yes (additivity) |
| key-events | 7 | yes, in full |
| key-events-by-source | 125 | yes (top 10) |
| key-events-daily | 100 | skimmed, informs §1 exclusions |
| landing-by-source | 257 | yes (ALSO #4) |
| landing-pages | 31 | yes |
| new-vs-returning | 4 | yes |
| os-browser | 30 | skimmed, nothing alarming |
| page-views | 72 | skimmed, nothing alarming |
| paid-cost-vs-sessions | 125 | skimmed, nothing alarming |
| promotions | 7 | skimmed, consistent with prior reports |
| revenue-by-item | 6 | yes |
| revenue-by-source | 14 | yes (additivity) |
| revenue-daily | 64 | yes (additivity) |
| session-quality-daily | 100 | skimmed, nothing alarming |
| traffic-by-source | 69 | yes (broken-value rows) |
| transactions | 32 | yes (transaction_id reuse) |
| users-daily | 100 | skimmed, consistent with daily-trend |
| utm-ad-detail | 301 | yes, in full (Loxleys attribution, UTM section) |
| utm-content | 93 | yes (broken/shared values) |
| webview-by-event | 80 | skimmed, nothing alarming |
| weekly-trend | 15 | skimmed, consistent with two-week comparison |
