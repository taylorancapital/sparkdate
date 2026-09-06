---
description: Drive Claude in Chrome to correct the live Eventbrite listing bodies and ticket tiers, verify against a banned-string list, and stop before Save
---

Bring the live SparkDate Eventbrite listings in line with `content/brand.json`,
without inventing a fact and without saving anything the user has not seen.

Argument (optional): a `brand.json` event key to limit the run —
`/fix-eventbrite-listings MC`, `/fix-eventbrite-listings LX`. With no argument,
do every on-sale listing.

## 0. The rule that governs this whole command

**Paste the copy. Do not click Save.**

An Eventbrite listing is public content naming a real venue, date and price, and
it is the channel that has outsold every paid ad this account has run. Build each
edit up to ready-to-save, screenshot it, and hand it to the user to click.

This is `CLAUDE.md`'s standing Meta-composer rule applied to the surface it
obviously extends to, and it matches `/syndicate-events` §0. The narrow TikTok
exception does **not** carry over.

Three things you may do without asking: **read** any listing page, **run the
verification pass** in §6, and **report** what you found.

## 1. Load the tools and open the real account

Use **Claude in Chrome** (`mcp__claude-in-chrome__*`), not the in-app Browser
pane — editing requires the logged-in Eventbrite session in the user's actual
Chrome profile. The Browser pane is signed out; it can read a public listing but
cannot open the editor or enumerate ticket tiers.

Load the tools in ONE call:

```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__tabs_create_mcp"
```

Then open `https://www.eventbrite.com/organizations/events`. If it bounces to a
sign-in, **stop and hand it back to the user** — never type a password and never
create an account.

## 2. EVENTBRITE SERVES STALE PAGES — cache-bust every read

This cost a full review cycle on 2026-09-04: two consecutive reads of the Marion
Court listing returned byte-identical text and were reported to the user as
"nothing changed," when four edits were in fact already live.

**Every read done to verify state must carry a unique query param:**

```
https://www.eventbrite.com/e/<slug>-tickets-<id>?cb=<timestamp>
```

A read without a cache-buster is not evidence. Tell: if the page lacks the
organizer stat line (`N followers · N events · N total attendees`), you are
looking at a cached copy — bust it and read again.

## 3. Where each fact comes from

| Fact | Source | Never |
|---|---|---|
| Venue, address, date, doors/ends | `content/brand.json` → `events.<KEY>` | A neighbouring listing |
| Testimonials | `universal.approved_testimonials` | Any other quote |
| Attendance figure | `universal.approved_stat` (31, Event 1) | A check-in tally, a guess |
| Run of show | `universal.run_of_show` | Prose on the live site — five files still carry the false version |
| **Price** | **The live Eventbrite ticket panel** | **`brand.json` — its price ladders have gone stale before** |

That last row is the exception to "brand.json is truth," and it matters: on
2026-09-04 `brand.json` recorded Marion Court's early bird as ending 2026-08-24
while the listing advertised Sept 1 and the only buyable ticket was the regular
tier. **Read the price off the ticket panel, every time.**

## 4. The body template

Identical for every event except the opening line and THE DETAILS block. Replace
each `{{...}}` from the sources in §3. Paste the whole body, not a patch.

---

**A singles mixer for people who are tired of apps.**

Not a scorecard and a stopwatch. A game, a room designed to mix, and real
conversations with people who actually showed up{{, at VENUE_SHORT — optional}}.

**THE PROBLEM**

Most people don't hate dating. They hate dating apps.

Endless matches who never reply. Conversations that fizzle before they start.
Profiles polished into something unrecognizable. The same five photos, the same
three prompts, and the slow-motion feeling that nothing real is happening.

The apps were built to keep you swiping. We were built to get you in a room.

**HOW THE NIGHT RUNS**

**Doors.** A host checks you off a reviewed guest list, hands you a name tag, and
gets drinks moving. Nothing to download. No profile at the door.

**Seated rounds — with the game.** The room splits into balanced tables of about
six, and a host-run game is what you play at the table. That *is* the icebreaker,
so nobody has to invent an opening line cold. After the first round, women stay
and men move one table along — so every round is an entirely new set of people.

**Open mingling.** The structure drops away. Go where you want, stay as long as
it's working. By this point you've already met most of the room, so nobody is
starting cold.

**One-on-ones.** Simultaneous pairs, prioritizing people you haven't already
shared a table with. A pair never repeats.

**The part that matters.** Near the end you privately note anyone you'd like to
see again. It takes under a minute and nobody sees it but you. If they noted you
back, that's a match — and you get it that same night, not in a follow-up email
three days later.

**COMING ON YOUR OWN?**

Most people do. That's the whole design: a host greets you by name at the door,
the tables are built for you, and the game means you never have to walk up to a
stranger and start from nothing.

> {{TESTIMONIAL_1}}
> {{TESTIMONIAL_2}}
> {{TESTIMONIAL_3}}

Our first Lancaster night drew {{APPROVED_STAT}} people.

**THE DETAILS**

📅 {{DAY}}, {{DATE}} — doors {{DOORS}}, wraps {{ENDS}}
📍 {{VENUE}}, {{ADDRESS}}
👥 21+
💰 {{PRICE — from the live ticket panel, §3}}
🎯 Limited to 30 people — balanced, not packed

**READY?**

Grab your spot below.

Know someone else burned out on apps? Bring them — ask us about the two-for-one.

Questions? Message us any time.

See you there 🍹

---

**Why the template reads the way it does.** Each of these was a live defect:

- **No durations, anywhere.** Rounds are host-settable 2/3/4 × 10/15/20 and
  1-on-1s are 5/7/10 since PR #379 moved the default from five to seven. Any
  number is stale by the next event. State the shape.
- **It does not say "no bell / no rotation / no timer."** All three exist.
  `brand.json` records that phrasing as flatly false against the shipped tool,
  and it is still live on five other files.
- **It does not deny the icebreaker.** There is a game; it is played at the
  tables. `public/event.html` still promises "no awkward icebreakers."
- **"No scorecard" IS accurate**, and `run_of_show` names it as the real contrast
  with speed dating. It is the one such line in the template.
- **"Reviewed guest list"** replaces "pre-screened attendees (no bots, catfish,
  or time-wasters)" — a promise the operation cannot keep.
- **"Speed dating" appears in the TITLE only.** Positioning decision, confirmed by
  Taylor 2026-09-04: the keyword buys findability, the product is a singles mixer
  built on games and chemistry. Do not reintroduce it to the body for SEO.

## 5. Per listing, one at a time

Report after each. Do not batch both listings unattended.

**a.** Organizer dashboard → the event → **Edit** → the description block.
Screenshot before touching anything.

**b.** Paste the filled template. **Leave the title alone** — both titles already
carry the `- Speed Dating Lancaster` keyword and are correct.

**c. Fix what is not copy.** These live in ticket settings and pasting the body
will not touch them:

- **Price mismatches.** Compare every price in the description against the
  buyable tiers. On 2026-09-04 Marion Court advertised $18.99 twice with only
  $24.99 purchasable, and Loxleys advertised "From $14.99 / $5.00 off / 2 for 1"
  on its search card while the description said $24.99→$29.99. Report both
  directions; change nothing without being asked.
- **Refund policy.** Flag any inconsistency across listings — Marion Court was
  "No refunds" while Loxleys allowed 14 days, the stricter policy on the sooner
  event. Do not change it unasked.

**d. Stop.** Screenshot the filled editor and hand it to the user to click Save.

## 6. Verification pass — run after the user saves

Re-read the public page **with a cache-buster** (§2) and confirm each string
below is absent. Every one was live at some point, and most survived more than
one edit pass — which is why this is mechanical rather than a read-through.

**Must not appear in the body:**

- `7-minute`, `7 minute`, `five-minute`, or any duration for a round or a 1-on-1
- `no bell`, `no rotation`, `no forced rotation`, `no timer`
- `no awkward icebreakers`, or any denial that an icebreaker exists
- `Summer Edition`, or any season that is not the current one
- `sold out` — unless sourced
- `pre-screened`, `catfish`, `no bots`, `time-wasters`
- `[` or `]` — literal template brackets survived three edits
- `Speed Dating` **in the body** (the title is deliberate and stays)
- Any venue name belonging to a different event — Marion Court carried
  "Location: Loxley's" for weeks, cloned from the sibling listing

**Must appear:** the venue matching `brand.json` for that key, the same-night
match line, and the "Coming on your own?" block.

Report as a list: string, found/absent, where.

## 7. What must never be filled from your own knowledge

If a field asks something the sources in §3 do not answer — a round count, a
duration, an attendance figure — **stop and ask.** Do not resolve it from an
existing listing, a past caption, or a sense of what a singles event usually
does. Every persistent defect on these listings came from copying a neighbouring
surface that was itself wrong.

**The age bracket is settled: there is no bracket, deliberately.** Confirmed by
Taylor 2026-09-04. Older buyers have converted, and matching runs on chemistry-
tool age compatibility, so a hard range would exclude people who buy. `21+`
stays. Competitors bracket theirs; that is not a reason to.

## 8. Finish

Report per listing: what was replaced, what ticket-settings changes are still
outstanding, the §6 result, and anything you stopped on. If a listing was left
mid-edit because the user has not clicked Save, **say so plainly** — an unsaved
editor looks identical to a saved one on the next session's read.
