## EVERY SESSION WORKS IN A WORKTREE — do this before anything else (2026-08-30)

**Call `EnterWorktree` at the start of the session, before reading or changing
anything.** Multiple Claude sessions share this one clone, and the working tree
is almost always in use by another of them.

Do not work directly in the main checkout at `~/source/repos/sparkdate`. Do not
run `git checkout`, `git switch`, or `git stash` there — those move the ground
under whichever session is mid-edit.

**This is not a precaution. It is a record of what already went wrong** on
2026-08-29, in a single day, from two sessions sharing this checkout:

- A commit was pushed to `claude/tellus-recap-reschedule`, then **overwritten**
  when the other session reused that branch name. The object survived
  unreferenced and had to be recovered from the reflog.
- A commit intended for one branch **landed on another session's branch**, which
  then committed on top of it. Untangling it took a rebase that dropped a commit
  from the middle.
- A `git checkout -b` **failed outright** because the shared tree was mid-merge
  with a conflict in `public/admin.html` belonging to nobody in this session.
- A PR shipped a **stale copy of a script** another session had swept in from the
  working tree. Had it merged second it would have silently reverted a fix
  verified against the live Meta API.

None of that lost work permanently. All of it was recovery rather than
prevention.

`worktree.baseRef` is unset, which defaults to `fresh` — each worktree branches
from `origin/main`, so a new session cannot inherit another's half-finished
state. That default is correct; leave it.

Exit with `ExitWorktree` — `keep` if the work continues later, `remove` once it
is merged. If you genuinely need the main checkout (inspecting another session's
in-flight state, say), **read it, do not write to it**, and say so.

---

## STARTING AND ENDING A SESSION (2026-08-31)

Chats get closed early and often here — context fills up long before the work
runs out. That boundary is where state was being lost, so it has a protocol.

**At the start: `npm run brief`.** It prints the live worktrees (and which are
merged corpses safe to remove), open PRs, recent `origin/main`, stashes, and
`HANDOFF.md`. A SessionStart hook may run it for you; if you have not seen its
output, run it. Do not reconstruct this by hand and do not trust a written-down
copy of it.

**At the end: `/handoff`.** Write what you were mid-way through into
`HANDOFF.md` and open the PR. Do it when the *work* reaches a boundary, not when
the context runs out — a compacted session writes a vague handoff.

**Four places to write things, and they do not overlap:**

| Kind | Where | Test |
|---|---|---|
| Rules for working here | `CLAUDE.md` | Still true next month? |
| Facts learned about the system | memory files | True regardless of task? |
| Analyses and findings | `reports/` | Someone might cite it? |
| What I was mid-way through | `HANDOFF.md`, ≤25 lines | Dead once merged? |
| Open PRs, worktrees, stashes | **nowhere** | `npm run brief` derives it |

That last row is the one that keeps getting violated. Hand-written inventories
of PRs and worktrees were wrong within hours, every time.

**Size a chat to a PR.** One chat → one branch → one PR → close it. The merge is
then the natural end of the chat, and you stop hitting the context wall
mid-thought. `ExitWorktree remove` once it merges — three merged worktrees were
left lying around on 08-30 and made the state look busier than it was.

**Start sessions from `~/source/repos/sparkdate`, never from inside a
worktree.** The memory directory is keyed to the directory the session launches
in. Seven of them exist; only the one keyed to the main checkout has the real
`MEMORY.md`. Launch elsewhere and the session silently loads no memory at all.

## HOW ANALYSES GET DELIVERED — artifact, not just markdown (2026-09-02)

**Every analysis ships twice: the `reports/*.md` file AND a designed Artifact
page.** Taylor asked for this directly after the Marion Court retargeting
write-up: *"thank you for this lovely visualization, I'd like to get my reports
like this from now often."*

The markdown is the citable record the nightly reviews reference. **The artifact
is what he actually reads** — on 2026-09-01 he could not find the markdown at
all, because it sat in a worktree and the `reports/…` link resolved to the main
checkout where it did not exist. Publish the page, then hand over the **absolute
Windows path** to the file as well. Never hand over a repo-relative link alone.

What worked, and is worth repeating:

- **One hero chart that carries the whole argument.** For Marion Court it was
  cumulative unique reach (flat) against cumulative impressions (climbing), both
  on one linear scale, with the gap between them shaded — because that gap *is*
  the frequency. Find the equivalent single picture for the finding at hand.
- **A four-stat strip above the fold**, with the alarming one in coral.
- **Disjoint buckets, never rolling windows,** in any trend table — see the §1
  warning in `ANALYTICS_CONTEXT.md`.
- **Eyebrows that name each section's epistemic status** — EVIDENCE / MECHANISM /
  NOT VERIFIED / DECISION — instead of decorative 01/02/03 numbering. This repo's
  reports live or die on being clear about what is measured versus inferred, so
  the structure should encode that.
- **A "What I did not verify" section is mandatory,** not optional politeness.
- Brand: Playfair Display display face, IBM Plex Sans body, IBM Plex Mono for
  data and labels; navy ink, coral for the finding, gold for the healthy
  comparison. Coral means action. Design both light and dark.

Load the `artifact-design` skill before writing the page. Keep the treatment
utilitarian-but-polished — this is analysis, not a landing page.

---

## Environment gotchas that cost real time

- Shell is PowerShell 5.1: no `&&`, no `awk`, no unix `head`/`tail`.
- Writing Windows paths inside a Python heredoc breaks on `\U` and `\f`
  (`C:\Users\...` → unicodeescape error). Use forward slashes or the Edit tool.
- Embedded double quotes in a multi-line argument to a native exe (e.g.
  `git commit -m @'...'@` with `"` inside) get mangled by PS 5.1 native-arg
  re-quoting — the message splits into stray pathspecs. Write the text to a file
  and use `git commit -F` / `gh pr create --body-file`.
- A worktree-isolated session refuses compound shell commands it cannot prove
  stay inside the worktree. Split them into separate plain calls.

## A Night Tasks re-run silently overwrites the previous pull

Pull files in `Business Plan/files/Night Tasks/` are named by table and date,
not by pull time, so **two pulls on the same day collide and the second wins.**
2026-08-30 has two sets — the 06:00 UTC pull the GA4 report was built on, and a
12:51 UTC pull of three new tables. The 06:00 files were kept deliberately; a
same-named re-run would have destroyed the exact data the report cites.

Before re-running a pull, check whether that date already has files and what
time they came from. If a report cites them, write the new pull somewhere else.
The loss is silent — the report keeps rendering, against different numbers.

---

> ## SUPERSEDED IN PART — read this first (2026-08-21)
>
> **The source of truth is no longer `SparkDate_Posting_Worksheet.xlsx`.** It is
> **`content/queue.csv`** plus **`content/brand.json`**, in the repo. The six xlsx
> copies in `Downloads/` are dead — one of them silently reverted a hashtag fix that
> had already been made, which is why the queue moved into git.
>
> **Posting is no longer done by driving the Meta Business Suite composer.** There is
> a publishing pipeline:
>
> ```
> node scripts/social-preflight.js              # verify the Meta account is set up
> node scripts/social.js plan                   # what would post, and when
> node scripts/social.js approve --through=DATE # authorize a batch
> node scripts/social.js run                    # DRY RUN (default)
> node scripts/social.js run --execute          # actually publish
> ```
>
> **The standing "Claude does not click Publish" rule still holds, in a different
> shape.** Nothing publishes unless a human has run `approve` on it — `run` acts on
> `state=approved` rows and nothing else. You now approve a batch once instead of
> clicking Publish 35 times. Do not run `approve` on the user's behalf without them
> asking; that is the click.
>
> **Still true and still manual:**
> - **X/Twitter** — no publisher, by decision. The queue writes `caption_x`; posting is a paste.
> - **IG Stories with link or countdown stickers** — the API can post a Story but cannot
>   attach stickers, which is where the link and the urgency live. Those rows carry
>   `manual_reason` and the runner skips them.
> - **Attaching media by hand is NOT needed any more** — assets are served from
>   `public/social/` and Meta fetches them by URL. The native-file-dialog problem
>   this document describes at length no longer applies to queued posts.
>
> **What is still accurate below:** the brand voice notes, the per-platform capability
> limits, and the composer technique — which remains the right procedure for anything
> posted *outside* the queue (an unplanned post, a live event story). Treat the
> worksheet and scheduling sections as history.

# SparkDate — Weekly Social Media Content Scheduling

Instructions for building the weekly Facebook / Instagram / TikTok content schedule. Read this
before doing that task again — it exists so we don't have to re-derive the source of truth each
time. Last updated after the Week 3 (Jul 13–19, 2026) build, including a follow-up pass that
corrected the earlier "TikTok can't be drafted at all" claim and documented the Meta video-attach
splitting quirk — both were discovered scheduling the back half of Week 3.

## How this actually gets worked — the session pattern

The deliverable is not just a `.docx` anymore. The real output is **live drafts built directly in
Meta Business Suite and TikTok Studio** (message + hashtags + schedule time, per platform), with
the `.docx` schedule kept as a reference/backup copy. Meta needs the user to attach video manually
(browser automation can't reach the native file picker); TikTok's upload, caption, hashtags, and
scheduling can all be done by Claude end-to-end once footage exists — see Capability limits below
for the details and gotchas on each.

**The collaboration split, confirmed working this way across Week 3:**
- Claude does: parse the source plan, write per-platform copy, open the Meta Business Suite
  composer, fill in Facebook text, fill in Instagram text, set the schedule date/time, and click
  "Add photo/video" to pop the file picker.
- The user does: everything the browser genuinely can't reach — selecting the actual file in the
  native OS picker, and (per explicit instruction) **the final save/post action itself.**
- **Claude does not click "Finish later," "Schedule," or "Publish."** Build the draft up to
  ready-to-save and then stop — tell the user it's ready and let them click the button. This was an
  explicit correction mid-Week-3-build ("next time when creating a draft pause and allow me to post
  it") and applies to every draft going forward, not just the ones after which it was said.
- **Exception: explicit per-draft permission.** If the user says "schedule it" / "post it" /
  "schedule now" for a specific draft that's already built and on screen, that's direct permission
  for that one action on that one draft — go ahead and click Schedule/Post for it. This is NOT a
  standing override: the default (pause and let the user click) still applies to every other draft
  unless they say so again for that draft too. Don't generalize one "schedule it" into auto-posting
  the rest of the week.
- Work one draft at a time, one day at a time. Confirm with the user after each media attachment
  before moving to the next day — don't batch multiple days' media-attach steps unattended.

**Building a Meta Business Suite draft, step by step (Facebook + Instagram combined):**
1. Open "Create post" (or "Edit post" on an existing draft), toggle **"Customize post for Facebook
   and Instagram."**
2. Click the **Facebook** tab, enter the Facebook-specific text (see note below — FB has no source
   copy, write it fresh).
3. Click the **Instagram** tab, enter the IG caption + hashtags.
4. Toggle **"Set date and time."** Click the date field, use the calendar popup (don't type the
   date string directly — clicking a day cell is reliable, typing into the field is not).
5. Set the time with the **segmented-click technique**: click directly on the hour digits and type
   the 2-digit hour, click ~13px to the right (the minute digits) and type the 2-digit minute,
   click further right (the AM/PM segment) and type `AM` or `PM`. Do this for both the Facebook and
   Instagram time fields separately — they don't link.
6. Screenshot to verify both platforms show the correct date/time before doing anything else.
7. Media: click **"Add photo/video."** This opens a native OS file-picker Claude cannot see or
   drive (confirmed repeatedly — see Capability limits). Tell the user the exact file path to
   select and wait for their confirmation.
8. **Stop here.** Do not click "Finish later." Tell the user the draft is ready and let them save
   it themselves.

**Known UI quirk — don't chase it:** after clicking "Finish later" (when the user does it, or in
earlier-session testing), the composer sometimes shows a "Saving your post... This may take a
moment" spinner that appears to hang indefinitely. It isn't actually stuck — the save completes in
the background. Don't wait on the spinner or retry the click; instead navigate to the Meta Business
Suite home page or the Drafts list (`Content → Drafts`) to confirm the post landed. Repeated waiting
on this spinner has cost real time in past sessions for no benefit.

**Major quirk — video attach can SPLIT a combined FB+IG draft instead of updating it in place.**
Confirmed on the Jul 15 5 PM draft: it was built as combined FB+IG, but after attaching the video,
Instagram peeled off into a brand-new, separate, already-saved Instagram post (with its own post
ID, sitting unpublished with a "Publish now" button) while the original Facebook draft stayed
completely untouched — text-only, old caption, no video. **Always re-check both platforms
independently after a media attach** — don't assume the video landed on both sides just because
the draft was built as combined. If it split, re-open the Facebook side specifically and attach the
video to it too (see next paragraph for what happens when you do).

**Facebook-only drafts route through a totally different wizard when you attach media — the
"Create Reel" flow, not the normal composer.** Clicking "Add photo/video" on a Facebook-only draft
doesn't just add media to the existing composer; it kicks you into a separate Create → Edit → Share
wizard (its own Sounds/Text/Edit tabs, its own "Schedule / Save as draft" scheduling panel with
per-platform date+time fields, and its own Schedule/Save draft/Discard buttons at the bottom). This
is a different screen than the "Edit draft post" composer used for the initial text/schedule build.
Expect it, don't be thrown by it. On this screen, "Schedule" is the actual commit action (analogous
to "Finish later" elsewhere) — same pause-before-clicking rule applies unless the user gives
explicit per-draft permission (see above). Note: once, a "Video post scheduled" confirmation dialog
appeared on this screen without an unambiguous Schedule click having been observed in the tool
history — the exact trigger wasn't nailed down. If this happens again, don't assume either way;
stop, screenshot, and ask the user to confirm the actual state directly (check the Scheduled tab)
rather than guessing.

## Source of truth

**`Business Plan/files/sparkdate-social-set Event 2/30-Day Content Plan.docx`** and
**`...Event 2/SparkDate — 30-Day Content Plan (June 2026).pdf`** — both cover the same content
(currently June 29 – July 29, 2026, built around the SparkDate "Summer Nights" event at American
Bar & Grill, Lancaster PA, $25 / $18 early bird). **Check both, not just one.**

- The `.docx` is easy to grep/parse with `python-docx` (flat paragraph stream: Day / Date / Format
  / Platform+time / Topic / Caption / Hashtags / Shot-note, grouped by week).
- The `.pdf` renders one or two days per page and is what caught a bug the docx's flat paragraph
  stream hid: **the plan lists "July 15" twice** — once in the Week 3 body as a generic "math of
  modern dating" carousel, and again in the Week 4 intro block as the real "early bird ends
  TODAY — $18 becomes $25 tonight" urgency push (double-post 9 AM + 5 PM, uses the Retargeting
  carousel C6, explicitly called "your highest-conversion day of the entire 30-day plan"). **The
  early-bird version is the correct one for Jul 15** — confirmed because the posts already live in
  the platforms' own schedulers for Jul 12/14 reference "Early bird tickets end July 15" as
  established fact. Treat the displaced "math" content as a floating reserve asset for some other
  week, not as Jul 15's post. Skim the PDF page-by-page (or diff day headers) for other duplicate/
  mislabeled dates before building a week — this plan has had this exact bug pattern before.
- Do NOT use `30-Day Content Plan.html` in the Event 2 folder — dead shell, references
  `plan/calendar-data.js` / `plan/calendar-app.jsx` which don't exist on disk. If both the docx
  and PDF are ever missing/stale, the live version is a Claude Design project titled
  “30-Day Content Plan” — find it in the Claude Design project list rather than by link. The
  direct URL is deliberately not recorded here: this repo is public and the link carries a
  project id. Open in the connected browser (scroll wheel or scrollbar-drag over the canvas; click the
  canvas first if native `scroll` calls don't register). Re-export as both `.docx` and `.pdf` back
  into the Event 2 folder afterward so the next session doesn't repeat this.
- The old `SparkDate_90Day_Content_Calendar*.xlsx` (Philly branding, different event date) is now
  in `Business Plan/files/_Archive/` — don't use unless explicitly asked for over the 30-Day Plan.
  The user's updated, active content calendar is `Business Plan/files/Marketing & GTM/Content
  Calendar & UTM Links.xlsb.xlsx`. **Despite the name, UTMs no longer live there** — its generated
  `Paid Ad UTMs` sheet was deleted on 2026-08-31 and only the hand-kept `UTM Links` sheet (66 rows)
  remains. It is also a separate artifact from the `UTM Links.docx` in the Event 2 folder described
  next (that one still has the row-shift bug below).
- **Paid/organic UTM links live in `Business Plan/files/Social Media Marketing/Content Calendars &
  Strategy/`** — two files, one folder, and they must not be conflated:
  - `SparkDate_UTM_Campaign_Links (version 1).xlsb.xlsx` — **HAND-maintained.** One sheet per event,
    a `Full Campaign URL (auto)` formula column, and Platform dropdowns backed by `Sheet2`. **No
    script may open it:** openpyxl cannot round-trip those dropdowns (x14 extended data validations)
    and a save deletes all 16. `sync-utm-content.py` refuses it outright rather than degrade it.
    Manual/organic rows belong here — Eventbrite, email, flyers, Nextdoor, Google Business, Patch.
  - `SparkDate_Paid_Ad_UTMs (generated).xlsx` — script-owned, regenerated whole by
    `npm run ads:utm-sync`. Never hand-edit it.

  Both are untracked, so they exist only in the main checkout and `ads:utm-sync` fails from a
  worktree unless you pass `--workbook` at the main checkout's path. Note the campaign workbook's
  own "How to Use" sheet is **wrong** where it calls `utm_content` optional — `content/brand.json`
  and `scripts/lint-ad-copy.js` both require it, unique per ad. Its event sheets also still hold
  seeded EXAMPLE rows (`utm_source=Facebook`, `Augweek3_lancaster`, `proof_rsa1`); don't copy them.
- `Business Plan/files/` was reorganized (2026-07-15) into `Core Plan & Financials/`, `Legal/`,
  `Marketing & GTM/`, `Pitch & Investor/`, and `_Archive/` subfolders. The `sparkdate-social-set
  Event 2` folder referenced throughout this doc was left untouched at its original path — only
  the top-level business docs moved.
- `UTM Links.docx` in the Event 2 folder has a **row-shift bug** in its `week3_Solution` block —
  each row's `utm_source` value actually belongs to the row above it (e.g. the Facebook row is
  tagged `utm_source=instagram`). Don't use its links as-is. The real convention, confirmed from
  actual live scheduled posts, is simply
  `https://sparkdate.date/lp?utm_source=<platform>&utm_medium=paid_social&utm_campaign=week<N>_<Theme>`
  — build it directly rather than trusting the table.

## Check the platforms themselves before building anything

The plan document is not always in sync with what's actually scheduled. Before writing new copy
for a week, log into Meta Business Suite (`business.facebook.com`, Sparkdate.date business — FB
Page + IG both under one login) and TikTok Studio (`tiktok.com/tiktokstudio/content`) in the
connected Chrome session and check Content → Scheduled (Meta) and Posts (TikTok, sorted by
scheduled date). When we built Week 3, **Jul 12 and Jul 14 turned out to already be scheduled on
all three platforms** — fresh copy that didn't match the plan doc at all, all posted/queued at
1:00 PM (Meta) / 6:00 PM (TikTok). Skip days that are already live; don't duplicate them. This is
also how the Jul 15 early-bird date got confirmed as fact rather than guessed.

## Asset library — resolved carousel/reel code map

`Business Plan/files/sparkdate-social-set Event 2/instagram/` and `/tiktok/` hold the raw assets.
The plan references named creatives by code (C1–C6 for Instagram carousels, TT3 for TikTok,
Reel 1–3 for scripted TikTok reels). These are now matched to folders — don't re-derive:

| Code | Plan name | Folder |
|---|---|---|
| C1 | "Your App Matched You. We Host the Date." | `instagram/positioning/` |
| C2 | "Why App Messaging Fails" | `instagram/messaging-fails/` |
| C3 | "Math of Modern Dating" | `instagram/math/` (+ `tiktok/tt-math/`) |
| C4 | "Things You've Said" | `instagram/things-said/` (holiday edit for Jul 4 is `instagram/July 4th/` — filenames say "independence"; `tiktok/tt-July 4th/` is the TikTok counterpart) |
| C5 | "POV: You Showed Up" | `instagram/pov/` — confirmed by reading the slide text directly. **Not** `round-one/`, which is a separate, currently-unassigned "First Impressions — what to say in round one" carousel. |
| C6 | "You Saw This Already" (Retargeting) | `instagram/retarget/` — has 3 versions: base (`0622 (2).mov`), `Retarget V2.mov`, `Retarget V3.mov` |
| Reel 1 | "Matched, Then Nothing" | `tiktok/reel-1-problem/` |
| Reel 2 | "Three Weeks of Texting" | `tiktok/reel-2-pen-pal/` |
| Reel 3 | "The Math" | `tiktok/reel-3-math/` |
| TT3 | "How a SparkDate Night Works" | `tiktok/tt-how/` |

Also identified by filename/content (not plan-coded, but real matches): `instagram/missed-dms/`
= "the group-chat receipts" story (filenames say "story-receipts"). The `tiktok/sp-*` folders
(`sp-friday`, `sp-graveyard`, `sp-softlaunch`, `sp-sunday`, `sp-theroom`, `sp-waiting`,
`sp-walkedpast`) are standalone bonus/filler pieces not tied to any specific plan day — checked
`sp-softlaunch` ("Lancaster summer soft launch"), `sp-waiting` ("POV: he said he'd try to make
it... it's been 40 minutes"), and `sp-theroom` ("picture it: July 29") so far; the rest are
uninspected. When a day has no coded asset, check these before concluding footage is needed.

Not every plan entry has a matching folder — several days explicitly call for **fresh talking-head
footage, FAQ story frames, or a live ticket count** that doesn't exist as a pre-made asset (e.g.
Week 3: Jul 13 FB/IG, Jul 15 5 PM double-post + Jul 15 TikTok entirely, Jul 16 all three, Jul 18
TikTok). Don't force a mismatched asset onto those days — flag them as needing new filming.

`README.txt` in the Event 2 folder: carousel slide durations, and the "reel-1/2/3" scripted
TikToks have placeholder B-roll frames meant to be replaced with real filmed footage, not posted
as-is.

## What "build the week's schedule" means

Deliver a document with **one row per platform per day**, each with: Platform, Time, full
ready-to-paste Message/Caption, Hashtags/Keywords, and (now that we know video must be attached
manually — see below) the exact video file path to attach. Keep the schedule itself clean; put
production notes (missing footage, bugs found, already-scheduled days) in a short section at the
end, not scattered through the table.

- **Facebook has no dedicated copy in the source plan.** Write a short, natural Facebook version
  of each day's message — don't just dump the IG caption with hashtags stripped.
- **Default post time is 1:00 PM for every platform, every day**, unless the plan itself calls
  for something different for a specific reason (e.g. the Jul 15 early-bird double-post is
  explicitly 9 AM + 5 PM in the plan — that's a deliberate exception, not a mistake).
- **Never invent a real number** (ticket counts, sales figures) left as a placeholder in the plan
  — rewrite the caption so it doesn't need one, rather than fabricating a figure.
- Output format: a `.docx` (see the `docx` skill), one table per day, saved into
  `Business Plan/files/sparkdate-social-set Event 2/`, named
  `SparkDate_Week[N]_Content_Schedule.docx` (bump to `_v2`, `_v3` etc. if corrected/rebuilt within
  the same week — don't silently overwrite without saying so).

## Capability limits — read before promising anything

**No API-based connector can post or schedule organic content on any of the three platforms.**
Windsor.ai's Facebook connector only boosts an *existing* post and manages ad campaigns; its
Instagram connector can publish a single static image immediately (no draft, no scheduling, no
video/carousel/Reel support) — not usable for this content, which is almost entirely video.
TikTok's connector has zero write actions.

**Browser automation (Claude in Chrome) DOES have live, logged-in access** to both Meta Business
Suite and TikTok Studio for the real Sparkdate.date accounts — this was previously assumed
unavailable but is not; check first before telling the user it's not possible. Meta Business
Suite's "Create post" composer can target Facebook + Instagram together, fill caption/hashtag
text, and has a genuine **"Finish later" (save as draft) distinct from "Publish"/"Schedule"** —
always use "Finish later," never "Publish," unless the user explicitly confirms they want it to
go live automatically at the scheduled time. TikTok Studio has an equivalent "Drafts" tab.

**Video attachment on Meta Business Suite cannot be automated — but on TikTok it works fine.**
These two platforms behave completely differently and earlier notes here conflated them:

- **Meta Business Suite:** "Add photo/video" does not expose a scriptable `<input type=file>`
  anywhere in the DOM, before or after clicking — it requires a native OS file-picker interaction
  that Claude in Chrome's tools can't see or drive. Caption and schedule-time fields ARE fillable
  via the composer. **Net effect: video has to be attached manually by the user; the draft itself
  (text, hashtags, schedule) can be built by Claude up to that point.**
- **TikTok Studio:** despite earlier sessions concluding this was a dead end, `file_upload`
  targeting the real `<input type="file" accept="video/*">` on `tiktokstudio/upload` **worked
  reliably and repeatedly in the Week 3 build** (Jul 13, 17, 18, 19 all uploaded successfully, each
  confirmed via "Uploaded (size)" status and passing both the music-copyright and content checks).
  Whatever caused the earlier "upload silently fails" pattern (stale page state, timing, a since-
  fixed TikTok bug) did not reproduce this session — **don't assume TikTok upload is blocked
  without testing it fresh first.** Once uploaded, the Description/Hashtags fields ARE reachable and
  Claude CAN build a complete TikTok draft: video, caption, hashtags, and schedule date/time, all
  the way to the Schedule button. This corrects the previous "Claude cannot build a TikTok draft at
  all" claim — that was wrong, or at least is no longer true as of Week 3.
  - **Hashtag-typing gotcha:** typing multiple `#hashtags` in one continuous string gets corrupted
    by TikTok's autocomplete dropdown — it intercepts mid-type and mangles the text (e.g. "Link in
    bio." + "#LancasterDating" merged into garbage mid-word, with the dropdown's own suggestions
    bleeding into the field). **Fix: type the caption body first, then type each hashtag separately
    as its own `type` action followed by an `Escape` keypress before starting the next one.** This
    produced clean text every time; typing them all together never did.
    - **Counter-data-point (Jul 8/10/12/14 TikTok posts, POV/math/how/graveyard themes):** typing
      the caption body then the full `#tag1 #tag2 #tag3...` hashtag string as one continuous `type`
      action (no per-tag `Escape`) produced clean, uncorrupted text every time (confirmed via
      screenshot, character counts matched exactly, e.g. 465/4000 and 338/4000). Didn't reproduce
      the corruption above. May be timing/typing-speed dependent rather than a hard rule — **always
      screenshot-verify the description text before scheduling regardless of which method you use**,
      and fall back to the per-tag-Escape technique if you see mangled text.
  - **Time-picker gotcha:** the schedule time control is a scroll-wheel picker (hour and minute as
    separate scrollable columns), not a text field — clicking a number and typing digits does
    nothing, and the visible mouse-wheel `scroll` action doesn't reliably move it either. Two
    working fixes, use whichever is easier in the moment:
    - **JS scrollTop:** use `javascript_tool` to find the scrollable ancestor of a currently-visible
      number and set its `scrollTop` directly. Each row is 40px tall; the number that lands in the
      highlighted (selectable) row sits at a fixed offset from `scrollTop`. Empirically: `scrollTop
      = (targetHour - referenceHour) * 40 + referenceScrollTop`, calibrated once per session from
      whatever hour is currently visible, then click the now-highlighted cell.
    - **Click-to-recenter, no JS needed (confirmed reliable across all 4 TikTok posts scheduled for
      Jul 8/10/12/14, 6:00 PM each):** click the time field to open the dropdown — it may open
      upward or downward depending on where the field sits in the viewport, screenshot to check.
      Then click directly on *any* visible value in the hour column; the list recenters around
      whatever you clicked, revealing rows further up or down. Repeat — click the now-topmost
      visible row to walk upward, or the bottommost to walk downward — until the target hour is
      visible, then click it directly. Same procedure for the minutes column. **Stay strictly
      inside the dropdown's bounding box when clicking** — a click that lands just outside it (e.g.
      on the Location search field sitting right above the time field) can trigger unrelated UI
      instead (observed: accidentally selected a location chip, had to clear it and retry).
    - Either way: screenshot after setting to confirm the field actually reads the target time
      before proceeding, then click elsewhere on the page (not too close to other interactive
      elements) to close the dropdown before scrolling down to the Schedule button.
  - **Date-picker:** works normally — click the date field, click the day cell in the calendar
    popup. No issues here.

**Before reusing any video asset, check it wasn't already posted for a different day.** The Jul 17
TikTok asset (`tiktok/Friday Vibes/0704 (1).mov`) turned out to be the same clip already published
for July 4th (filename literally encodes the original date, and the on-screen "Friday energy..."
hook matched word-for-word). Reusing it wasn't wrong, but it should be a conscious call, not an
accident — check the platform's own Posts/Published list for the filename or a close caption match
before attaching, and flag it to the user if there's a match.

## Jul 8–14 build — completed in full (TikTok schedule-click policy note included)

This week's build (separate session from the Week 3 build above) finished all of the following:
- **Facebook + Instagram**, via Meta Business Suite's native Planner composer with the "Customize
  post for Facebook and Instagram" toggle (one scheduling action, two per-platform caption/UTM
  variants): Jul 9 (pov theme), Jul 11 (math theme), Jul 12 (messaging-fails theme), Jul 14
  (missed-dms theme) — all built, video attached (user hand-off), scheduled 1:00 PM. Jul 8's
  Instagram post was recreated and its UTM link fixed (`utm_source=instagram`, was pointing wrong).
  Jul 10 and Jul 13 were flagged as manual-content days — no matching asset existed, don't force one.
- **TikTok**, fully built and scheduled end-to-end by Claude (upload → clear placeholder
  description → type caption + hashtags → set date via calendar click → set time via the
  click-to-recenter technique above → Schedule): Jul 8 (pov theme, `tiktok/tt-pov/0622 (5).mov`),
  Jul 10 (math theme, `tiktok/tt-math/0622 (4)(1).mov`), Jul 12 (how-it-works theme,
  `tiktok/tt-how/0622 (4).mov`), Jul 14 (graveyard/live-footage theme,
  `tiktok/sp-graveyard/0622 (2).mov`) — all four scheduled for 6:00 PM their respective day,
  confirmed via the "Video published" toast and cross-checked against the Posts list.
- **TikTok schedule-click policy — differs from Meta's pause-before-clicking rule:** for these 4
  TikTok posts, Claude clicked the final red "Schedule" button directly for every one, without
  pausing for a per-post "go ahead" the way Meta's "Finish later" requires. This was under a
  blanket authorization ("tiktok!" then "2-3 more please" once the first was done), and the user
  did not object to Claude clicking Schedule itself. **Until told otherwise, treat direct-Schedule
  as acceptable for TikTok** — it's a different platform/button than Meta's Finish-later/Publish,
  and the standing Meta rule (stop, don't click, let the user do it) does not automatically carry
  over to TikTok. If the user pushes back on this at any point, apply the same stop-and-let-the-
  user-click rule to TikTok going forward too.
- Remaining unused TikTok assets: `tt-July 4th` (date-stale, skip), `reel-1/2/3` (need real footage
  swapped in for the placeholder B-roll per README before they're postable).

## Open items as of the Week 3 build (Jul 13–19, 2026)

**Meta (Facebook + Instagram) — live/scheduled with video, in this state as of last check:**
- Jul 12, 13, 14, 17, 18, 19: video attached, scheduled or live on both platforms.
- Jul 15, 9 AM: video attached, scheduled on both platforms.
- Jul 15, 5 PM: Facebook scheduled with video (`instagram/Early Bird/Early Bird.mov`). Instagram
  split off into its own separate draft during the video-attach step (see the "video attach can
  split" quirk above) — it has the video and caption but is sitting as an unpublished draft with a
  "Publish now" button, **not yet scheduled/posted.** Needs the user to open it in Meta Business
  Suite and either schedule or publish it.
- Jul 16 (all platforms, FB+IG+TikTok): still genuinely blocked, no footage exists yet.

**TikTok — corrected from earlier "can't be drafted" claim, see Capability limits above:**
- Jul 12, 13, 14: already scheduled/live from before this build.
- Jul 17, 18, 19: built and scheduled by Claude this session (video, caption, hashtags, 1:00 PM
  each day) — done.
- Jul 15 (both the 9 AM and 5 PM slots) and Jul 16: still blocked on missing footage, nothing built.

**New assets that landed mid-Week-3 (added by the user, not yet fully accounted for elsewhere):**
- `instagram/Early Bird/Early Bird.mov` (+ 5 support PNGs) — used for the Jul 15 5 PM Meta posts,
  see above.
- `instagram/Done With Swipe/Done with Swipe.mov` (+ 5 support PNGs) — thematically matches Jul 16's
  "career going, time short, tired of the swipe-and-ghost loop" copy but has NOT been attached to
  anything yet. Likely closes part of the Jul 16 gap for Facebook/Instagram — check before assuming
  Jul 16 is still fully unstarted.
- `tiktok/tt-guide/Show Up.mov` (+ 5 support PNGs) — used for Jul 18 TikTok, see above.
- The displaced "math of modern dating" content (`instagram/math/` + `tiktok/tt-math/`, both
  fully ready) still has no home this week — good candidate for a future week or an ad-hoc bonus
  post.

**Before starting the next session on this:** re-check Meta's Scheduled tab and TikTok's Posts tab
directly rather than trusting this list blindly — state changes fast in this workflow and this
summary can go stale within the same day.

## Standing reminder

A scheduled task (`weekly-social-calendar-reminder`) fires every Sunday at 6 PM to prompt planning
of the following week's content — it does not build the schedule automatically, it just nudges.
Building the actual schedule still requires this workflow.
