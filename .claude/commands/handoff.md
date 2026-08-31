---
description: Update HANDOFF.md with what this session was mid-way through, then open the PR
---

Close out this session so the next chat starts informed. Usage growth forces new
chats often; this is what carries intent across that boundary.

## 1. Re-read the contract

Read `HANDOFF.md`. It holds **intent only** and stays under ~25 lines.

## 2. Rewrite "In flight"

Replace it with what THIS session was actually doing. For each item, one bullet:
what was being changed, why, and the next concrete step. Be specific enough to
resume cold — name files and PR numbers.

If the session finished cleanly and left nothing open, write `- Nothing. Last
session closed clean.` Do not invent loose ends to look thorough.

## 3. Prune

Delete every entry that is no longer in flight, and every entry a machine can
derive. Move anything durable to where it belongs and delete it here:

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
