# Three venues, one October — is the ad schedule able to carry it? (2026-09-03)

**Question asked:** three new partnerships — Tellus360, Stratus Rooftop Lounge
(Philadelphia) and Lucky Dog Cafe — proposed for Tue Oct 6, Thu Oct 15 and Tue
Oct 20. Is that feasible, and can it be folded into the ad schedule?

**Answer: yes, on the money and on the runway. Two things have to move.** The
Lucky Dog date, because at Oct 20 its whole audience-building phase runs
underneath Tellus's heaviest spend in the same Lancaster auction. And the
Tellus booking, because its ad runway starts **Sunday Sep 6 — three days from
now** — and nothing for it exists yet.

The dates themselves check out: Oct 6 and Oct 20 are Tuesdays, Oct 15 is a
Thursday, which is the only day Stratus offered.

---

## Four numbers

| | |
|---|---|
| Ad spend to carry all three, 30-day runways | **$650** |
| Recent actual run rate, four events at once (08-26..09-01) | $24.67/day |
| Peak day under the proposed dates | **$32.50/day (Oct 6)** |
| Days Lucky Dog's prime sits under Tellus's close, same geo | **15 of 15** |

---

## EVIDENCE — the runway model says all three dates clear

`content/brand.json` → `paid_template` sets a 30-day reference runway, a 21-day
minimum and an 18-day floor below which the prime phase disappears entirely.
Measured on this account, **73% of tickets sell in the final 14 days**, which is
why the phase ladder is anchored to absolute days before the event rather than
scaled.

Against today (2026-09-03):

| Event | Date | Market | Runway starts | Slack |
|---|---|---|---|---|
| Tellus360 | Tue Oct 6 | Lancaster | **Sep 6** | 3 days |
| Stratus | Thu Oct 15 | Philadelphia | Sep 15 | 12 days |
| Lucky Dog Cafe | Tue Oct 20 | Lancaster | Sep 20 | 17 days |

No date needs a compressed runway. That part is comfortable.

## MECHANISM — why Lucky Dog on Oct 20 is the one that breaks

Phases were computed with the same window arithmetic as
`scripts/build-paid-campaign.js`, then overlaid day by day, with Loxleys (still
live to Sep 22) included.

Lucky Dog at Oct 20 puts its prime phase at **Sep 20 – Oct 4**. Tellus's convert
and close run **Sep 22 – Oct 5**. Both target the Lancaster geo — Lancaster +
Harrisburg + York, 20mi each.

```
Sep 20 ─────────────────────────────── Oct 4
        LuckyDog: prime      $2.00/day   ← building the retargeting pool
        Tellus:   convert   $10.00/day   ← same women, same auction
        Tellus:   close     $12.86/day
```

CBO allocates *within* a campaign. Two campaigns in the same geo are two
separate auctions bidding for the same people, and the one paying $12.86 wins.
Lucky Dog's prime is not merely outbid — **it is the phase whose entire job is
to build the pool retargeting needs at T-14.** `paid_template` already names
this failure mode: launching retargeting with no pool "produces a campaign with
an empty audience", which is why Loxleys retargeting was deliberately not built
in #255.

So Lucky Dog would reach Oct 6 with a starved audience and spend its 35% convert
share on it.

### Moving Lucky Dog to Tue Oct 27 fixes it

A 21-day runway from Oct 27 starts **Oct 6** — the day Tellus ends. The two
Lancaster campaigns stop overlapping almost entirely.

| | As proposed (Oct 20) | Lucky Dog → Oct 27 |
|---|---|---|
| Days with 2+ Lancaster campaigns live | 21 | **8** |
| Days with 3 Lancaster campaigns live | 2 | **0** |
| Days with two closes at once | 2 (Oct 13–14) | **0** |
| Peak daily spend | $32.50 | **$27.50** |
| Lucky Dog prime, days spent under a heavier Lancaster campaign | 15 | **1** |

The cost of the move: a 21-day runway gives Lucky Dog a 6-day prime instead of
15. That is above the 18-day floor and at the stated 21-day minimum, but it is
thinner. **If you want Lucky Dog to keep a full 30-day runway with a clean
prime, the date is Tue Nov 3** — 28 days out from Oct 6, no Lancaster overlap at
all. Oct 27 is the best answer that stays inside October.

## EVIDENCE — the budget is not the binding constraint

Three campaigns at the Loxleys shape ($200) plus a slightly heavier Stratus
($250, a new room in the weaker market) is **$650 total**. Spread across the
ladder, the peak is $27.50/day under the corrected dates.

The account ran **$172.72 in the seven days to Sep 1 — $24.67/day — with four
campaigns live** (Marion Court Traffic $43.20, Good Good Event 3 $64.51, Good
Good Retargeting $31.57, Marion Court Retargeting $21.53, Loxleys $9.85, three
Tellus remnants $2.06). The October slate asks for roughly the same daily rate
the account is already spending, not an increase.

For scale: lifetime spend is $1,197.77 across 40 delivered ads, with six
Meta-attributed purchases. The slate is a ~54% increase on everything ever spent
on this account. That is a real commitment; it is not a cash-flow problem.

## NOT VERIFIED — Stratus is a rooftop, on October 15, and nobody has asked

`Business Plan/files/Venue_Outreach_Package.md` sets the criteria that produced
this outreach, and one of them is unambiguous:

> **Covered or indoor fallback: REQUIRED.**

with a seasonality note that "Philadelphia outdoor season ends in late October"
and that year-round or covered venues should be approached first. Stratus is
listed in that same file under "Rooftops", annotated **"Rooftop = outdoor"**,
with no covered-space note next to it.

Diandra Gore's reply says nothing about weather. A 7 PM start on a Philadelphia
rooftop on **Oct 15** is inside the window the package flags — near its edge,
but inside it. **This is the cheapest question to answer and the most expensive
one to skip:** an unanswered rain plan on a paid event is a refund event.

It goes in the reply, not in a later email.

## DECISION — what has to happen, and by when

**Sep 6 is the real deadline, and it is for Tellus.** A campaign cannot be built
against an event that has no ticket link, so the booking, the event record and
the on-sale page all have to precede the runway start, not follow it.

| By | What |
|---|---|
| **Sep 4–5** | Reply to Diandra (draft below). Get a date from Lucky Dog — the Sep 3 reply is a yes with no date in it. Confirm Oct 6 with Tellus360. |
| **Sep 6** | Tellus event live and on sale; `brand.json` entry; campaign built PAUSED. |
| Sep 15 | Same for Stratus. |
| Oct 6 | Same for Lucky Dog (on the Oct 27 date). |

**Content is the load nobody has costed.** `content/queue.csv` ends at
**2026-09-23** — there is nothing queued past Loxleys. Marion Court carried 15
rows and Loxleys 13, so three events is **roughly 40 new organic rows plus paid
creative**, on top of the ad build. Both Lancaster events can reuse the existing
Lancaster asset library; **Stratus cannot** — it is a new room, in the market
with one completed event, and that event ran 19:1 men-to-women.

## What I did not verify

- **Tellus360 Oct 6 is not confirmed anywhere I can see.** No booking thread for
  an October date exists in Gmail. Tellus is a proven room (Aug 26 ran), so this
  is likely a conversation held off-email — but it is an assumption, not a fact.
- **Lucky Dog has agreed in principle and to no date.** The Sep 3 reply reads
  "I wouldn't mind doing this", against a July 28 message that asked for an
  *August* date. Someone still has to propose Oct 27 and get a yes.
- **Whether Stratus has covered space.** Not stated by the venue, not recorded
  in the outreach package.
- **The $200/$250 budgets are a choice, not a measurement.** They mirror the
  Loxleys shape. Nothing on this account establishes the right spend per event.
- I did not touch the ad account. No campaign was created, no budget changed.
- The 45/30/25 female/male/retargeting split is `paid_template`'s stated
  starting point and is explicitly not measured.

---

## The Stratus reply

To Diandra Gore, on the existing thread. Says yes to Thursday, names Oct 15,
takes her earlier slot, and asks the weather question.

> Hi Diandra,
>
> Thursdays work — and it's good to hear the format isn't new to the room.
>
> I'd like to look at **Thursday, October 15**, using your earlier window:
> guests arriving 7:00, the structured part of the night running 7:00–9:00,
> and people staying on afterward as long as they're buying. The night runs in
> three movements — seated rounds with a game to open, then open mingling, then
> one-on-ones — so the two hours are the part we run, and the tail is yours.
>
> Two things I should ask before we lock it:
>
> 1. **Is there covered or indoor space if the weather turns?** Mid-October is
>    the reason I ask. If there's a fallback, I'll book without hesitating; if
>    the night is weather-dependent, I'd rather know now and plan for it than
>    move 30 people around on the day.
> 2. **What do you need from me on numbers?** I'd expect 25–40, buying off your
>    regular menu on their own tabs. If there's a minimum or a preferred layout
>    for a group that size, tell me and I'll build around it.
>
> No cost to you, and nothing changes about how you run the bar. Happy to do
> 15 minutes on the phone if that's faster than email.
>
> Best,
> Taylor
> Founder, SparkDate
> 717-344-4176

Two notes on sending it. The signature says `hello@sparkdate.date` while the
thread is going out from `taylor.ancapital@gmail.com` — HANDOFF flags this for
the eight unsent outreach drafts and it applies here too; check the From line is
a send-as alias or drop the address from the signature. And the run-of-show
wording above quotes no durations for the individual movements, per
`run-of-show-is-contradicted` — only the 7–9 window, which is ours to set.
