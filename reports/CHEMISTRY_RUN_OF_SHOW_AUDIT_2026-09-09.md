# Chemistry run of show — audit

**2026-09-09** · `public/admin.html` (8,915 lines; the chemistry modal is ~3,160–5,210)
· measured against the shipped code, lifted the same way `tests/chemistry-*.test.js` lift it.

**Designed page:** https://claude.ai/code/artifact/af7b1207-39b4-45a8-a5dd-d0e7c499f169

Taylor's brief, verbatim: *"love the tables and the 1 on 1s but its a little clunky,
not easy to know where people are going next, except for the search bar. priority
intros great, some of other features not really used like the long lists etc.
run of show pretty good."*

Every one of those five judgements turns out to have a structural cause in the code,
and two of them are measurable rather than a matter of taste. This is what they are.

---

## The decision, first

Four changes, in the order they pay off. None of them touches the seating solver,
the scoring, the pin, or the clock — the parts that work.

| # | Change | Why now |
|---|---|---|
| **1** | **Answer "where next" for all 9 plan steps, not 3.** Extend `itineraryFor()` past the seated rounds into the 1-on-1s, and put a **NOW / NEXT** pair of cells above the fold. | The lookup is silent for **6 of the 9 steps** — the entire 1-on-1 segment. This is the whole of "not easy to know where people are going next." |
| **2** | **Print the destination on the table card:** `Men → Table 3 next`. | Removes the need to search at all for the common case. The card already prints where the men *came from* and not where they *go*. |
| **3** | **Retire `Intro order`; fold its print sheet into Priority Intros.** | On every roster SparkDate has actually run, that view is **100% dimmed rows with nothing to action** (proof below). It is not under-used, it is structurally empty. |
| **4** | **`flex-wrap: wrap` on `.chem-toggle`.** | On every phone width tested (375/390/430), the **Run of show tab sits off the right edge** of the modal. One line of CSS. |

Changes 1 and 2 are the "clunky." Change 3 is the "not really used." Change 4 is
one line and is the first thing anyone meets.

---

## EVIDENCE — the search bar goes dark for two thirds of the night

`renderRunOfShow()` builds the plan as seated rounds **followed by** 1-on-1 rounds
(`computeRunPlan`, admin.html:4866). It then hands the lookup **only the seated
rounds**:

```js
const seatedRounds = plan.filter(s => s.kind === 'round').map(s => s.tables);
...
${renderFindPanel(seatedRounds, currentRound)}
```

`itineraryFor(person, rounds)` can only answer for the rounds it is given. Run
against a 10W/10M room at the defaults (6 seats, 3 seatings, 7-minute 1-on-1s):

```
  step  1 Round 1       truth: Table 3 (with 3)    lookup: Table 3 (with 3)
  step  2 Round 2       truth: Table 3 (with 3)    lookup: Table 3 (with 3)
  step  3 Round 3       truth: Table 3 (with 4)    lookup: Table 3 (with 4)
  step  4 1-on-1s r1    truth: paired with m2      lookup: LOOKUP SHOWS NOTHING
  step  5 1-on-1s r2    truth: paired with m9      lookup: LOOKUP SHOWS NOTHING
  step  6 1-on-1s r3    truth: paired with m4      lookup: LOOKUP SHOWS NOTHING
  step  7 1-on-1s r4    truth: paired with m8      lookup: LOOKUP SHOWS NOTHING
  step  8 1-on-1s r5    truth: paired with m3      lookup: LOOKUP SHOWS NOTHING
  step  9 1-on-1s r6    truth: paired with m7      lookup: LOOKUP SHOWS NOTHING
```

**3 of 9 steps.** The plan knows every one of those pairings — `buildOneOnOnes()`
computed them — the lookup is simply never handed them.

It is worse than a blank: during the 1-on-1s `currentRound` is `null`
(admin.html:5065), so even the *seated* legs the card does show lose their
"you are here" highlight. The one segment Taylor singles out as loved is the
one the tool stops narrating.

Coverage by roster shape, same defaults:

| roster | tables | seatings | 1-on-1 rounds | plan steps | lookup answers |
|---|---|---|---|---|---|
| 4W/9M *(Good Good, actual)* | 2 | 2 | 6 | 8 | **2 of 8** |
| 6W/6M | 2 | 2 | 6 | 8 | **2 of 8** |
| 10W/10M | 3 | 3 | 6 | 9 | **3 of 9** |
| 12W/12M | 4 | 3 | 4 | 7 | **3 of 7** |
| 8W/14M | 4 | 3 | 4 | 7 | **3 of 7** |

---

## EVIDENCE — the long lists are empty at SparkDate's actual size

`Intro order` and `Priority Intros` both lead with the pairs the rotation
*never* seats together — the host's genuine manual job. That count is not a
matter of scores; it is structural. With **T** tables and **R** seatings, each
woman meets **R** of the **T** men-groups, so the manual list is empty whenever
**R ≥ T**. The default is 3 seatings, so:

```
seats=6, seatings asked=3 (the defaults)

 roster    people  tables  seatings  pairs  manual-intros
  4W/4M         8       1         1     16              0
  6W/6M        12       2         2     36              0
  8W/8M        16       3         3     64              0
 10W/10M       20       3         3    100              0     <- still zero
 11W/11M       22       4         3    121             30     <- first content
 12W/12M       24       4         3    144             36
 14W/14M       28       5         3    196             78

 4W/9M  (Good Good, actual)  tables=2 seatings=2 pairs=36 manual=0
 6W/10M                      tables=3 seatings=3 pairs=60 manual=0
 5W/7M                       tables=2 seatings=2 pairs=35 manual=0
```

**Below ~20 in the room, the manual-intro list has nothing in it at all.**
Every SparkDate event to date is well under that. So on the real rosters:

- **`Priority Intros` → Manual mode renders an empty list.**
- **`Intro order` renders W×M rows, every one of them tagged `seated R*n*` and
  dimmed to 55% opacity.** At 10W/10M that is 100 greyed-out rows saying
  "the seating already handles this."
- The Tables footer confirms it out loud: *"Every scored pair shares a table at
  some point — the rotation covers the whole room."*

Taylor is not ignoring a useful feature. **The feature is correct and it has
nothing to say at his scale.** The one mode of it that does have content is
`top` — each woman's strongest N — and that is exactly the mode the code
comments say the hostess actually asks for.

### …and that mode is rendered three times

`topMatchesFor(w, _shortlistN)` is the single source for "her strongest N."
Three of the five tabs render it:

| Tab | What it draws at 10W/10M, defaults |
|---|---|
| **Chemistry** (opens here every time) | 10 cards × top 3 = **30 rows** |
| **Priority Intros**, mode `top` | the **same 30 rows**, flat |
| **Intro order** | 100 rows, of which the same 30 are the top of each column |

Half the tab strip is three renderings of one shortlist, and the tab that opens
first is one of them.

---

## MECHANISM — why "where do they go next" is hard even when the data is there

Four separate places where the answer exists and is not shown.

**1. The card prints the source, never the destination.** Both the run body and
the Tables card compute where a table's men *came from*:

```js
const from = step.rotated && step.nTables > 1
    ? (((i - step.offset) % step.nTables) + step.nTables) % step.nTables + 1 : null;
// → "Table 1  ← men from 3"
```

The rotation is `+1 table per round`, so the destination is `i + 1` and free to
compute. It is never rendered. The host reading the card can say where everyone
has been and not where they are going.

**2. The 1-on-1s have no location at all.** A pair renders as a bare ordinal:

```js
<div class="run-table-n">${i + 1}</div>   // "7"
```

Not a table, not a seat — an index into a list. During the segment Taylor likes
most, *nobody in the room, including the host, has been told where to stand.*

**3. Nobody is told they are sitting out.** `buildOneOnOnes` greedily matches;
in an unbalanced room a lot of people are unpaired each round and the panel
lists only the pairs. Measured at 8W/14M (22 people):

```
  1-on-1 round 1: 8 pairs,  6 people idle
  1-on-1 round 2: 8 pairs,  6 people idle
  1-on-1 round 3: 7 pairs,  8 people idle
  1-on-1 round 4: 5 pairs, 12 people idle
```

Six men, then eight, then twelve, whose names appear nowhere on the screen and
who have not been told whether they were forgotten. This is the one finding with
a cost to a guest rather than to the host.

**4. The lookup exists in exactly one view.** `renderFindPanel()` has a single
call site (admin.html:5129), inside `renderRunOfShow`. The **Tables** view — the
one Taylor loves, and the one that is literally a seating chart — has no lookup.
Someone asking "where am I?" while Tables is open costs a tab switch first.

On top of that the lookup is **typed-only** (`findAttendees` returns nothing
under 2 characters, caps at 6 results) with no way to browse the roster. Typing
is the worst available input in a dark, loud room, on a phone, one-handed.

---

## EVIDENCE — the Run of show tab is off-screen on every phone

`.chem-toggle` is a five-item flex row with **no `flex-wrap` and no
`overflow-x`**. Measured in the browser against the shipped stylesheet:

| viewport | strip needs | strip has | overflow | `Run of show` fully visible |
|---|---|---|---|---|
| 375 px (SE / mini) | 389 px | 269 px | **120 px** | **no** |
| 390 px (iPhone 14/15/16) | 389 px | 284 px | **105 px** | **no** |
| 430 px (Pro Max) | 389 px | 324 px | **65 px** | **no** |
| 768 px (tablet) | 662 px | 662 px | 0 | yes |

At 375 px the fifth tab starts at x = 380 — **it begins past the right edge of the
screen.** It is still *reachable*: the backdrop computes to `overflow-x: auto`
(a side effect of `overflow-y: auto`), so the whole modal can be dragged
sideways. But nothing advertises that, and doing it drags the clock and every
panel off-centre with it.

The CSS comment on this block reads *"Run of show — read at arm's length, in a
dark room, on a phone."* It is the only view that cannot be opened on one
without a horizontal drag.

Adding `flex-wrap: wrap` drops overflow to **0 px at 375 px with all tabs
visible on two rows** — verified in the browser, not assumed.

---

## MECHANISM — two tick-lists that cannot see each other

`Intro order` and `Priority Intros` both let the host tick a pair off. They use
**identical key formats and two different Sets**:

```js
window.toggleIntro = (wId, mId) => { const key = `${wId}|${mId}`;  _introsDone …  }
window.togglePrio  = (wId, mId) => { const key = wId + '|' + mId;  _priorityDone … }
```

and both are persisted separately:

```js
done: { intros: [..._introsDone], priority: [..._priorityDone] },
```

A pair ticked off in one view still reads as outstanding in the other. Whichever
one the host happens to be holding is the one that is right. If `Intro order`
goes (change 3), this resolves itself — the two sets become one on restore by
taking their union.

---

## The rest of the "clunky", in descending order

- **The modal opens on `Chemistry` every single time** (`switchChemView('chemistry')`,
  admin.html:3568) — including mid-event, with a clock running. Opening on
  `Run of show` whenever `_runEndsAt` is set costs three lines and one condition.
- **Tab order does not match the night.** It reads Chemistry → Intro order →
  Priority Intros → Tables → Run of show; the night runs Tables → Run of show,
  with the intro lists as reference. The two live views are at the far end.
- **Two tabs are near-synonyms.** "Intro order" and "Priority Intros" name the
  same idea, and neither name says which is the to-do list.
- **`_shortlistN` and `_prioMode` reset to `3`/`'all'` on close** while the clock
  and the ticks persist. A host who set "All" and tapped the backdrop gets "Top 3"
  back with no indication anything changed.
- **A 44 px clock and 12 px tab labels** in the same panel. The clock is sized for
  arm's length; the controls beside it are not.

## What is genuinely good and should not be touched

Worth saying plainly, because the fixes above all sit next to it:

- **The wall-clock timer.** An end-timestamp rather than a decrementing counter,
  so a phone that sleeps in a pocket comes back correct. The comment explaining
  why is better than most of the code it describes.
- **`runStepIn()`.** Clamping every plan index through one function after the
  plan shrank underneath a running step. That was a real mid-event crash and the
  fix is the right shape.
- **The pin.** Seating pinned per event so a door check-in cannot silently
  re-seat a room that has already been read out loud.
- **"The room decides" (±1 min).** Stretching the running segment without
  touching the plan. That is a host-shaped control, not a programmer-shaped one.
- **The rotation guarantee** — men move one table, capped at T rounds so round
  T+1 can never be round 1 re-presented as fresh. Already covered by
  `tests/chemistry-rotation.test.js`.

---

## DECISION — what I would build, concretely

**1. `itineraryFor()` returns a leg per plan step, not per seated round.**
Give it the plan instead of the rounds, and have it return, for each step:
a table for `round` steps; the partner and a location for `ones` steps; and an
explicit *"sitting this one out"* for anyone unpaired. Takes the lookup from
3 of 9 to 9 of 9, and lights up the idle people in the same pass. This is the
single change that answers Taylor's actual complaint.

**2. NOW / NEXT above the fold, and a tappable roster instead of a text field.**
Two cells — where this person is now, where they go next — rather than a flat
list of every round. Tap a name chip; do not type it. *Verified at 375 px in the
browser; see the artifact for the rendering.*

**3. `Men → Table N next` on every table card**, in both the run body and the
Tables view, alongside the existing `← men from N`. One line, and it answers the
question for a whole table at once without anyone searching.

**4. Give the 1-on-1s a table number.** The tables are physically in the room;
reuse the numbering. `Pair 7` becomes `Table 2`.

**5. Retire `Intro order`.** Move `printIntros()` — the cheat sheet, which does
have standalone value — to a button inside Priority Intros. Union the two
done-sets on restore so no ticks are lost. Four tabs then fit a phone.

**6. `flex-wrap: wrap` on `.chem-toggle`**, reorder to
`Tables · Run of show · Intros · Chemistry`, and open on Run of show when a
clock is running.

Roughly: (1) and (3) are the substance and are contained changes to two render
functions; (5) and (6) are deletions and one CSS property. Nothing here needs the
solver, the scoring or the persistence layer reopened, and
`tests/chemistry-rotation.test.js` should stay green throughout — which is the
check that the seating promise has not moved.

---

## What I did not verify

- **The live dashboard.** admin.html is auth-gated, so every rendering measurement
  above was taken against a standalone page built from admin.html's **own
  `<style>` block and own `.chem-toggle` markup, lifted verbatim at build time** —
  not a retyped copy. That is exact for the tab-strip geometry and for the CSS. It
  is *not* a test of the real page with real data in it, and a live check on
  Taylor's own phone could still turn up something the extraction misses.
- **Usage.** There is no analytics in the modal. "Not really used" is Taylor's
  observation; what I established is only *why* those views would have nothing to
  show at his roster sizes. I did not measure that he doesn't open them.
- **Which phone.** Widths of 375 / 390 / 430 cover current iPhones. I did not
  confirm which device Taylor actually hosts from; at ≥768 px the tab strip is
  fine and finding 4 is moot.
- **The scoring itself.** `scorePair()` and everything feeding it were read but
  not audited. Nothing here claims the chemistry numbers are right or wrong.
- **The 1-on-1 table numbering (fix 4)** assumes the physical tables stay in the
  room for the 1-on-1 segment. That is a question about how the night actually
  runs, not about the code — worth a one-line answer from Taylor before building it.
- **The roster chip row at scale.** Verified at 10 people (3 wrapped rows). At 24
  it would be ~6 rows and may need collapsing behind a toggle; not measured.
