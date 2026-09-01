# Fact audit — what SparkDate says about itself, 2026-09-01

Every factual claim SparkDate makes on a public surface, cross-checked against
one canonical record per fact. Run it yourself:

```bash
node scripts/audit-facts.js
```

**Scope:** 26 public surfaces — the marketing site, all 16 blog posts, the four
city pages, and `content/queue.csv` — plus the live Meta ad account, the
Firestore event records, and `content/brand.json`. `public/admin.html` is
excluded because it is staff-facing and is the *source* for the run of show,
not a copy of it.

**What this proves and does not prove.** It proves surfaces agree or disagree.
It cannot prove a claim is true. Four surfaces agreeing on a wrong number reads
as clean here — which is exactly what happened with the end time before Taylor
corrected it out loud.

---

## Why this was needed

The event-listing job that triggered it turned up, in one afternoon:

- **four different end times** for the same event, none of them right
- **three mutually exclusive descriptions** of the run of show, two of them
  published
- a **price** stated as a flat site-wide number when it varies by city

None of it was caught by any existing check, and the reason is structural:
every check reads exactly one surface. `lint-content-queue.js` reads the queue.
`lint-ad-copy.js` reads the ads. **Nothing reads the marketing site at all.** A
fact that appears on six surfaces has six chances to be wrong and one chance to
be noticed.

---

## 1. End time — was wrong in 8 places, and is still wrong at source

**Truth: 6:30 – 8:30 PM.** (Taylor, 2026-09-01.)

| Surface | Said | Status |
|---|---|---|
| `public/city.html` ×4 | "about 6:30 to 9 PM" | fixed |
| `content/queue.csv` ×3 | "6:30-9:00 PM" | fixed |
| `public/careers.html:292` | close out 9:00 PM | **not fixed** — host-facing, see §7 |
| **Firestore event docs** | **endDate 9:30 PM** | **not fixed — needs you** |

> **The Firestore one is the one that matters most.** Both live events carry a
> three-hour duration, so `/event?id=…` publishes `endDate` of 9:30 PM inside
> its schema.org Event JSON-LD. That is the block Google reads to show event
> times in search results, and it is what every calendar that scrapes us will
> ingest. **Fixing the marketing copy does not touch it.** The event record has
> to be edited in `/admin`.

Note the spread: 8:30 (true), 9:00 (careers + queue), 9 PM (city pages), 9:30
(Firestore). Nobody wrote the wrong number on purpose; each surface was written
from a different one.

---

## 2. Ticket price — stated as flat $24.99 in 9 places, but it varies

**Truth:** `brand.json` records Marion Court at $24.99, Tellus at $24.99, Good
Good Things at **$29.99**, and Loxleys at $24.99 early-bird rising to **$29.99
after Sep 7**.

Nine surfaces state $24.99 as though it were the standing price, including all
four city pages *and their FAQ structured data*.

**Philadelphia is the live problem.** Good Good Things was $29.99, but the
Philly city page and two Philly-targeted blog posts (`first-timer-guide`,
`what-to-wear`) both say "$24.99". Understating a price is worse than
overstating one — it is the number a buyer will argue about at the door.

**Not fixed.** The fix is a decision, not an edit: either these pages stop
quoting a number and point at the event page, or they quote a per-city number
that someone commits to maintaining. Given the whole point of this audit, I'd
take the first.

Also minor: `first-timer-guide.html:257` says "$25" while the same post says
"$24.99" twenty lines later.

---

## 3. Format — the site denied a structure the product has

Settled 2026-09-01 against the shipped chemistry tool in `public/admin.html`:
**doors and drinks → timed rounds at small tables, with a game as the icebreaker
and the men moving one table along each round → five-minute one-on-ones →
private interest notes → same-night matches.**

Nine surfaces said some version of "no rotation, no timer, no scorecard".

**Fixed (5):** `blog/how-same-night-matching-works.html`, `city.html` ×3 prose
plus its FAQ structured data, and `event.html:788` — which promised "no awkward
icebreakers" on the page where people buy.

**Deliberately not fixed (2):** `blog/speed-dating-vs-singles-mixer.html`. Its
entire thesis is "we are a mixer, *not* speed dating", down to a closing CTA of
"No whistle, no scorecard, no three-minute timer." With rotations and a timer,
that post now argues against the product. That is a positioning decision, not a
copy fix — see §7.

**In new copy, state the shape but never the numbers.** The round count (2–4)
and length (10/15/20 min) are settings the host picks on the night. The
five-minute one-on-ones are hardcoded and safe to state.

---

## 4. Welcome drink — 7 claims, zero sources

> "Tickets are $24.99, which includes entry and — at most venues — a welcome
> drink."

On all four city pages, in prose **and inside the FAQ structured data Google
surfaces**. There is no record anywhere in the repo of which venues include a
drink or whether any do.

"At most venues" is doing a great deal of work. This is the only claim in the
audit that **costs money at the bar** if it is wrong, and the only one a guest
can dispute in person. Someone who knows the venue contracts needs to confirm
it or cut it. **Not fixed — I cannot verify it from here.**

---

## 5. Name badges — the site says both

- `blog/how-same-night-matching-works.html:174` — "check in with your host,
  **get your name badge**"
- `blog/first-timer-guide.html:202` and `first-timer-guide-lancaster.html:202`
  — "**No name tag**, no scorecard"

`brand.json` currently records "name badge", but only because it was written
from the first of those. Nothing settles it. It is the first thing a guest
experiences, so it is worth settling. **Not fixed.**

---

## 6. Clean

- **Capacity** — 20 occurrences across the site and queue, all compatible with
  the 30-seat `spotsTotal` on both live events ("20 to 30 people", "under 30",
  "thirty people, and that's the cap"). No contradiction.
- **Age** — "21+ with valid ID" is consistent in all 4 places it appears. It is
  only on transactional surfaces (checkout, signup, careers) and on no
  marketing page. Worth *adding*, not removing: a 20-year-old buying a ticket
  is a refund and a bad first impression.
- **Venue names and addresses** — consistent between Firestore and brand.json.
  One gap: Marion Court Room's Firestore `streetAddress` is literally
  "Lancaster, PA 17602" — no street. Listing sites ask for a street address.

---

## 7. Open, needs a decision from Taylor

1. **Edit the Firestore event records** so `endDate` is 8:30 PM, not 9:30. This
   is the highest-value item in the audit — it is the one publishing to Google.
2. **The Philly price.** Stop quoting a flat number, or commit to maintaining
   per-city ones.
3. **The welcome drink.** Confirm or cut.
4. **Name badge or no name badge.**
5. **`speed-dating-vs-singles-mixer.html`.** The honest version of that post
   probably says SparkDate is a hybrid — the structure of speed dating with
   longer rounds and no scorecard — which is a genuinely better pitch than
   either pure position. But it is a rewrite, and it is yours to call.
6. **`careers.html`.** Its host timeline ("7:00 Icebreaker / 7:20 the actual
   evening / 9:00 close out") never mentions the tables and has the wrong end
   time. A prospective host reads this. Low urgency, real inaccuracy.

## 8. The structural fix

`scripts/audit-facts.js` exists so this is a command rather than an afternoon.
It is **not** wired into CI, deliberately: several checks report occurrences
that are correct-but-worth-knowing (capacity, age), so it would go red
permanently and teach everyone to ignore it — the failure mode
`lint-ad-copy.js`'s own header warns about.

Run it when copy changes, and when a fact about the events changes. Adding a
check is about ten lines; the shape is one canonical value, one source, one
pattern.
