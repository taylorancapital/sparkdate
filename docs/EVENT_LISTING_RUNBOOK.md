# Event listing syndication — free discovery channels

How a live SparkDate event gets onto the free event calendars, and why the list
of calendars looks the way it does.

**Source of truth:** `content/listing-sites.json`. Add or retire a site there,
not in this document — the generator and the browser driver both read it, and a
prose list in a runbook is the thing that goes stale.

```bash
npm run listing:pack
```

Writes `build/listing-pack.md`: per-event title, teaser, short and full
description, and the ticket link with UTMs attached, one link per site. Then
`/syndicate-events` drives Chrome through the forms.

---

## The problem this addresses

From `Business Plan/files/Night Tasks/ga4-api-traffic-by-source-2026-09-01.csv`,
window 2026-05-19 → 2026-09-01:

| Source / medium | Sessions | Key events | Revenue |
|---|---|---|---|
| `eventbrite / listing` | 170 | 23 | $290.39 |
| `patch / referral` | 1 | 0 | $0 |
| every other listing surface | 0 | 0 | $0 |

Eventbrite produces more revenue than any source except `(direct)` — and it is
the **only** event-listing surface producing anything at all. That is not an
Eventbrite problem; it works. It is a concentration problem: one moderated
third-party platform carries the entire non-paid, non-direct funnel, and if it
changes its fees, its algorithm or its mind, there is nothing behind it.

Everything below is about putting something behind it, at zero marginal cost.

## What was already known and never done

`docs/MARKETING_PLAYBOOK.md` named five Lancaster calendars in June 2026 and
called them "≈45 min total". GA4 shows none of them has ever sent a session.
The hand-kept UTM sheet has rows for Patch, Eventbrite and Google Business
Posting; only Eventbrite's was ever filled in.

So the gap is not discovery of the idea. It is that the work is eight
near-identical forms, and nobody does eight near-identical forms twice. Hence a
generator and a driver rather than a longer checklist.

## Ticket Tailor is not one of these

It came up as a candidate and it is worth being explicit about why it is not in
the active set: **Ticket Tailor has no discovery marketplace.** It is a box
office — a cheaper place to *process* a ticket, not a place anyone browses
looking for something to do on a Tuesday. Adding it would mean a third checkout
(site + Eventbrite + Ticket Tailor) splitting the attendee record three ways,
for zero new eyeballs.

As a **fee** play against Eventbrite it is a real option and worth costing out
separately. As a **listing** surface it answers a question nobody asked.

## Eventful is dead

It shut down in 2021 and the domain no longer resolves, but it still appears in
most "free event listing sites" roundups. It is recorded as `rejected` in the
registry so it does not get re-suggested by the next roundup someone reads.

## UTM convention

```
https://sparkdate.date/event?id=<id>
  &utm_source=<site_key>
  &utm_medium=listing
  &utm_campaign=<event_key>_<YYYYMM>
  &utm_content=<event_key>_<site_key>
```

- **`medium=listing`, not `referral`.** GA4 assigns `referral` by itself to any
  uncontrolled inbound link. A hand-tagged listing would drown in it. `listing`
  is a bucket nothing else writes to, which makes "what did free calendars do
  for us" one readable row. It also matches the `eventbrite / listing` rows
  already in GA4, so the new surfaces land in the same report as the one that
  works.
- **`campaign` follows `brand.json`** (`{event_key}_{YYYYMM}`). The old
  `week3_Solution` shape went stale by construction every month.
- **`content` is unique per site per event.** `brand.json` bans a shared
  `utm_content` — 11 ads once shared `proof_rsa1` and none of them could be
  attributed. Same failure mode, same rule.
- **The link points at the event page, not `/lp`.** Someone clicking "tickets"
  from a calendar has already been sold the event; `/lp` has no cart and adds a
  hop. See `brand.json` → `universal.landing_page_warning`.

## Expect this to be slow

Moderation queues run days. SEO indexing runs weeks. Nothing here reports
tomorrow. The check is `sessionSourceMedium` where the medium is `listing`, in
a GA4 traffic-by-source pull several weeks out — and the honest expectation for
most of these calendars individually is a handful of sessions each. The case
for doing them is the aggregate and the backlinks, not any one of them.

## One open contradiction, blocking one sentence of copy

The generator refuses to describe the format of the night, because two of our
own sources disagree:

- `content/brand.json` → `events.TL.open_issues` says a live listing's "no
  bell, no rotation, no timer" phrasing is **wrong**, and that the real run of
  show is check-in and drinks, then icebreaker/mingling, then **7-minute
  matched rounds last**.
- The live blog at `/blog/how-same-night-matching-works` still says "there's no
  bell, no forced rotation, no seven-minute timer."

Both are ours and they are published. Every listing description generated here
is written around the disputed mechanic — everything both sources agree on is
used, and the rounds question is simply absent.

**This needs a human decision, and it is bigger than this pipeline:** the same
contradiction is live on the blog and, per `brand.json`, on a real Eventbrite
listing. Settle which is true, fix both places, then add the sentence to
`FORMAT_DISPUTE` in `scripts/build-listing-pack.js` on purpose.
