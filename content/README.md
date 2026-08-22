# Where the social files live

The short rule: **two files are the source of truth. Everything else is
generated and should never be kept.**

```bash
npm run social:build
```

Rebuilds the calendar, the Claude Design brief and the four campaign sheets
into `build/`. Takes a second. `build/` is gitignored.

---

## Source — edit these, they are versioned

| File | What it is |
|---|---|
| `content/queue.csv` | The calendar. One row per post: date, time, event, format, caption, hashtags, links, state, published ids. |
| `content/brand.json` | Facts that don't change row to row: events, prices, hashtag pools, testimonials, banned figures, the 21-beat template. |
| `templates/campaign-export.template.html` | The slide renderer, with Playfair and Inter embedded as base64. |
| `reference/event3-frames.json` | The 68 hand-built Tellus frames, kept as the reference for a full campaign — 53 organic + 15 paid, all ten modes. |

## Generated — never edit, never keep a copy

| Output | From |
|---|---|
| `build/SparkDate_30DAY_CALENDAR.md` | `scripts/build-calendar.js` |
| `build/SparkDate_DESIGN_BRIEF.md` | `scripts/design-handoff.js` — this is the file you hand to Claude Design |
| `build/campaign-sheets/*.html` | `scripts/build-campaign-export.js` — open in a browser, "Export all as PNG" |

**Keep zero versions of these.** Git holds the inputs, so

```bash
git checkout <sha> && npm run social:build
```

reproduces any past state exactly. Saving dated copies is precisely how the
calendar became six near-identical spreadsheets in `Downloads/`, one of which
silently reverted a hashtag fix that had already been made.

If you edit a generated file, your change is lost on the next build. Edit
`queue.csv` instead — that is also the only way the linter can check it.

## Binary assets — outside git on purpose

| Where | What |
|---|---|
| `OneDrive\SparkDate\SourceArt\` | PNG masters from Claude Design. The only originals — `public/social/*.jpg` are lossy conversions. |
| `OneDrive\SparkDate\Superseded_*\` | Dead worksheets and brand docs. Read-only history. |
| `OneDrive\SparkDate\Event3-Campaign-Export.html` | The original hand-built sheet. 1 MB, almost all base64 photos; only its frames are in `reference/`. |
| `public/social/*.jpg` | **Committed.** What actually publishes — Meta fetches these by URL. |

Source art stays out of git because PNGs don't diff, git never forgets a
binary, and every re-export would add another full copy. OneDrive versions
them and it's reachable from a file picker.

## The loop

1. Edit `content/queue.csv` (and `brand.json` for a new event)
2. `npm run social:lint` — **before commissioning any art.** A wrong price
   costs nothing to fix in a CSV and a re-export once slides are drawn
3. `npm run social:build`
4. Hand `build/SparkDate_DESIGN_BRIEF.md` to Claude Design, or open the
   campaign sheets and export PNGs directly
5. PNGs into `OneDrive\SparkDate\SourceArt\`
6. `python scripts/prep-social-assets.py` — converts to JPEG, wires
   `asset_files` into the queue
7. Commit `content/queue.csv` and `public/social/`
8. `node scripts/social.js plan` → `approve` → `run --execute`

Full detail in `SOCIAL_RUNBOOK.md`.
