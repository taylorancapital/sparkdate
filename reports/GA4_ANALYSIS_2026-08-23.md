# SparkDate — GA4 + Meta Analysis, 2026-08-23

**Run:** Cowork session, user-requested (fresh Meta pull + newly dropped GA4 export)
**GA4 export:** 36 CSVs + `data.pdf`, window `20260519-20260823`, dropped today 14:44–15:24
**Meta:** pulled fresh this session via Windsor → `meta-insights-2026-08-23.csv` (campaign, Aug 17–23)
and `meta-insights-daily-2026-08-23.csv` (campaign × day, Aug 15–23)
**Prior period:** `reports/GA4_ANALYSIS_2026-08-22.md` (window `…-20260822`, $803.71 / 30)
**Repo state:** `main` @ `777071f` — *"Put paid on the schedule, weighted to when tickets actually sell (#260)"*, Sun Aug 23 15:16 −0400

> **Zero code changes.** This branch adds one file: this report. The two Meta CSVs were written
> into the Night Tasks data-drop folder as the artifact of the pull; no source, config or
> `package*.json` was touched.

`ANALYTICS_CONTEXT.md` was re-read in full first — **it changed today** (13,966 → 17,425 bytes) and
two of its new sections directly overturn a headline from the 08-22 report. Details in §F6 and the
caveats note.

---

## Headline

**The waitlist question is answered, and the answer is "rescuing".** A new GA4 exploration —
*Waitlist: Rescue or Cannibalize?* — closes `ANALYTICS_CONTEXT.md` open question 1, which has been
open across several reports. **Of 52 sessions that fired `generate_lead`, 39 never viewed an item
and 13 did.** The email capture is overwhelmingly catching people who were never on a path to a
ticket.

Two things temper it, both required by the context file:

- **Internal traffic is in that 52.** `download (5).csv` shows the landing pages of those lead
  sessions: **6 landed on `/admin`**, 4 on `/matches`, 1 on `/profile` — 11 sessions that are you,
  a test, or a signed-in member, not a lead. The two tables cannot be cross-tabulated in this
  export, so the 39/13 split cannot be re-derived on clean traffic. The direction is not in doubt;
  the exact ratio is.
- **The `SEQ` column in that same file is broken and was not used.** It reports **476** sessions for
  *"view_item then generate_lead"* — larger than the 245 sessions that fired `view_item` at all
  (`download (28).csv`), and impossible against 52 lead sessions. Whatever that segment is
  matching, it is not its label.

**Meanwhile the business is quiet.** GA4 revenue is **$803.71 / 30 transactions — identical to the
08-22 report, to the cent, across a full extra day.** Meta agrees: **zero purchases on Aug 20, 21,
22 and 23.** The last recorded Meta purchase was **Aug 19**.

---

## F1 — Meta: spend has fallen six days running, and the shape of the account changed on Aug 22

Reported daily, per the rolling-window caveat. A 7-day window total ($267.44 → $276.95) would say
"flat" and would be wrong.

| Date | Spend | Clicks | Impressions | Purchases | Leads | Campaigns |
|---|---|---|---|---|---|---|
| 2026-08-15 | $38.63 | 80 | 1,426 | 1 | 0 | 6 |
| 2026-08-16 | $16.51 | 46 | 806 | 0 | 2 | 6 |
| 2026-08-17 | **$62.38** | 98 | 2,239 | 1 | 2 | 9 |
| 2026-08-18 | $57.48 | 75 | 1,844 | 1 | 9 | 9 |
| 2026-08-19 | $43.56 | 49 | 1,497 | **1** | 1 | 9 |
| 2026-08-20 | $37.64 | 46 | 1,371 | 0 | 1 | 9 |
| 2026-08-21 | $30.91 | 53 | 1,491 | 0 | 0 | 9 |
| 2026-08-22 | $23.85 | 63 | 1,699 | 0 | 0 | **11** |
| 2026-08-23 *(partial)* | $21.13 | 50 | 1,758 | 0 | 2 | 7 |

**Spend is down 66% from the Aug 17 peak, declining every single day.** The 08-22 report called
this at ~50% over five days; it has continued for two more.

**Two campaigns appeared on 2026-08-22 and neither is in `ANALYTICS_CONTEXT.md`'s campaign table:**

- **`Campaign 1 Event 3 Good Good Campaign` is live again.** The context table records its last
  spend as **2026-08-13**. It resumed **2026-08-22** ($3.80) and ran again Aug 23 ($3.35).
- **`Marion Court | Traffic` is brand new**, first spend **2026-08-22** ($0.18), then $3.73 on Aug 23.

Both look like traffic-objective buys, and they are cheap in a way nothing else in the account is:

| Campaign (Aug 17–23) | Spend | CPM | CPC | Landing page views |
|---|---|---|---|---|
| Campaign 1 Event 3 Good Good Campaign | $7.15 | **$6.11** | **$0.149** | 37 |
| Marion Court \| Traffic | $3.91 | **$6.44** | **$0.261** | 13 |
| *(sales-objective campaigns, range)* | $17–46 | $21–32 | $0.61–1.58 | 3–38 |

On **Aug 23 those two are 33% of spend ($7.08 of $21.13) but 78% of clicks (39 of 50) and 85% of
landing-page views (35 of 41).** Their CPMs are a quarter of everything else's. Whether that traffic
is worth anything is a separate question — neither has produced a purchase — but the buying pattern
changed on Aug 22 and no prior report has recorded it.

Also worth noting: **`Marion Court All Genders` and `Marion Court Female` last spent on Aug 22** and
have no Aug 23 rows, while `Marion Court | Traffic` started. That reads like a deliberate swap, but
one partial day is not enough to call it — check tomorrow before treating either as ended.

**Marion Court still has zero purchases, now visible on the GA4 side too.** $69.80 across its four
campaigns Aug 17–23, and its event item — **"SparkDate: Real People, Real Drinks, Real Court"** —
shows **20 items viewed, 1 added to cart, 0 purchased, $0.00 revenue** (`download (20).csv`). This
is the first export in which the item appears at all.

---

## F2 — A second internal UI name is now a GA4 traffic source

The 08-22 report flagged `get_tickets_block / (not set)` as a session source it could not explain.
**`sticky_ticket_bar / (not set)` has now joined it** (`download (2).csv`, 1 active user, 0 key
events, $0.00).

What is now established:

- Both strings are `promotion_name` values on **`public/index.html`** —
  `get_tickets_block` at `index.html:1098`, `sticky_ticket_bar` at `index.html:1430`. Both are
  plain `gtag('event','select_promotion', {...})` calls that set no source of any kind.
- **Neither has ever existed as a `utm_source` anywhere in git history.** Checked with
  `git log -S"utm_source=get_tickets_block"` and `-S"utm_source=sticky_ticket_bar"` across all refs
  after `fetch --unshallow`; the only hit is the 08-22 report itself quoting the string.
- **This is not new code.** `get_tickets_block` shipped 2026-06-05 (`58c83b8`); `sticky_ticket_bar`
  shipped **2026-08-07** (`d3b686c`, PR #155) — *not* in the Aug 22 batch, which is what I first
  assumed and had to discard.
- `lp.html`'s `lp_sticky_bar` (shipped 2026-08-22, #243) has **not** appeared as a source. So the
  pattern currently covers exactly the two `index.html` promotion names.

**The scale is much larger than the 08-22 report could see, because that report only had the
session-scoped view.** Two different tables give two different sizes, and they should not be mixed:

| Attribution scope | Phantom-source revenue | Share of $803.71 |
|---|---|---|
| **Session-scoped**, whole transactions (`download (27).csv`) | `get_tickets_block` $27.49 + `matches` $27.49 = **$54.98** (2 of 30 txns) | 6.8% |
| **Event-scoped**, data-driven fractional (`download (17).csv`) | `lp` $118.89 + `get_tickets_block` $58.73 + `events` $7.57 = **$185.19** (6.54 of 30) | **23.0%** |

The session-scoped figure is unchanged from 08-22. The event-scoped one is new here, and it says
**roughly a quarter of GA4's purchase credit is assigned to strings that name our own pages and UI
elements rather than any channel.**

One more thread on the same knot: `download (14).csv` shows **`view_item` from `lp / (not set)` =
20 events from a single user**, plus 8 `checkout_form_started` from that same one user. A single
session generating 20 product views under a phantom source is what internal or test traffic looks
like — and per the context file's new section, **this property has no internal-traffic filter at
all.**

---

## F3 — `select_promotion` more than doubled; the CTA work is producing taps

| | 08-22 export | 08-23 export |
|---|---|---|
| `select_promotion` (sitewide events) | 9 | **24** |
| `add_payment_info` | 1 | **1** |

**+15 `select_promotion` events in one day**, against 9 accumulated in the prior day and a half.
That is the sticky bar and the moved CTA doing what #243 intended.

**But open question 2 still cannot be answered.** The `promotion_name` dimension is *still* not in
the export, so the `lp_sticky_bar` share is unknown — the same gap the 08-22 report flagged. What
is available: `download (11).csv` places **13 of the 24 in paid-social mobile (6 webview, 7 direct
browser)**. A Free-form with `promotion_name` as a dimension is a five-minute build and would close
a question that has now been open for two reports.

`add_payment_info` stuck at **1** is the more troubling number. `begin_checkout` now fires correctly
at real checkout start and has **129 events**, yet exactly one `add_payment_info` has ever fired.
See §F7.

---

## F4 — Android in-app browser is a dead end, and iOS is not

From `download (13).csv` and `download (15).csv`:

| | Sessions | Key events |
|---|---|---|
| In-app browser, **iOS** | 734 | 9 |
| In-app browser, **Android** | 324 | **0** |
| All in-app browser | 1,096 (31.3% of 3,499) | 9 |

**324 Android in-app-browser sessions produced zero key events of any kind** — no lead, no purchase,
nothing. And every one of the **118 `in_app_browser_escape_attempt` events is Android; iOS fired
zero** (`download (15).csv`). Android users are visibly trying to get out of the Meta webview and
are converting at nothing when they do not.

`in_app_browser_checkout_blocked` (12) and `_override` (2) are present exactly as
`ANALYTICS_CONTEXT.md` describes them — ghosts from a removed build, split 7/5 and 0/2 across
iOS/Android. Not current behaviour, not counted as such here.

---

## F5 — `/lp` engagement, webview vs direct browser

`download (10).csv`, paid social mobile, landing page `/lp` (n = 1,447 sessions):

| | All paid social mobile | Webview (A) | Direct browser (B) |
|---|---|---|---|
| Sessions | 1,447 | 923 | 526 |
| Avg engagement time / session | 4.70s | **2.71s** | **8.19s** |
| Bounce rate | 69.2% | **64.2%** | **78.1%** |
| Engaged sessions | 446 | 330 | 115 |

Webview bounces *less* but engages a third as long. Per the context file's engagement-time caveat,
the 2.71s is partly missing instrumentation, not measured inattention — `user_engagement` fires on
visibility/focus changes, which is exactly what Meta's webview handles badly. **Prefer the discrete
counts below to either of these numbers.**

`scroll` remains the flat line it was before the CTA move: **144 of 1,027 webview sessions (14.0%)
and 78 of 611 direct-browser (12.8%)** fired it. The context file's pre-fix figures were 14% and
11%. One post-change day inside a 90-day window cannot move a cumulative rate, so **this is not
evidence the CTA move failed** — it is evidence the window is too long to see it. Re-check on a
window starting 2026-08-23.

---

## F6 — Retracting the 08-22 report's F3 headline

`ANALYTICS_CONTEXT.md` gained a section today stating that `lead_form_started` does not pair with
`generate_lead` (51 lead sessions, only 21 with a recorded form start) and naming
`GA4_ANALYSIS_2026-08-22.md` §F3 specifically as something not to rely on.

**This export supplies the numeric proof:**

| paid social mobile | 08-22 export | 08-23 export | Change |
|---|---|---|---|
| Sessions, webview (A) | 954 | 1,027 | +8% |
| Sessions, direct (B) | 576 | 611 | +6% |
| `lead_form_started`, webview | **13** | **42** | **+223%** |
| `lead_form_started`, direct | 48 | 58 | +21% |

A 223% rise in a 90-day cumulative counter while its denominator moved 8% is not behaviour. **The
segments were rebuilt between the two exports** — today's A and B partition C exactly by sessions
(1,027 + 611 = 1,638 against C = 1,637), which the 08-22 pair did not (954 + 576 = 1,530). That
matches the context file's note that "Exclude permanently" was properly tested on 2026-08-23 and
partitioned cleanly.

So the 08-22 conclusion — *"it is the direct-browser users filling in the form"* — **should be
treated as withdrawn.** It was measuring the segment definition. Note the partition is exact for
sessions but not users (962 + 546 = 1,508 against 1,497), which is expected: a user can appear in
both segments across different sessions. Do not compute a user-scoped rate from these two segments.

Using `generate_lead` instead, as the context file directs: **5 webview sessions against 4 direct
browser** (`download (11).csv`). Nine sessions total. That is far too small to carry any conclusion
and is reported only so the next run has the baseline.

---

## F7 — Funnels: what is readable and what is not

**Not readable, and no conclusion drawn:** `download (28).csv` (Paid funnel drop-off) and
`download (29).csv` show **`purchase` = 0 for every channel and every segment**. Per
`ANALYTICS_CONTEXT.md`, `add_payment_info` did not exist before 2026-08-21, so any funnel with it as
a step reads 0 for every step after it — which drives `purchase` to 0 even though 30 real purchases
happened. **This is the trap working exactly as documented, not a finding.** Both explorations also
span 2026-08-21, so their `begin_checkout` step mixes two incompatible definitions.

Two more disagree with each other on the paid denominator and should not be mixed:
`download (28)` reports Paid Social `session_start` = **1,605**; `download (29)`'s two paid-social
segments sum to **1,860**. Different segment definitions, same label.

**Readable, because it stops above `add_payment_info`:** `download (30).csv` —
`begin_checkout` 84 → `checkout_form_started` 36 → `purchase` 11. And `download (32).csv` —
`session_start` 2,373 → `begin_checkout` 84 → `purchase` 13. Both still straddle Aug 21, so the
84 mixes old-definition CTA taps with new-definition real checkout starts. Treat 84 as an upper
bound.

Against that, **`add_payment_info` = 1 across 129 `begin_checkout` events** is the number worth
someone's attention. Either the event is mis-wired, or essentially nobody reaches the card field.
`checkout_error` = 18 (9 `card_incomplete`, 8 `(not set)`, 1 `card_declined`) suggests at least 18
sessions *did* reach a card. That is inconsistent with a single `add_payment_info` and points at
instrumentation rather than behaviour.

---

## F8 — Frozen counters, second consecutive export

| Event | Aug 19 | Aug 22 | **Aug 23** |
|---|---|---|---|
| `next_event_fetch_failed` | 60 | 60 | **60** |
| `checkout_error` | 18 | 18 | **18** |
| `ads_conversion_About_Us_1` | 97 | 97 | **97** |
| `getaway_interest` | 203 | 203 | **204** |

`next_event_fetch_failed` frozen at 60 for a fourth day is **good news holding** — zero new degraded
`/lp` landings since the 08-21 report measured 67 of 824 (8.1%).

`ads_conversion_About_Us_1` frozen at 97 for a second consecutive export, with `google / cpc`
revenue still exactly $27.49, now looks less like a pause and more like **Google Ads has stopped
delivering**. `download (18).csv` supports it: that event shows zero across roughly the last
fourteen day-columns. It has dominated the key-event count in every report since 07-26 and is worth
$0.00.

---

## F9 — Unchanged standing items (recorded so they are not re-investigated)

- **Source-vs-item revenue gap reconciles exactly**: $803.71 − $733.71 = **$70.00 = 28 × $2.50**
  against 30 transactions. Same as 08-22. The two legacy fee-free transactions persist.
- **`fbclid` duplication: 1,141 of 1,142 paid landing-page rows (99.9%)** carry it twice — same rate
  as 08-22 (1,072/1,073), ~69 more rows. Still unfixed.
- **`eventId` repetition: 826 of 1,150 rows** carrying `eventId` carry it two or more times (72%).
- **Founders Mixer: 0 viewed / 0 carted / 8 purchased / $192.93** — unchanged, roughly the 12th
  consecutive report.
- **Philadelphia vs Lancaster**: Philadelphia 410 users → 5 key events → $27.49; Lancaster 93 users
  → 16 key events → $108.96. Philadelphia draws 4.4× the users and returns a quarter of the revenue,
  at a 34.4% engagement rate against Lancaster's 52.3%.

---

## NEEDS TAYLOR INPUT

1. **Why is Meta spend winding down?** Six consecutive days of decline, −66% from Aug 17, with
   two cheap traffic-objective campaigns started Aug 22. If this is deliberate, say so and the
   nightly reports will stop flagging it. If it is not, something is throttling delivery.
2. **Kill or rebuild Marion Court.** $69.80 across four campaigns Aug 17–23, zero purchases ever,
   and its event item is 20 viewed / 1 carted / **0 purchased**. Its all-genders and female
   campaigns appear to have stopped on Aug 22 in favour of `Marion Court | Traffic`; confirm that
   is intentional.
3. **Is Google Ads still running?** `ads_conversion_About_Us_1` frozen at 97 for two exports,
   `google / cpc` frozen at $27.49, zero fires across ~14 recent days.
4. **The phantom-source problem is now ~23% of GA4 purchase credit**, not 6.8%. It is not in our
   code and not in our git history, so it needs someone with GA4 UI access to look at data-import
   or Google Ads conversion-import settings. Until then, every channel-level revenue number in
   these reports understates real channels by whatever share these strings absorb.
5. **Turn on an internal-traffic filter.** 6 of 52 lead sessions landed on `/admin`, and one user
   is generating 20 `view_item` events under a phantom source. This is a GA4 Admin setting, not a
   code change, and it silently distorts every small-n figure in every report.

---

## Proposed zero-risk work — NOT APPLIED

None of these are code, and none were done.

1. **Add a Free-form with `promotion_name` as a dimension** against `select_promotion`. Closes open
   question 2, which is now two reports old. Five minutes in the GA4 UI.
2. **Re-run the waitlist exploration with `/admin`, `/matches` and `/profile` landings excluded**,
   and add landing page as a breakdown so the 39/13 split can be re-derived on clean traffic.
3. **Fix or delete the `SEQ` segment** in *Waitlist: Rescue or Cannibalize?* — it reports 476
   sessions for a sequence that cannot exceed 52.
4. **Rebuild the paid funnel exploration without `add_payment_info` as a step**, on a window
   starting 2026-08-23. As built it reports 0 purchases across every channel and always will.
5. **Refresh `ANALYTICS_CONTEXT.md`'s campaign table** — `Campaign 1 Event 3 Good Good Campaign` is
   live again (last-spend 2026-08-13 is wrong), and `Marion Court | Traffic` is missing entirely.

---

## What to re-check, and when

| Item | Metric | When |
|---|---|---|
| Did the CTA move work? | `view_item` from paid social and `select_promotion` on a window **starting 2026-08-23** | ~1 week (2026-08-30) |
| `lp_sticky_bar` share | `select_promotion` split by `promotion_name` | As soon as the dimension is added |
| Waitlist rescue vs cannibalise | `generate_lead` sessions with/without `view_item`, `/admin` excluded | ~1 week, once n > 52 |
| Meta wind-down | Daily spend — is Aug 24 below $21.13? | Tomorrow |
| Marion Court | Any purchase at all; item view→cart on "Real People, Real Drinks, Real Court" | ~1 week |
| Google Ads | `ads_conversion_About_Us_1` — still 97? | Next export |
| Phantom sources | Whether `lp_sticky_bar` joins `lp` / `get_tickets_block` / `sticky_ticket_bar` | Next export |
| `add_payment_info` | Count against `begin_checkout`; 1 vs 129 today | Next export |

---

## Method and caveats

**Freshness, verified from each file's own `#` header, not filenames or timestamps.** All 36 CSVs
carry window `20260519-20260823`. Unlike the previous drop, **there are no duplicate files** — all
36 md5s are distinct. Two report types are new: *Waitlist: Rescue or Cannibalize?* (2 tables) and
*In-app browser impact* (4 tables). `data.pdf` is present. The file-number → report-type map is
**again completely different** from the 08-22 export's; it was rebuilt from each file's own title
line, as it must be every time.

**Meta came via the Windsor MCP, not `scripts/fetch-meta-insights.js`** — no `META_ADS_ACCESS_TOKEN`
and no route to `graph.facebook.com` from this sandbox. Action data therefore arrives as discrete
columns rather than the packed `actions` string the script emits, so it is **not byte-comparable**
with the Aug 19/20 pulls. Same account (1672342180672647), same campaign level, same window
convention. **2026-08-23 is today and partial** in both the Meta pull and the GA4 export.

**`ANALYTICS_CONTEXT.md` caveats applied to tonight's numbers:**

- **`begin_checkout` redefinition (2026-08-21):** applied — §F7 refuses to trend the 84 and labels
  it an upper bound.
- **`add_payment_info` did not exist before 08-21:** applied — §F7 explains the all-zero purchase
  rows in two funnels as the documented artifact rather than a finding.
- **Meta rolling windows fake trends:** applied — §F1 is reported daily; the 7-day totals
  ($267.44 → $276.95) are named only to show they would have said "flat".
- **GA4 revenue is own-site only (~55% via Eventbrite/Meetup):** applied — no GA4 figure is
  presented as business revenue.
- **`view_item` does not fire on `/lp`:** applied — click-through language used throughout.
- **Engagement time unreliable in webviews:** applied — §F5 states it and defers to discrete counts.
- **`lead_form_started` does not pair with `generate_lead`:** applied, and §F6 supplies the
  numbers that retract the 08-22 report's F3.
- **Internal traffic is not filtered:** applied — the `/admin` contamination is stated in the
  headline rather than buried, and drives NEEDS TAYLOR INPUT #5.
- **Sample sizes (§5):** applied — every sub-`add_to_cart` figure is given as a raw count.

**Where a computed number contradicts the context file**, per its own instruction: the campaign
table in §1 lists `Campaign 1 Event 3 Good Good Campaign` as last spending 2026-08-13. **Tonight's
daily pull shows it spending on 2026-08-22 and 2026-08-23.** The pull is the newer measurement; the
table needs refreshing, not the pull.

**Limits of this run.** No browser or network egress, so nothing was verified against the live site
or the GA4 UI — the phantom-source mechanism could only be ruled *out* of the codebase, not traced
to its actual origin. The waitlist answer rests on one export and cannot be cleaned of internal
traffic without a re-run. Day-index → calendar-date mapping in the *Monthly Trends* tables was **not**
attempted: GA4's "Nth day" columns are ordinal positions that skip days with no data, so the
last-day engagement-rate artifact tracked by six prior reports is **not** confirmed or denied here.
