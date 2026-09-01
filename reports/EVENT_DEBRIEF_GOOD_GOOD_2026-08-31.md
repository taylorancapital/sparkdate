# Good Good — debrief, 2026-08-31

Dive bar venue. **20 ticket docs, 23 registrations, 4 women ticketed, 2 women in
the room.** MEASURED via `scripts/audit-event-gender-mix.js` on 2026-09-01.

This file has been rewritten. The first version reasoned from the code alone and
got the central claim wrong — it blamed 2-for-1 comps. The real data says the
2-for-1 played no part whatsoever. What follows is the corrected read; the
superseded reasoning is not preserved, because a wrong cause left lying around
is worse than no cause.

## The roster

| | seats | paid | free | attended |
|---|---|---|---|---|
| women | 4 | 1 ($32.49, own-site) | 3 (all Eventbrite, $0) | 0 scanned |
| men | 16 | 13 | 3 (2 are 2-for-1 +1s) | 12 scanned |

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

If those are the same two humans — and the door flow creating a fresh
registration when its email lookup misses is a known, documented failure
(`scripts/audit-duplicate-attendees.js` exists for it) — then the true figures
are roughly **1 of 4 ticketed women** and **14 of 16 men**, not 0 and 12.

**This must be settled before any decision rests on these numbers.** It is
plausible that a woman who did attend is recorded as having skipped.

## So: what caused the no-shows?

Ranked by what the data actually supports.

**A. A measurement failure, for a real share of them.** Three attendees exist
with no ticket, two of them name-matching ticketed absentees, plus the organiser
himself mis-scanned. Some fraction of "no-show" is "we failed to connect a person
to their ticket at the door."

**B. Free-on-Eventbrite underperformed, but the sample cannot carry weight.**
Three free women, at most one attended. Directionally consistent with the usual
result that a free seat is a weak commitment — but n=3, and the one woman who
paid the most also did not come.

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

1. **Fix door matching before trusting any of this.** Run
   `scripts/audit-duplicate-attendees.js` on this event. Note it groups by
   *email*, so it will miss a pair whose door email differs from their Eventbrite
   one — the Kate and Daniel pairs may need a human eye.
2. **Stop issuing free Eventbrite tickets to women, or make them confirm.** They
   are invisible to `isComp`, they skew the mix on paper, and here they
   converted at 0–33%.
3. **Record the door.** A walk-in with no ticket doc (Helesha) is revenue and a
   lead with no origin attached to it.
4. **Test a non-bar venue.** The cheapest way to probe hypothesis C.
5. **Give guest registrations the profile prompt.** Still true and still unfixed:
   `api/cron-send-emails.js:491` skips any registration without a `userId`, so
   six seats here never got it.

## Kernels from the room — REPORTED, not verified

- **One woman effectively carried the night.** Engaged, helpful, enjoyed herself
  by the end. Two women were checked in (Helesha, Kate); Taylor recalls one as
  meaningfully present. Worth a personal follow-up, not a nurture email.
- **A prospective partner/regional operator** with Date Faster and Date
  Philadelphia history. Taylor notes the approach is not uncommon and is treating
  it with appropriate caution.
- **The hotel-lobby tip**, above.

## Open questions

- Are Kate/Kate Kim and Daniel/Daniel Anderson the same people?
- What Eventbrite ticket type issued the three $0 women's tickets, and who set it
  up? Nothing in this repo did.
- Did the three absent women open the pre-event emails? Resend tracks clicks from
  2026-08-31 but never opens, so this may be unanswerable for this event.
