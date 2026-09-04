---
description: The monthly field notes — a catalogue of how the agents failed this month, classified by how each failure was actually caught. Reads the previous edition first and only adds what is new. Writes reports/FIELD_NOTES_<YYYY-MM>.md. Run by hand as /field-notes; never publishes anything.
---

# Field notes — the monthly failure record

You are producing this month's edition of the field notes: a catalogue of the
ways autonomous agents failed against this live business, each one classified
by **how it was actually detected**. Edition 1 is
`reports/NOTHING_THREW_2026-09-04.md` — eighteen incidents, May–September 2026.
Read it before anything else; it defines the form, the voice and the bar.

The public copy lives at `github.com/taylorancapital/nothing-threw`. **You never
touch it.** See §8.

## The thing that makes this document worth writing

Anyone can list bugs. The finding in edition 1 was the *detection* axis:
seventeen of eighteen failures reported success, and only two were caught by
the system rather than by a person distrusting a number. That ratio is the
product. If a month's edition does not classify every incident by detection
mode and total it, you have written a changelog, not field notes.

## 1. Read the previous edition and establish the watermark

List `reports/FIELD_NOTES_*.md` plus `reports/NOTHING_THREW_2026-09-04.md`.
The newest is the **previous edition**. Read it in full and extract:

- every incident already catalogued, and its number
- the edition's date, which is your **watermark**

**If no prior edition exists on this branch, do not guess a watermark.** The
likely cause is that the edition is sitting in an unmerged PR rather than on
`origin/main` — check with `gh pr list --search "FIELD_NOTES OR NOTHING_THREW"`
before concluding there is none. If one is genuinely open, stop and say so:
writing a second edition against an unmerged first one will duplicate its
incidents and collide on numbering. Only if no edition exists anywhere is this
edition 1, starting at incident 01 with a watermark of `2026-05-02`, the repo's
first commit.

**Incident numbers continue across editions and never restart.** Edition 1 ends
at 18, so the next new incident is 19. Numbers are stable references — one may
already be cited publicly — so never renumber an existing one, and never reuse
a number for a different incident.

**Do not re-report a catalogued incident.** A recurrence of one already listed
is not a new incident; it is a line in §6 (Recurrences). Only genuinely new
material gets a new number.

## 2. Where the incidents actually are

Six sources. Sweep all six; none alone is sufficient. **Start with source 1** —
on the 2026-09-04 test run every single candidate that cleared the bar came
from it, and the other five only corroborated.

1. **The memory files** —
   `C:\Users\penns\.claude\projects\C--Users-penns-source-repos-sparkdate\memory\`.
   The richest source by far. Files with `type: feedback` carry a `**Why:**`
   section that is usually a failure written up at the time, but do not skip
   `type: project` — two of the three candidates on the test run were project
   files whose body described a failure. Read `MEMORY.md` for the index, then
   sort by the frontmatter `modified:` stamp and read every file stamped after
   the watermark:

   ```bash
   grep -H "^  modified:" *.md | sed 's/.md:  modified:/ | /' | sort -t'|' -k2 -r
   ```
2. **`CLAUDE.md`** — much of it is a failure record wearing a rule's clothes
   ("This is not a precaution. It is a record of what already went wrong").
   Diff it against the watermark: `git log -p --since=<watermark> -- CLAUDE.md`.
3. **`reports/*.md` written since the watermark** — especially any that
   retract an earlier version of themselves, and every "What I did not verify"
   section, which is where a near-miss usually sits.
4. **The run logs** —
   `C:\Users\penns\source\repos\sparkdate\Business Plan\files\Night Tasks\logs\`.
   Grep for `ERROR`, `WARN`, `SKIP`, and for the gate's refusal line
   ("did not produce exactly one commit"). Count nights that produced no log
   at all against the calendar; a missing night is an incident the logs cannot
   report by construction.

   **Two log families live in that one folder and they are different tasks.**
   `<date>.log` is the 02:00 nightly. `review-<date>.log` is the 09:00 report
   review. A date can have one and not the other — 2026-09-03 has a
   `review-` log and no nightly log, meaning the nightly did not run that
   night. Filter to `^\d{4}-\d{2}-\d{2}\.log$` before counting missing nights,
   or a night that silently failed will read as present and you will report a
   false negative in the one section whose whole purpose is catching silence.
5. **Git history since the watermark** — reverts, commits whose subject
   describes a defect, PRs that fix something shipped the same month.
   `git log --oneline --since=<watermark>`.
6. **`HANDOFF.md`, "Open threads nobody owns"** — items that have been sitting
   there since before the watermark are candidates: something was noticed and
   nothing was done, which is itself a finding.

## 3. The bar for inclusion

An incident goes in only if **all four** hold:

- **It is anchored.** A commit SHA, a log line with its date, a file path with
  a line number, or an API read taken at the time. Anchor it in the entry.
  *No anchor, no entry.* This document's whole credibility is that every claim
  is checkable, and a padded edition destroys the value of the honest ones.
- **Something was actually wrong.** Not a design decision you disagree with,
  not a TODO, not a limitation that was known and accepted.
- **An agent's behaviour is part of the causal chain.** Ordinary product bugs
  belong in `reports/`, not here. The subject is agents operating live systems.
- **You can state what it cost**, or state plainly that it was caught before it
  cost anything. "Cost" means what was lost or nearly lost, not what could
  theoretically have happened.

**A short edition is a good edition.** Three well-anchored incidents beat
twelve padded ones. If the month genuinely produced nothing new, say exactly
that in a four-line edition and stop — that is a real and reportable result,
and it is the only way the trend in §5 ever means anything.

## 4. Classify every incident twice

**Failure class** — reuse edition 1's five, and add a sixth only if something
genuinely does not fit:

- **A** — the agent was confidently wrong
- **B** — the check passed for a reason unrelated to correctness
- **C** — silent failure; the error was swallowed and read as absence of data
- **D** — a destructive write the API reported as success
- **E** — concurrency: several agents, one working tree

**Detection mode** — exactly one per incident:

| Mode | Means |
|---|---|
| `GATE` | A deterministic check refused it |
| `THREW` | An actual error surfaced at the time |
| `HUMAN` | Someone distrusted a number or a claim |
| `OPERATOR` | Reported as "data went missing" / "this looks wrong" |
| `LATER` | Found by an unrelated dig, days to months on |

Be honest about `GATE`. A failure caught because someone happened to read the
diff is `HUMAN`, not `GATE`. Inflating the automated column is the one way this
document can lie about the exact thing it exists to measure.

## 5. The running tally is the point

Every edition carries a cumulative table across **all** editions, not just this
month's:

| Detection | This month | Cumulative |
|---|---:|---:|

Then one paragraph on whether the automated share is moving. That number going
up is the only evidence that the countermeasures work. If it is flat, say so —
edition 1's countermeasures were written in September 2026 and their whole
justification is that this ratio should improve.

## 6. Structure of the file

Write `reports/FIELD_NOTES_<YYYY-MM>.md`:

1. **Title and standfirst** — the month, the incident count, the one-line
   finding.
2. **Detection table** — this month and cumulative (§5).
3. **The incidents**, grouped by failure class, each with: number, title,
   detection chip, what happened, `**Cost:**`, and its anchor.
4. **Recurrences** — previously-catalogued incidents that happened again, by
   number. A recurrence is the strongest possible evidence a countermeasure
   did not work; name the countermeasure it defeated.
5. **What changed in response** — countermeasures built this month, if any.
6. **What this is and is not** — carried forward from edition 1 and updated.
   The selection-bias paragraph is mandatory: this catalogue holds the failures
   that were *noticed*.

Match edition 1's voice: plain, specific, no hedging, no adjectives doing work
that a number should do. Name mechanisms, not vibes.

## 7. Then the artifact

CLAUDE.md requires every analysis to ship twice. Load the `artifact-design`
skill, build the page, publish it, and hand over **both** the artifact URL and
the absolute Windows path to the markdown. Reuse edition 1's visual system
(the detection-mode colour encoding is the whole information design — keep it).

## 8. What you must not do

- **Never push to `github.com/taylorancapital/nothing-threw`.** That repo is
  public. Publishing is Taylor's action, not yours. Produce the markdown and
  the artifact; if he wants an edition public he will say so.
- **Never invent an incident, and never round one up.** If the evidence is
  thin, either anchor it properly or leave it out and note in §6 that you
  looked and could not anchor it.
- **Never name a customer.** Real names and addresses were scrubbed out of this
  public repo on 2026-09-04 (PR #434). Pseudonymise consistently, the way
  `reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md` does, and preserve any
  structure the finding depends on.
- **Never merge the PR.** Open it and leave it; Taylor merges his own.

## 9. Mechanics

Work in a worktree per CLAUDE.md. The file is the only thing the commit
changes. Open the PR with `gh pr create --body-file` — never `--body`, which
PowerShell 5.1 mangles into stray pathspecs. Then stop.
