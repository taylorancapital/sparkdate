---
description: The nightly GA4 + Meta review. Reads last night's pulls from Night Tasks, writes reports/GA4_ANALYSIS_<date>.md, commits it. Run unattended by run-nightly-claude-code.ps1 at 02:00; also runnable by hand as /nightly-ga4 after a fresh export lands.
---

# Nightly GA4 review

You are producing tonight's GA4 + Meta analysis report. This is Prompt 9 from
the Night Tasks prompt library, moved into git on 2026-09-02 so it cannot fork
the way the untracked copies did. First work out which of two ways you were
launched, because the rules differ:

**Unattended (the normal case).** `run-nightly-claude-code.ps1` launched you
with `--print` inside the dedicated clone at
`C:\Users\penns\source\repos\sparkdate-nightly`, already on a fresh branch
`claude/nightly-ga4-<date>` cut from `origin/main`. Nobody is watching and
nobody will answer a question. In this mode:

- Do NOT call EnterWorktree, do NOT run `npm run brief`, do NOT create any
  other branch or worktree. You are already where you need to be.
- Do NOT push, do NOT open a PR, do NOT run `gh`. The script pushes and opens
  the PR after it has checked your commit. Your job ends at the commit.
- There is no `node_modules` in this clone and you must not install one. Read
  CSVs with Python or by hand.
- CLAUDE.md's worktree rule does not apply here: this clone is neither the
  main checkout nor shared with anyone. The session brief may call it MAIN
  CHECKOUT or NIGHTLY CLONE; either way, stay on this branch.
- Scratch files (a CSV-parsing helper, say) go in the system temp directory,
  not in the clone. If you wrote one here anyway, delete it before you commit.
- If something is genuinely ambiguous, write the ambiguity into the report and
  keep going. Stopping with nothing committed wastes the night.

**By hand (`/nightly-ga4` in an interactive session).** A human is present,
usually because a fresh export just landed. Follow CLAUDE.md as normal: work in
a worktree, and when the report is committed open the PR yourself with
`gh pr create --body-file` (never `--body`; PowerShell 5.1 mangles quotes).

Everything below applies to both.

## 1. Read the guardrails before any number

Read BOTH, in full:

1. `reports/ANALYTICS_METHOD.md` in this checkout. Tracked, always current.
   Measurement traps only.
2. `C:\Users\penns\source\repos\sparkdate\Business Plan\files\Night Tasks\ANALYTICS_CONTEXT.md`.
   Gitignored, hand-maintained. The commercial context, and the settled
   questions list in its §3b.

State ANALYTICS_CONTEXT.md's `Last updated:` date in the report's first
paragraph — it is cheap provenance and says which copy you read.

**Do NOT raise the stamp as an item for Taylor unless it disagrees with the
file's own modified time.** Compare the stamp to the file's mtime, nothing
else. If they agree, the file is self-consistent: say the date and move on. If
the stamp is OLDER than the mtime, the file was edited without bumping it —
that, and only that, is worth one sentence.

REWRITTEN 2026-09-04, after this instruction produced the same request seven
nights running. It used to say "if it is older than the newest
`reports/GA4_ANALYSIS_*.md` on this branch, say so". A report is generated
every night, so the newest one is always newer than any hand-edited stamp:
the condition was permanently true and fired every single run. Seven
"NEEDS TAYLOR INPUT" slots went to a date while real findings — an unreplaced
`<campaign-name>` tracking placeholder carrying 41 key events among them —
queued behind it.

The stamp was a FORK DETECTOR, and the fork it detected is gone. It existed
because the Cowork sandbox kept its own copy of this file, refreshed only when
Taylor re-uploaded it, and the 2026-08-26 report ran against a stale one and
wasted a night re-asking answered questions. Since 2026-09-02 the nightly runs
on this machine and reads the single canonical copy by absolute path — Cowork
is paused, and there is exactly one copy on disk. A fork can no longer happen,
so a stamp that merely looks old is not evidence of anything.

Where the two files disagree on a measurement question, the tracked one wins.
Where a caveat in either contradicts a number you compute, say so explicitly
rather than silently trusting either.

## 2. Find tonight's data

Everything lives in
`C:\Users\penns\source\repos\sparkdate\Business Plan\files\Night Tasks\`.
List the folder first. Never assume a filename.

- **GA4:** the `ga4-api-*-<date>.csv` set with the newest date in the
  filename, pulled by the same script that launched you (its step 2, about
  02:00 local, 06:00 UTC). Read the pull time and date window from each
  file's own `#` header, not from the filename or the mtime. The hand-exported
  `download*.csv` files are usually stale; use one only if its header window
  is newer than the API set, and say that you did.
- **Meta:** the newest `meta-insights-<date>.csv` (last 7 days, campaign level).
- **The two run logs:** the newest `logs/<date>.log` (what tonight's pulls
  did, including any SKIP or WARN line) and the NIGHTLY RUN LOG at the top of
  `sparkdate-nightly-claude-code-prompts.md` (what previous nights concluded,
  so you do not re-ask a settled question or re-report a known series break).
- **Previous reports:** `reports/GA4_ANALYSIS_*.md` on this branch. The newest
  is the one you are continuing.

If a file is missing, empty, or you cannot confidently identify its columns,
stop that part of the analysis and say so in the report. Never guess a number.

GA4 CSV shape: `#` metadata lines first, then the header row, then data. One
file may stack several tables, each with its own `# ` title. Column names vary
by table, so read the real headers. Do NOT move, rename, edit, or delete any
source file.

## 3. Compute the standing summary FIRST — do not hand-derive it

Run this before you read a single CSV by hand:

    node scripts/ga4-nightly-summary.js

It is zero-dependency (no `node_modules` needed, by design) and reads the pull
by absolute path, so it works from the nightly clone, a worktree, or the main
checkout. `--date YYYY-MM-DD` picks an older pull; `--dir` overrides the
location.

It computes, from all 46 tables: traffic by day / channel / source / device /
geo, two disjoint closed 7-day buckets, every event and every key event,
revenue and item sale dates, funnels by channel / device / landing page /
webview, checkout errors, Google Ads, the full UTM-defect inventory, and a
**coverage ledger naming every table and whether it was used.**

**Its output is the FLOOR of the report, not the ceiling.** You are not
finished when you have pasted it; you are finished when you have explained it.
It exists because the numbers kept being skipped, not because the analysis can
be automated. It also handles, once and correctly, the arithmetic that has
produced wrong reports here before — the two non-final days, rolling windows,
`Grand total` rows swept into sums, and `view_item`/`begin_checkout`/
`add_to_cart`/`add_payment_info` appearing in the key-events table with a
**zero** key-event count (they are funnel steps, NOT conversions; only
`purchase`, `generate_lead` and `ads_conversion_About_Us_1` are key events).

If the script errors, say so in the report and fall back to reading by hand —
but say which numbers you derived yourself.

## 4. Analyse

The goal is TICKET SALES, not signups. Tie every claim to a number and to the
file it came from.

- What moved since the last report, and is the movement real or a measurement
  artifact (the §1 tail, the series breaks, the 06:00 UTC pull timing)? Lead
  with this.
- Which pages and channels get real traffic but underperform on engagement or
  conversion? For each, open the page source in `public/` and form a specific
  hypothesis: CTA, message mismatch against the source, no visible path to
  `/event`, a device-specific problem. **Use the landing-page × source
  cross-tab**: when one source converts on a page and another does not, the
  page is not the explanation and you must say what is.
- Which channels and landing pages actually convert, and does the site make
  the most of them?
- Any page with meaningful traffic whose only conversion path is a newsletter
  signup: flag it.
- Meta: spend and results by campaign for the week. No week-over-week
  comparison when the two pulls overlap (ANALYTICS_METHOD §9). Meta's
  attributed conversions are NOT sales — it sees roughly 11% of real tickets.
  **Before crediting any campaign with a sale, check the item's sale DATES in
  the standing summary against the date the ads started.** A campaign cannot
  have sold a ticket bought before it existed; that exact error put a spurious
  "best ROAS on the account" headline on PR #449.
- Additivity: do the by-source tables sum to the daily trend, does revenue
  close across tables? Report what closes and what does not.

Never present GA4 revenue as business revenue (§7). Never invent a number.

## 5. Write the report, and nothing else

Create exactly one file: `reports/GA4_ANALYSIS_<YYYY-MM-DD>.md`, dated today
in America/New_York. Do not touch any other file in the repo. Every fix you
find is DESCRIBED, not applied. This run is report-only, always.

Shape, in this order:

1. First paragraph: "This run made ZERO code changes", the staleness sentence,
   and the data provenance (window and pull time from the header, Meta file).
2. **HEADLINE.** The one thing that matters most, with the evidence.
3. **TRAFFIC — standing section, never omitted.** Sessions, users and new users
   for the two disjoint closed weeks with the change; the channel table; the top
   15 sources with conversion rate and revenue; device and geography. Two
   sentences of reading per table, not just the table.
4. **EVENTS — standing section, never omitted.** Every event with its count,
   which are key events, what each channel actually produces, and what moved.
5. **UTM AND TAGGING GAPS — standing section, never omitted.** The defect
   inventory from the summary script, ranked by sessions affected, each with the
   fix and who can make it. This section is a worklist, not an observation.
   Fragmentation, internal self-referral tagging, broken/placeholder values,
   obfuscated third-party tags, dead campaigns, shared `utm_content`.
6. **ALSO IN THE REPORT.** The rest, ranked.
7. **NEEDS TAYLOR INPUT.** Judgment calls: copy, layout, pricing-adjacent,
   brand voice, anything legal-sensitive. Each with the number that justifies
   it and what to re-check in a week. Mark repeat asks "(2nd ask)" and so on.
   Never re-ask anything §3b calls settled. **An item only belongs here if
   Taylor is genuinely the only person who can act on it.** Before adding one,
   try to resolve it yourself: a third-party tag can be decoded, a vendor can be
   identified from the account's own mail, a listing URL can be read from the
   live listing. An ask that repeats without new evidence is not a finding, it
   is an unpaid debt — retire it or advance it.
8. **Zero-risk fixes, described and not applied.**
9. **Caveats.** Which ANALYTICS_METHOD sections shaped what you did not say,
   and a "What I did not verify" list.
10. **Coverage.** Paste the ledger's verdict line. If any table is unread,
    name it and say in one clause why it held nothing tonight. "Skimmed, nothing
    alarming" is not an acceptable entry for any table.

**On length.** The pull is 46 tables; a half-page report is a failure of the
run, not a tidy summary. There is no upper bound and no reward for brevity
here — Taylor's standing complaint is that these reports are too thin to act
on. Depth means numbers and mechanisms, not more adjectives.

## 6. Commit, with a PR-quality message

The commit message becomes the PR title and body verbatim, so write it for
Taylor reading at 7 AM:

- Subject: the headline as one plain sentence, under 72 characters, in the
  house style (`git log --oneline -20` shows it). The branch name carries the
  date, so the subject need not.
- Body: one plain-English paragraph first, then HEADLINE, ALSO, NEEDS TAYLOR
  INPUT and RETIRED sections in prose, and the line "Report only, no code
  changed."
- **The body must also carry a three-line NUMBERS block**, because the PR body
  is what actually gets read and it has been arriving with no numbers in it at
  all:

      TRAFFIC: <sessions> sessions / <users> users this closed week vs
               <sessions> / <users> the week before; best channel <name> at
               <conv rate>; worst <name> at <conv rate>.
      EVENTS:  <n> key events (<purchase count> purchases, <lead count> leads);
               biggest funnel loss <n> users at <step>.
      UTM:     <n> sessions mis-tagged across <n> defects; largest is <name>.

  Fill every angle bracket from the standing summary. A PR body that states no
  number is not a report of a 46-table pull.

Write the message to a file and commit with `git commit -F`. Stage ONLY the
report with `git add reports/GA4_ANALYSIS_<date>.md`. Then verify, and print
the result of each:

    git status --porcelain                     # must be empty
    git diff --name-only origin/main...HEAD    # must be exactly the one report

Finally append ONE entry, 10 to 15 lines and no more (the PR body is the
record), to the top of the NIGHTLY RUN LOG in
`C:\Users\penns\source\repos\sparkdate\Business Plan\files\Night Tasks\sparkdate-nightly-claude-code-prompts.md`,
in the same shape as the entries already there: date, "(local CLI run)", the
branch, the headline, the needs-input count, and what was retired.

## Guardrails (from the prompt library, unchanged)

- Never merge to main. Never push in unattended mode.
- Never touch pricing, gender-based logic, or age-gate copy.
- Never send email, post to social, or take any external action.
- If data is missing or malformed, stop and report it rather than guessing.
- Do not edit CLAUDE.md, HANDOFF.md, memory files, or ANALYTICS_CONTEXT.md.
