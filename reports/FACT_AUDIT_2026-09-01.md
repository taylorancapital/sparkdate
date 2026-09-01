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
| `public/careers.html:292` | close out 9:00 PM | **not fixed** — host-facing, see §9 |
| `DEFAULT_EVENT_DURATION_HOURS` | **published endDate 9:30 PM** | **fixed — 3 → 2** |

> **It turned out not to be a data problem at all.** No event doc sets
> `durationHours`; the end time was *computed* from
> `DEFAULT_EVENT_DURATION_HOURS`, which was **3**. That single constant was the
> published end time for every event, and it was inventing an hour that does
> not exist — into the schema.org `endDate` Google reads, and into every
> calendar that scrapes the site.
>
> **Fixed at the source: 3 → 2.** No Firestore write was needed, and it
> corrects every future event too, not just the two on sale.
>
> The constant was also duplicated as a bare `3` in four other places
> (`api/next-event.js`, `city.html`, `event.html`, `events.html`) — in a file
> whose own comment warns that every such check "must route through this helper
> so they can't drift out of sync again". The API now imports the constant; the
> three client-side copies can't import from `lib/`, so they carry the number
> with a comment naming what it must match.
>
> It also decided when an event stopped being *current*. At 3, the site kept
> selling and check-in kept pointing at a room that had emptied an hour
> earlier. `tests/next-event.test.js` gained a 2.5-hour boundary case —
> verified to fail under the old default.

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

Settled 2026-09-01, in two passes. The night runs in **three movements**:

1. **Timed rounds at small tables**, a game as the icebreaker, men moving one
   table along each round
2. **Open mingling** — no structure, go where you want
3. **One-on-ones** with people you haven't already sat with

then private interest notes and same-night matches.

Nine surfaces said some version of "no rotation, no timer, no scorecard".

> **The nuance that explains why this was so hard to settle.** Movement 2 is
> real, and it is invisible in the chemistry tool — there is nothing to seat
> and nothing to time, so a run of show derived from the dashboard alone comes
> out missing it entirely. That is exactly what happened here, twice.
>
> Which means the site's "conversations at your own pace, no rigid rotation"
> language **was never invented**. It describes movement 2 accurately and then
> presents it as the whole evening. Every party to this contradiction was half
> right, which is why it survived so long: whoever checked could always find
> evidence for their side. The defect was never the phrase — it was the phrase
> standing alone.

**Fixed (5):** `blog/how-same-night-matching-works.html`, `city.html` ×3 prose
plus its FAQ structured data, and `event.html:788` — which promised "no awkward
icebreakers" on the page where people buy.

**Deliberately not fixed (2):** `blog/speed-dating-vs-singles-mixer.html`. Its
entire thesis is "we are a mixer, *not* speed dating", down to a closing CTA of
"No whistle, no scorecard, no three-minute timer." With rotations and a timer,
that post now argues against the product. That is a positioning decision, not a
copy fix — see §9.

**In new copy, state the shape and NO duration whatsoever.** See §7 — the one
number that looked safe stopped being safe within hours.

---

## 4. Welcome drink — 7 false claims. RESOLVED: there is no drink.

> "Tickets are $24.99, which includes entry and — at most venues — a welcome
> drink."

On all four city pages, in prose **and inside the FAQ structured data Google
surfaces**. Nothing in the repo backed it.

**Taylor, 2026-09-01: "We should not under any circumstances be giving out
welcome drinks."** All seven removed; the pages now say the ticket covers
entry and "Drinks are on you at the bar."

This was the only claim in the audit a guest could stand at a bar and demand.
The `free-drink` check stays in `audit-facts.js` permanently — the claim is
attractive, cheap to retype, and was sitting in structured data Google had
already indexed.

---

## 5. Name tags — RESOLVED: they are used

- `blog/how-same-night-matching-works.html:174` — "get your name badge" ✓ right
- `blog/first-timer-guide.html:202` and `first-timer-guide-lancaster.html:202`
  — "No name tag" ✗ wrong

**Taylor, 2026-09-01: name tags are used.** Both guides corrected. The "no
scorecard" half of that sentence was always right and is kept — it is the real
contrast with speed dating.

The `name-badge` check stays, inverted: it now watches for a regression *back*
to "no name tag".

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

## 7. The near miss that changed the rule

The first version of this audit said the round count and length were unsafe to
print but that **"five minutes for the one-on-ones is fixed and safe to state"**
— because `ONE_ON_ONE_MS` was a hardcoded constant.

**#379 merged the same day.** It made the 1-on-1 length a host setting of
5/7/10 minutes and moved the default to **seven**. Every listing already
carrying "five-minute one-on-ones" would have been wrong, on calendars that
cannot be edited after moderation.

The rule is now absolute: **quote no duration for any segment.** A number that
is a constant today is a setting tomorrow, and the listing outlives the
constant. `audit-facts.js` has a `quoted-duration` check and
`tests/listing-pack.test.js` fails on any `N-minute` phrase in generated copy.

It also caught a second thing on its first run.

## 8. The most accurate description of the night was in a social caption

`content/queue.csv:110` — a queued Instagram caption nobody had cross-checked —
described the night as:

> …open a tab, get a drink → **"we sit you down for an icebreaker activity —
> with people we think you'll click with"** → **open mingling** → **"the
> 7-minute rounds, at the end"**

Every element of that is right. It is the only surface in the entire codebase
that got the icebreaker-at-a-table correct, the only one that mentioned open
mingling at all, and "7 minutes at the end" matches the 1-on-1 default that
#379 shipped hours later.

It was flagged here as *suspect* because it disagreed with every other source,
including the dashboard. Taylor confirmed it. **The outlier was the truth.**

Only the naming was changed — it called the 1-on-1s "rounds", colliding with
the table rounds, and quoted a duration that is now host-settable. It now reads
"Then the one-on-ones, at the end - once you already know half the room."

The lesson for this audit is uncomfortable and worth keeping: **agreement
between surfaces is not evidence.** Six surfaces agreed the night had no
structure and all six were wrong; one caption disagreed with everything and was
right.

## 9. Open, needs a decision from Taylor

1. ~~Edit the Firestore event records.~~ **Resolved — it was a code default,
   not data. `DEFAULT_EVENT_DURATION_HOURS` 3 → 2.**
2. **The Philly price.** Stop quoting a flat number, or commit to maintaining
   per-city ones. **The last open item in this audit.**
3. ~~The welcome drink.~~ **Resolved 2026-09-01 — cut everywhere.**
4. ~~Name badge or no name badge.~~ **Resolved — name tags are used.**
5. **`speed-dating-vs-singles-mixer.html`.** The honest version of that post
   probably says SparkDate is a hybrid — the structure of speed dating with
   longer rounds and no scorecard — which is a genuinely better pitch than
   either pure position. But it is a rewrite, and it is yours to call.
6. **`careers.html`.** Its host timeline ("7:00 Icebreaker / 7:20 the actual
   evening / 9:00 close out") never mentions the tables and has the wrong end
   time. A prospective host reads this. Low urgency, real inaccuracy.

## 10. The structural fix

`scripts/audit-facts.js` exists so this is a command rather than an afternoon.
It is **not** wired into CI, deliberately: several checks report occurrences
that are correct-but-worth-knowing (capacity, age), so it would go red
permanently and teach everyone to ignore it — the failure mode
`lint-ad-copy.js`'s own header warns about.

Run it when copy changes, and when a fact about the events changes. Adding a
check is about ten lines; the shape is one canonical value, one source, one
pattern.
