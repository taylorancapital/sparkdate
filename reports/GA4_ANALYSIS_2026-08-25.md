# GA4 analysis — 2026-08-25

**This run changed zero code.** The only file added by this branch is this report. No file under
`public/`, `api/`, `lib/`, `scripts/`, `vercel.json`, `package.json` or the Firestore rules was
touched, and nothing in the Night Tasks folder was moved, renamed or deleted. Every suggestion
below is written down for Taylor to approve, not applied.

**Focus:** Prompt 9 (GA4 export → site improvement suggestions), picked because a genuinely fresh
export is in the Night Tasks folder — see *Freshness* under Method.

**Export:** 39 `download*.csv` files, GA4 property `sparkdate-philly`, window
**`20260519-20260824`** (98 days) read from each file's own `#` header.

---

## Headline

**The single most important number in this export is one I am deliberately refusing to interpret:
engaged sessions on 2026-08-24 read 3 against 96 sessions — a 3.1% engagement rate, against 36.4%
the day before and 75.4% the day before that.** That is either the sharpest signal in three months
or a data-processing artifact, and on the evidence available tonight it cannot be told apart. It is
written up as an open item, not a finding. See §A1.

The finding I *am* confident in is new and has never appeared in any prior report:
**Philadelphia is 82.8% of the geo-identified audience and 35.5% of the geo-identified revenue.**
See §A2.

---

## A. Findings

### A1. Engagement collapsed on 2026-08-24 — flagged, NOT interpreted

`download (7).csv` (Engaged Sessions Trend) and `download (4).csv` (Sessions Trend), last three
days of the window:

| Day | Date | Sessions | Engaged sessions | Engagement rate |
|---|---|---:|---:|---:|
| 0095 | 2026-08-22 | 175 | 132 | **75.4%** |
| 0096 | 2026-08-23 | 129 | 47 | **36.4%** |
| 0097 | 2026-08-24 | 96 | **3** | **3.1%** |

`download (5).csv` (Engagement Rate Trend) independently confirms day 0097 = **0.03125**, so this is
not my arithmetic — GA4 computed it. Across the whole 98-day window the daily engagement rate has
ranged roughly 21%–100%, with typical days in the 30–70% band. **3.1% is the lowest value in the
file by a wide margin.**

**Why I will not call this a behaviour change.** Three reasons, in order of weight:

1. **Sessions did not collapse — only engagement did.** Aug 24 recorded 96 sessions and 76 active
   users, which is an ordinary day (Aug 23 was 129/96, Aug 21 was 69/50). If Aug 24 were simply a
   partial day, the session count would be depressed too. It is not. So the divergence sits
   specifically in the metric that `ANALYTICS_CONTEXT.md` §1 already warns is the least reliable
   one in this property: engagement is derived from `user_engagement`, which fires on
   visibility/focus changes and is exactly what Meta's in-app browser handles badly.
2. **Engaged-session status can be assigned late.** GA4 marks a session engaged on ≥10s engaged
   time, ≥2 pageviews, or ≥1 key event. The 10-second component depends on `user_engagement`
   arriving, and this export was pulled at roughly 23:35–00:00 on the night of Aug 24/25 — the same
   "current day is partial" trap the 2026-08-24 performance report asked to have written into
   `ANALYTICS_CONTEXT.md`. That request is still open, and this is the second night running it
   would have mattered.
3. **The corroborating events do not agree.** Aug 24 still produced 1 purchase ($32.49), 1
   `generate_lead`, 2 `ads_conversion_About_Us_1`, and 470 total events tagged to that date
   (`download (27).csv`). A day on which real users bought a ticket and submitted a lead form is
   not a day on which 97% of sessions were unengaged.

**What to do:** re-pull the same Monthly Trends reports in ~48 hours, once GA4 has finalised
2026-08-24, and read day 0097 again. If it stays near 3%, this is a real event and worth a
dedicated investigation. If it lands in the 30–70% band, this entry is the proof that the property
needs a stated "today is partial" rule.

### A2. Philadelphia buys the audience; Lancaster buys the tickets — NEW, never analysed

`download (37).csv` — *Philly vs Lancaster (filtered)* — is a report type that appears in **no**
prior report. I string-searched `GA4_ANALYSIS_2026-08-23.md` and `GA4_TRAFFIC_ANALYSIS_2026-08-24.md`
for the exploration title: zero hits.

| City | Active users | Key events | Revenue | Engagement rate |
|---|---:|---:|---:|---:|
| Philadelphia | **439** (82.8%) | **6** | **$59.98** | 33.6% |
| Lancaster | **96** (18.1%) | **16** | **$108.96** | 51.9% |
| *Grand total (filtered)* | 530 | 22 | $168.94 | 37.2% |

Derived, with counts stated because these are small cells:

- **Revenue per active user: Philadelphia $0.137, Lancaster $1.135 — an 8.3× gap.**
- **Key events per active user: Philadelphia 1.4% (6 of 439), Lancaster 16.7% (16 of 96) — 12.2×.**
- Engagement rate is 18 points higher in Lancaster.

**Why this matters more than the ratio suggests:** every event currently in the queue is in
Lancaster — Marion Court, Tellus360, Good Good Things, Loxley's. Philadelphia is 4.6× the audience
for a calendar that contains nothing they can attend without an hour and a half of driving. The
6 key events and $59.98 from 439 Philadelphia users is what "wrong city" looks like in the data.

**Four honest limits on this, all of which I want on the record:**

- **The cells are tiny.** 6 key events and 16 key events. $59.98 is about two tickets; $108.96 is
  about four. Do not treat the 8.3× as a precise multiplier.
- **This is a filtered report covering 530 of 2,489 active users (21.3%).** The other 78.7% of the
  property has no city label in this export. This is not "the audience is 83% Philadelphia" — it is
  "of the users GA4 could place in one of these two cities, 83% were in Philadelphia."
- **439 + 96 = 535 against a stated grand total of 530.** Five users (0.9%) appear in both rows
  across different sessions. Immaterial here, but it means the two rows are not a clean partition —
  the §2 "verify the segments sum to the total" rule catches it.
- **Key events are ~47% junk property-wide** (§A4), so the 6-vs-16 split may be partly measuring
  which city triggers `ads_conversion_About_Us_1`, not which city converts.

This is a budget and market-strategy question, so it goes to **NEEDS TAYLOR INPUT**, not to a fix.

### A3. Channel economics: Eventbrite is 2.6% of the audience and 31.4% of the money

`download (24).csv` — *Campaign Performance* — by active users. Grand total 2,489 users / 210 key
events / $836.20.

| Channel | Active users | Key events | Revenue | Revenue / user |
|---|---:|---:|---:|---:|
| Meta paid (all 5 case variants summed) | **1,666** (66.9%) | 21 (10.0%) | **$152.45** (18.2%) | **$0.092** |
| `eventbrite / listing` | **64** (2.6%) | 18 (8.6%) | **$262.90** (31.4%) | **$4.108** |
| `(direct) / (none)` | 364 (14.6%) | 16 | $109.96 | $0.302 |
| Google Ads family (7 rows) | 123 (4.9%) | **98** (46.7%) | $27.49 | $0.223 |
| Internal phantom sources (10 rows) | 39 (1.6%) | 6 | **$54.98** (6.6%) | — |

**Eventbrite returns 44.9× more revenue per user than Meta paid**, on 1/26th the audience. This
confirms the 2026-08-24 report's finding on a different denominator (that report used sessions;
this uses active users) and with a day of fresh data.

**Movement since last night:** total revenue went $803.71 → **$836.20** (+1 transaction, +$32.49 on
Aug 24) while **Eventbrite stayed flat at $262.90**. So Eventbrite's share fell 32.7% → 31.4%
purely because someone else sold a ticket. The multiple is not growing; the base is.

**Same four temperings as last night, restated because they still apply:** n = 10 Eventbrite
transactions; `ANALYTICS_CONTEXT.md` §1 says GA4 misses roughly 55% of real ticket revenue and most
of that missing revenue *is* Eventbrite and Meetup, so Eventbrite is understated further and the
admin dashboard remains the revenue truth; the two channels do different jobs (a marketplace
catching late-funnel intent vs. cold prospecting), so this is **not** a move-the-budget conclusion
on its own; and direct/email rows are internal-traffic contaminated because this property still has
no internal-traffic filter.

**Meta case fragmentation, current numbers:** `Facebook / paid_social` 962, `facebook / paid_social`
389, `Instagram / paid_social` 205, `fb / paid_social` 88, `Facebook / paid` 22. The top row alone
reads 38.7% of the property; the true Meta paid share is **66.9%**. Reading only the top row
understates Meta by 42%. Lowercase `facebook / paid_social` (389 users) and `fb / paid_social`
(88 users) still show **$0.00 revenue across 98 days**. Whether that is worse inventory or the same
ads spelled differently remains unanswerable while all 14 ads share `utm_content=proof_rsa1`.

### A4. `ads_conversion_About_Us_1` is NOT frozen — correcting last night's report

The 2026-08-24 report stated this counter was "frozen at 97 across two consecutive exports."
Tonight it reads **99** (`download (12).csv`, `download (23).csv`, `download (34).csv` all agree),
and `download (13).csv` shows the two additional fires landed on day 0097 (2026-08-24).

So the counter is alive — it just fires rarely and in bursts (41 fires on day 0021, then long runs
of zeros; days 0089–0096 were all zero, then 2 on 0097). "Frozen" was the wrong inference from two
identical snapshots; **stale-looking is not the same as stopped**, which is the same lesson the
08-24 run log already recorded about the export freshness check.

Everything else about it stands and has now been true for four consecutive reports:
**99 of 210 key events (47.1%) are an About Us page view worth $0.00.** Excluding it, the property's
real key-event total is 111 (`generate_lead` 80 + `purchase` 31). Every key-event rate in this
property is inflated ~1.9×, and the inflation sits almost entirely on Google Ads: the `googleads*`
rows plus `Google Ads / cpc` total **114 users and 93 key events with $0.00 revenue**, which would
read as an 81% conversion rate to anyone who did not know what the event was.

### A5. The in-app-browser tagging fix (#265) worked — and exposed a second defect

`download (27).csv` breaks events by the `In_App_Browser` custom dimension and by date. PR **#265**
("Tag in_app_browser on every event, not five of them") landed **2026-08-23 18:22 EDT** — verified
from the commit, not assumed. The dimension's behaviour changes exactly there:

| Date | `(not set)` | `true` | `false` | *(empty string)* | Total |
|---|---:|---:|---:|---:|---:|
| 2026-08-22 (pre-fix) | 1,075 | 4 | 12 | 0 | 1,091 |
| 2026-08-23 (fix ships mid-day) | 654 | 88 | 141 | 0 | 883 |
| **2026-08-24 (first full day)** | **0** | **272** | **83** | **115** | **470** |

**The fix works.** `(not set)` went to zero on the first complete day after deploy — the whole point
of #265, confirmed.

**But an empty-string value now accounts for 115 of 470 events (24.5%) on that same day.** #265's
own commit message quotes the pre-fix measurement as `(empty string) 369, 4.5%`. So the bucket that
was 4.5% of events is now **24.5%** — the fix moved events out of `(not set)` and roughly a quarter
of them landed on an empty value instead of `true`/`false`. That is a real regression in the
dimension's usefulness and it is one day old.

I did not chase the exact call site, because doing so properly means reading every `gtag` call in
nine pages and I would rather hand Taylor a precise question than a guess. The likely shape: a call
site passing `in_app_browser: undefined` (the codebase does this deliberately for
`target_event_id` at `public/lp.html:795`, so the pattern exists) rather than omitting the key.

**On the first clean day of data, 272 of 355 resolved events (76.6%) were in-app browser** — higher
than the 61%/67% webview shares earlier reports estimated from session-level proxies. That number
is one day old and should not be treated as settled, but it is the first direct measurement.

### A6. `/api/next-event` fails **only** inside webviews — 27 users, zero in a normal browser

`download (19).csv` (*Events by browser*, paid social mobile), `next_event_fetch_failed`:

| Segment | Events | Users | Sessions |
|---|---:|---:|---:|
| A — Webview, paid social, mobile | **29** | **27** | 27 |
| B — Direct browser, paid social, mobile | **0** | **0** | 0 |

Property-wide the event fired 61 times (`download (23).csv`). The zero on side B is exact, not a
rounding artifact, which is what makes this worth raising: 27 of 1,030 webview users (2.6%) versus
0 of 556 direct-browser users.

`public/lp.html:790–795` shows what this means for the visitor: the event fires in the `.catch()`
of the `/api/next-event` fetch, and the comment states the ticket button then falls back to a
static `/event` link. So those 27 users landed on `/lp` and saw a ticket card that never populated
with the real event's name, date, venue or price — the dynamic content the 2026-08-22 CTA work
(#243) was built around. `targeted_event_not_found` shows the same asymmetry at smaller scale
(5 webview vs 1 direct).

This is a bug with a clear user-visible consequence, in the one traffic segment that is two-thirds
of paid Meta. **It is not a code change I am allowed to make and I have not made one** — it is
written up under proposed fixes.

### A7. `/lp` engagement: the webview/direct comparison contradicts itself

`download (18).csv`, paid social mobile, landing page `/lp`:

| Segment | Sessions | Avg engagement time | Bounce rate | Engaged sessions | Key events |
|---|---:|---:|---:|---:|---:|
| A — Webview | 991 | **2.54s** | **64.9%** | 348 (35.1%) | 6 (0.61%) |
| B — Direct browser | 536 | **8.32s** | **78.2%** | 117 (21.8%) | 5 (0.93%) |
| C — All paid social | 1,524 | 4.58s | 69.4% | 466 | 11 |

Webview sessions have **3.3× less** engagement time but a **13-point lower** bounce rate and a
**13-point higher** engaged-session rate. Those two cannot both describe the same underlying
behaviour. `ANALYTICS_CONTEXT.md` §1 explains half of it — engagement *time* is under-recorded in
webviews because `user_engagement` misfires there — but that predicts fewer engaged sessions in
webviews, and we observe more.

**Do not quote either the bounce rate or the engagement time for these cohorts.** The one column
that is a discrete event count and therefore trustworthy per §1's own instruction is the last one:
**key events, 0.61% webview vs 0.93% direct — direct browser converts about 1.5× better.** That is
the only comparison in this table I would put in front of anyone, and at 6 and 5 events it is
still barely a signal.

**Segment sum check (§2 rule):** A (991) + B (536) = 1,527 against C's 1,524 — **off by 3, 0.20%**.
Small enough to ignore for these ratios, disclosed because the rule says to verify and say so.

### A8. Item economics — new table, and two items that break the funnel

`download (11).csv` (*View-Cart-Revenue*), never analysed by title in a prior report:

| Item | Viewed | Carted | Purchased | Revenue | View→cart |
|---|---:|---:|---:|---:|---:|
| Tellus AfterDark: Singles Edition | 291 | 34 | 9 | $212.91 | 11.7% |
| Good Good Night @ Good Good Things | 110 | 22 | 4 | $119.96 | 20.0% |
| **SparkDate: Real People, Real Drinks, Real Court** (Marion Court) | **21** | **3** | **0** | **$0.00** | 14.3% |
| SparkDate: Round 2 — Summer Nights | 21 | 7 | **8** | $199.92 | 33.3% |
| Sparkdate: The Loxley's Social | 20 | 7 | 2 | $37.98 | 35.0% |
| **Founders Mixer** | **0** | **0** | **8** | **$192.93** | — |
| *Grand total* | 463 | 73 | 31 | $763.70 | |

Two rows are arithmetically impossible as a funnel: **Founders Mixer sold 8 tickets with zero
recorded views and zero carts**, and **Round 2 — Summer Nights sold 8 against 7 carts.** Together
that is **$392.85 — 47% of GA4 revenue — arriving without the ecommerce steps that precede it.**
This is not a defect to fix; it is §1's "GA4 revenue is own-site only" made visible. Sales that
originate on Eventbrite, or from an email link straight into checkout, post a `purchase` without a
`view_item`. It is a concrete argument for why the admin dashboard, not GA4, is the revenue truth.

**Also: item revenue totals $763.70 while source revenue totals $836.20** (`download.csv`) — a
**$72.50 (8.7%) gap** between two files in the same export. Both agree on 31 transactions. I have
not resolved which is right; flagged, not used in any ratio above.

### A9. Marion Court: zero purchases for the fourth consecutive report

| Report | Item views | Carts | Purchases | Meta spend (7-day window) |
|---|---:|---:|---:|---:|
| 2026-08-23 | 20 | 1 | 0 | — |
| 2026-08-24 | 21 | 2 | 0 | $75.53 (Aug 17–23) |
| **2026-08-25 (tonight)** | **21** | **3** | **0** | **$74.88 (Aug 18–24)** |

From `meta-insights-2026-08-24.csv` (Meta Marketing API, campaign level, window `20260818-20260824`
read from the file's own `#` header — this file was written by the local 02:00 nightly, I did not
create it):

| Marion Court campaign | Spend | Impressions | Clicks |
|---|---:|---:|---:|
| Marion Court Retargeting | $34.34 | 1,389 | 25 |
| Marion Court All Genders | $14.19 | 679 | 16 |
| Marion Court Female | $14.03 | 665 | 6 |
| Marion Court \| Traffic | $12.32 | 1,963 | 54 |
| **Total** | **$74.88** | **4,696** | **101** |

That is **28.9% of the account's $259.10 for the week**, at an average CPC of $0.74, producing
**one additional add-to-cart and zero purchases** since last night. On 2026-08-24 specifically the
item recorded **zero item views** (`download (9).csv`, day 0097) while the four campaigns were live.

**Window-comparability, per §1's explicit warning:** the $74.88 and last night's $75.53 come from
two *different* rolling 7-day windows (Aug 18–24 vs Aug 17–23). Their difference is Aug 24 minus
Aug 17, not a trend, and I am not presenting it as one. What the two windows jointly support is
that Marion Court has been spending roughly $10–11/day continuously since launching 2026-08-17, and
that the cumulative purchase count is still zero. **Whether individual Marion Court campaigns are
currently paused cannot be determined from a rolling window** — last night's report derived that
`All Genders` and `Female` spent $0.00 on Aug 23, and nothing in tonight's data confirms or refutes
whether that continued. A daily-granularity pull is needed to answer it.

### A10. Checkout instrumentation: still 18 errors against 1 `add_payment_info`

`download (30).csv` — *Checkout Error Breakdown*, a report type never analysed by title before:
**18 `checkout_error` events — `card_incomplete` 9, `(not set)` 8, `card_declined` 1.**

Against `add_payment_info` = **1 event** property-wide (`download (23).csv`). Both figures are
**identical to the 2026-08-23 report's**, so this has now failed to move across two exports and one
additional day.

At least 18 sessions reached a card field; exactly 1 recorded `add_payment_info`. As the 08-23
report said, that is instrumentation, not behaviour. The eight `(not set)` error categories are a
second, smaller gap — 44% of checkout errors are not being categorised at all, so the most common
failure mode may not be `card_incomplete` at all.

`ANALYTICS_CONTEXT.md` §1 already establishes that `add_payment_info` did not exist before
2026-08-21, so a low historical count is expected — but 1 event in the four full days *since* it
shipped, against 185 `checkout_form_started` events, is not explained by that.

### A11. Funnel reports: what is and is not readable

Three funnel files disagree with each other, and the disagreement is instructive.

| File | Report | Step counts |
|---|---|---|
| `download (33).csv` | *Funnel* | Session start 2,487 → Begin Checkout **93** → Purchase 14 |
| `download (29).csv` | *Checkout Events Tracking* | Begin Checkout **93** → Checkout Form Started 44 → Purchase 12 |
| `download (31).csv` | *Segment by Device* | Session start 2,487 → View product 265 → Add to cart 45 → Begin checkout **9** → Purchase 3 |
| `download (35).csv` | *Paid funnel drop-off* | session_start 2,487 → view_item 265 → add_to_cart 45 → begin_checkout **9** → add_payment_info **0** → purchase **0** |

**`begin_checkout` reads 93 in two files and 9 in the other two.** The difference is funnel shape,
not data: the 93 files count anyone who fired the event; the 9 files require it to follow
`add_to_cart` in sequence.

**All four of these funnels span 2026-08-21, so `begin_checkout` in every one of them is two
incompatible event definitions added together** (pre-#204 it fired on homepage/landing CTA clicks;
post-#204 at actual checkout start). Per `ANALYTICS_CONTEXT.md` §1, **I am not reporting any of the
four `begin_checkout` numbers as a measurement of user behaviour**, and neither should the next
report.

`download (35).csv`'s **`purchase` = 0 for every channel is a documented artifact, not a result**:
step 5 is `add_payment_info`, which did not exist before 2026-08-21, so step 6 reads 0 by
construction. Anyone reading that file cold would conclude paid social has never produced a sale.
It has — `download.csv` shows Meta paid at $152.45 across 5 transactions.

**What IS readable** — steps 1→3, which use events whose definitions did not change:
**2,487 users → 265 view product (10.7%) → 45 add to cart (17.0% of viewers).** Device split at
step 2: mobile 220 of 1,993 (11.0%), desktop 45 of 480 (9.4%) — mobile is slightly *better* at
reaching a product view, which is the opposite of the usual assumption.

### A12. Retention is ~2% at week 1

`download (32).csv` — *Retention & Cohorts*, never analysed before. Weekly cohorts, week-1 return
rate: **47 of 2,122 users (2.2%)** overall. The two largest recent cohorts:

- 2026-08-09 – 08-15: 484 users → **14 returned (2.9%)**
- 2026-08-16 – 08-22: 481 users → **5 returned (1.0%)**

For a business selling one-off event tickets rather than a subscription, low return traffic is not
automatically a failure — but 1.0% on the most recent complete cohort, in the week the site
changes shipped, is worth watching rather than assuming. Nothing actionable tonight; recorded as a
baseline so the next report has something to trend against.

---

## B. Corrections to earlier reports

1. **`ads_conversion_About_Us_1` is not frozen** (§A4). The 2026-08-24 report's "frozen at 97
   across two consecutive exports" is superseded: it reads 99 and fired twice on 2026-08-24.
2. **The 08-24 report's Eventbrite share (32.7% of GA4 revenue) is now 31.4%** (§A3) — not because
   Eventbrite changed but because the property total rose to $836.20.
3. **`ANALYTICS_CONTEXT.md`'s campaign table remains stale on the two rows the 08-24 run flagged** —
   `Marion Court | Traffic` is still absent from it and `Campaign 1 Event 3 Good Good Campaign` is
   still listed as ending 2026-08-13 while spending $17.30 in the Aug 18–24 window. That correction
   was recommended last night and has not been made. I have not made it either — that file is
   documentation, but it is a repo file and this run does not edit repo files.

---

## C. NEEDS TAYLOR INPUT

Strategy, money, targeting and copy — none of these are mine to decide.

1. **Is Philadelphia deliberate?** (§A2) 439 of 530 geo-identified users are in Philadelphia, for a
   calendar containing only Lancaster events, at $0.137 revenue per user against Lancaster's $1.135.
   Either the Philadelphia spend is buying an audience for a future Philadelphia event — in which
   case it is a legitimate cost and should be labelled as one — or the geo targeting is wrong.
   **This is the first time this split has been measured.**
   *Re-check in ~1 week:* `download (37).csv`'s equivalent — Philadelphia key events per active
   user, currently 1.4%.
2. **Kill or rebuild Marion Court — fourth consecutive report asking** (§A9). $74.88 in the last
   7-day window, 4,696 impressions, 101 clicks, 21 item views and **zero purchases** since 08-17.
   *Re-check in ~1 week:* item purchases for "SparkDate: Real People, Real Drinks, Real Court",
   currently 0.
3. **Is Eventbrite a deliberate channel or an accident?** (§A3) — **second ask.** 2.6% of the
   audience, 31.4% of recorded revenue, $4.11 per user against Meta paid's $0.09. If it is
   accidental, it is the highest-leverage accident in the account.
4. **Turn on GA4's internal-traffic filter — third ask.** This is a GA4 Admin setting, not code, so
   nightly runs cannot do it. Until it is on, every rate in every one of these reports includes
   Taylor's own sessions; `download (21).csv` still shows **6 of 52 lead-generating sessions landing
   on `/admin`.**
5. **Retire or demote `ads_conversion_About_Us_1` — second ask.** It is 47.1% of all key events and
   worth $0.00, and it makes Google Ads look like it converts at 81%.
6. **Is Google Ads still running?** — **third ask.** 123 users, 98 key events, **$27.49** total
   revenue across 98 days, and 93 of those key events are the About Us page view.
7. **The homepage still says "Your app matched you."** `/lp` was rewritten to "You show up. We
   handle the rest." on 2026-08-22 (#245) on the stated grounds that no ad mentions an app and four
   of nine sell against them. That change landed on `lp.html` only. `public/index.html` still
   carries the old line in the H1 (line 1109), the meta description (line 8), the og:description
   (line 12), the JSON-LD schema description (line 42) and the footer tagline (line 1281);
   `about.html` and `signup.html` carry it too. `/` is the **single largest landing page for
   `generate_lead`** — 13 of 52 sessions (`download (21).csv`) — and Direct is 364 users. Whether
   the homepage should follow `/lp` is a brand-voice call, so it is here rather than in §D.
   *Re-check in ~1 week:* `generate_lead` and `purchase` for sessions landing on `/`.
8. **Add a "the current day is partial until tomorrow's 02:00 pull" rule to
   `ANALYTICS_CONTEXT.md`** — **second ask** (raised by the 08-24 performance run). §A1 is the
   second night in a row where one sentence in that file would have removed a whole section of
   hedging.

---

## D. Proposed zero-risk fixes — described, NOT applied

None of these were made. Each is a change a human should make and review.

1. **Find the call site sending an empty `in_app_browser` value** (§A5). 115 of 470 events on
   2026-08-24 (24.5%) carry an empty string on the dimension that #265 just fixed. Suspect pattern:
   `in_app_browser: <expression returning undefined>` rather than omitting the key — the codebase
   uses exactly that pattern intentionally at `public/lp.html:795` for `target_event_id`.
   *Re-check in ~1 week:* the empty-string column in `download (27).csv`; target is 0.
2. **Make `/api/next-event` failures non-fatal to the ticket card in webviews** (§A6). 27 webview
   users and 0 direct-browser users hit the `.catch()` at `public/lp.html:790`. Worth first
   establishing *why* it only fails in webviews — a retry, a longer timeout, or server-rendering the
   next event into the page would each fix the symptom, and they are not equivalent.
   *Re-check in ~1 week:* `next_event_fetch_failed`, currently 61 property-wide / 29 in webview.
3. **Categorise the 8 uncategorised `checkout_error` events** (§A10). `(not set)` is 44% of all
   checkout errors, so the most common real failure mode is currently invisible.
   *Re-check in ~1 week:* the `(not set)` row in `download (30).csv`.
4. **Rebuild the Meta ad URLs with consistent lowercase `utm_source`** — repeated from the 08-24
   report, still not done (§A3). Reading the top Meta row alone currently understates Meta by 42%.
   Also gives per-ad attribution a chance, which `utm_content=proof_rsa1` currently makes impossible.
5. **Strip query parameters in the GA4 data stream settings** — repeated, GA4 configuration not
   code. `download (25).csv` still lists **1,240 distinct landing-page URLs for 1,375 paid sessions**
   (0.90 URLs per session) because `fbclid` and `eventId` are in the path. The busiest single URL
   is 15 sessions in 98 days.
6. **Reconcile the $72.50 revenue gap between `download.csv` and `download (11).csv`** (§A8) — two
   files in one export disagreeing by 8.7% on the same 31 transactions is worth ten minutes before
   either number is used in a decision.

---

## E. Method, parsing assumptions and caveats

**Freshness — how GA4 was chosen.** Every CSV's own `#` date-range header was read; **36 of 38
numbered files carry `20260519-20260824`**, one day past the `20260519-20260823` window that the
08-23 and 08-24 reports both analysed. That is a genuinely new export, so Prompt 9 is the pick per
the rotation note. Filenames and file timestamps were not used for this. Both run logs were checked
first (the prompt-library log and `TONIGHT_PROMPT.md`): the last three runs were GA4-traffic
(08-24), performance/M6 (08-24) and GA4+Meta (08-23).

**Two files did not refresh.** `download (20).csv` and `download (21).csv` — both halves of the
*Waitlist: Rescue or Cannibalize?* exploration — still carry **`20260519-20260823`**. They are one
day stale relative to the rest of the export and identical to what the 08-23 report analysed, so
**no new waitlist conclusion is drawn tonight.** The one figure I did reuse from them (6 of 52
lead sessions landing on `/admin`, §C4) is quoted as the 08-23 measurement, not as new.

**Duplicates.** 39 CSVs, **37 distinct md5s**: `download (5).csv` ≡ `download (6).csv` (Engagement
Rate Trend) and `download (7).csv` ≡ `download (8).csv` (Engaged Sessions Trend). Same report
downloaded twice. Neither is double-counted anywhere above.

**Report titles vs prior coverage.** Per the process lesson recorded in the 08-24 run log, I
diffed each file's own title line against the two most recent GA4 reports rather than relying on
the date-range header alone. Never covered by any prior report: ***Philly vs Lancaster***,
***Checkout Error Breakdown*** (as a report; its numbers were quoted in the 08-23 text),
***Revenue by Item*** / ***Views-Cart Ratio***. That is what §A2, §A8 and §A10 are built on.

**Parsing.** Every file was parsed from its real header row after the `#` metadata block, per
Prompt 9. `download (2).csv`, `download (9).csv`, `download (13).csv`, `download (22).csv` and the
Monthly Trends files use GA4's pivoted "Nth day" layout with one column per day and a variable,
non-contiguous column set — column indices were read from each file's own header rather than
assumed, and day indices are **0-based** (day `0000` = 2026-05-19, so **day `0097` = 2026-08-24**).
That mapping was cross-checked three ways: the cohort file's last weekly cohort is `20260823-20260824`;
`download (13).csv` shows 1 purchase on day 0097; and `download.csv`'s revenue total rose by exactly
the day-0097 revenue-trend value ($32.49).

**The Campaign Performance exploration was rebuilt between exports.** The 08-24 report read
`download (24).csv` as *3,566 sessions / 2,418 users / 206 key events*; tonight the same file has
**no Sessions column at all** and reads *2,489 active users / 210 key events / $836.20*. So
tonight's channel shares are computed on **active users**, and are **not** directly comparable to
the session-based shares in the 08-24 report. Where I compare the two (§A3) I say which
denominator each used. Users 2,418 → 2,489 (+71) and key events 206 → 210 (+4) are comparable.

**Row-sum reconciliation.** `download (24).csv` row sums come to 2,603 active users against its own
grand total of 2,489 — **+114, 4.6%**. Expected: active users are de-duplicated across source rows,
so rows legitimately over-sum. **Key events (210) and revenue ($836.20) reconcile exactly.** All
channel percentages above use the file's own grand total as the denominator; the smallest ratio
argued is 8.3×, so nothing here moves on a 4.6% denominator question.

**`ANALYTICS_CONTEXT.md` caveats applied tonight, explicitly:**

- §1 `begin_checkout` changed meaning 2026-08-21 → **four funnel files' `begin_checkout` steps
  refused** (§A11).
- §1 `add_payment_info` did not exist before 2026-08-21 → **`download (35).csv`'s all-zero purchase
  row explained as an artifact, not reported as a result** (§A11).
- §1 GA4 revenue is own-site only (~55% missing) → every revenue figure labelled as GA4-recorded,
  not total; admin dashboard named as the truth (§A3, §A8).
- §1 engagement time unreliable in webviews → **§A1 and §A7 both declined to draw a behavioural
  conclusion from engagement metrics**; discrete event counts used instead.
- §1 internal traffic unfiltered → §C4 restated; direct/email rows flagged as contaminated.
- §1 Meta rolling windows fake trends → **§A9 explicitly refuses to read $75.53 → $74.88 as a
  trend** and states what the two windows jointly do and do not support.
- §1 Meta case fragmentation → all five Meta variants summed before any share was quoted (§A3).
- §2 verify segments sum to the total → **applied and it caught two discrepancies**: A+B vs C in
  `download (18).csv` (off by 3) and Philadelphia+Lancaster vs grand total in `download (37).csv`
  (off by 5). Both disclosed.
- §5 small samples → counts stated alongside every percentage below the top of the funnel; the
  Philadelphia/Lancaster cells (n=6 and n=16 key events) carry an explicit "do not treat as a
  precise multiplier" warning.

**Where tonight's numbers contradict `ANALYTICS_CONTEXT.md`, said plainly:** §3 records the webview
share of paid social as 61% and the 08-24 report put Meta mobile webview at 67%; the first fully-
tagged day (2026-08-24) gives **76.6%** (§A5). One day is not enough to update that file, and I have
not updated it.

**What was NOT done.** No Windsor MCP pull — the existing `meta-insights-2026-08-24.csv` written by
the local 02:00 nightly already provided a complete campaign-level week, and mixing a second source
in would reintroduce the source-mismatch noise the 08-23 report documented. No daily-granularity
Meta data newer than `meta-insights-daily-2026-08-23.csv`, which is why §A9 cannot say whether
individual Marion Court campaigns are currently paused. No Lighthouse or performance work — that
was the 08-24 run. Source files under `/tmp/sparkwork` were read only; the Night Tasks CSVs were
read in place and not moved, renamed or modified.

**Review backlog note.** `main` at `ad4dfbc` contains the earlier report PRs, but this branch is the
fifth report awaiting Taylor's gate this week. The Marion Court question is now on its fourth ask
and the internal-traffic-filter question on its third; both are single decisions that would change
what the next several reports can measure.
