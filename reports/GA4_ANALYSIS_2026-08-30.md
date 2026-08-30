# GA4 analysis — 2026-08-30

**This run made ZERO code changes.** The only file added to the repository is this
report. No file in `public/`, `api/`, `lib/`, `scripts/`, `content/`, `vercel.json`,
`package.json` or the Firestore rules was created, edited or deleted, and no GA4 or
Meta CSV in the Night Tasks folder was moved, renamed or altered. Everything below
that looks like a fix is a *description* of a fix for a human to apply.

`ANALYTICS_CONTEXT.md` was read in full. Its stamp reads **"Last updated: 2026-08-26."**
That is older than the newest report in `reports/` (`GA4_ANALYSIS_2026-08-28.md`), which
by that file's own sync rule is a fork signal — but it is a false positive here: the body
of the sandbox copy contains the `SPLIT 2026-08-28` header, the `SHIPPED 2026-08-28
(PR #311)` getaways note and the 2026-08-27 `lead_form_started` cause, so the **content**
is current through 08-28 and only the **stamp** was not bumped. Treated as current.
The tracked sibling `reports/ANALYTICS_METHOD.md` was also read and, per its own rule,
was treated as the authority wherever the two overlap on a measurement question.

---

## 0. What was analysed, and why this one

**Focus: Prompt 9 (GA4 → site improvement suggestions).**

Tonight is the **first analysis ever run against the GA4 Data API export**. That
pipeline (`scripts/fetch-ga4-tables.js`, shipped **2026-08-29 in PR #322** —
*"Pull the core GA4 tables from the Data API, so a missed export is not a missed
night"*) writes nine `ga4-api-*.csv` tables. No report in `reports/` mentions
`ga4-api-` or the Data API; `grep -rl` over the whole directory returns nothing.

Freshness was decided from each file's own `#` header, never filenames or mtimes:

| source | window in the file's own header | verdict |
|---|---|---|
| 9 × `ga4-api-*-2026-08-30.csv` | `20260519-20260830`, pulled **2026-08-30 06:00 UTC** | **FRESH — analysed** |
| 9 × `ga4-api-*-2026-08-29.csv` | `20260519-20260829`, pulled 2026-08-29 22:04 UTC | prior snapshot, used as control |
| 38 × `download*.csv` (UI export) | `20260519-20260827`, unchanged | **STALE** — this is the identical drop `GA4_ANALYSIS_2026-08-28.md` analysed and the 08-29 run rejected |
| `meta-insights-2026-08-29.csv` | `20260823-20260829`, 9 campaigns | **FRESH — analysed** |
| `meta-insights-2026-08-27.csv` | `20260821-20260827`, 11 campaigns | prior pull, **overlaps 5 of 7 days** — see §G |

Both run logs were checked before choosing (the `## NIGHTLY RUN LOG` section of
`sparkdate-nightly-claude-code-prompts.md`, and `TONIGHT_PROMPT.md`, which is still
dated 2026-08-14 and queues nothing). Recent focuses: 08-29 M8 content freshness,
08-28 GA4, 08-27 M7 accessibility. GA4 has not run since 08-28, and it has *never*
run against this data source.

Property `sparkdate-philly` / `536859339` / `G-21YLCC35F1`. Headline totals for
2026-05-19 → 2026-08-30: **4,409 sessions, 3,105 users, 224 key events, $978.65,
36 transactions.**

---

## A. HEADLINE — 44.2% of this property's "key events" are a retired, $0 page-load event, and it is concentrated on the one page that takes half the traffic

The key-event total reconciles **exactly**, with no residual:

| event | count | share of 224 | value |
|---|---|---|---|
| `ads_conversion_About_Us_1` | **99** | **44.2%** | $0.00 |
| `generate_lead` | 89 | 39.7% | $0.00 |
| `purchase` | 36 | 16.1% | $978.65 |
| **total** | **224** | 100% | |

`99 + 89 + 36 = 224`, matching the grand total in every one of the three files that
carries a `keyEvents` metric. So the decomposition is complete, not an estimate.

`ads_conversion_About_Us_1` is defined in GA4 as **`Page load: /lp?utm_source=googleads`**
— it does not fire on an About Us page (`ANALYTICS_CONTEXT.md` §1). All 99 sit on
Google-tagged rows, which is exactly what that definition predicts:

```
googleads / paid          51      googleads / offline    16
googleads / (not set)     16      googleads / cpc        11
google / cpc               3      (data not available)    1      email / email  1
```

**The consequence that matters.** Because that event fires only on `/lp`, all 99 of
its firings are inside `/lp`'s 121 key events. So:

> **`/lp` takes 2,427 of 4,409 sessions (55.0%) and shows 121 key events — but at
> most 22 of those (121 − 99) are a real lead or a real sale. That is ≤0.91% of its
> sessions, against an apparent 4.99%. The headline number for the site's single
> biggest page is inflated 5.5×.**

This is *not* a re-ask of the settled retirement question (§3b) — the decision to
unmark it on 2026-08-25 stands and is not being reopened. The point is narrower and
new: **the `keyEvents` metric in this export cannot be used as a denominator without
subtracting this event first**, and nothing in the export labels it. Channel-group
`Paid Other` (109 sessions, 101 users, **63 key events, $0.00**) is the same artifact
wearing a channel name.

**Re-check in ~1 week:** pull `ga4-api-events-2026-09-06.csv` and confirm
`ads_conversion_About_Us_1` is still frozen at **99**. It read 99 in the 08-28 report
and 99 in both pulls tonight, consistent with Google Ads being dark since ~2026-07-24.
If it moves off 99, something re-enabled paid search and that is a separate story.

---

## B. HEADLINE — the `source:` gtag pollution is confirmed at the commit level, and it splits cleanly into a frozen half and a live half

`GA4_ANALYSIS_2026-08-28.md` found that GA4 is recording our own UI element names as
acquisition sources, and named `get_tickets_block` as the proof because that string
exists nowhere as a URL or UTM. Tonight that mechanism was **confirmed from git
history on an unshallowed clone (598 commits)**, with dates:

| value | introduced as `source:` | removed | live as a source for |
|---|---|---|---|
| `get_tickets_block` | `58c83b8` **2026-06-05** — `gtag('event','begin_checkout',{ source: 'get_tickets_block' })` | `ea7faa8` **2026-08-21** (PR #204) | 77 days |
| `sticky_ticket_bar` | `d3b686c` **2026-08-07** (PR #155) | `ea7faa8` **2026-08-21** (PR #204) | 14 days |

`git show ea7faa8` removes exactly three `source:` lines — `get_tickets_block`,
`sticky_ticket_bar`, and one `source: 'lp'`. The 08-28 report said two instances were
fixed "by accident" in that commit; it was three.

**So the two most alarming-looking rows are frozen and cannot grow.** Both windows
end 2026-08-21, inside this export's range, which is why they still appear:

| polluted row | sessions | users | key events | revenue | status |
|---|---|---|---|---|---|
| `lp / (not set)` | 163 | 17 | 1 | $0 | **LIVE** |
| `get_tickets_block / (not set)` | 60 | 6 | 1 | $27.49 | frozen at 2026-08-21 |
| `matches / (not set)` | 31 | 2 | 4 | $27.49 | **LIVE** |
| `matches / web` | 26 | 4 | 0 | $0 | #237 UTM bug, fixed |
| `lp / (none)`, `lp / paid_social`, `matches / (none)`, `sticky_ticket_bar / (not set)` | 9 | 6 | 0 | $0 | mixed |
| **total** | **289** | **35** | **6** | **$54.98** | |

**The live half is still shipping.** Twelve `gtag('event', …)` call sites still pass a
parameter literally named `source`, so `lp`, `events`, `event` and `matches` keep
accruing:

```
public/event.html:1041     source:'event'
public/events.html:1857    source:'events'      (in_app_browser_escape_attempt)
public/events.html:1870    source:'events'      (in_app_browser_detected)
public/events.html:1888    source:'events'      (in_app_browser_copy_link)
public/lp.html:647,678,700,747,757,864,962      source:'lp'   (7 sites)
public/matches.html:263    source:'matches'     (select_content)
```

`lp.html:678` fires `in_app_browser_detected` on essentially every `/lp` load, which is
why `lp / (not set)` is the largest polluted row. The 08-28 report listed 11 sites;
tonight's count is **12** (line numbers have shifted since — `lp.html:962`, the
`next_event_fetch_failed` call added by PR #299, is the extra one, and it was added
*after* the problem was known).

**Honest limit.** The 08-28 report flagged that `event` (singular) was the one live
value not observed as a source row. That is still true in tonight's export — there is
no `event / …` row in `ga4-api-traffic-by-source-2026-08-30.csv`. The mechanism is
confirmed for four of five values.

**Re-check in ~1 week:** `lp / (not set)` sessions in `ga4-api-traffic-by-source-2026-09-06.csv`.
It should keep climbing (163 tonight) until the parameter is renamed, and stop dead
afterwards. `get_tickets_block` should stay at exactly 60.

---

## C. HEADLINE — "Facebook" is four GA4 rows that behave like four different channels, and one of them is sending traffic with no `eventId` at all

Case and macro fragmentation splits paid Facebook across four rows. Summed, per
`ANALYTICS_CONTEXT.md` §3: **1,975 sessions, 1,809 users, $97.47, 3 purchases.** But
the rows do not behave alike, and the differences are not small:

Rates below are **share of that row's users**, not of its sessions — an event can fire
more than once in a session, so an events-over-sessions figure is not a percentage of
anything. Both the event count and the user count are given.

| row | sessions | users | `targeted_event_landing` | % of users | `view_item` | % of users | `generate_lead` |
|---|---|---|---|---|---|---|---|
| `Facebook / paid_social` | 1,426 | 1,309 | 1,147 ev / 1,009 u | **77.1%** | 98 ev / 51 u | 3.9% | 11 |
| `facebook / paid_social` | 435 | 390 | **0 / 0** | **0.0%** | **0 / 0** | **0.0%** | 5 |
| `fb / paid_social` | 88 | 88 | 72 ev / 72 u | **81.8%** | 15 ev / 15 u | 17.0% | 0 |
| `Facebook / paid` | 26 | 22 | **0 / 0** | **0.0%** | **0 / 0** | 0.0% | 0 |
| `Instagram / paid_social` | 439 | 378 | 214 ev / 199 u | **52.6%** | 189 ev / 138 u | 36.5% | 3 |

**The `facebook / paid_social` row is the finding.** 435 sessions — 22% of paid
Facebook — fire `in_app_browser_detected` **353 times, from 232 of the row's 390 users
(59.5%)**, so most are unambiguously arriving in a Meta webview on one of `/lp`,
`/events` or `/event`. Yet they fire `targeted_event_landing` **zero** times.
`Facebook / paid` (26 sessions) is at zero too, so **461 sessions / 412 users sit at a
hard 0.0%** while the two neighbouring rows sit at 77.1% and 81.8%.

Reading `public/lp.html:746-758` narrows what that can mean. `targeted_event_missing_id`
only fires when `?eventId=` is present *and blank*; `targeted_event_landing` only fires
when it is present *and non-blank* — and **both fire only on `/lp`**, so a session that
lands on `/events` or `/event` reads zero on both regardless of what its URL carried.
(`view_item` = 0 does not close that hole: on `/events` it fires when the user opens an
event's modal — a click, per the "moved to dialog-open" note in `public/events.html` —
so an `/events` landing that never opened one also reads zero; only `/event`, 163
landing sessions property-wide, fires it on load.) What the zeros DO establish:
property-wide `targeted_event_missing_id` is **1**, and `next_event_fetch_failed` —
also `/lp`-only — fires **13 events from 11 users** in this row. Those 11 users
demonstrably reached `/lp` and carried **no `eventId` parameter at all**, so they got
`/lp`'s generic "soonest event" fallback rather than the event the ad was selling.
Whether all 435 sessions did the same, or some landed on `/events`/`/event` instead,
needs the `landingPage × sessionSourceMedium` table this report already asks for in
§H2 — either answer is a destination-URL defect on these ads.

**This partially answers standing open question 3** (`ANALYTICS_CONTEXT.md` §4:
*"Why is `targeted_event_landing` 64% in webview against 16% outside?"*, with the
hypothesis that non-webview paid traffic arrives without the parameter). The split is
**not** webview-vs-browser. It is **destination-URL-vs-destination-URL**: two Facebook
rows fire it at 80.4% and 81.8% while a third fires it at 0.0%, and the 0.0% row is
just as webview-bound as the other two (59.5% of its users against 68.8% and 67.0%).
A subset of ad destination URLs is defective — provably missing the parameter for the
11 users pinned to `/lp` above, or pointing somewhere other than `/lp` for the rest —
and the case of `utm_source` happens to travel with the defect.

**Hypothesis I tested and could NOT sustain — recorded so nobody re-runs it.** Instagram
looks like it clicks through **10× better** than Facebook: `view_item` reaches 36.5% of
Instagram's users (138 of 378) against 3.6% of paid Facebook's (66 of 1,809). And
`view_item` is (mostly) a genuine click signal: on `/events` it fires when the user
opens an event's modal — a click, per the "moved to dialog-open" note in
`public/events.html` — and only `/event` (163 landing sessions property-wide) fires it
on page load. The problem is the other direction: per `ANALYTICS_METHOD.md` §4,
`view_item` **cannot fire on `/lp` at all**, so a `/lp` visitor contributes a zero
however interested they were, and the comparison only measures behaviour if both rows
put the same share of users on pages that *can* fire it. They do not appear to:
Instagram fires `targeted_event_landing` for only **52.6%** of its users against paid
Facebook's **59.8%**, and **179 of Instagram's 378 users never fired it**, against
138 users observed firing `view_item` — so roughly half of Instagram's users may not
be landing on `/lp` at all. Destination mix explains the gap at least as well
as behaviour does, and this export has no landing-page × source cross-tab to separate
them. `ANALYTICS_CONTEXT.md` records that this exact event was "misread once already";
**not reporting an Instagram click-through win.**

What survives without depending on `view_item`: Instagram produced **$54.98 from 439
sessions ($0.125/session)** against paid Facebook's **$97.47 from 1,975 ($0.049/session)**.
That is 2.5×, but it rests on **2 purchases vs 3** — §5 sample-size territory. Direction
only; do not build a budget on it.

**Re-check in ~1 week:** `targeted_event_landing` on the `facebook / paid_social` row.
If the destination URLs are corrected it moves off zero; if it is still 0 of N, the ads
are still sending traffic to a generic landing page.

---

## D. `lead_form_started` has a second, independent reason not to be trusted

`ANALYTICS_CONTEXT.md` §1 already says to count `generate_lead` instead, because
`lead_form_started` missed a whole surface until PR #311 (2026-08-28). Tonight's export
adds a different problem at the other end:

| row | sessions | users | `lead_form_started` | % of users | `generate_lead` |
|---|---|---|---|---|---|
| `fb / paid_social` | 88 | 88 | 76 ev / 76 u | **86.4%** | **0** |
| `m.facebook.com / referral` | 47 | 47 | 44 ev / 33 u | **70.2%** | **0** |
| `facebook.com / referral` | 29 | 29 | 16 ev / 13 u | **44.8%** | **0** |
| `Facebook / paid_social` | 1,426 | 1,309 | 70 ev / 70 u | 5.3% | 11 |
| `Instagram / paid_social` | 439 | 378 | 23 ev / 23 u | 6.1% | 3 |

**Those three small rows are 3.7% of all sessions (164 of 4,409) but 48.1% of all
`lead_form_started` events (136 of 283), and they produced zero leads between them.**
Rates of 86.4% and 70.2% of users are not what form-filling looks like next to the 5.3%
the main Facebook row produces. `fb / paid_social` also has 88 sessions from 88 users —
every session a new user — and 0 key events, 0 revenue.

I am **not** calling this bot traffic; the export has no device or user-agent dimension
and I did not check one. What I am saying is that any abandonment or start-rate figure
computed from `lead_form_started` is ~48% driven by 3.7% of sessions that never convert,
which is a second reason the 86% abandonment figure in older reports is an upper bound
and not a rate.

**Re-check in ~1 week:** whether `fb / paid_social` and `m.facebook.com / referral` are
still above 50% of users firing `lead_form_started` with 0 `generate_lead`. Post-#311 volume will step up
generally (§10 series break) — read the *per-row rate*, not the total.

---

## E. Engagement rate: a real-looking drop that I am refusing to call a drop

| block | sessions | engaged | rate |
|---|---|---|---|
| Aug 22–24 (post-site-change, **pre-filter**) | 439 | 241 | **54.9%** |
| Aug 26–28 (**post-filter**) | 441 | 137 | **31.1%** |

Nearly identical session volume, 23.8 points apart. It is tempting, and it is
**invalid**: the internal-traffic filter went Active on **2026-08-25**, exactly between
the two blocks, and `ANALYTICS_METHOD.md` §10 and `ANALYTICS_CONTEXT.md` §1 both say a
comparison spanning that date is not a behaviour read. Taylor's own visits are the most
engaged sessions on the property, so removing them moves this metric down mechanically.

A rough bound, offered as an order-of-magnitude check and not a decomposition: at the
~12% internal contamination measured on lead sessions, removing a ~100%-engaged 12%
from a 54.9% base lands near 48.8%, not 31.1%. That suggests the filter cannot account
for the whole move — but the 12% was measured on lead-generating sessions, not all
sessions, so it does not transfer cleanly. **Not a finding. A reason to look again with
clean data.**

The clean, one-sided series is only three days long: **08-26 42.4%, 08-27 20.9%,
08-28 27.6%.** Three points is not a trend.

One live-spend hypothesis worth holding for next week: `Marion Court | Traffic` is a
**traffic-objective** campaign (deliberate, per PR #296) and it spent **$41.94 in
08-23–08-29, 22.0% of the week**, buying 177 clicks at $0.2369 with 0 add-to-cart by
design. Cheap low-intent clicks landing on `/lp` would push engagement rate down
without anything being wrong. **This export cannot test that** — there is no daily ×
source table, only daily totals and lifetime source totals. See §H.

**Re-check on 2026-09-03**, when 08-26 → 09-01 are all finalised and give the first
seven-day block entirely on the post-filter side of the cliff. Compare it against
09-02 → 09-08 later, never against anything before 08-25.

---

## F. Commercial read — where the money and the spend actually are

**GA4 revenue is own-site only and misses ~55% of real ticket revenue** (`ANALYTICS_CONTEXT.md`
§1). Nothing below is business revenue; the admin dashboard is the truth. Item counts
also step up at 2026-08-21 from the 2-for-1 quantity fix (#205, `ANALYTICS_METHOD.md`
§10), so `itemsPurchased` mixes two definitions across this window; revenue does not.

| item | event date | viewed | carts | purchased | revenue | cart→purchase |
|---|---|---|---|---|---|---|
| Tellus AfterDark: Singles Edition | **2026-08-26 (past)** | 358 | 45 | 12 | $287.88 | 26.7% |
| SparkDate: Round 2 — Summer Nights | past | 21 | 7 | 8 | $199.92 | — |
| Founders Mixer | past | **0** | **0** | 8 | $192.93 | import artifact |
| Good Good Night @ Good Good Things | **2026-08-31 — tomorrow** | 140 | 27 | 6 | $149.94 | 22.2% |
| Sparkdate: The Loxley's Social | 2026-09-22 | 22 | 9 | 2 | $37.98 | 22.2% |
| SparkDate: Real People… Real Court (Marion Court) | 2026-09-08 | 44 | **9** | **1** | $24.99 | **11.1%** |

Founders Mixer at 8 purchases with **0 views and 0 carts in front of them** is the
documented server-side import path (`api/lead-signup.js` `IMPORT_CHANNELS`), not a
funnel.

**Marion Court's cart→purchase is the one number `ANALYTICS_CONTEXT.md` §3b named as
the trigger to reopen the discussion, and it moved the wrong way.** 08-26: 27/6/0.
08-28: 40/7/1 (14.3%). Tonight: **44/9/1 (11.1%).** Two more carts, no more sales.
n = 9 carts — stated because §5 requires it. This is the checkout-stage signal, which
§3b explicitly separates from the venue/ad-set decision. **The venue decision is not
being reopened.**

**Meta, week of 2026-08-23 → 08-29** (`meta-insights-2026-08-29.csv`, 9 campaigns,
$190.93, 21,278 impressions, 675 clicks, blended CPC $0.2829). Split by event:

| event | campaigns | spend | share | pixel purchases |
|---|---|---|---|---|
| **Good Good (08-31, tomorrow)** | 3 | **$94.23** | **49.4%** | 1 (on the $0-spend campaign) |
| Marion Court (09-08) | 3 | $67.40 | 35.3% | **0** — and 0 add-to-cart, 0 initiate-checkout |
| Tellus AfterDark (**08-26, already happened**) | 3 | $29.30 | 15.3% | 1 |

Two CPC outliers against the $0.2829 blended rate: **`Tellus …-Sales-Obj-Women` at
$2.2020 (7.8×)** for 5 clicks and **1** landing-page view, and **`Marion Court
Retargeting` at $1.0608 (3.8×)** for 24 clicks, 10 landing-page views, 0 carts. The
cheapest are `Good Good` at $0.1653 and `Marion Court | Traffic` at $0.2369 — the
latter converting nothing **by design**, not as a failure.

Two campaigns show conversions on **$0.00 spend** (`Good Good-Sale Obj Women`:
1 purchase; `Marion Court All Genders`: 1 landing-page view). That is attribution
crediting a click from before the window, not spend — do not divide by it.

**Highest-converting row in the whole property, by a distance:** `eventbrite / listing`
— 163 sessions, 79 users, **11 purchases, $290.39** (6.7% of sessions purchase, 29.7%
of GA4 revenue). Per §1 these are *not* the imported Eventbrite sales; they are people
who found a listing and then bought on our own site. Zero Meta budget points at that
path.

---

## G. Three consistency checks — two exact, one that failed usefully

1. **Channel group `Unassigned` = $345.37 = $290.39 + $27.49 + $27.49** — that is
   `eventbrite / listing` plus the two polluted UI-element rows, to the cent. So
   "Unassigned", the property's largest revenue channel group (35.3% of $978.65), is
   one real channel GA4 has no bucket for, plus §B's bug. It is not mystery traffic.
2. **Key events 99 + 89 + 36 = 224**, matching the grand total in three separate files
   (§A). No residual.
3. **A third check FAILED, and the failure is itself the useful result.** Summing each
   dimensioned table's rows against its own `Grand total` row shows that **counts are
   additive and session/user metrics are not**:

   | metric | behaviour |
   |---|---|
   | `keyEvents`, `totalRevenue`, `transactions`, `eventCount`, all four item metrics | **sum exactly**, to the cent, in every file |
   | `sessions` | over-sums by **+2.5% to +5.7%** (daily-trend 4,518 vs 4,409; channel-groups 4,563; landing-pages 4,566; traffic-by-source 4,573; cities 4,662) |
   | `totalUsers` | over-sums by **+4.7% to +407.6%** (events-by-source sums to 15,761 against 3,105) |

   `totalUsers` not summing is expected — a user spans days, cities and sources. **`sessions`
   over-summing by up to 5.7% is not obvious** and matters: it means a row's share of the
   stated 4,409 total and its share of the summed rows differ by a few points. `/lp` is
   55.0% of the stated total and 53.2% of the summed rows; both are quoted here as
   "2,427 sessions" with the denominator named. **No conclusion in this report turns on
   that difference**, and every rate in §§C–D is computed inside a single row (users who
   fired the event ÷ that row's users), which is unaffected.

---

## H. NEEDS TAYLOR INPUT

1. **Add `promotion_name` to the Data API pull.** *(3rd ask — escalated by the 08-26
   and 08-28 reports as their #1 item, and the new pipeline shipped 08-29 without it.)*
   `select_promotion` is 84 events and `view_promotion` is 178, so the sticky-bar CTR
   question from `ANALYTICS_CONTEXT.md` §4 open question 2 now has both a numerator and
   a denominator — and still cannot be answered, because
   `ga4-api-events-by-source-2026-08-30.csv` breaks events down by source only.
   `scripts/fetch-ga4-tables.js:115` is one dimension away from answering a question
   that has now been open across three reports. **This is a config/scope decision, not
   a code fix I would make unilaterally.**
2. **Two more dimensions worth the same decision, both of which blocked a conclusion
   tonight:** a `date × sessionSourceMedium` table (would have let §E test whether the
   traffic-objective campaign explains the engagement drop) and a
   `landingPage × sessionSourceMedium` table (would have settled §C's Instagram
   question instead of leaving it undecided). *(1st ask, new.)*
3. **The `facebook / paid_social` destination URLs — 435 sessions firing
   `targeted_event_landing` zero times, of which 11 users provably reached `/lp` with
   no `eventId` (§C).** *(1st ask, new.)* Which ads are they, and should their
   destinations carry the event? This is an ad-account change with money attached, so
   it is here and not in §I.
4. **Marion Court checkout stage: 9 carts, 1 sale (11.1%) against 22–27% everywhere
   else.** *(2nd ask — the 08-28 report raised the trigger; the number has since moved
   further.)* §3b named this as the only thing that reopens the discussion. Explicitly
   **not** re-raising the venue or ad-set configuration, which is settled.
5. **$29.30 (15.3% of the week's Meta spend) went to Tellus AfterDark campaigns for an
   event that happened 2026-08-26.** *(1st ask, new.)* The window spans the event date
   and this export has no daily Meta granularity, so I cannot say how much landed after
   it. Retargeting spend after an event may well be deliberate (feeding the pool, as
   with `Marion Court | Traffic`) — that is a budget judgement, not a defect.
6. **`Tellus …-Sales-Obj-Women` at $2.2020 CPC (7.8× blended) for 5 clicks and 1
   landing-page view.** *(1st ask, new — the 08-28 report's outlier, Marion Court
   Female at $4.32, is now at $0.00 spend, so this is a different campaign.)*
7. **Nothing on the paid side points at `eventbrite / listing`, the property's best
   converting row (11 purchases, $290.39, 6.7% of sessions).** *(1st ask, new.)*
   Whether to lean into that channel is a spend-allocation call.
8. **`West Chester, Pennsylvania`: 52 users but 423 sessions (8.13 sessions/user)**,
   19 key events, $82.47 — against Philadelphia's 1.17 and Lancaster's 1.41. It is not
   in the datacenter set. `ANALYTICS_CONTEXT.md` §1 notes cellular traffic from Taylor's
   phone was never in the internal filter's scope. *(1st ask, new.)* Worth a look before
   any per-user metric is quoted; I am not assuming what it is.

**No settled question was re-asked.** The internal-traffic filter, `ads_conversion_About_Us_1`'s
retirement, Google Ads being dark, the Marion Court venue/ad-set configuration, and
`next_event_fetch_failed` (#299) were each checked against §3b and deliberately left
alone. The `ads_conversion` and Marion Court items above are the *specific* follow-ons
§3b itself leaves open, not the settled decisions.

---

## I. Proposed zero-risk fixes — described, NOT applied

None of these were made. Each is for a human.

1. **Rename the `source` parameter at the 12 live `gtag('event', …)` call sites**
   listed in §B (e.g. to `fired_from`). This is what stops `lp / (not set)` and
   `matches / (not set)` from growing. Confirm in DebugView first — §B's mechanism is
   inferred from data plus git history, and no browser or GA4 UI was available tonight.
2. **Bump `ANALYTICS_CONTEXT.md`'s "Last updated" stamp to 2026-08-28.** Its body
   already contains 08-27 and 08-28 content; only the stamp lags, and that stamp is
   what the nightly fork check reads. It cost a paragraph of this report to rule out.
3. **Record in `ANALYTICS_CONTEXT.md` §1 that `get_tickets_block` and `sticky_ticket_bar`
   as sources are frozen at 2026-08-21** with the two commit hashes from §B, so future
   reports stop treating them as live and stop re-deriving the history.
4. **Record the key-event decomposition rule** — that `keyEvents` in any export covering
   dates before 2026-08-25 is ~44% `ads_conversion_About_Us_1` and must be netted out
   before it is used as a denominator (§A).
5. **Record the additivity rule for the Data API tables** (§G3): counts sum exactly,
   `sessions` over-sums by up to 5.7% and `totalUsers` by far more, so a row's "share of
   the property" must name which denominator it used. This belongs in the tracked
   `reports/ANALYTICS_METHOD.md` rather than the gitignored file, since it is purely a
   measurement rule.
6. **Refresh `ANALYTICS_CONTEXT.md` §1's campaign table** — now the **4th** report to
   flag it. It still lists `Campaign 1 Event 3 Good Good Campaign` as ending 2026-08-13
   while that campaign is the account's largest line at **$60.18** this week, and still
   omits `Marion Court | Traffic` ($41.94, 22.0% of the week).

---

## J. Caveats, method, and what I did not do

**Parsing.** Every `ga4-api-*.csv` was parsed from its real header after skipping the
`#` block; none contained stacked tables (unlike the UI `download*.csv` set). The
trailing `Grand total` row was excluded from row-level sums and used as a control.
**It did not match on every metric** — see §G3 for exactly which metrics are additive
and which are not; an earlier draft of this report asserted that it matched everywhere,
which was wrong, and the corrected version is reported rather than smoothed. One further
parsing trap worth recording: `ga4-api-landing-pages` contains **two** rows with an
empty first column — a genuine blank-landing-page row (81 sessions / 81 users / 2 key
events) and the `Grand total` row — so a parser that keys off "first column is empty"
silently mistakes one for the other. Take the last row. No column name was hardcoded. No
file was empty or malformed; nothing was guessed.

**Caveats that applied tonight, and how:**
- **§1 / §10 two-day tail** — applied, and **independently re-confirmed**. Across the
  08-29 22:04 UTC and 08-30 06:00 UTC pulls, **every day from 2026-05-30 to 2026-08-28
  reads identically**; the *only* row that moved is 2026-08-29 (99 → 133 sessions), and
  2026-08-30 reads 5 sessions / 0 engaged. 08-29 shows 2 engaged sessions in both pulls
  — the §1(a) signature. All engagement figures in this report stop at **2026-08-28**.
  The 08-28 report's recommendation to soften the rule from two days to one is **not
  supported tonight**: 08-27 read 142/2 in the 08-27 UI export and 153/32 here, so it
  took more than one day to settle. **Keep "drop two."**
- **§1(b) pull-time incompleteness** — the two pulls are 8 hours apart, so the delta
  between them is a partial slice and is reported as direction only, never a rate:
  +26 sessions, +37 users, +223 events, **+0 key events, +$0.00 revenue, +0
  transactions**, +30 `view_promotion`. Conversions may simply lag sessions in GA4
  processing; **no conclusion is drawn from the zeros.**
- **§1 `begin_checkout` 2026-08-21 boundary** — this window (05-19 → 08-30) spans it, so
  **no `begin_checkout` figure is trended anywhere in this report.** Its 209 events are
  quoted once, in §B, purely to show that `get_tickets_block / (not set)` carries 7 of
  them — which is the historical bug, not a funnel step.
- **§1 / §10 2026-08-25 internal-traffic cliff** — enforced in §E, which is the whole
  reason the 23.8-point engagement move is reported as *not a finding*.
- **§10 2026-08-28 series breaks** — `lead_form_started` (#311) and `view_promotion`
  (#310) are both mid-ramp. §D reads per-row rates, never totals; `view_promotion`'s
  148 → 178 growth across the two pulls is instrumentation arriving, and is labelled so.
- **§9 Meta rolling windows** — the two Meta pulls (`20260821-20260827` and
  `20260823-20260829`) **overlap on 5 of 7 days** and the campaign count changed 11 → 9,
  so **no week-over-week Meta comparison is made.** §F reports only within-window facts
  from the fresh pull. The one cross-pull statement — that the 08-28 report's $4.32-CPC
  outlier is now at $0.00 spend — is a presence/absence check, not a rate.
- **§1 GA4 revenue is own-site only** — stated at the top of §F; $978.65 is never
  presented as business revenue.
- **§4 `view_item` does not fire on `/lp`** — this is what killed the Instagram finding
  in §C rather than letting it into the headline: the opportunity to fire the event
  differs by landing page, so a cross-row rate is destination mix before it is behaviour.
- **§1 `lead_form_started` pairing gap** — stated in §D; `generate_lead` used for every
  actual lead count.
- **§1 datacenter denominators** — the cities table shows a floor of **~304 users** in
  hyperscale datacenter towns (Prineville 94, Lulea 63, Forest City 40, Council Bluffs
  27, Ashburn 23, Boardman 22, Altoona 17, Gallatin 12, Moses Lake 6), plus **354 users
  across 26 `(not set)` city rows**. Prineville, Lulea and Forest City each read exactly
  1.00 sessions/user. This is **not comparable** to the 205 / 210 figures in earlier
  reports — those came from the UI export's active-users metric; this is `totalUsers`
  from a different table whose own total (3,583) exceeds the property's 3,105 because
  users are counted once per city. **No per-user rate is quoted anywhere in this report.**
- **§1 Lancaster is a borough, not a county** — grouped before use: Lancaster County
  towns sum to **214 users / 303 sessions / 22 key events / $163.94** against the raw
  `Lancaster` row's 111 / 156 / 16 / $108.96.
- **§1 Facebook case fragmentation** — summed before quoting throughout §C.
- **§5 sample sizes** — every count below double digits is given as a count with its n:
  Instagram's 2 purchases, Marion Court's 9 carts and 1 sale, the $0-spend attributions.

**Data gaps that blocked specific conclusions** (all in §H): no `promotion_name`
breakdown, no `date × source` table, no `landingPage × source` table, no device or
platform dimension, no daily Meta granularity since 2026-08-23, and no Search Console
in the export (a gap the 08-29 report also named).

**What I did not have.** No browser and no GA4 UI access, so §B's mechanism and §C's
missing-`eventId` reading are inference from data plus source plus git history, and
should be confirmed in DebugView before any code moves. Per `ANALYTICS_METHOD.md` §2
I did not reason about any of the seven server-rendered routes' `<head>` from
`public/`, and I did not need to — nothing tonight turned on it.

**Nothing was changed.** `git status` on the working clone shows one untracked file:
this report.
