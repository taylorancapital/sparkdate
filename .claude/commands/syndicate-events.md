---
description: Drive Claude in Chrome to list every live SparkDate event on the free event-listing sites, with UTMs already attached
---

Get every on-sale SparkDate event onto the free event-listing surfaces in
`content/listing-sites.json`, with the tagged ticket link, without creating
duplicates and without publishing anything the user has not seen.

Argument (optional): a site key or event key to limit the run —
`/syndicate-events allevents`, `/syndicate-events LX`. With no argument, do
every `active`, `not_pursued` and `dormant` site for every upcoming event.

## 0. The rule that governs this whole command

**Fill the form. Do not submit it.**

A listing is public, outward-facing content that names a real venue, a real
date and a real price, and several of these calendars are moderated — a wrong
submission costs a relationship with the calendar, not just a bad row. Build
each submission up to ready-to-send, screenshot it, and hand it to the user to
click.

This is the same standing rule `CLAUDE.md` sets for the Meta composer, applied
to the surface it obviously extends to. The narrow TikTok exception recorded
there does **not** carry over — it was granted for one platform's Schedule
button under an explicit blanket authorization, and nothing like it has been
given here.

Two things you may do without asking: **read** any listing page, and **fix a
link you previously submitted** if the user asks you to.

## 1. Generate the pack first

```
node scripts/build-listing-pack.js --out=build/listing-pack.md
```

Every headline, description and URL you type comes from that file. Do not
compose listing copy in the browser and do not retype a price from memory —
retyping is the failure this pipeline exists to prevent.

Read `build/listing-pack.md` and note the warning block at the top: one claim
about the format of the night is deliberately omitted because two of our own
sources contradict each other. **Do not fill that gap from your own knowledge**
and do not copy a sentence about it from an existing listing. If a form makes
the question unavoidable, stop and ask the user.

If the pack reports an event that is not in `content/brand.json`, say so — its
UTM campaign will fall back to `evt_` and be unattributable.

## 2. Open the browser on the real accounts

Use **Claude in Chrome** (`mcp__claude-in-chrome__*`), not the in-app Browser
pane. Eventbrite, Facebook, Nextdoor, Meetup and Google Business all need the
logged-in sessions that live in the user's actual Chrome profile.

Load the tools in ONE call:

```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__tabs_create_mcp"
```

If a site turns out to need a login the user does not have, stop on that site
and record it as blocked. **Never create an account and never type a password**
— hand those back to the user by name.

## 3. Per site, in priority order

Work `content/listing-sites.json` in ascending `priority`. One site at a time,
reporting after each. Do not batch several sites unattended.

**a. Check for a duplicate before typing anything.** Search the site's own
calendar for the event name, the venue, and the date. Several of these
aggregators auto-import from Eventbrite, so a listing may already exist that
nobody created by hand — AllEvents especially. If one exists:
  - If it is ours and editable, **claim/edit it** rather than adding a second.
    That is also the only way to get our UTM onto an auto-imported listing,
    which otherwise carries Eventbrite's link.
  - If it is ours and stale (old price, past date, wrong link), fix it and say
    what changed.
  - If it exists and is fine, skip it and record "already listed".

**b. Read the form before filling it.** `read_page` on the submission page and
work from the accessibility tree. Do not assume field names from this document
— these are small local sites and their forms change without notice. Map what
you find onto the pack's fields:

| Form asks for | Use |
|---|---|
| Event title / name | `Title` |
| Short blurb, summary, teaser, excerpt | `One-line teaser` or `Short description`, whichever fits the character limit |
| Description / details | `Full description`, with `{URL}` replaced |
| Ticket URL, registration link, website | the tagged link for **this** site |
| Date, start time, end time | from the event table |
| Price / admission | the price, and the rise date if there is one |
| Category | singles / social / nightlife / community — whatever the site's own taxonomy is nearest to |
| Image | `Image`, resized to that site's stated constraint |

**c. Use each site's own link, not the last one.** The whole point of the
per-site `utm_content` is that one calendar's contribution is separable from
another's. Pasting Eventbrite's link into Discover Lancaster silently merges
them and the row becomes unreadable.

**d. Respect the recorded constraints.** `content/listing-sites.json` carries
each site's lead time, image dimensions and gotchas, and the pack prints a
warning when an event is inside a site's lead-time window. Submitting a
14-day-notice calendar 7 days out is allowed — just say that it may not clear.

**e. Stop at the submit button.** Screenshot the completed form. Tell the user
exactly which button to press and what it will do. Then move on to the next
site only when they say to.

## 4. Sites that are not a form

Three entries need judgement rather than form-filling; the same
fill-but-do-not-post rule applies.

- **Facebook Event** — create from the SparkDate Page, not a personal profile.
  After the user posts it, verify the ticket link still carries its `utm_*`
  params through Facebook's `l.facebook.com` wrapper; if the tags are stripped,
  say so, because the GA4 row will never appear.
- **Nextdoor free Events post** — a different surface from the Nextdoor ads
  already running. Keep `utm_source=nextdoor_event` distinct from the paid
  traffic or the free post's contribution is invisible.
- **Meetup, existing groups** — these are other people's groups. Do not post a
  ticketed event into one uninvited. Draft a short message to the organiser
  asking first, show it to the user, and let them send it.

`reddit_lancaster` is marked `out_of_scope` on purpose: a form-shaped post
reads as spam there and most local subs remove promotion outright. Leave it to
the human-voiced organic workflow.

## 5. Report

For each site: **listed / already listed / drafted, awaiting the user's click /
blocked**, with the reason and the exact URL of the live listing where there is
one.

Then, in the repo:

- If a site turned out to be dead, members-only, paywalled, or otherwise not
  what the registry claims, **fix `content/listing-sites.json`** — move it to
  `rejected` with the reason. A registry that records what did not work is what
  stops the next session re-trying it.
- If a new surface turned up that is genuinely free, add it with a `priority`.
- Do not write an inventory of what is listed where into `HANDOFF.md` or
  `CLAUDE.md`. That goes stale within a day; the live listings are the truth.

Finally, note that nothing here proves itself for weeks. These are slow
channels — moderation queues, SEO indexing. The check is
`sessionSourceMedium` where medium is `listing` in the GA4 traffic-by-source
pull, several weeks out, not tomorrow.
