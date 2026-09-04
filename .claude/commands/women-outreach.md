---
description: Drive Claude in Chrome to find women-audience local businesses and community groups, draft the ask or the post from a generated pack, and stop before sending
---

Get SparkDate in front of women through lists somebody else already built —
local businesses whose audience is mostly women, and community groups where
women are the members. Registry: `content/women-surfaces.json`.

Argument (optional):
- `/women-outreach discover` — run only the discovery pass (§2) and write rows
- `/women-outreach partner` / `/women-outreach community` — one motion only
- `/women-outreach <surface_key>` — one surface
- no argument — discover if the registry has no women-specific rows, then work
  every `not_pursued` surface for every on-sale event

## 0. The rule that governs this whole command

**Draft it. Do not send it, do not post it.**

Every output here lands in someone else's inbox or someone else's community
under Taylor's own name and personal profile. A misjudged post does not just
fail — it gets the account removed from a group he cannot rejoin, or burns a
business relationship before it starts.

Build each message up to ready-to-send, screenshot it, and hand it over. This
is `CLAUDE.md`'s standing Meta-composer rule applied to the surface it
obviously extends to, and it matches `/syndicate-events` §0 and
`/fix-eventbrite-listings` §0. **The narrow TikTok exception does not carry
over** — it was granted for one platform's Schedule button and nothing like it
has been given here.

Four things you may do without asking: **read** any public page, **run the
discovery pass**, **generate the pack**, and **report** what you found.

## 1. Two motions. Do not conflate them.

| | `partner` | `community` |
|---|---|---|
| Who | A business or an organiser | A group of people |
| Action | An **ask** — "would you share this" | A **post**, in their room |
| Voice | Taylor, business to business | Taylor, as a person |
| Fails by | Being ignored | Being removed, or getting him banned |
| Needs first | Nothing | **Reading the group's rules** |

The registry's `motion` field decides which. A partner ask never gets posted
publicly; a community post never gets emailed to a business.

## 2. Discovery — how rows get into the registry

The registry ships with three general-audience groups from the June 2026
playbook and **no women-specific rows at all.** That is deliberate: inventing
plausible local business names would be fabrication, and a fabricated row is
worse than an empty list because the next session treats it as researched.

Work `discovery_targets` in the registry. For each search:

**a.** Open the surface in Claude in Chrome (§3) and search as written.
**b.** Qualify each candidate against `discovery_targets.qualify_on` — local
audience, actually active, already cross-promotes, reachable human. A studio
with 40k followers and no local tag is worth less than one with 1,200 who all
live here.
**c.** Record what you actually saw: name, URL, follower/member count, date of
last post, whether promotion is allowed (for groups), whether there is a
named human to reach.
**d.** **Show the user the list before writing anything to the registry.**
They pick which ones are real targets.
**e.** Write the chosen rows into `content/women-surfaces.json` with
`status: "not_pursued"`, a `utm_source` unique to that surface, and the
gotchas you observed. Never write a row you did not open.

If a search turns up nothing usable, **record that too** — a registry that
remembers what did not work is what stops the next session re-running it.

## 3. Open the browser on the real accounts

Use **Claude in Chrome** (`mcp__claude-in-chrome__*`), not the in-app Browser
pane. Facebook groups, Instagram and Nextdoor all need the logged-in sessions
in the user's actual Chrome profile; the pane is signed out and will show you
a login wall or a stripped public view and let you believe it is the real page.

Load the tools in ONE call:

```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__tabs_create_mcp"
```

**Never create an account and never type a password.** If a surface needs a
login the user does not have, stop on it and record it as blocked, by name.

## 4. Generate the pack before typing anything

```
node scripts/build-outreach-pack.js --out=build/outreach-pack.md
node scripts/build-outreach-pack.js --motion=partner --event=LX
```

Every fact, every price and every URL you type comes from that file. Do not
compose in the browser and do not retype a price from memory — retyping is the
failure this pipeline exists to prevent, and it is why the pack exists at all.

Three things the pack does deliberately, which you must not "fix":

- **`[OFFER GOES HERE]` is left blank.** What a business gets in return is
  Taylor's to decide and to state. Filling it in is negotiating on his behalf,
  and a number written down first becomes the ceiling. Memory
  `never-ask-a-venue-for-its-minimum` records this exact mistake being made
  with venues. **Hand the draft over with the blank still in it** unless the
  user has already told you what the offer is.
- **No duration appears anywhere.** Round count, minutes per round and minutes
  per 1-on-1 are host-settable per event and two of our own sources disagree.
  If a reply asks, ask the user — do not answer from your own knowledge.
- **Each surface has its own tagged link.** Pasting one surface's link into
  another silently merges them and both rows become unreadable.

## 5. Per surface, in order

One at a time, reporting after each. Do not batch several unattended.

### community

**a. Read the rules first, every time.** Open the group's About / pinned post
and find its promotion policy. If promotion is banned, **stop — mark the
surface `rejected` with that reason and move on.** Do not post anyway and do
not reword around it. Most local groups remove promotional posts, and some ban
the poster; the account is Taylor's personal profile.

**b. Check for a duplicate.** Search the group for "SparkDate" and for the
venue name. If we have posted before, read how it went — comments, reactions,
whether it was removed — and say so before drafting another.

**c. Post as the person, not the page**, where the group allows either. A page
post reads as an ad and gets less reach in group feeds.

**d. Fill the composer. Do not click Post.** Screenshot it, say exactly which
button the user should press, and wait.

### partner

**a. Find the reachable human.** Owner, manager, whoever replies to comments.
A named person beats a contact form; a contact form beats nothing.

**b. Prefer their own channel.** An Instagram DM to a studio owner outperforms
a generic info@ address, and it is where they actually are.

**c. Fill the message. Do not click Send.** Screenshot it with the
`[OFFER GOES HERE]` blank visible so the user can see what is missing before
they fill it.

**d. If they reply asking for terms, that is the user's answer to give.** Do
not improvise a deal in a follow-up.

## 6. What you must never do

- **Never DM individual women found in groups or follower lists.** It is
  unsolicited contact with private individuals, it will get the account
  reported, and it is the exact behaviour the events are positioned against.
  It is recorded as permanently `rejected` in the registry. Do not re-propose
  it in a different wrapper.
- **Never join a group under false pretenses** or answer membership questions
  on the user's behalf. Membership questions are the user's to answer.
- **Never scrape a member list**, export followers, or compile contacts into a
  file. The venue contact CSV is already gitignored for this reason.
- **Never post the same text into several groups in one sitting.** It is the
  clearest spam signal there is and the groups often share moderators.

## 7. Report, then record

For each surface: **posted / drafted, awaiting the user's click / already
posted / blocked / rejected**, with the reason and the live URL where there is
one.

Then, in the repo:

- **Update `content/women-surfaces.json`.** A surface that turned out to ban
  promotion, be dead, or be members-only moves to `rejected` with the reason.
  A surface that worked gets its status advanced. A new one found along the
  way gets added.
- **Do not write an inventory of what is posted where into `HANDOFF.md` or
  `CLAUDE.md`.** It goes stale within a day; the live posts are the truth.

Finally: **this channel proves itself slowly and partly invisibly.** A group
post gets seen over days, a business shares when it suits them, and Meetup and
Eventbrite checkouts are invisible to GA4 entirely. The check is
`sessionSourceMedium` where medium is `partner` or `community`, weeks out —
and ticket sales at the tagged links, not follower counts.
