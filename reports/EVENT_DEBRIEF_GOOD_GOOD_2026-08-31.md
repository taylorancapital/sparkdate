# Good Good — debrief, 2026-08-31

Dive bar venue. **23 ticket sales, 4 to women, 1 woman attended.** Figures are
Taylor's from the room; the ticket-level split is not yet pulled (see "Run this
first"). Everything below marked MEASURED comes from the code; everything marked
REPORTED is from the debrief and is not independently checked.

## The number that matters

23 sold, and the working gender mix on the night was roughly **19 men to 1
woman**. Not 23:4 — the roster's 4 is a sales figure, and three of those seats
were empty. Any post-mortem that starts from "we had 4 women" is planning
against a number that never existed in the room.

## How a woman gets a free seat here — MEASURED

There is exactly one $0 path in the product: the **2-for-1 companion**
(`api/purchase-ticket.js`, ticket written with `amount: 0`). There is no admin
comp screen and no promo-code path. So a free seat means a +1 rode on someone
else's single charge, or it came in through Eventbrite, which is a separate
system this repo does not write.

Three properties of that seat, all confirmed in code, and all of them push
toward a no-show:

1. **The companion never decided to come.** The buyer enters their name, email,
   phone and gender at checkout (`purchase-ticket.js:515-529`). Intent belongs
   to the buyer, not the attendee.
2. **The companion pays nothing**, so there is no sunk cost to show up against.
3. **The companion is created with `userId: null`** and never authenticates. The
   chemistry-profile reminder skips every registration without a userId
   (`api/cron-send-emails.js:491` — `if (r.status !== 'confirmed' || !r.userId
   ...) continue`). So a comped +1 **never gets the profile prompt** and arrives
   unmatched even when she does turn up.

Pre-event reminders (t7/t1) *do* reach her — those iterate registrations, not
users. But with one caveat: that pass **dedupes by email address**
(`cron-send-emails.js:628-632`). If a buyer puts their own address on the +1
because they do not know their friend's, or fat-fingers it, the companion gets
**no mail at all**, and the roster still shows a confirmed seat.

## The 2-for-1 is female-ads-only in marketing and unconditional in code — MEASURED

`content/brand.json:243` states it plainly: *"2-for-1 is FEMALE ADS ONLY. It is
a marketing restriction, not a code one — checkout's toggle is unconditional, so
nothing stops the offer being honoured from a male ad."*

`purchase-ticket.js:520` accepts `po.gender` of `'woman'` **or** `'man'`, from
any buyer. So the offer designed to import women can equally import a second
man. On a night that ran 19:1, that is worth knowing before the next one.

Pricing itself is gender-blind on this event shape: `ticketPriceDollars`
(`lib/seat-model.js:53-59`) returns the flat `event.price` and never consults
gender unless the event is a legacy `priceWomen`/`priceMen` one.

## Run this first

The above is mechanism, not measurement. The per-ticket split — which of the 4
women paid, which were +1s, which had a real address, who was scanned — needs
production credentials this machine does not have:

```
node scripts/audit-event-gender-mix.js --match="good good"
```

It separates paid from free, buyer from companion, account from guest, and flags
shared email addresses. Attendance is a **floor**: it reads `checkedInAt` then
`attended`, and anyone who came but was never scanned reads as a no-show.

The question it settles: **were the three missing women free +1s?** If yes, the
fix is structural and below. If they paid and still did not come, this is a
different problem — venue or timing — and the recommendations change.

## What to change

Ordered by how much they cost to try.

1. **Stop counting comped seats as sales in the mix.** A 2-for-1 is one sale and
   two seats, and only one of them chose to be there. Report paid-women and
   free-women separately or the mix will keep reading better than the room.

2. **Make the +1 confirm for herself.** The companion currently never touches
   the product. A single "confirm your seat" email to *her* address, with the
   seat not counted as confirmed until she clicks, converts a silent no-show
   into a known empty seat days ahead — and it catches the typo'd-address case,
   which is currently invisible.

3. **Reject a +1 that shares the buyer's email.** One line at checkout. Today it
   produces a confirmed registration that provably receives nothing.

4. **Give guests the profile prompt.** The reminder is keyed on `userId` for
   convenience, not for a reason — the registration already carries the email.
   A woman who shows up unmatched is a worse experience than one who never came,
   because she is in the room having a bad time.

5. **Consider paid-only for women, not free.** REPORTED-adjacent but worth
   stating: the free seat is not attracting women, it is attracting *plus-ones
   of men who already bought*. If the goal is women who chose to come, a
   discounted women's ticket that she buys herself outperforms a free one she
   was given — she has skin in the game and an account.

## Kernels from the room — REPORTED, not verified

- **One woman effectively saved the event.** Highly engaged, helpful, sounded
  like she genuinely enjoyed it by the end. She is the single most valuable
  contact from the night: a testimonial, a returning attendee, and proof the
  format works when the mix is right. Follow up personally, not through the
  nurture sequence.
- **A prospective partner/regional operator.** Has run Date Faster, Date
  Philadelphia, and singles mixers in several markets. Taylor notes this
  approach is not uncommon and is treating it with appropriate caution.
- **His venue tip: hotel lobbies worked well.** Against a dive bar, a hotel
  lobby reads as calmer, better-lit, easier to talk in, and — the part that
  probably matters for the mix — it feels safer to arrive at alone. That is a
  cheap thing to test and it bears directly on whether women who buy actually
  come.

## Open questions

- Were the 3 absent women free +1s, or paid? The audit script answers this.
- Did any of the 4 receive a pre-event email at all, or did a shared address
  swallow one? Also in the script's output.
- Is the dive-bar setting suppressing female *attendance* (bought, did not come)
  or female *purchase* (never bought)? Different problems. The 23:4 sales split
  says purchase is already weak before attendance makes it worse.
