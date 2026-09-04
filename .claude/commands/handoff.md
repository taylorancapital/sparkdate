---
description: Update HANDOFF.md with what this session was mid-way through, then open the PR
---

Close out this session so the next chat starts informed. Usage growth forces new
chats often; this is what carries intent across that boundary.

## 1. Re-read the contract

Read `HANDOFF.md`. It holds **intent only**. There is no length cap — the ~25
line one was retired 2026-09-04 after never holding once in seven sessions, and
after it caused a live watch signal to be deleted to hit the number. Judge an
entry by whether it is undeliverable intent, not by the file's length.

## 2. Update "In flight"

**Add or update YOUR session's entries. Do not replace the section.** Most of
what is there belongs to other chats that are still mid-thread, and a dropped
thread is invisible in a way a long file is not.

For each of your items, one bullet: what was being changed, why, the next
concrete step, and the date `(MM-DD)`. Be specific enough to resume cold — name
files, and cite a PR number where it explains WHY something is true.

Citing `#411` as the reason a rule exists is fine. Writing "#440 is open" is
not: `npm run brief` derives that live and a typed copy is wrong within hours.

You may CORRECT another session's entry when you have evidence it is done or
wrong — say what the evidence was. You may not delete one to make room.

If your session finished cleanly and left nothing open, add nothing and say so
in the PR. Do not invent loose ends to look thorough.

## 3. Prune — on evidence, never on length

Delete an entry only when you can say why it is gone: you finished it, or you
checked and it is done, or a machine derives it. "The file is long" is not a
reason and never was.

Move anything durable to where it belongs and delete it here:

| What it is | Where it goes |
|---|---|
| A rule about how to work in this repo | `CLAUDE.md` |
| A fact learned about the system | a memory file |
| An analysis or finding | `reports/` |
| Open PRs, worktrees, stashes, recent commits | nowhere — `npm run brief` derives it |

## 4. Ship it

`HANDOFF.md` is tracked, so it only reaches the next session once merged — an
unmerged handoff is invisible to every other worktree. Commit it, push, and open
the PR. Do not merge; the user merges their own PRs.

Then report: the PR link, and a two-line summary of what the next session should
pick up first.
