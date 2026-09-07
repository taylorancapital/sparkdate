# Field notes — May 2026

**One incident, caught before it could cost anything.** SparkDate's first commit
landed 2026-05-02. This edition covers the month the product was still being
built, not yet run.

*Retroactive edition, written 2026-09-07 as part of a five-month catch-up
(May–September). Numbered from incident 23 — May happened chronologically
first, but was catalogued last, after editions 1 and 2 had already claimed
incidents 01–22. See the numbering note in "What this is and is not."*

## Detection

| Detection | This month | Cumulative |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 0 | 0 |
| `THREW` — an actual error surfaced | 0 | 0 |
| `HUMAN` — someone distrusted a number | 1 | 1 |
| `OPERATOR` — reported as "data went missing" | 0 | 0 |
| `LATER` — found by an unrelated dig | 0 | 0 |
| **Total** | **1** | **1** |

May is too small a sample to read anything into a 100% catch rate. One incident
is one incident.

---

## A. The agent was confidently wrong

### 23 — A pricing refactor that touched half of a two-sided contract · `HUMAN`

On 2026-05-30, a commit removing gendered ticket pricing
(`e24d7755`) updated the admin event-creation form and the on-page price
display to a single spots/price model. It did not touch the payment path.
`api/purchase-ticket.js` still read `spotsWomen`/`spotsMen` and
`priceWomen`/`priceMen` — fields that are `undefined` on any event created
through the new admin.

The effect on a new-model event: the capacity check read `undefined → 0` and
rejected **every** purchase attempt as `Event full` (409). Had a purchase
somehow passed the capacity check, price would have resolved to `$0`, so it
would have charged only the `$2.50` service fee — a real ticket for a dollar
fifty short of nothing.

**Cost: none realised.** Stripe's live publishable key was not switched in
until 2026-06-02 (`d8b90115`) — three days after the mismatch was introduced
and a full day after it was fixed. No real customer, and no live payment
method, could have reached this code path during the window it existed. It
was caught in pre-launch testing and fixed the next day, 2026-06-01
(`483ca977`), which added `lib/seat-model.js` as a single source of truth for
both the admin and payment sides and 9 new unit tests. A genuine near-miss:
the shape of the bug (silently charge $2.50 instead of full price) is exactly
the kind of thing that is expensive to notice once real money is involved, and
this was fixed the week before real money was involved.

**Anchor:** commits `e24d7755` (2026-05-30, introduces the mismatch, `Co-Authored-By: Claude Opus 4.8`) and `483ca977` (2026-06-01, fixes it); Stripe
live-key switch at `d8b90115` (2026-06-02).

---

## What this is and is not

- **This is a retroactive edition.** SparkDate's field notes started with
  `reports/NOTHING_THREW_2026-09-04.md` (edition 1, incidents 01–18) and
  `reports/FIELD_NOTES_2026-09.md` (edition 2, incidents 19–22), both written
  in September 2026 and both concentrated in incidents from August and
  September. This edition, and the June/July/August ones written alongside
  it, backfill the months before the field-notes practice existed by going
  back through git history, reports, and memory files for anchored material.
  **Incident numbers are assigned in the order they were catalogued, not the
  order they happened** — this is why a May incident is numbered 23, higher
  than August's incidents in the 03–18 range. Numbers are never reassigned
  once published, and August's incidents keep the numbers edition 1 already
  gave them.
- **May and June were pre-launch.** Stripe's live key did not go in until
  2026-06-02. Anything found in May with a stated "zero cost" is zero cost
  because nothing was live yet to be costed against — not because the bug was
  mild.
- **Selection bias is sharper here than in any other edition.** May has 343
  commits and one catalogued incident. That is not a claim that May had one
  bug; it is a claim that one May incident left a clear enough anchor (a
  named commit fixing a named prior commit, with an explicit before/after) to
  clear the bar four months later. Anything not written down plainly enough
  to still be findable in September is invisible to this method, by
  construction.
- **"Cost" means what was lost or nearly lost.** Where an incident was caught
  before doing damage, that is stated rather than counted as a loss.
- **Names, account identifiers and customer records are omitted throughout.**
