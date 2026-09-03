# Getting women into the room — the levers that are not Eventbrite and not Meta ads (2026-09-02)

**This report changes no site code.** It adds this file only. Taylor asked for a
brainstorm: he is already running Eventbrite and women-targeted Meta ads, and
wants the strategies that sit outside both, including the other sites he lists
events on.

Everything marked MEASURED below comes from files already in this repo —
`reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`,
`reports/AD_LEVER_WOMEN_2026-09-02.md`, and the GA4 evidence block inside
`content/listing-sites.json`. Two findings marked CODE-READ were checked against
`api/cron-send-emails.js` and `api/purchase-ticket.js` on 2026-09-02. Everything
else is an idea, and is labelled as one.

---

## The reframe this whole list rests on

Eventbrite and Meta ads do the same job: they put a **decision to buy one ticket
in front of one woman, alone, on a phone.** That is the hardest sale in this
business and the one with the worst follow-through.

MEASURED, Good Good, 2026-08-31, after every correction:

| | ticketed | walked in | rate |
|---|---:|---:|---:|
| men | 16 | 14 | **88%** |
| women | 4 | 1 | **25%** |

Four women is not a sample. But it is the only measured female arrival rate that
exists, and it says something worth acting on: **buying more women's tickets
through a channel that produces solo attendees may not produce attendance.**
Almost everything below is therefore aimed at one of three things the two current
channels do not touch:

1. selling to women in **pairs**, not singles;
2. **borrowing** a female audience someone else has already assembled;
3. removing the **"who else will be there"** unknown before she has to decide.

---

## TIER 1 — free, this week, and the machinery already exists

### 1. Reopen the +1 after purchase. This is the biggest one.

**CODE-READ.** The 2-for-1 works end to end, and it is reachable from exactly one
place: the checkout modal. `plusOne` is only ever read from the purchase request
body in `api/purchase-ticket.js:515`. No other endpoint can add a companion.

So the offer expires at the precise moment a woman is least able to use it. She
is deciding at 11pm on her phone; she has not texted anyone yet; she buys one
seat and the free second seat is gone forever.

Then the t7 and t1 pre-event emails — the two touches she is guaranteed to
receive — say nothing about bringing anyone. Confirmed by reading
`preEventEmailFor()` (`api/cron-send-emails.js:569`): run of show, doors,
the 9pm picks link, and no companion prompt of any kind.

**The move:** an "add your +1, still free" link in the t7 email, and again in
t1, pointing at a small add-guest flow. Zero new impressions. It converts women
you have *already paid to acquire* into pairs — and a woman arriving with a
friend is a completely different arrival proposition than one walking into a
dive bar alone.

**Precondition, do not skip it:** the companion seat is structurally weak today
(memory `two-for-one-is-female-ads-only`). She is written with `userId: null`,
so the chemistry-profile reminder skips her entirely
(`api/cron-send-emails.js:491` requires `r.userId`), and if she shares or
mistypes the buyer's email address the pre-event mail dedupe means she gets
nothing at all. Double the seats without fixing that and you have doubled the
number of women who arrive unmatched and uninformed.

### 2. Work the Meetup group you already own.

**MEASURED:** the group exists, has roughly 20 members, and has already sold
2 tickets — which appear nowhere in GA4 and carry no attribution, so the
dashboard will never show you this channel working. It is recorded in
`content/listing-sites.json` as `not_pursued`.

Two things make it worth more than its member count suggests. Meetup's own
discovery ranks **active** groups, so a group that posts once every six weeks is
invisible by construction — activity is the input, not the audience. And Meetup's
singles browsers are a different population from Eventbrite's; you are not
re-reaching the same people.

Note the constraint honestly: member emails are not exportable on a standard
organizer plan. The post itself has to carry the signup CTA.

### 3. Get one woman's testimonial. Today.

**MEASURED:** the only testimonial creative in the entire ad account is Quang's —
a man (`reports/AD_LEVER_WOMEN_2026-09-02.md`). And Taylor's own read, backed by
the Tellus purchase data, is that **social-proof creative is the one thing that
has converted women directly** — four direct female purchases on 2026-08-18,
driving a 59%-female week (memory `social-proof-pulls-women`).

There are two named candidates from Good Good: **Helesha**, who walked in with no
ticket at all, and **Kate**, who came on a free Eventbrite ticket and was filed
as a no-show by a broken door lookup. One of them, 40 seconds, vertical, on a
phone: *why she came alone and what it was actually like.*

That single asset unlocks the event page, every listing photo set, organic social,
and the ads simultaneously. It is the cheapest thing on this list and the one
with the widest blast radius.

### 4. Give the listing copy a women-facing pass.

**MEASURED:** `content/listing-sites.json` registers 15 pursuable listing
surfaces. **One of them — Eventbrite — carries the entire non-paid, non-direct
funnel** (170 sessions, $290.39). Thirteen have never been submitted to at all.

`/syndicate-events` already exists to fill them, and `build-listing-pack.js`
generates the copy. But the copy itself has never had a pass for this audience:
the standing pitch is *"meet 12+ singles"*, which is a numbers argument, and a
numbers argument is what men respond to. A woman reading a listing is asking
*who is running this, what happens when I get there, and will I be the only one.*

Prioritise the surfaces where that reader actually is: **Fig Lancaster**
(lifestyle, weeknight-goers, closest audience fit of the tourism calendars),
Visit Lancaster City (downtown, where the venues are), Discover Lancaster
(ranks for "things to do in Lancaster", 14-day lead time — submit early).

---

## TIER 2 — borrow a female audience instead of building one

The premise: in a market this size, the women you want are already on somebody's
list. Renting attention through Meta is the expensive way to reach them.

### 5. Trade with women-audience local businesses.

Barre / yoga / pilates studios, blowout bars and salons, boutiques, wine shops,
book clubs, women's run clubs. These have engaged local female lists and
newsletters and stories, and — this is the part that matters — an **endorsement**
you cannot buy: it arrives from someone she already trusts.

It is a swap, not a spend. They post it; you comp seats for their staff, or run a
"get ready with us" pre-event hour at their space, or put their name on the night.
Start with three, not thirty.

### 6. Post by hand in women-specific local groups.

The playbook (`docs/MARKETING_PLAYBOOK.md` §2) lists general Lancaster singles
groups. Women-specific groups are a different and better surface for this
particular problem, and they need a human voice — a form-shaped post reads as
spam and gets removed. Same reason `reddit_lancaster` is deliberately marked
out of scope for the syndication run.

### 7. Ask the venue to post it. Put it in the pitch.

Marion Court, Tellus360 and Loxleys each have an Instagram following in exactly
the right geography, and it costs them nothing. Venue-posted content also carries
third-party credibility the brand cannot self-supply — *"this room is hosting
it"* is a different claim from *"we are hosting it."*

There is already a venue pitch in circulation
(`reports/VENUE_PITCH_FACT_AUDIT_2026-09-01.md`). **A social post from the
venue's own account should be a standard line item in it**, alongside the room
and the F&B — it is the cheapest thing the venue can give and nobody is currently
asking for it.

### 8. Co-host one night with an operator who already has women.

The Date Faster / Date Philadelphia operator who approached at Good Good is one
option; Taylor has already noted that this pitch is not uncommon and is treating
it with caution, which is right. Framed as **one co-hosted night**, though, it is
a bounded test of borrowed audience with no partnership attached.

---

## TIER 3 — change what she is being asked to buy

### 9. Publish the cap, or publish the ratio.

*"We cap the room at 20 and 20. When the men's list fills, it closes."*

No competitor says this, it is the single most credible sentence available to a
woman deciding, and it is honest. It also does useful work on the other side of
the ledger: it converts the male surplus into a **waitlist**, which is scarcity
you currently have and are not using.

Operationally this is a ticket cap plus a waitlist, not a marketing line — do not
say it before it is true.

### 10. A women's early-access window.

Tickets open to the women's list 72 hours before general sale. Costs nothing,
discounts nothing, and it structurally front-loads the side of the room that
always fills last.

**Flag, stated once and not repeated:** gender-based *pricing* and admission at a
public accommodation carries real legal exposure — "ladies' night" pricing has
been successfully challenged in several states, and Pennsylvania has the PHRA.
Early *access* to a sale is a materially different thing from a differential
price, and is the safer construction. This exposure is not new: the free women's
Eventbrite ticket type and the female-only 2-for-1 both exist today. It is worth
twenty minutes with counsel before any of it becomes a public promise. Not a
blocker, and not a reason to skip the idea — a thing to get right once.

### 11. Build a low-commitment format above the paid event.

A $25 ticket to a dive bar full of strangers is a very high-commitment first
touch. A free or $5 coffee walk, a happy hour, a "singles trivia" table — that is
what somebody tries first.

It does three jobs at once: it feeds the Meetup group's activity ranking (idea
2), it builds the email list with real consent, and it lets a woman **meet the
host before committing to the real thing.** This is the structural answer to
"women won't take the first step," and it is the one idea here that compounds.

### 12. Name the host, and show her.

A woman deciding whether to walk into a bar alone is deciding whether anyone in
that room has the job of catching her. The Tellus retargeting copy already
answers this well — *"hosts whose job is making sure you're not standing
alone"* — and that line is currently buried in one ad set.

It belongs on the event page, in every listing description, and in the t7 email,
with a name and a face attached. *"Ask for [host] at the door"* converts an
unknown room into an appointment with a specific person.

---

## TIER 4 — acquisition into a leaky bucket is wasted

None of the above is worth much if the women who buy still do not arrive, or if
you cannot tell whether they did.

- **Test a non-bar venue.** Already the #4 recommendation of the Good Good
  debrief, and independently what the outside operator said: hotel lobbies
  outperformed bars. Not about ambience — about whether it is comfortable to
  walk in alone. A hotel lobby bar, a restaurant's private room, a wine bar.
- **Choreograph the arrival.** Day-of text or email: the host's name, where the
  SparkDate table is, and that there is a reserved spot. The gap the debrief
  identifies is the thirty seconds between the door and the first conversation.
- **Fix door matching first.** MEASURED and confirmed: two of twenty attendees
  at Good Good were recorded twice, and `audit-duplicate-attendees.js` cannot
  detect it because it groups by email and the missing email lookup is what
  creates the duplicate. Until that is fixed, **every number you would use to
  score this brainstorm is wrong in the same direction.**

---

## If you only do three things

1. **Reopen the +1 in the t7 and t1 emails** (fix the companion record first).
   It is free, it uses an offer that already works, and it converts acquisition
   you have already paid for into pairs.
2. **Film one woman's testimonial.** It is the named gap in your own ad report,
   and social proof is the only thing that has demonstrably converted women.
3. **Post the next event into the Meetup group and give the listing copy a
   women-facing pass.** Cheapest reach available, on surfaces already registered
   and currently at zero.

## How to score it

The honest answer is that most of this is slow and several channels are blind:
Meetup and Eventbrite checkouts are invisible to GA4 (memory
`ga4-revenue-is-own-site-only`), so the dashboard cannot referee this.

What can referee it:

- `scripts/audit-event-gender-mix.js --match="<event>"` per event — **women
  ticketed, and women who arrived, as two separate numbers.** Never one "sold"
  figure blending comped and paid.
- `sessionSourceMedium` where medium is `listing`, in the GA4 traffic-by-source
  pull, several weeks out — not tomorrow.
- The pair rate: what share of women's tickets carry a +1. That number is zero
  or near it today and is the direct readout on idea 1.

## What I did not verify

- **The 25% female arrival rate is four people.** It survives every correction
  applied to it, and it is the only measured figure of its kind — but it cannot
  carry the weight of a finding, and no strategy here should be defended on it
  alone.
- **Whether any of the Tier 2 businesses would say yes.** No outreach has been
  attempted; the audience-fit argument is mine, not measured.
- **Whether a verified Google Business Profile exists** — flagged as a
  precondition in `listing-sites.json` and still unchecked.
- **The legal position on gender-based access**, beyond noting that the exposure
  exists and predates every idea in this file. Not researched, not advice.
- **Whether the women who bought and did not arrive ever opened the pre-event
  email.** Resend tracks clicks only from 2026-08-31 and never opens, so for
  Good Good this is likely unanswerable.
