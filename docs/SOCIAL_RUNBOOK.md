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

### 9. TikTok

TikTok reuses the queue — the same events, the same copy, nothing separately
authored. 17 carousel rows carry `tiktok` in `platforms`.

**Carousels, not video, and that is a bandwidth decision rather than a claim
about what performs.** TikTok is video-first and photo posts generally reach
fewer people. But there are 111 finished carousel images and no video capacity,
so a carousel posted beats a Reel not made. If the carousels get traction, that
is the evidence for investing in video.

Reels rows are deliberately excluded: the publisher posts `media_type: PHOTO`,
so a Reel row would push its cover frame as a one-image post — not the content.

**Vertical art.** The feed is vertical; the existing carousels are 1080×1080.
TikTok accepts squares — they letterbox — so a TikTok row without vertical art
still posts, and the linter warns (`tiktok-not-vertical`). To render the proper
set:

```
node scripts/build-campaign-export.js --all --vertical
```

That writes `Campaign-Export-<KEY>-<event>-TIKTOK.html` alongside the square
sheets. Export as usual; the filenames carry `-tt`, which is what routes them
to TikTok and keeps them out of the Instagram carousel.

The TikTok canvas is **not** the Story canvas. Both are 1080×1920, but TikTok
puts an action rail down the right edge and the caption across the bottom, so
these frames reserve the right 250px and the bottom 380px. A frame laid out for
an Instagram Story puts its headline under the like button.

**Tokens expire in ~24 hours**, unlike Meta's, so the access token is minted
per run from a refresh token. Only the CLIENT pair is configuration:

```
TIKTOK_CLIENT_KEY      repo secret
TIKTOK_CLIENT_SECRET   repo secret
```

**The refresh token is NOT a secret you set.** TikTok issues a new one on
nearly every refresh and kills the old one, and a GitHub secret cannot rewrite
itself — so wiring it in as a secret gives you exactly one working run, then
silent failure, with the only copy of the new token in an Actions log that
expires. It lives in Firestore instead (`integration_tokens/tiktok`), read at
the start of each run and written back on rotation, with no human in the loop.
That is why the publish workflow carries `FIREBASE_*` credentials at all. See
`lib/tiktok-token-store.js`.

`TIKTOK_REFRESH_TOKEN` is still honoured when the store is empty — that is how
the first token gets in, and how you recover if a rotation is ever lost. Once
the store holds one, the store wins; don't leave a stale copy in the secrets to
confuse the next person.

### First-time setup

The refresh token cannot be created by a machine. It comes out of an OAuth
authorization performed by a human signed in as the SparkDate account.

1. **Developer portal** (developers.tiktok.com) — create the app, add the
   **Content Posting API** product, request the `video.publish` scope, and
   **verify `sparkdate.date` as a property**. That last one is not optional:
   publishing uses `PULL_FROM_URL`, and TikTok refuses to fetch media from an
   unverified domain. It fails at publish time with an error that does not
   name the cause.
2. **Authorize**, with the client key and secret plus the three `FIREBASE_*`
   variables in your shell:
   ```
   node scripts/tiktok-authorize.js               # prints a URL
   node scripts/tiktok-authorize.js --code=<code> # exchanges and stores it
   ```
   Sign in as SparkDate *before* opening the URL — whichever account is signed
   in is the one this posts as, and there is no later prompt.
3. **Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`** as repo secrets.
4. `node scripts/social-preflight.js` — it reports the account it will post as
   and the privacy levels the account actually allows, which is how you read
   the audit state.

`social-preflight` goes through the same store as the publisher, deliberately.
It refreshes, and a refresh rotates the credential the scheduled job depends
on — so a preflight that talked to TikTok directly would quietly break
publishing every time someone checked whether publishing worked.

**Draft vs direct.** Default is `UPLOAD_TO_DRAFT` — posts land in the app's
drafts, you tap publish, and this needs **no audit**.
`TIKTOK_POST_MODE=DIRECT_POST` publishes outright but requires TikTok's app
review (2–4 weeks, and it can be rejected).

**Until that clears, DIRECT_POST does not "succeed privately" — it is refused
outright.** An unaudited client may Direct Post **only to a private account**,
and `publish/init` returns
`unaudited_client_can_only_post_to_private_accounts` while the account is
public, whatever privacy level was chosen. (An earlier version of this section
said the app was "capped at `SELF_ONLY`, so DIRECT_POST succeeds and posts
privately to nobody." That was wrong, and was disproved on 09-12 by posting for
real.)

**`privacy_level_options` will not tell you any of this.** It describes what the
ACCOUNT permits, not what the APP may do — a sandbox target user gets all three
levels back while `video.publish` is still gated. Reading that field is how the
09-11 session talked itself into believing the audit had cleared. A capability
reported by `creator_info` is not permission.

**Before the first real post**, two things are worth confirming, because both
fail at publish time with errors that do not name the cause:

1. **`sparkdate.date` must be verified in the TikTok developer portal.** Media
   is pulled by URL (`PULL_FROM_URL`), and TikTok refuses unverified domains.
2. **The audit application** (Developer Portal → your app → Content Posting
   API) is what unlocks `DIRECT_POST` and `PUBLIC_TO_EVERYONE`.

### Two Vercel variables that break `/admin/tiktok` silently

Both were found on 09-12 while filming the review demo, and neither is visible
from `social-preflight`, which does not go near the admin page's OAuth path.

- **`TIKTOK_REDIRECT_URI` was set to the literal string `na`.** `api/tiktok.js`
  and `api/tiktok-callback.js` both read it and only fall back to
  `https://sparkdate.date/tiktok/callback` when it is *unset*, so Connect sent
  `redirect_uri=na` and TikTok answered `param_error / errCode=10006`. **Delete
  the variable rather than correcting it** — the code default is already the URI
  registered with TikTok, and one copy cannot drift from another. This is why
  the admin page's Connect button had never worked: the 09-11 setup authorized
  with `scripts/tiktok-authorize.js`, which takes its redirect from its own
  default and ignores the variable entirely.
- **`TIKTOK_REFRESH_TOKEN` in Vercel made Disconnect a no-op.** Disconnect wipes
  the Firestore store, then the next page load re-seeds from the env copy
  (`lib/tiktok-token-store.js`, `resolveRefreshToken`) and the UI never leaves
  the connected state. Observed twice in a row before the cause was found. This
  is the concrete version of the warning above: once the store holds a token,
  **delete the env copy**. Its only legitimate use is seeding an empty store.

### The app review demo video

TikTok wants **one video showing the complete end-to-end flow**, every requested
scope exercised, on the registered domain — 5 videos max, 50 MB each. A missing
scope or a domain that does not match the redirect URI is a standard rejection.

What worked, filmed at `https://sparkdate.date/admin/tiktok`:

1. **Set the account private first.** Direct Post cannot reach
   `PUBLISH_COMPLETE` on a public account while the app is unaudited (above),
   so there is no take to be had without this. Set it back afterwards.
2. **Revoke the existing grant** — TikTok app → Settings and privacy → Security
   and login → Manage app permissions → remove access. Without this, Connect
   skips the consent screen entirely because the grant is remembered, and the
   scopes never appear on camera. This is account-level and reversible; it does
   not touch the app on `developers.tiktok.com`.
3. Connect → consent screen listing `user.info.basic`, `video.publish`,
   `video.upload` → approve → fill the form → Post → hold on the status box
   until it reads `PUBLISH_COMPLETE`.

**A Direct Post publish id starts `v_pub_file~`; the draft/inbox path gives
`v_inbox_file~`.** That prefix is how you tell which path actually ran.

**Before submitting, swap the placeholder clip in the App review section.** A
reviewer seeing a placeholder is a straightforward rejection, and Content
Posting API rejections are slow to recover from.

### 10. TikTok video

```
npm run social:video -- --all
npm run social:video -- --row=GG-09 --seconds=3.5
```

Builds a 1080×1920 slideshow from the row's frames — crossfades, brand navy
background, h264 — and writes `<row_id>.mp4` to
`OneDrive\SparkDate\SourceArt\Video\`. **Not the repo.** `.gitignore` already
blocks `*.mp4`; git never forgets a binary and one clip is the size of all 119
JPEGs.

**Claude Design is not in this loop.** It renders HTML and exports PNG — it has
no video output. Design's job ends at the frames, and it already did it.
Assembly is a build step: same row in, same video out, nothing to re-review.

**Frames used**, in order of preference:

1. `*-tt.png` in SourceArt — the vertical export, laid out for TikTok's safe
   areas. Full bleed.
2. The prepared square carousel from `public/social/` — scaled and set high on
   the navy so TikTok's caption clears the SparkDate mark. It looks deliberate
   and it works today, but the action rail still overlays the right edge. The
   `-tt` export is the fix, not this.

**ffmpeg is required** and is not on PATH by default:

```
pip install imageio-ffmpeg
```

That ships its own binary inside the Python environment — no system change, and
`pip uninstall imageio-ffmpeg` removes it. A PATH `ffmpeg` is used instead if
you have one.

**Posting is manual for now, and that is not only a gap.** The publisher uses
`PULL_FROM_URL`, so TikTok fetches media from a public address — a file that
only exists in OneDrive has none. Automating it needs the `FILE_UPLOAD` path
(init → PUT the bytes, chunked above 64 MB), which is not built.

Upload the MP4 in the app, paste the caption from `caption_x`, and **pick a
trending sound**. That last part is the actual reason to post video rather than
the carousel — on TikTok the sound is a bigger algorithmic lever than the
images, and it can only be chosen in the app where you can hear what is
currently working.

---

## What stays manual, permanently

| Thing | Why |
|---|---|
| **Story link/countdown stickers** | The API can post a Story but cannot attach stickers — which is where the link and the urgency live. Rows carry `manual_reason`; the runner skips them. |
| **Live event coverage (T-0 evening)** | Shot on the night. |
| **X / Twitter** | No publisher, by decision. `caption_x` is written and linted; posting is a paste. |
| **Tapping publish on TikTok drafts** | Until the audit clears. `UPLOAD_TO_DRAFT` needs no review; `DIRECT_POST` does. |
| **Uploading TikTok video + picking the sound** | `FILE_UPLOAD` is not built, so videos in SourceArt have no URL for TikTok to fetch. The sound is chosen in the app regardless — it is the lever, and you have to hear it. |
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
| `OneDrive\SparkDate\SourceArt\Video\` | TikTok MP4s. Not in git — `.gitignore` blocks `*.mp4`. |
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
