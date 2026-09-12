## EVERY SESSION WORKS IN A WORKTREE — do this before anything else (2026-08-30)

**Call `EnterWorktree` at the start of the session, before reading or changing
anything.** Multiple Claude sessions share this one clone, and the working tree
is almost always in use by another of them.

Do not work directly in the main checkout at `~/source/repos/sparkdate`. Do not
run `git checkout`, `git switch`, or `git stash` there — those move the ground
under whichever session is mid-edit.

**One exception:** the unattended nightly runs in a dedicated clone at
`~/source/repos/sparkdate-nightly` that nobody shares. A session launched there
must NOT enter a worktree; it commits on the branch the launcher cut and stops.
See "THE NIGHTLY RUNS ON THIS MACHINE NOW" below.

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

**`EnterWorktree` with a name that already exists RESUMES it, commits and all
— it does not refuse and it does not branch fresh.** On 2026-09-10 a session
ending with `/handoff` called `EnterWorktree name:"handoff-2026-09-10"` and
landed inside another chat's worktree, on its branch, carrying its unmerged
commit for PR #496. Nothing was lost only because the next command was
`git log origin/main..HEAD` rather than an edit. The tool does say "resumed
as-is" in its result — read that line. **Anything generic enough to collide is
a name to avoid: `handoff`, `fix`, today's date.** If you find yourself in one,
`ExitWorktree keep` (never `remove`) and pick another name.

**Squash-merged branches read as unmerged to `ExitWorktree remove`.** The squash
makes a new commit, so the branch's own commit is not an ancestor of `main` and
the tool refuses, asking for `discard_changes: true`. That is a real guardrail,
not a formality — confirm the content actually landed on `main` before forcing
it, and get the user's word first.

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
| What I was mid-way through | `HANDOFF.md`, dated, with a next step | Dead once merged? |
| Open PRs, worktrees, stashes | **nowhere** | `npm run brief` derives it |
| How to drive one tool or surface | `docs/*_RUNBOOK.md`, `docs/*_PLAYBOOK.md` | Only needed while doing that task? |

That last row is the one that keeps getting violated. Hand-written inventories
of PRs and worktrees were wrong within hours, every time.

**The `HANDOFF.md` row said "≤25 lines" until 2026-09-04. That cap is retired.**
It was set in #357 when the file was 29 lines and never held once — 29 → 48 →
94 → 115 → 129 → 152 → 195 across seven sessions, with no session ever trimming
to it. Its only real effect was pressure to delete other chats' live intent to
hit a number, and at least one watch signal was lost that way. Length was never
the failure; **derivable inventory going stale** was, and that is the row above.
Date each entry, give it a next step, and delete it when it is done.

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

## THE NIGHTLY RUNS ON THIS MACHINE NOW (2026-09-02)

The GA4/Meta nightly no longer runs in Cowork. One Windows scheduled task,
`Meta Ads Results Pull` (02:00 local, misnamed, leave the name), runs
`Business Plan/files/Night Tasks/run-nightly-claude-code.ps1`, which:

1. pulls Meta insights and the GA4 Data API tables into Night Tasks (as before);
2. sweeps `claude/*` branches pushed without a PR (as before, now via
   `--body-file`, which is why the 08-31 report was stranded for a day);
3. runs the analysis itself: headless `claude --print` in a **dedicated clone
   at `~/source/repos/sparkdate-nightly`** (never the main checkout, never a
   worktree of it), on a fresh `claude/nightly-ga4-<date>` branch, with the
   prompt at **`.claude/commands/nightly-ga4.md`**, tracked so it cannot fork.
   Claude commits; the script checks the commit is exactly one `reports/*.md`
   file, then pushes and opens the PR. Claude never pushes and never runs `gh`.

The 09:00 `SparkDate Nightly Report Review` task then fact-checks that PR.

- Re-run by hand after a fresh export: `/nightly-ga4` in a normal worktree
  session, or `run-nightly-claude-code.ps1 -AnalysisOnly -Force` (the switch
  names are documented at the top of the script).
- `-SmokeTest` exercises the launcher end to end with a throwaway prompt and
  no push. Run it after upgrading the CLI or editing the script.
- **Step 2b syncs Eventbrite Ads spend** (`scripts/sync-eventbrite-ads-spend.js`,
  since 2026-09-11) by driving the installed Chrome through a signed-in profile
  at `%LOCALAPPDATA%\SparkDate\eventbrite-ads-profile`, because Eventbrite has
  no ads API and its dashboard endpoints refuse the OAuth token. The profile
  is created ONCE by hand with `npm run ads:eventbrite-login`; when the login
  expires the step logs a WARN with that command and the night carries on. It
  writes `ad_spend/{date}__eventbrite` (never `{date}`, which is Meta's) and
  `Night Tasks/eventbrite-ads-<date>.csv`. Eventbrite's attributed tickets in
  those documents are Eventbrite's count, not sales.
- Health: `Night Tasks/logs/<date>.log`. **The Cowork nightly task must stay
  paused.** If both run, two reports race for one branch name.
- `TONIGHT_PROMPT.md` is dead. The prompt library file keeps the run log only.

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

## SOCIAL POSTING — the queue is the system; the composer is the exception

**Source of truth is `content/queue.csv` + `content/brand.json`** (since
2026-08-21, PR #214). The six xlsx copies in `Downloads/` are dead — one of
them silently reverted a hashtag fix, which is why the queue moved into git.
The loop for a new event is `docs/SOCIAL_RUNBOOK.md`; the pipeline:

```
node scripts/social-preflight.js              # verify the Meta account is set up
node scripts/social.js plan                   # what would post, and when
node scripts/social.js approve --through=DATE # authorize a batch — THE HUMAN CLICK
node scripts/social.js run                    # DRY RUN (default)
node scripts/social.js run --execute          # actually publish
```

`.github/workflows/social-publish.yml` runs `run --execute` on a cron (asks
for `*/15`, really ~every two hours); nobody has to be at a keyboard. Only
`state=approved` rows publish. Media is served from `public/social/` and
fetched by URL — no hand attachment for queued posts.

**The standing "Claude does not click Publish" rule, in this shape: Claude
does not run `approve` unless Taylor asks for that batch.** That is the click.

**Still manual, by decision:** X/Twitter (the queue writes `caption_x`;
posting is a paste) and IG Stories with link/countdown stickers (the API
cannot attach stickers; those rows carry `manual_reason` and the runner skips
them).

**Anything posted OUTSIDE the queue** (an unplanned post, a live event story)
goes through the platform composer by hand, and these rules hold there:

- **Meta Business Suite: build the draft, then STOP.** Claude fills text,
  hashtags, date and time, and pops the file picker; the user attaches the
  video (a native OS dialog the browser tools cannot reach) and clicks
  "Finish later" / "Schedule" / "Publish" themselves. Taylor's correction,
  July 2026: *"next time when creating a draft pause and allow me to post
  it."* One explicit "schedule it" / "post it" covers that ONE draft on
  screen — never the rest of the week.
- **TikTok Studio: Claude may click Schedule directly.** Upload works through
  the real `<input type=file>`. Accepted under blanket authorization in July
  2026 and never objected to; if Taylor pushes back, TikTok gets the Meta rule.
- **Never invent a real number** (ticket counts, sales figures) to fill a
  placeholder in copy. Rewrite the caption so it does not need one.
- Check the platform's own Scheduled / Posts tab before building anything;
  the plan and the platform drift within a day.

The full composer procedure — the step-by-step Meta draft build, the
video-attach quirk that SPLITS a combined FB+IG draft, the Create Reel
wizard, the TikTok scroll-wheel time picker and hashtag-autocomplete
corruption, the July 2026 asset code map — is in
**`docs/SOCIAL_COMPOSER_PLAYBOOK.md`**. Read it only when actually driving a
composer.

**UTM workbooks** live in `Business Plan/files/Social Media Marketing/Content
Calendars & Strategy/` — untracked, main checkout only, two files that must
not be conflated:

- `SparkDate_UTM_Campaign_Links (version 1).xlsb.xlsx` — HAND-maintained
  (Eventbrite, email, flyers, Nextdoor, Google Business, Patch). **No script
  may open it**: openpyxl drops its 16 Platform dropdowns on save, and
  `sync-utm-content.py` refuses it outright rather than degrade it.
- `SparkDate_Paid_Ad_UTMs (generated).xlsx` — script-owned, regenerated whole
  by `npm run ads:utm-sync`. Never hand-edit. From a worktree, pass
  `--workbook` at the main checkout's path.

The campaign workbook's own "How to Use" sheet is wrong where it calls
`utm_content` optional (`content/brand.json` and `scripts/lint-ad-copy.js`
require it, unique per ad), and its event sheets still hold seeded EXAMPLE
rows (`utm_source=Facebook`, `Augweek3_lancaster`, `proof_rsa1`) — don't copy
them. Tags are built by `scripts/ad-utm.js` from brand.json, never typed at a
call site. Full map: memory `utm-process-map`.
