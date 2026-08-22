# Social runbook — how to run a campaign from here

The short answer to "do I update the 30-day scheduler, get the art built, then
push it": **yes, and in that order.** The spreadsheet is gone; `content/queue.csv`
took its place. Everything else is the same shape you were already working in.

---

## The loop, for a new event

### 1. Add the event to `content/brand.json`

One block under `events`, keyed by a two-letter prefix (`MC`, `TL`, `GG`, `LX`):

```json
"XX": {
  "name": "...", "market": "lancaster", "venue": "...", "city": "Lancaster, PA",
  "date": "2026-10-14", "doors": "6:30 PM", "event_id": "<Firestore eventId>",
  "pricing": { "early_bird": 24.99, "early_bird_through": "2026-09-30", "regular": 29.99 },
  "hashtag_pool": ["#LancasterDating", "..."]
}
```

This is the part that makes the linter useful. Prices, hashtags and the market
are checked against **this block** — get it right once and every row is
validated against it forever.

### 2. Generate the rows

`brand.json` → `calendar_template` holds the 21-beat cycle (T-30 → T+1), ported
from the old brand doc. Each beat has an offset, platforms, format, and a
content brief. Convert offsets to real dates from the event date and add one
row per beat to `content/queue.csv`.

Set `utm_content` to the `row_id` and `utm_campaign` to `{EVENTKEY}_{YYYYMM}`.

> **This step is still manual and it shouldn't be.** A generator that takes
> `--event=XX --date=YYYY-MM-DD` and writes the rows is the obvious next tool.
> Until it exists, copy an existing event's rows and edit.

### 3. Lint before you commission any art

```bash
npm run social:lint
```

Do this **before** step 4. Fixing a wrong price or a Philly hashtag on a
Lancaster event costs nothing here; it costs a re-export after the art is made.

Errors fail; warnings are yours to judge. `asset-missing` warnings are expected
at this stage — that's the to-do list for step 4.

### 4. Commission the art

The linter output *is* the brief list. For each row you need: `row_id`, the
`format` (how many slides), the `theme` and `brief` from the template, plus
name/venue/date/price from the event block.

Hand that to Claude Design. Ask for **1080×1080 PNG** for feed, **1080×1920**
for story/reel.

Drop the exports into `OneDrive\SparkDate\SourceArt\`. Filenames just need the
row id recognisably in them — `sparkdate-oct14-1of3-XX5.png` maps to `XX-05`.

### 5. Convert and wire them up

```bash
python scripts/prep-social-assets.py --dry-run
python scripts/prep-social-assets.py
```

Flattens RGBA, encodes JPEG (**Instagram's API accepts JPEG only** — this is not
optional), validates dimensions, renames to the row-id convention, writes to
`public/social/`, and fills in `asset_files` in the queue.

Then lint again. The `asset-missing` warnings should be gone.

### 6. Commit and push

```bash
git add content/queue.csv public/social
git commit -m "Add the <event> 30-day calendar"
git push
```

**Pushing matters more than it looks.** The runner reads the queue from the
repo, not your disk. An unpushed `published_ids` is how you get a duplicate
post.

### 7. Review, approve, schedule

```bash
node scripts/social.js plan --through=2026-10-14
node scripts/social.js approve --through=2026-10-14
node scripts/social.js run --execute
```

`plan` prints what would go where and when, and publishes nothing. `approve` is
the gate — **nothing publishes without it**, and a bare `approve` with no
`--through` or `--row` is refused rather than approving the queue. `run
--execute` hands Facebook everything inside its 30-day window.

Then commit the queue again — `run` writes the post ids back.

### 8. Instagram takes care of itself

Instagram cannot be scheduled (no API parameter, and containers expire in 24h),
so the GitHub Actions runner fires every 15 minutes and publishes IG posts at
their slot. Nothing to do, provided the secrets are set:
`META_SOCIAL_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID`.

Watch it at **Actions → social publish**.

---

## What stays manual, permanently

| Thing | Why |
|---|---|
| **Story link/countdown stickers** | The API can post a Story but cannot attach stickers — which is where the link and the urgency live. Rows carry `manual_reason`; the runner skips them. |
| **Live event coverage (T-0 evening)** | Shot on the night. |
| **X / Twitter** | No publisher, by decision. `caption_x` is written and linted; posting is a paste. |
| **Counted attendance in recaps** | Never estimate. Wait for the real check-in number. |

---

## Weekly rhythm, once a run is live

- **Monday** — `npm run social:lint`, deal with anything red.
- **Before art requests** — lint first, always.
- **After any `run --execute`** — commit and push the queue.
- **After each event** — fill the real attendance number into the T+1 recap row
  before it goes out.

---

## Where things live now

| | |
|---|---|
| `content/queue.csv` | The calendar. One row per post. |
| `content/brand.json` | Facts, pricing, hashtag pools, the 21-beat template. |
| `public/social/*.jpg` | What publishes. Committed. |
| `OneDrive\SparkDate\SourceArt\` | PNG masters. Not in git — 31.5 MB of binaries git can never forget. |
| `OneDrive\SparkDate\Superseded_*\` | The dead worksheets. Read-only history. |

`content/` is deny-by-default in `.gitignore` — only those two files. A pasted
folder cannot be committed by accident.

---

## Troubleshooting

**"Nothing due"** — normal. Facebook posts are already handed over; Instagram
waits for its slot; unapproved rows are skipped by design.

**A post didn't fire** — check `published_ids` on the row. Empty means it never
ran; populated means it did and the runner correctly skipped a repeat.

**`(#200) Unpublished posts must be posted to a page as the page itself`** —
the Page access token failed to mint. Run `node scripts/social-preflight.js`.

**Preflight says no Instagram account** — if the token lacks `instagram_basic`
that message proves nothing either way. Set `META_IG_USER_ID` and re-check.

**Duplicate post risk** — always push after `run --execute`. The runner reads
the repo copy; if it doesn't know a post exists, it will make another.
