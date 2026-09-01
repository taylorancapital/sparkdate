# Good Good — debrief, 2026-08-31

Dive bar venue. **20 ticket docs, 23 registrations, 4 women ticketed, 2 women in
the room.** MEASURED via `scripts/audit-event-gender-mix.js` on 2026-09-01.

This file has been rewritten. The first version reasoned from the code alone and
got the central claim wrong — it blamed 2-for-1 comps. The real data says the
2-for-1 played no part whatsoever. What follows is the corrected read; the
superseded reasoning is not preserved, because a wrong cause left lying around
is worse than no cause.

## The roster

| | seats | paid | free | scanned | **actually attended** |
|---|---|---|---|---|---|
| women | 4 | 1 ($32.49, own-site) | 3 (all Eventbrite, $0) | 0 | **1** (Kate) |
| men | 16 | 13 | 3 (2 are 2-for-1 +1s) | 12 | **14** (+Daniel, +Taylor) |

The scanned column is what the export says. The attended column is what happened
— see the check-in section below, which is the single biggest correction here.

Plus **3 registrations with no ticket at all**, every one created at the door
with `src=checkin`, and every one marked attended:

```
woman  Helesha  22:36 UTC   ← 6:36pm local, at the door
woman  Kate     23:35 UTC
man    Daniel   22:40 UTC
```

## Three things the first version got wrong

**1. Not one woman was comped by us.** `isComp` is false on all four. The three
$0 seats are `eventbrite_import` — they came in free *on Eventbrite*, through a
ticket type this codebase never sees. The app's own comp flag cannot describe
them, which is why they looked like sync noise.

They are not sync noise. `attendeePriceCents` (`scripts/sync-eventbrite.js:89`)
reads `base_price ?? gross`, and the **same import batch priced ten men
correctly** at $24.99–$29.99. The sync works. Those three zeros are real free
tickets.

**2. The 2-for-1 imported two men.** Both `+1` seats at this event were male, and
**both showed up**. The offer that `content/brand.json` restricts to female ads
produced zero women here and a 100% attendance rate for the men it did bring.
Whatever is wrong, the companion mechanism is not it.

**3. Free seats are not obviously the driver, because the paying woman also did
not come.** Heather Colosi paid $32.49 — top of the price ladder, own-site — and
has no check-in. One person is not a finding, but it is the only paid-woman
observation there is, and it points away from a clean comp story.

## The no-show rate is partly a check-in failure

**Taylor's own ticket reads as a no-show.** He ran the event. So scanning was
incomplete, and every "0 showed" here is a FLOOR, not a count.

Worse, two of the three door-created registrations share a first name with a
ticketed "no-show":

| ticketed, marked absent | created at door, marked present |
|---|---|
| Kate Kim (woman, Eventbrite, $0) | Kate (woman) |
| Daniel Anderson (man, Eventbrite, $26.22) | Daniel (man) |

**CONFIRMED by Taylor, 2026-09-01: same people, both pairs.** The door flow
created a second account because its email lookup missed — the known failure
`scripts/audit-duplicate-attendees.js` exists for, here caught by first name
rather than by email, which is why that script would not have found it.

So the corrected figures are **1 of 4 ticketed women** and **14 of 16 men**
(13 matched plus Taylor, who is mis-scanned in the export). Not 0 and 12.

**Everything below reads against the corrected numbers.** The raw export
understated attendance by three people — 15% of the room — and a woman who did
attend was filed as a no-show.

## So: what caused the no-shows?

Ranked by what the data actually supports.

**A. A measurement failure, CONFIRMED, for three of them.** Kate and Daniel were
each recorded twice — absent on their ticket, present on a door-created account —
and Taylor is mis-scanned besides. That is three people, 15% of the room, that
the export got wrong. This is no longer a candidate explanation; it is a
measured fact, and it is the largest single correction to the night.

**B. Free-on-Eventbrite underperformed, and now the sample is smaller still.**
Kate was one of the three free-on-Eventbrite women, and she came. So it is one of
three attending, not zero of three. Directionally still weak, but n=3 and now
carrying an attendance — this cannot support a conclusion in either direction.

**C. Something between buying and walking in, specific to women.** After the most
generous correction, ticketed attendance is about 25% for women against ~88% for
men. That gap survives every adjustment, and it is not explained by price
(the top-paying woman skipped), by comps (none from us), or by the 2-for-1
(no women). What remains is the experience of arriving — a dive bar, alone, with
no way to know whether anyone like you is inside. **This is a hypothesis with
four data points behind it. It is not established.**

It is, however, exactly what the outside operator described independently: hotel
lobbies working better than bars. Not about ambience — about whether it is
comfortable to walk in alone.

## What to do

1. **Fix door matching. It is confirmed broken and it is the top item.** Two of
   twenty attendees were double-recorded at this one event. `audit-duplicate-
   attendees.js` groups by *email* and would NOT have caught either pair — both
   were found by first name. The door needs to match on more than an exact email,
   or every future event carries the same silent undercount.
2. **Stop issuing free Eventbrite tickets to women, or make them confirm.** They
   are invisible to `isComp` and they skew the mix on paper. Note the attendance
   argument for this is now weak — Kate was one of them and she came.
3. **Record the door.** A walk-in with no ticket doc (Helesha) is revenue and a
   lead with no origin attached to it.
4. **Test a non-bar venue.** The cheapest way to probe hypothesis C.
5. **Give guest registrations the profile prompt.** Still true and still unfixed:
   `api/cron-send-emails.js:491` skips any registration without a `userId`, so
   six seats here never got it.

## Kernels from the room — REPORTED, not verified

- **One woman effectively carried the night.** Engaged, helpful, enjoyed herself
  by the end. Two women were in the room — Helesha, who walked in with no ticket
  at all, and Kate, who held a free Eventbrite ticket and was recorded as a
  no-show. Worth a personal follow-up, not a nurture email.
- **A prospective partner/regional operator** with Date Faster and Date
  Philadelphia history. Taylor notes the approach is not uncommon and is treating
  it with appropriate caution.
- **The hotel-lobby tip**, above.

## Open questions

- What Eventbrite ticket type issued the three $0 women's tickets, and who set it
  up? Nothing in this repo did.
- Did the three absent women open the pre-event emails? Resend tracks clicks from
  2026-08-31 but never opens, so this may be unanswerable for this event.
