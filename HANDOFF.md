# HANDOFF — intent only

**Contract for this file. Read before editing it.**

This holds only what a machine cannot derive: what someone was mid-way through,
why, and what they would do next. Keep it under ~25 lines.

**Never write here:** open PRs, worktree inventories, stash lists, recent
commits, or "X is merged." `npm run brief` derives all of that live and is
correct; a typed copy is wrong within hours. The 2026-08-30 version of this file
listed two PRs as open (one had merged) and three worktrees that no longer
existed, while missing all four that did.

**Durable rules go in `CLAUDE.md`. Durable facts go in memory files. Findings go
in `reports/`.** If an entry here stops being "in flight," move it or delete it.

## In flight

- Nothing. Last session closed clean.

## Open threads nobody owns

- `reports/META_CAPI_PROMPT.md` is untracked and has never been run.
- 7 of 11 serving Meta ads still share `utm_content=proof_rsa1`, so per-ad
  attribution collapses to one bucket.
- Marion Court Traffic ads have no pixel dataset selected — they cannot report
  conversions until one is.
- `/admin` took 13 sessions from 1 user attributed to `facebook / paid_social`
  with 5 key events. Looks like internal traffic wearing paid attribution;
  nobody has looked. Small, but it feeds the internal-traffic-filter question.

## Watch signals

- GA4 `facebook / paid_social` should read near-zero sessions from here on. New
  sessions there mean an ad re-introduced June's hand-typed lowercase-no-
  `eventId` URL shape. Same for `Facebook / paid`. Context:
  `reports/GA4_ANALYSIS_2026-08-30.md`.
- Promotions CTR is only computable on windows starting 2026-08-28 or later
  (report §H1) — earlier rows read clicks > views.
