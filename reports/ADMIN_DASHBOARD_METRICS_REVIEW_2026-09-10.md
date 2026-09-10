# Admin dashboard metrics review — 2026-09-10

**Question asked:** review `public/admin.html` and propose improvements, and
name metrics that should be tracked and are not.

**Method:** read every metric-computing function in `public/admin.html`
(8,915 lines: `renderKPIs`, `renderReport`, `renderCampaigns`, `costSeries`,
`eventCosts`, `renderEventPnl`, `renderChannelPnl`, `loadRetention`,
`loadFunnel`, `mixCell`, `renderLeads`), then ran a **read-only** inventory
against live Firestore (`fs-inventory.js`, `fs-inventory2.js`, scratchpad,
not committed) to measure what the dashboard's numbers are actually built on.
No code was changed. Ticket, registration, event, user, lead, ad-spend and
match collections were read in full; nothing was written.

**Data provenance:** Firestore project `sparkdate-philly`, read 2026-09-10
~10:00 local via the Firebase admin service account. Counts below are
as-of that read. Marion Court (09-08) was two days old at read time, so its
post-event numbers are still accumulating and are marked as such.

---

## HEADLINE

**The dashboard measures money well and never measures the promise.** The
product's stated value — *"if they tell us the same about you, we exchange
your contact info"* — is fully recorded in Firestore (231 picks, 34 mutual
matches, 113 pick-your-matches prompts across five events) and
**`admin.html` reads none of those three collections.** Admin already has
read access to all three in `firestore.rules`; nothing is blocked except the
dashboard code.

Read against that data, the five past events do not look alike:

| event | date | attendees | picked anyone | picks | mutual matches | attendees matched |
|---|---|---:|---:|---:|---:|---:|
| Founders Mixer | 06-24 | 24 | 15 | 67 | 12 | **11 (46%)** |
| Round 2 — Summer Nights | 07-29 | 30 | 16 | 47 | 13 | **14 (47%)** |
| Tellus AfterDark: Singles Edition | 08-26 | 34 | 13 | 36 | 2 | **3 (9%)** |
| Good Good Night | 08-31 | 23 | 10 | 21 | 4 | 6 (26%) |
| Marion Court *(2 days old)* | 09-08 | 29 | 11 | 60 | 3 | 5 (17%) |

"Attendees" is confirmed registrations. Tellus had the **best gender ratio of
any event (16 W / 18 M, 47% women)** and produced the fewest matches per head
by a wide margin. Tellus is also the venue booked again for 2026-10-06 (TL2).
Why Tellus is the outlier is **not verified** here — see §NOT VERIFIED — but
the point of this review is that nobody could have seen it on the dashboard.

Three other things stand out, in order of how soon they bite:

1. **The all-time revenue, P&L and CAC figures silently truncate at 200
   tickets.** `loadPayments()` and the live-ticket listener both read
   `limit(200)`. There are **145 confirmed tickets now**, events run ~20–30
   each, so the cap lands in roughly two events. Nothing on the page will say
   so; every all-time number will just stop growing.
2. **Est. LTV double-counts repeat purchases.** `arpu` is already
   ticket revenue ÷ unique buyers — lifetime-to-date spend per buyer,
   repeats included — and is then multiplied by `max(avgEvents, 1.5)`. Real
   ARPU is $23.88; the card prints $35.82. LTV:CAC and its 3:1 badge inherit
   the error.
3. **"Paid" means "not comped", not "paid money."** 29 of the 133 "paid"
   tickets carry `amount: 0`: 21 Eventbrite free-tier tickets, 7 two-for-one
   plus-ones, 1 manual import. 105 "unique buyers" on the card versus **87
   people who ever paid anything**.

---

## EVIDENCE — what the dashboard tracks today

Nine tabs. What each one computes, from the code:

| tab | metrics | source | notes |
|---|---|---|---|
| Overview | Total members, Net revenue, Blended CAC, Ticket velocity; 30-day sparklines; rotating revenue / cost / tickets / gender chart | `users`, `tickets` (≤200), `events`, `ad_spend`, `recurring_costs` | Hero band is trailing 30 days vs the 30 before |
| Full Report | the same KPIs re-ordered; gross → EB fees → acquisition → delivery → net strip; tickets-by-event bars; velocity donut; revenue+cost and tickets charts (30 d); "when tickets sell" weekday×daypart heatmap; recent signups; live activity | same | Heatmap is browser-timezone, by purchase timestamp |
| Revenue | Ticket revenue, Revenue/buyer, Est. LTV, LTV:CAC, Active subscriptions; subscription breakdown; payment history | `tickets`, `payments` | `payments` has **0 documents**; all 117 users have `subscriptionStatus: null` |
| Ads | spend / clicks / CPC / tickets / cost-per-ticket by event; cost by campaign → ad set, with objective badge; trailing-7-day cost per ticket | `ad_spend` (107 days: 91 Meta, 16 Google Ads; $1,393.24 since 06-01) | Window selector 2/7/14/30/all |
| P&L | Channel P&L (Direct / Eventbrite / Meetup: gross, acquisition, fees, net, margin, rev/ticket); recurring costs by month; Event P&L with expandable cost detail | `tickets`, `events`, `ad_spend`, `recurring_costs` | EB fees actual where `ebFeeCents` exists (52 of 84), estimated otherwise; Stripe fees estimated |
| Events | scheduled events with sold/spots, gender mix cell, live Eventbrite count, cost fields; new-event form; chemistry / seating / run of show | `events`, `event_registrations`, EB API | Mix cell switches to "door N · %show" **only when `doorCount` is set — it never has been** |
| Retention | events with attendance, unique attendees, avg/event; repeat attendance histogram (once/twice/3+); digital check-in coverage; consecutive-event return rate; attendees per event | `event_registrations` | Coverage today: 91 / 140 past confirmed regs checked in (65%) |
| Funnel | leads → converted → revenue by lead source; buyer reconciliation (buyers with / without a lead) | `leads` (150), `tickets` | Email-join only; no web funnel |
| Leads | per-lead nurture grid with sent/delivered/opened/clicked evidence per step; unsubscribe | `leads` | Per-row evidence, **no aggregate rate anywhere** |

Cost handling is careful and worth keeping as-is: acquisition / transaction /
delivery are separated so Eventbrite's cut never lands in CAC; synced Meta
spend beats the hand-typed `costFacebook`; null and zero are distinguished
("not measured" vs "measured, nothing"); estimates are labelled as estimates.
None of that is in question below.

---

## EVIDENCE — metrics that are stored and never shown

### 1. Post-event matching (the product outcome)

Collections: `connection_intents` (231 docs: `fromUserId`, `toUserId`,
`eventId`, `createdAt`), `matches` (34: `eventId`, `users[]`, `matchedAt`),
`post_event_prompts` (113: `userId`, `eventId`, `sentAt`). Zero reads from
`admin.html`. Rules already grant admin read on all three.

Four numbers per event, all computable from what exists:

- **Participation** — attendees who picked at least one person ÷ attendees.
  Range today 43%–63%. Founders Mixer: 15 of 24. Tellus: 13 of 34.
- **Picks per picker** — 67/15 = 4.5 at Founders, 60/11 = 5.5 at Marion
  Court, 36/13 = 2.8 at Tellus.
- **Reciprocity** — matched pairs × 2 ÷ picks. Round 2: 55%. Founders: 36%.
  Good Good: 38%. **Tellus: 11%.** (Marion Court 10% but still open.)
- **Attendees matched** — people in at least one mutual match ÷ attendees.
  The table in the headline.

Who is picking is also visible and lopsided: across all five events, 17
women and 48 men picked anyone. At Tellus, 2 women picked versus 11 men.

### 2. Sales pacing against the event date

Every past event's cumulative sales at fixed distances from the event
(paid tickets, comps excluded):

| event | on sale (days) | sold by T-30 | T-14 | T-7 | T-1 | final |
|---|---:|---:|---:|---:|---:|---:|
| Founders Mixer | 19 | 0 | 2 | 9 | 20 | 21 |
| Round 2 | 37 | 4 | 13 | 19 | 27 | 29 |
| Tellus (Aug) | 20 | 0 | 7 | 20 | 27 | 29 |
| Good Good | 27 | 0 | 6 | 11 | 17 | 19 |
| Marion Court | 30 | 0 | 4 | 11 | 16 | 19 |

Across all 128 dated paid tickets: 9 sold on the day or the day before, 37 in
T-2..7, 38 in T-8..14, 33 in T-15..30, 10 earlier. **Two-thirds sell inside
the final two weeks**, which matches the `brand.json` curve.

The dashboard's **Ticket Velocity** KPI divides tickets sold by days since the
event doc was created and compares it with a flat 1.5/day. Against the curve
above, that reads "behind pace" for almost every event until about T-7, and
then flips. Today: Loxleys (T-12, 10 sold) sits **inside** the past-event
range at T-12 (Round 2 had 13, Marion Court 4, Tellus ~7). Tellus Oct 6
(T-26, 1 sold) is on the flat part of the curve, which is where every past
event was at T-26. The KPI cannot say either of those things.

### 3. Women, as a metric rather than a cell

Women are the constraint (`two-for-one-is-female-ads-only`,
`good-good-was-19-to-1`, the 09-02 women-acquisition brainstorm). Today the
only gender readout is the per-event mix cell on the Events tab and the
30-day rotating chart. Confirmed registrations all-time: 60 W / 97 M (38%).
Per event: Founders 33%, Round 2 31%, **Tellus 47%**, Good Good 26%, Marion
Court 45%.

Not computed anywhere: **cost per woman ticket** (spend ÷ women's paid
tickets, the number the 2-for-1 decision needs), women's share of tickets
**at T-7** as the leading indicator for the night, and the women-picked /
men-picked split from §1.

### 4. Show rate

`mixCell` has a "door N · %show" branch that renders when `ev.doorCount > 0`.
**No event has ever had a `doorCount`.** Digital check-in reached 91 of 140
past confirmed registrations (65%) and is a floor, not attendance
(`checkin-counts-undercount-attendance`). So no-show rate — the number that
decides whether to oversell 30 seats — has never been measured, and the code
path that would show it is dead until someone types a door count.

### 5. Web funnel

The dashboard has no top-of-funnel at all: no sessions, no landing-page
views, no checkout starts, no checkout errors. The one number that decides
whether ad spend can ever pay back — landing-page view → purchase, measured
at **0.40%** (`sales-happen-in-the-last-14-days`) — lives only in nightly
`reports/GA4_ANALYSIS_*.md`. The Ads tab shows clicks → tickets, which skips
the two steps where most of the loss happens.

`sync-ad-spend.yml` already runs a Google Ads pull against GA4 with
`GA4_SERVICE_ACCOUNT_JSON` in CI secrets, and `scripts/fetch-ga4-tables.js`
already knows the queries. A daily `web_daily/{date}` document (sessions,
LPV, begin_checkout, purchase, checkout_error, split paid/organic) is the
same shape as `ad_spend/{date}` and the same ~150 lines.

### 6. Email, in aggregate

`leads` carries per-step evidence: welcome sent 56, delivered 16, opened 5,
clicked 5; day2 sent 49; day5 41; day14 34; day25 14; unsubscribed 8. The
Leads tab renders these as ticks per row. There is no sent → delivered →
clicked → bought rate per step, no unsubscribe rate (8/150 = 5.3%), and no
"which step's click preceded a purchase". Delivered counts are low because
the Resend webhook went live 2026-08-31 (`resend-click-tracking-on-opens-off`)
— an aggregate view should say that rather than print 29%.

### 7. Referral loop

The match email carries a `?ref=` link and `lead-signup.js` /
`purchase-ticket.js` both write `referredBy`. **0 of 150 leads carry it.**
The Funnel tab has a "Referral" row label that has never populated. Either
nobody has used the link or capture is broken (`index.html` stores `?ref=`
in localStorage; `events.html` does not). Not verified which — but a metric
that reads zero forever should be on the page saying zero, because that is a
finding.

### 8. Per-ticket attribution

`lib/attribution.js` exists precisely because "14 tickets sold in 30 days
and not one of them could be attributed." It works: `attribution.utm_*`,
`landing_path`, `first_seen`, `channel` are written on the ticket. **4 of
144 confirmed tickets carry UTMs, 12 carry a `channel`**, because 84 are
Eventbrite imports and 46 predate the schema. The dashboard reads none of it.
For direct tickets going forward it is the only first-party channel
attribution the business has; the Ads tab's per-event cost-per-ticket cannot
split by campaign, and this can. PR #491 (keep Eventbrite `order_id`) is the
right next step on the import side.

---

## MECHANISM — metrics that are shown and wrong

### LTV double-counts repeats

```
arpu      = ticketRevenue / uniqueBuyers          // $2,506.87 / 105 = $23.88
avgEvents = paidTickets / uniqueBuyers            // 133 / 105 = 1.27
ltv       = arpu * Math.max(avgEvents, 1.5)       // $23.88 × 1.5 = $35.82
```

`arpu` is total spend per buyer to date, repeats included. Multiplying it by
tickets-per-buyer counts every repeat purchase twice; the 1.5 floor then
applies a 50% uplift that no cohort has earned (measured 1.27). Honest
options: report ARPU as the lifetime figure it already is, or build LTV as
*revenue per ticket × expected tickets per buyer* where the expectation comes
from the Retention tab's once/twice/3+ histogram.

### CAC divides by the wrong people

```
firstTimers = buyers with exactly 1 ticket        // 87
cac         = totalAcquisition / firstTimers
```

Every unique buyer was acquired once; the 18 buyers with 2+ tickets are
excluded from the denominator, so CAC rises as retention improves — the
inverse of what the number is for. The denominator should be **unique buyers
who paid money** (87 today, by coincidence the same count as "first-timers",
but a different set: it excludes the 21 Eventbrite-free and 7 plus-one
"buyers" and includes the repeaters).

Also: it is all-time spend ÷ all-time buyers, so it can only ever drift. A
per-event CAC (that event's synced spend ÷ that event's paying buyers) and a
trailing-30-day CAC would actually move when something changes.

### "Paid" includes $0

`paidTickets = tickets.filter(p => !p.isComp)`. 29 of 133 carry
`amount: 0` (21 `eventbrite_import` free tier, 7 plus-ones, 1 manual). They
inflate ticket counts, dilute revenue-per-ticket and revenue-per-buyer, and
pad the CAC denominator. Define paid as `amount > 0`; show free-tier and
plus-one seats as their own line, since both are deliberate (the free
women's tier and the 2-for-1 are pricing decisions worth watching
separately, not noise).

### The 200-ticket cap

`loadPayments()` → `tickets ... limit(200)`; `startLiveTickets()` →
`limit(200)`. 145 confirmed today; events sell 19–29. The `renderCampaigns`
comment already says "past 200 tickets both understate together, and this
comment is where to start looking." That comment will be the only symptom.
Either paginate the all-time reads or move all-time sums to a per-event
aggregate document maintained by the purchase path (the event doc already
carries a `confirmed` counter).

### Velocity is the wrong shape

Covered in Evidence §2. A flat tickets/day target against a curve where
two-thirds of sales land in the last 14 days will read "behind pace" on the
flat part and "on pace" only once it no longer matters.

---

## EVIDENCE — dead weight

- **Subscriptions.** `payments` has 0 documents. All 117 users:
  `subscriptionStatus: null`, tier `free` (115) or `Free` (2). The Active
  Subscriptions KPI, the Subscription Breakdown table, the subscription rows
  of Payment History, and the Members-table LTV column
  (`TIER_PRICES[tier] × AVG_LIFETIME_MONTHS`) all describe a product that is
  paused (`declare-connection.js`: "Memberships are paused"). They occupy a
  KPI slot and a card on the Revenue tab.
- **Hygiene, minor.** `users.source` has `EventBrite_Import` ×2 beside
  `eventbrite_import` ×63; all seven events carry `status: 'open'` including
  the five that have happened.

---

## NOT VERIFIED

- **Why Tellus produced 2 matches from 34 attendees.** Candidates, none
  tested: the room/format (Tellus is a bar with a different run of show),
  the prompt email timing, a bug in the `/matches` page for that event, or
  simply that 32 of 34 prompts were sent and 13 people responded — a
  response-rate problem rather than a chemistry one. The Oct 6 event at the
  same venue is the reason to find out before then.
- **Whether `referredBy` is zero because the link is unused or because
  capture is broken.** Not traced through `events.html`.
- **The Marion Court match numbers.** Two days old at read time; picks were
  still arriving (60 already, the second-highest count).
- **The Firestore read was one snapshot.** Counts are as-of ~10:00 local
  2026-09-10; the nightly Eventbrite sync may have moved ticket counts since.
- **Nothing in this review was rendered in the browser.** Findings are from
  reading the code and the data it reads; no UI defects are claimed.

---

## DECISION — what to build, in order

Priority is by how soon the gap costs a decision, not by size.

1. **A Matches panel on the Retention tab** (or its own tab), reading
   `matches`, `connection_intents`, `post_event_prompts`. Per event:
   attendees · prompted · picked anyone · picks · mutual · attendees
   matched, with the women/men picker split. No rules change, ~120 lines in
   `admin.html`. **Do this before Oct 6** so the Tellus question has a
   baseline on the page.
2. **Fix the three arithmetic errors in `renderKPIs`** — paid = `amount > 0`;
   CAC ÷ unique paying buyers; LTV not multiplied by `avgEvents`. Add a
   per-event CAC to the Event P&L detail row, where the synced spend already
   is.
3. **Lift the 200 cap** before it lands. Cheapest: page the all-time reads
   (`startAfter`) inside `loadPayments()`; cleaner: an `event_stats/{eventId}`
   aggregate maintained by the purchase/refund/import paths.
4. **Replace Ticket Velocity with a pacing curve.** For each open event, sold
   now vs the median of past events at the same T-minus, with the range
   shaded. The data for the reference curve is the table in Evidence §2.
5. **Women's acquisition strip on the Ads tab:** cost per woman ticket per
   event, women's share at T-7, women's share of pickers.
6. **Door count prompt** at the end of the run-of-show screen, so
   `doorCount` gets set and the show-rate branch in `mixCell` starts
   rendering. Add show rate to the Retention cards next to check-in coverage.
7. **`web_daily` sync** — one GitHub Actions step beside the Google Ads pull,
   writing sessions / LPV / checkout starts / purchases / checkout errors per
   day, paid vs not. Then an Overview card: LPV → purchase, trailing 14 days,
   against the 0.40% baseline.
8. **Email aggregate** on the Leads tab: per step, sent → delivered →
   clicked → bought since 2026-08-31, plus unsubscribe rate.
9. **Retire the subscription surfaces** until memberships come back; the KPI
   slot goes to "attendees matched, last event".
10. **Surface per-ticket attribution** on the Ads tab for direct tickets
    (channel / utm_campaign → tickets, revenue), and a plain "referral leads:
    0" line on the Funnel tab so the zero is visible.

---

## What I did not do

No edits to `public/admin.html`. No writes to Firestore. No browser
verification of the current rendering. The scratchpad inventory scripts are
not committed; the queries are ordinary `collection().get()` reads and are
reproducible from the counts above.
