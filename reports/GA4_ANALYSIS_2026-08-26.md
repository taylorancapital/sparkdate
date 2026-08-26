# GA4 analysis — 2026-08-26

**This run changed zero code.** The only file added by this branch is this report. Nothing under
`public/`, `api/`, `lib/`, `scripts/`, `vercel.json`, `package.json` or the Firestore rules was
touched, and no file in the Night Tasks folder was moved, renamed or deleted.

**Focus:** Prompt 9 (GA4 export → site improvements), re-run against a new export Taylor pulled
today at ~12:41–13:12.

**Export:** 39 `download*.csv`, property `sparkdate-philly`, window **`20260519-20260826`**
(100 days), read from each file's own `#` header. All 39 md5s distinct — no duplicate pairs this
time. **The waitlist pair refreshed**, unlike last export.

---

## Headline: last night's report had three wrong findings, and this export proves it

The 2026-08-25 report flagged an engagement collapse on 2026-08-24 and **explicitly refused to
interpret it**, calling it "either the sharpest signal in three months or a data-processing
artifact" and asking for a 48-hour re-check. The re-check is in. **It was the artifact**, and the
same artifact silently corrupted two other findings in that report which were *not* hedged.

This report's most useful output is therefore not a new business insight. It is a measured,
reproducible rule about how long GA4 takes to finalise, which should go into
`ANALYTICS_CONTEXT.md` so this stops happening. See §A1.

The genuinely new business finding is §A2: Taylor added an *All Cities (check for bot traffic)* tab
after last night's report, and **the answer is yes** — at minimum 205 and plausibly 318 of 2,670
active users resolve to hyperscale datacenter towns, most of them Meta's own.

---

## A. Findings

### A1. RESOLVED — the Aug 24 collapse was a processing artifact, and it has a shape

Same calendar day, two exports:

| 2026-08-24 (day index 0097) | Export pulled 08-24 ~23:35 | Export pulled 08-26 12:41 | Change |
|---|---:|---:|---:|
| Sessions | 96 | **135** | **+41%** |
| Engaged sessions | **3** | **62** | **+1,967%** |
| Engagement rate | **3.1%** | **45.9%** | — |

45.9% is an ordinary day. **There was no collapse.** The refusal to interpret it was correct.

**The artifact is reproducible and it moved forward exactly one day.** In tonight's export the
second-most-recent day now shows the same signature:

| Day | Date | Sessions | Engaged sessions | Engagement rate |
|---|---|---:|---:|---:|
| 0095 | 2026-08-22 | 175 | 132 | 75.4% |
| 0096 | 2026-08-23 | 129 | 47 | 36.4% |
| 0097 | 2026-08-24 | 135 | 62 | 45.9% |
| 0098 | 2026-08-25 | 135 | **2** | **1.5%** |
| 0099 | 2026-08-26 | 54 | *(no row at all)* | *(no row)* |

**Control:** days 0095 and 0096 read **identically** in both exports (132/175 and 47/129). Days
two or more back are settled. So the lag is bounded, not general drift.

**The rule, stated so it can be pasted into `ANALYTICS_CONTEXT.md`:**

> In any GA4 export from this property, the **most recent day** is missing its engagement metrics
> entirely and undercounts sessions by roughly 30%; the **second-most-recent day** reports
> engagement near zero and is not usable. Only days **three or more back** from the export date are
> final. Drop the last two days from any trend, and never read a single-day engagement figure off
> the tail of an export.

This is the **third consecutive night** a version of this has been raised (the 08-24 performance
run asked for a "current day is partial" sentence; the 08-25 report asked again). It now has
measurements behind it instead of a hunch.

### A2. The bot-traffic tab: yes, and most of it is Meta's own datacenters — NEW

`download (16).csv` — *Philly vs Lancaster / All Cities (check for bot traffic)* — is a tab that
did not exist in any previous export. It lists **700 city rows against 2,670 active users.**

**Unambiguous hyperscale datacenter towns** — places with no plausible Pennsylvania or
Philadelphia-metro twin:

| City | Active users | What is there |
|---|---:|---|
| Prineville, OR | **85** | Meta datacenter |
| Lulea, Sweden | **51** | Meta datacenter |
| Council Bluffs, IA | 23 | Google datacenter |
| Ashburn, VA | 21 | AWS us-east-1 / Equinix |
| Boardman, OR | 20 | AWS datacenter |
| Moses Lake, WA | 5 | Meta datacenter |
| **Conservative subtotal** | **205** | **7.7% of all active users** |

**Adding towns that are datacenter sites but have a same-named alternative** — Dublin (37),
Forest City (31), Altoona (16), Gallatin (11), Des Moines (3), Kansas City (3), Frankfurt (4),
Warsaw (4), Columbus (2), New Albany (1), Ogden (1) — **the total reaches 318, or 11.9%.**

**I am giving both numbers rather than one, because the ambiguity is real and matters here.**
Altoona is both a Meta datacenter in Iowa and a real Pennsylvania city about 100 miles from
Lancaster. Forest City is a Meta datacenter in North Carolina and a borough in Susquehanna County,
PA. Dublin is Ireland, Ohio and California. GA4's city dimension is IP geolocation, which cannot
tell these apart. **205 is the floor I would defend; 318 is the likely figure; the truth is between.**

**The pattern is coherent, which is what makes it credible.** Prineville, Lulea, Forest City,
Altoona, Gallatin and Moses Lake are *all Meta datacenters* — that is roughly 199 users clustered
in one company's infrastructure, for a site whose traffic is two-thirds Meta paid social. Meta
crawling its own ad destination URLs is the obvious explanation.

**Two related numbers from the same file:**

- **`(not set)` 300 users plus 11 blank = 311 (11.6%) have no city at all.** Combined with the
  datacenter rows, **19–24% of the property's active users are either unlocatable or in a server
  farm.**
- **451 of the 700 city rows contain exactly one user; 548 rows contain two or fewer, totalling
  645 users (24.2%).** A long tail that thin is what automated traffic and VPN exits look like.

Row sums come to 2,976 against the file's grand total of 2,670 (+11.5%) — expected, since active
users de-duplicate across rows.

**This is not a fix I can make.** Filtering it is GA4 configuration (a bot/datacenter exclusion
filter or IP rules), which nightly runs cannot touch. It goes to §C.

### A3. Philadelphia vs Lancaster — the direction holds, but my framing last night was flawed

Updated figures, `download (15).csv`:

| City | Active users | Key events | Revenue | Revenue / user | Engagement rate |
|---|---:|---:|---:|---:|---:|
| Philadelphia | **486** | 7 | **$87.47** | **$0.180** | 32.1% |
| Lancaster | **101** | 16 | **$108.96** | **$1.079** | 52.8% |

Philadelphia gained a sale (+$27.49) in the two days, so **the gap narrowed from 8.3× to 6.0×.**

**But the new All Cities tab shows the comparison is structurally unfair, and I should have caught
this last night.** "Philadelphia" in GA4 is a large city; "Lancaster" is a borough of about 57,000
people. The real catchment is Lancaster County, and it is scattered across the tail of the same
file:

Lancaster 101, Ephrata 20, Millersville 14, Elizabethtown 11, Lititz 9, Mount Joy 7, Quarryville 6,
Willow Street 5, Leola 4, Salunga 4, Christiana 3, Landisville 3, Maytown 3, East Petersburg 2,
Manheim 1 — **≈193 users, roughly 1.9× the "Lancaster" row alone.** (Denver, Akron and Columbia add
another 21 but each has an out-of-state twin, so they are excluded.)

Philadelphia's suburbs are in the same tail and equally uncounted: West Chester 52, King of Prussia
27, Coatesville 11, Exton 7, Norristown 6, Drexel Hill 6, Chester 4, Paoli 4, Horsham 4,
Plymouth Meeting 3 — **another ≈124 on the Philadelphia side.**

**So both denominators are wrong in the same direction and the 6.0× multiplier is not reliable.**
What survives: **Lancaster's engagement rate is 21 points higher (52.8% vs 32.1%) and it produced
more than twice the key events off a fifth of the users.** The direction is robust; the size is not.
A proper region grouping is needed before this drives any budget decision — see §C1.

Caveats unchanged: n = 7 and n = 16 key events, ~3 tickets against ~4; the filtered tab covers **582
of 2,670 users (21.8%)**; and 486 + 101 = 587 against that stated grand total of 582, a 5-user overlap.

### A4. RETRACTION — the in-app-browser "empty string regression" was the same artifact

The 08-25 report called this a "real regression in the dimension's usefulness, one day old." It was
not. `download (25).csv`, same calendar day, two exports:

| 2026-08-24 | `(not set)` | `true` | `false` | *(empty)* | Total |
|---|---:|---:|---:|---:|---:|
| As read on 08-24 | **0** | 272 | 83 | **115** | 470 |
| Finalised, read 08-26 | **182** | 507 | 144 | **0** | 833 |

**Both of last night's claims about that day were wrong, in opposite directions.** The empty-string
bucket went to **zero**, so there is no regression. And `(not set)` did **not** go to zero, so
"the fix works, `(not set)` hit zero on the first full day" was also wrong.

**And the artifact moved forward one day, exactly as in §A1:** 2026-08-25 now reads `(not set)` 0,
`true` 449, `false` 176, **empty 99**. Tomorrow's export will show that 99 resolve to zero.

**What PR #265 actually achieved, on finalised data only:**

| Date | `(not set)` share | Note |
|---|---:|---|
| 2026-08-22 (pre-fix) | 1,075 / 1,091 = **98.5%** | |
| 2026-08-23 | 654 / 883 = **74.1%** | #265 shipped 18:22 EDT mid-day |
| **2026-08-24 (first full day)** | **182 / 833 = 21.9%** | |

**Substantial improvement, not elimination** — 182 events on a finalised day still carry no value.
That is the honest version, and it is a smaller claim than either thing I said last night.

**The one estimate that held:** webview share on the first fully-tagged day is
**507 of 651 resolved events = 77.9%**, against last night's 76.6%. Still above
`ANALYTICS_CONTEXT.md` §3's recorded 61%, and now on finalised data — but it is one day, and I have
not edited that file.

### A5. RETRACTION — two other "frozen" counters were not frozen

- **`checkout_error` is 20, not 18** (`download (23).csv`): `card_incomplete` **10** (was 9),
  `(not set)` 8, `card_declined` 1, and a **new `other` category, 1**. Last night's "identical to
  the 08-23 report's, so this has failed to move across two exports" is superseded.
- **`add_payment_info` is 3 events, not 1** (`download (4).csv`), carrying $87.47 of event value.
  It fired twice more in two days. The underlying concern stands and is still stark —
  **3 `add_payment_info` against 214 `checkout_form_started` and 20 `checkout_error`** — but the
  event is not dead.
- **Week-1 retention was measured too early too.** Last night I reported the 2026-08-16–08-22 cohort
  at "5 returned of 481 (1.0%)". It is now **9 of 481 (1.9%)** — that cohort's week-1 window
  (Aug 23–29) was still open when I read it. Property-wide week-1 retention is **51 of 2,122
  (2.4%)**, up from the 2.2% reported. **Never quote the most recent cohort row.**

**What genuinely IS frozen**, and this is the third export in a row for the first one:

- **`ads_conversion_About_Us_1` = 99**, unchanged across the 0824 and 0826 exports — two extra days
  of traffic, zero fires. It remains **99 of 213 key events (46.5%) worth $0.00.** Note this is the
  opposite of last night's correction, where I showed it moving 97 → 99; it fires in bursts, so
  neither "frozen" nor "alive" is a stable description. What is stable: it is nearly half of all
  key events and worth nothing.
- **`next_event_fetch_failed` = 61 property-wide / 29 events / 27 users in webview, 0 in direct
  browser** — byte-identical to the last export across two more days. The §A6 finding below stands
  on its evidence, but it has produced **no new fires**, which is itself worth knowing.

### A6. `/api/next-event` still fails only in webviews — 27 users, 0 in a direct browser

`download (28).csv`, paid-social mobile: `next_event_fetch_failed` = **29 events / 27 users in the
webview segment, exactly 0 of 594 users in the direct-browser segment.** `targeted_event_not_found`
shows the same asymmetry at 5 vs 1.

`public/lp.html:790–795` fires this in the `.catch()` of the `/api/next-event` fetch; the comment
there records that the ticket button then falls back to a static `/event` link. Those 27 users
landed on `/lp` and saw a ticket card that never populated with the real event's name, date, venue
or price.

**Unchanged from the last export**, so this is not currently getting worse — but an exact zero on
one side of a 1,137-vs-594-user comparison is not a sampling artifact, and it sits in the segment
that is two-thirds of paid Meta. Written up under §D, not fixed.

### A7. Marion Court — fifth consecutive report, and now it is producing carts

| Report | Item views | Carts | Purchases | Meta spend (7-day window) |
|---|---:|---:|---:|---:|
| 2026-08-23 | 20 | 1 | 0 | — |
| 2026-08-24 | 21 | 2 | 0 | $75.53 (Aug 17–23) |
| 2026-08-25 | 21 | 3 | 0 | $74.88 (Aug 18–24) |
| **2026-08-26 (tonight)** | **27** | **6** | **0** | **$73.44 (Aug 19–25)** |

From `meta-insights-2026-08-25.csv` (Meta Marketing API, campaign level, window `20260819-20260825`
read from the file's own `#` header — written by the local 06:59 nightly, not by me):

| Marion Court campaign | Spend | Impressions | Clicks |
|---|---:|---:|---:|
| Marion Court Retargeting | $32.42 | 1,434 | 26 |
| Marion Court \| Traffic | $18.16 | 2,861 | 71 |
| Marion Court All Genders | $11.48 | 548 | 15 |
| Marion Court Female | $11.38 | 533 | 5 |
| **Total** | **$73.44** | **5,376** | **117** |

**$73.44 is 31.3% of the account's $234.58 for the week** — its highest share yet.

**The new fact is the carts.** Views doubled the cart count in two days: 3 → 6, and **still zero
purchases.** Six people put a Marion Court ticket in a cart and none of them bought. That is a
different failure from "nobody is interested," and it is the strongest version of this finding in
five reports.

**Window-comparability, per `ANALYTICS_CONTEXT.md` §1:** $75.53 → $74.88 → $73.44 are three
*different* rolling 7-day windows and **are not a declining trend** — each difference is one day
entering minus one day leaving. What they jointly support is that Marion Court has spent roughly
$10.5/day continuously since launching 2026-08-17, now totalling well over $200 across its life,
for zero recorded sales.

### A8. Channel economics — Eventbrite's gap widened to 45.3×

`download (5).csv`, by active users. Grand total 2,670 users / 213 key events / $863.69.

| Channel | Active users | Key events | Revenue | Revenue / user |
|---|---:|---:|---:|---:|
| Meta paid (5 case variants) | **1,811** (67.8%) | 22 | $152.45 | **$0.084** |
| `eventbrite / listing` | **69** (2.6%) | 18 | **$262.90** (30.4%) | **$3.810** |
| `(direct) / (none)` | 379 | 16 | $109.96 | $0.290 |
| Google Ads family (7 rows) | 114 | **94** (44.1%) | **$0.00** | $0.000 |
| Internal phantom sources (10 rows) | 40 | 6 | $54.98 | — |

**Eventbrite returns 45.3× more revenue per active user than Meta paid** — the gap widened from
44.9× because Meta gained 145 users and no revenue while Eventbrite gained 5 users and no revenue.
Eventbrite's revenue share slipped 31.4% → 30.4% for the same reason as last time: the base grew,
the multiple did not.

Same four temperings as the last two reports and they still apply: n = 10 Eventbrite transactions;
§1 says GA4 misses ~55% of real ticket revenue and most of it *is* Eventbrite, so Eventbrite is
understated further and the admin dashboard remains the revenue truth; the two channels do
different jobs; and direct/email rows are internal-traffic contaminated.

**New row worth noting:** `(not set) / (not set)` jumped to **37 users, 3 key events and $27.49** —
a completed sale with no recorded source at all, where it was $0.00 last export.

**Case fragmentation, current:** `Facebook / paid_social` 1,053, `facebook / paid_social` 389,
`Instagram / paid_social` 259, `fb / paid_social` 88, `Facebook / paid` 22. Reading only the top row
gives 39.4% against a true **67.8%** — a 42% understatement. The lowercase and `fb` rows still show
**$0.00 across 100 days.**

### A9. Item economics — $392.85 still arrives with no funnel in front of it

`download (36).csv`:

| Item | Viewed | Carted | Purchased | Revenue | View→cart | Cart→purchase |
|---|---:|---:|---:|---:|---:|---:|
| Tellus AfterDark: Singles Edition | 336 | 42 | 10 | $237.90 | 12.5% | 23.8% |
| Good Good Night @ Good Good Things | 119 | 23 | 4 | $119.96 | 19.3% | 17.4% |
| **Marion Court** | **27** | **6** | **0** | **$0.00** | 22.2% | **0%** |
| Sparkdate: The Loxley's Social | 22 | 9 | 2 | $37.98 | 40.9% | 22.2% |
| SparkDate: Round 2 — Summer Nights | 21 | 7 | **8** | $199.92 | 33.3% | *>100%* |
| **Founders Mixer** | **0** | **0** | **8** | **$192.93** | — | — |
| *Grand total* | 525 | 87 | 32 | $788.69 | | |

**Founders Mixer (8 sales, no views, no carts) and Round 2 (8 sales against 7 carts) together are
$392.85 — 45.5% of GA4 revenue — arriving without the ecommerce steps that precede it.** Not a
defect: this is §1's "GA4 revenue is own-site only" made visible, and it is the concrete argument
for the admin dashboard being the revenue truth.

**Marion Court now has the second-highest view→cart rate on the board (22.2%) and the only 0%
cart→purchase rate.** Whatever is wrong is at the last step, not the first.

**The revenue reconciliation gap persists and grew:** items total **$788.69**, sources total
**$863.69** — a **$75.00 (8.7%)** difference between two files in the same export, both agreeing on
32 transactions. Flagged, not used in any ratio above. It was $72.50 last export.

### A10. Funnels — what is readable, and what is still refused

Four funnel files, all spanning 2026-08-21:

| File | Report | Step counts |
|---|---|---|
| `download (20).csv` | *Funnel* | Session start 2,661 → Begin Checkout **112** → Purchase 15 |
| `download (14).csv` | *Checkout Events Tracking* | Begin Checkout **112** → Checkout Form Started 56 → Purchase 12 |
| `download (22).csv` | *Segment by Device* | Session start 2,660 → View product 297 → Add to cart 51 → Begin checkout **14** → Purchase 3 |
| `download (17).csv` | *Paid funnel drop-off* | session_start 2,661 → view_item 297 → add_to_cart 51 → begin_checkout **14** → add_payment_info **0** → purchase **0** |

**Every `begin_checkout` figure in all four is refused**, per `ANALYTICS_CONTEXT.md` §1 — the
definition changed on 2026-08-21 (#204, #229) and all four windows span it. The 112-vs-14 spread is
funnel shape (open vs sequential), not data.

`download (17).csv`'s **`purchase` = 0 for every channel remains a documented artifact**: step 5 is
`add_payment_info`, which did not exist before 2026-08-21, so step 6 reads 0 by construction.
Anyone reading it cold concludes paid social has never produced a sale. It has —
`download (2).csv` shows Meta paid at $152.45 across 5 transactions.

**What is readable**, using events whose definitions did not change:

**2,660 users → 297 view product (11.2%) → 51 add to cart (17.2% of viewers).**

Against the last export's 2,487 → 265 (10.7%) → 45 (17.0%), the view-product rate improved
**10.7% → 11.2%**. Two days of movement on a 100-day cumulative base is nowhere near significant;
recorded so the next report has a trend line, not as a result.

### A11. `/lp` engagement — the same self-contradiction, now with more data

`download (27).csv`, paid social mobile, landing page `/lp`:

| Segment | Sessions | Avg engagement time | Bounce rate | Engaged sessions | Key events |
|---|---:|---:|---:|---:|---:|
| A — Webview | 1,093 | **2.60s** | **66.2%** | 369 (33.8%) | 6 (**0.55%**) |
| B — Direct browser | 569 | **7.86s** | **79.3%** | 118 (20.7%) | 5 (**0.88%**) |
| C — All paid social | 1,658 | 4.41s | 70.6% | 487 | 11 |

Webview still shows 3× less engagement time alongside a 13-point *lower* bounce rate — the same
contradiction as last export, now on 134 more sessions, so it is not noise. **Do not quote the
bounce rate or the engagement time for these cohorts.** The trustworthy column is key events:
**direct browser converts 1.6× better (0.88% vs 0.55%)**, and at n=5 and n=6 that is still barely
a signal.

**Segment sum check (§2 rule):** A (1,093) + B (569) = 1,662 against C's 1,658 — **off by 4,
0.24%.** Disclosed because the rule says to verify and say so.

**Android in a webview has produced zero key events across 350 sessions** (`download (32).csv`):
iOS 907 of 1,878 sessions in-app (48.3%) with 9 key events; Android 350 of 999 (35.0%) with **0**.
All 153 `in_app_browser_escape_attempt` events are Android; iOS fires none. Two different problems
wearing one label.

### A12. `select_promotion` jumped 54% in two days

Property-wide **35 → 54 events** (`download (4).csv`). In paid-social mobile the increase is
concentrated in the webview segment: **9 → 20 events**, against direct browser 7 → 8
(`download (28).csv`).

That is the metric `ANALYTICS_CONTEXT.md` §3 names for judging whether the 2026-08-22 CTA move and
sticky bar worked, and it is moving in the right direction. **But open question 2 still cannot be
answered**, because no file in this export breaks `select_promotion` down by `promotion_name`, so
the `lp_sticky_bar` share — the specific number §3 asks for — is not measurable from these CSVs.
See §D5.

### A13. Waitlist — open question 1 holds and strengthens

`download (7).csv` and `download (8).csv` both refreshed this export (they were stale last time).
**Of 55 sessions that fired `generate_lead`, 40 never viewed an item and 15 did** — up from 39/13.
**72.7% of leads never looked at a ticket**, so the form is catching bounces rather than
intercepting buyers. The 08-23 conclusion that the waitlist is *rescuing*, not cannibalising, holds
on two more days of data.

Tempered as before: **6 of the 55 landed on `/admin`** and 4 on `/matches`, so roughly **18% of
recorded lead volume is internal**, and the export's `SEQ` column still reports 492 sessions for a
sequence that cannot exceed 55 — that column remains broken and is not used here.

---

## B. What this report retracts or corrects from 2026-08-25

Collected in one place, because four items is enough that they should not be scattered.

1. **The Aug 24 engagement collapse (3.1%) was an artifact.** True value 45.9%. It was hedged as an
   open item, so nothing downstream depended on it — but it is now closed (§A1).
2. **The in-app-browser "empty string regression" (115 events, 24.5%) was the same artifact.** True
   value 0. And the paired claim that `(not set)` "went to zero, the fix works" was also wrong —
   true value 182 (21.9%). **Neither was hedged.** (§A4)
3. **"`checkout_error` has failed to move across two exports" was wrong** — it moved 18 → 20, and
   `add_payment_info` moved 1 → 3 (§A5).
4. **The 2026-08-16–08-22 cohort's 1.0% week-1 retention was measured before the window closed.**
   True value 1.9% (§A5).
5. **The Philly-vs-Lancaster 8.3× multiplier compared a metro against a borough.** Direction holds,
   magnitude does not (§A3).

**The common cause of 1, 2 and 4 is the same:** reading the tail of a GA4 export as if it were
final. §A1 gives the rule that prevents all three.

---

## C. NEEDS TAYLOR INPUT

1. **Build a region grouping before acting on the geography finding** (§A2, §A3). The Philadelphia
   and Lancaster rows both undercount their real catchments, and 7.7–11.9% of users are in
   datacenters. A GA4 audience or a `region`-level breakdown would settle in one query what these
   two reports have now half-answered twice.
   *Re-check in ~1 week:* revenue per active user for a properly grouped Lancaster County vs
   Philadelphia metro, currently $1.079 vs $0.180 on wrong denominators.
2. **Turn on GA4 bot/datacenter filtering** (§A2) — **new ask.** At minimum 205 and plausibly 318
   active users (7.7–11.9%) resolve to Meta, Google and AWS datacenter towns. This is a GA4 Admin
   setting, not code.
3. **Turn on the internal-traffic filter** — **fourth ask.** `download (8).csv` still shows
   **6 of 55 lead-generating sessions landing on `/admin`** plus 4 on `/matches` — ~18% of recorded
   lead volume. Also GA4 Admin, not code.
4. **Kill or rebuild Marion Court** — **fifth ask** (§A7). Now producing carts and still zero sales:
   **27 views → 6 carts → 0 purchases**, at 31.3% of weekly Meta spend. Six abandoned carts is a
   sharper signal than five reports of silence.
   *Re-check in ~1 week:* purchases for "SparkDate: Real People, Real Drinks, Real Court",
   currently 0 of 6 carts.
5. **Retire or demote `ads_conversion_About_Us_1`** — **third ask.** 99 of 213 key events (46.5%),
   $0.00, and it makes the Google Ads family (114 users, **$0.00 revenue in 100 days**) appear to
   convert at 82%.
6. **Is Google Ads still running?** — **fourth ask.** 114 users, 94 key events, **zero dollars**.
7. **Is Eventbrite a deliberate channel?** — **third ask.** 2.6% of users, 30.4% of GA4 revenue,
   **45.3×** Meta paid's revenue per user.
8. **Should the homepage follow `/lp`'s headline rewrite?** — **second ask.** `public/index.html`
   still says "Your app matched you" in the H1 (line 1109), meta description (8), og:description
   (12), JSON-LD (42) and footer (1281); `about.html` and `signup.html` too. `/` is still the
   **largest landing page for `generate_lead` — 15 of 55 sessions.** Brand voice, so it stays here.
9. **Add the §A1 finalisation rule to `ANALYTICS_CONTEXT.md`** — **third ask**, and this time the
   exact wording is written out in §A1 ready to paste. Three of tonight's five retractions would not
   have happened if it were already there.

---

## D. Proposed zero-risk fixes — described, NOT applied

1. **Make `/api/next-event` failures non-fatal to the ticket card in webviews** (§A6). 27 webview
   users and 0 direct-browser users hit the `.catch()` at `public/lp.html:790`. Establish *why* it
   only fails in webviews first — a retry, a longer timeout, and server-rendering the next event
   are not equivalent fixes. *Re-check:* `next_event_fetch_failed`, currently frozen at 61.
2. **Categorise the 8 uncategorised `checkout_error` events** (§A5). `(not set)` is 40% of the 20
   checkout errors, so the most common real failure mode is still invisible.
3. **Find the remaining `(not set)` `in_app_browser` call sites** (§A4). 182 events on a finalised
   day still carry no value after #265 — down from 98.5% but not the zero last night claimed.
   *Note the empty-string item from the 08-25 report is withdrawn; there is nothing to fix there.*
4. **Rebuild the Meta ad URLs with consistent lowercase `utm_source`** — repeated, still not done
   (§A8). Reading the top Meta row alone understates Meta by 42%, and
   `utm_content=proof_rsa1` on all 14 ads makes per-ad attribution impossible.
5. **Add a `promotion_name` breakdown to the GA4 exploration set** (§A12). `select_promotion` rose
   35 → 54 in two days but the `lp_sticky_bar` share — the number `ANALYTICS_CONTEXT.md` §3
   explicitly asks for — is not in any of the 39 files. One free-form tab would close open question 2.
6. **Strip query parameters in the GA4 data stream settings** — repeated, GA4 configuration.
   `download (6).csv` lists **1,386 distinct landing URLs for 1,530 paid sessions** (0.91 per
   session; busiest single URL = 18 sessions in 100 days) because `fbclid` and `eventId` are in the
   path. Collapsed to path: **`/lp` 88.2%, `/events` 11.8%** of paid traffic.
7. **Reconcile the $75.00 revenue gap** between `download (2).csv` and `download (36).csv` (§A9) —
   two files, one export, same 32 transactions, 8.7% apart.

---

## E. Method, parsing assumptions and caveats

**Freshness.** All 39 CSVs carry `20260519-20260826`, two days past the `...0824` window analysed
last night, read from each file's own `#` header — not filenames, not timestamps. **All 39 md5s are
distinct** (the last export had two duplicate pairs). The *Waitlist* pair, stale last export,
refreshed this time. File-number → report-type mapping was **completely different** from the
previous export and was rebuilt from each file's own title line, as every prior run has had to do.

**Title diff against prior coverage.** Per the process lesson in the 08-24 run log, each file's
title was checked against the two most recent GA4 reports. **New this export: *Philly vs Lancaster /
All Cities (check for bot traffic)*** and ***In-app browser impact / In-app vs all by source and
device***, neither of which existed before. §A2 is built on the first.

**Day indexing.** GA4's "Nth day" columns are **0-based**: day `0000` = 2026-05-19, so
**`0099` = 2026-08-26**. Cross-checked three ways — the cohort file's last weekly cohort is
`20260823-20260826`; the sessions series ends at 0099 with a partial 54; and the engaged-sessions
series has no 0099 row at all, which is itself the §A1 finding.

**Row-sum reconciliation.** `download (5).csv` row sums exceed its own grand total on active users
(expected — users de-duplicate across source rows) while **key events (213) and revenue ($863.69)
reconcile exactly.** `download (16).csv` sums to 2,976 against 2,670 (+11.5%), same reason. All
shares above use each file's own grand total as denominator.

**`ANALYTICS_CONTEXT.md` caveats applied tonight, explicitly:**

- §1 `begin_checkout` changed meaning 2026-08-21 → **all four funnel files' `begin_checkout` steps
  refused** (§A10).
- §1 `add_payment_info` post-dates 2026-08-21 → `download (17).csv`'s all-zero purchase row
  explained as an artifact, not reported as a result (§A10).
- §1 GA4 revenue is own-site only → every revenue figure labelled GA4-recorded; admin dashboard
  named as truth (§A8, §A9).
- §1 engagement unreliable in webviews → §A11 declines to use bounce rate or engagement time and
  uses key-event counts instead.
- §1 internal traffic unfiltered → §C3, and the waitlist figure carries its `/admin` contamination
  inline (§A13).
- §1 Meta rolling windows fake trends → **§A7 explicitly refuses to read $75.53 → $74.88 → $73.44
  as a decline** and states what the three windows jointly do and do not support.
- §1 Meta case fragmentation → all five variants summed before any share was quoted (§A8).
- §2 verify segments sum to the total → **applied, and it caught two discrepancies**: A+B vs C in
  `download (27).csv` (off by 4) and Philadelphia+Lancaster vs grand total in `download (15).csv`
  (off by 5). Both disclosed.
- §4 open question 1 (waitlist) → answered again and strengthened (§A13). Open question 2 (CTA move)
  → **partially answered and honestly left open** for want of a `promotion_name` breakdown (§A12).
- §5 small samples → counts stated with every percentage below the top of the funnel.

**Where tonight's numbers contradict `ANALYTICS_CONTEXT.md`:** §3 records the paid-social webview
share as 61%; the first fully-tagged, finalised day gives **77.9%** (§A4). One day of data, so that
file has **not** been edited. Separately, §3's own recommended metric for open question 2 —
`promotion_name: lp_sticky_bar` — is not exportable from the current exploration set (§D5).

**What was NOT done.** No Windsor MCP pull; `meta-insights-2026-08-25.csv`, written by the local
06:59 nightly, already provided a complete campaign-level week and adding a second source would
reintroduce the mismatch noise the 08-23 report documented. No daily-granularity Meta data newer
than `meta-insights-daily-2026-08-23.csv`, which is why §A7 cannot say whether individual Marion
Court campaigns are paused. Source files under `/tmp` were read only; the Night Tasks CSVs were read
in place and not moved, renamed or modified. **`ANALYTICS_CONTEXT.md`'s campaign table is still
stale on the two rows flagged on 08-24** (`Marion Court | Traffic` absent; `Campaign 1 Event 3 Good
Good Campaign` listed as ending 2026-08-13 while spending $27.62 in the Aug 19–25 window) — reported
for a third time, not edited, because that file is a repo file and this run does not edit repo files.
