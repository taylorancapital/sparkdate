# Field notes — August 2026

**Eleven incidents — the busiest month in this catalogue, and the one where
the pattern that gives this whole project its name first became visible.**
Nightly GA4 analysis started in earnest 2026-08-13, the Firestore-backed admin
dashboard was carrying real live data, and two sessions collided in a shared
checkout on 2026-08-29. Every incident below was originally catalogued in
`reports/NOTHING_THREW_2026-09-04.md` ("edition 1") as one of its 18; this
edition reproduces them under their original numbers, grouped and dated to
August specifically, as part of a five-month retroactive catch-up.

*Retroactive edition, written 2026-09-07. See
`reports/FIELD_NOTES_2026-05.md` for why numbering does not run in strict
chronological order across editions.*

## Detection

| Detection | This month | Cumulative |
|---|---:|---:|
| `GATE` — a deterministic check refused it | 0 | 0 |
| `THREW` — an actual error surfaced | 1 | 4 |
| `HUMAN` — someone distrusted a number | 4 | 6 |
| `OPERATOR` — reported as "data went missing" | 1 | 1 |
| `LATER` — found by an unrelated dig | 5 | 6 |
| **Total** | **11** | **17** |

One of August's 11 (incident 17) was caught by something that fires on its
own — but it is `THREW`, not `GATE`: an operation failing outright, not a
check built to catch it. Of the 18 incidents edition 1 catalogued, exactly one
was caught by an actual deterministic gate (incident 13, September), and it is
the only one in the whole original 18. Zero of August's 11 were caught by a
purpose-built check.

---

## A. The agent was confidently wrong

### 03 — A debrief that named the wrong cause · `LATER`

Published in the Good Good event debrief, 2026-08-31
(`reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md`). An event post-mortem
reasoned from the code alone and blamed a two-for-one ticket offer for a
gender imbalance. The flag it depended on was false on every record involved;
the offer had played no part at all — both `+1` seats that day were men, and
both attended.

**Cost:** a confident, circulated, wrong explanation. Rewritten only after
someone queried the data directly — and the superseded reasoning was deleted
rather than kept, because a wrong cause left lying around is worse than none.

### 04 — A filtered first query · `HUMAN`

Taylor, 2026-08-22, after four rounds of revised Meta ads conclusions: *"I'm
so sick of you being in a constant state of discovery and doubling back on
things that you should have evaluated fully the first time."* An investigation
into an ad account opened by listing only `ACTIVE` campaigns. Three dormant
campaigns — the ones that had delivered the cheapest clicks the account ever
bought — were invisible to every subsequent step.

**Cost:** three successive proposals, each blocked by a different constraint,
each looking like progress. The real fix was flipping a status back. The cost
was not the wrong answer; it was four review cycles of someone else's time.

---

## B. The check passed for a reason unrelated to correctness

### 05 — Green locally, red in CI, and the difference was a token · `LATER`

2026-08-30. A script called `main()` at module scope instead of guarding on
`require.main === module`. CI, with no API token, hit `process.exit(2)`
synchronously on import and the test process died. The dev machine *had* the
token, so the same import went to the network instead of exiting, and the
synchronous tests finished before the exit landed.

**Cost:** the suite passed for a reason that had nothing to do with the code
being right, and was reported as verified.

> When a check passes, ask what it would have taken to fail. If the answer is
> "different machine state," it verified nothing.

---

## C. Silent failure — the error was swallowed and read as absence of data

### 08 — Security rules that were never deployed · `LATER`

Precedent PR #257, 2026-08-22. Nothing in CI deploys the Firestore ruleset; it
is a manual command. A collection shipped with no matching rule, so the
dashboard's read was denied — and the codebase's deliberate fail-soft
handlers swallowed the permission error into a `console.warn`.

**Cost:** the dashboard reported a materially wrong P&L for as long as the
rules sat undeployed, against a collection holding 73 real documents.
Deploying moved cost $260.00 → $527.38, net revenue $628.44 → $434.68,
blended CAC $12.24 → $15.36.

### 09 — A missing composite index inside a live listener · `OPERATOR`

PR #196, mid-August. A query combined `where()` with `orderBy()` on a
different field, requiring a composite index that did not exist. Every
snapshot threw "the query requires an index" straight into the listener's own
fail-soft catch.

**Cost:** the widget read "No ticket sales yet" from the moment it shipped.
Reported by the operator as data going missing, not as an error — because in
the UI a permission failure and "nobody has entered anything" are
indistinguishable.

### 11 — A finished report with no pull request · `LATER`

The report finished the night of 2026-08-31. The automation pushed an
analysis branch, then failed at the step that opens the PR — a multi-line
body passed as a command-line argument, mangled by PowerShell 5.1's own
re-quoting into stray arguments.

**Cost:** a completed report stranded for a day, invisible because a branch
with no PR looks like nothing at all. Fixed by writing the body to a file and
passing the path — the same class of fix incident 28 (July) needed for a
different root cause on a different automation stack.

### 12 — A data pull that silently overwrote the one before it · `HUMAN`

2026-08-30. Nightly export files are named by table and date, not by pull
time. Two pulls on the same day collide and the second wins — this date has
two sets: a 06:00 UTC pull the GA4 report was built on, and a 12:51 UTC pull
of three new tables. The 06:00 files were kept deliberately.

**Cost:** nearly destroyed the exact dataset a published report cited. The
loss would have been invisible — the report keeps rendering perfectly,
against different numbers.

---

## E. Concurrency — several agents, one working tree

*All four of the following happened on a single day, 2026-08-29, from two
Claude sessions sharing one checkout — the incident that is the direct cause
of this repository's worktree-per-session rule.*

### 15 — A pushed commit, overwritten · `LATER`

Two agent sessions shared one checkout. One pushed work to a branch; the
other reused the same branch name and force-moved it.

**Cost:** the commit survived unreferenced and had to be recovered from the
reflog. Recovery, not prevention — and only because someone went looking.

### 16 — A commit that landed on someone else's branch · `HUMAN`

Work intended for one branch was committed onto another session's, which then
committed on top of it.

**Cost:** untangling took a rebase that dropped a commit from the middle. One
recovery created the next problem.

### 17 — A branch that could not be created · `THREW`

`git checkout -b` failed outright: the shared tree was mid-merge, with a
conflict in a file belonging to nobody in that session.

**Cost:** minutes. Listed because it is the only incident in the original 18
that produced an immediate, honest error.

### 18 — A pull request carrying a stale copy of someone else's file · `HUMAN`

A session swept an unrelated in-progress file out of the shared working tree
into its own commit.

**Cost:** caught in review. Had it merged second, it would have silently
reverted a fix already verified against the live API — a regression with a
green diff, introduced by a PR about something else entirely.

---

## What this is and is not

- **This is a reproduction, not a re-investigation.** Every incident above was
  already catalogued, anchored, and classified in edition 1
  (`reports/NOTHING_THREW_2026-09-04.md`); this edition changes only which
  document each one lives in, sorted by the month it happened. Cost figures,
  classifications, and detection modes are unchanged from the original.
- **August's 11-of-18 concentration is not a coincidence of dating
  convenience.** It reflects when the systems that produce this catalogue's
  failure modes — a live Firestore dashboard, nightly GA4 automation running
  daily rather than experimentally, concurrent agent sessions on one
  checkout — actually existed at volume. May through July combined produced 6
  incidents across three months; August alone produced 11.
- **Zero of August's 11 were caught by a purpose-built check.** One
  (incident 17) was caught by an operation failing outright — `THREW`, not
  `GATE`. Across the full retroactive catalogue, only incident 13 (September)
  was ever caught by an actual deterministic gate.
- **"Cost" means what was lost or nearly lost**, established from logs,
  commits and API reads at the time, unchanged from edition 1.
- **Names, account identifiers and customer records are omitted throughout.**
