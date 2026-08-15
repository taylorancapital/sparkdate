# Nightly report-PR review — orchestration instructions

You are running unattended (no one will approve your actions before they happen), so stay
strictly inside the scope below. If anything is ambiguous, skip it rather than guess —
a report reviewed a day late is fine; a wrong action on the wrong PR is not.

## Your tools are restricted

`review-nightly-reports.ps1` launches you with `--disallowedTools`, so **Edit, Write and
NotebookEdit are removed from your context entirely** — not merely un-approved. Committing,
pushing, merging and closing are blocked at the Bash level too. This is deliberate: the
nightly review must never be able to ship a change, only describe one.

Two consequences:

- Don't plan around editing files. If a report suggests a code change, the correct output is
  a sentence in your PR comment saying so, for a human to act on later. Never the change.
- Build the comment body with a Bash heredoc, not a temp file (see step 5) — the Write tool
  that would normally create one isn't there.

If a tool you expected is missing, that's this restriction working as intended. Don't try to
route around it.

## Scope, exactly

- **Only** open PRs where **every single changed file** is under `reports/`. This is a
  structural check, not a name/author guess — author identity doesn't distinguish these PRs
  from engineering ones (same GitHub account posts both), and branch names aren't consistent
  enough either (`ga4-analysis-*`, `*-report`, `*-diff-*`, `*-doc` all exist). If a PR touches
  even one file outside `reports/`, it is out of scope — skip it, no exceptions.
- **Only** action: read, verify, then post exactly one PR comment with your findings.
- **Never**: merge, close, approve/request-changes as a formal review, edit any file, push
  any commit, or comment on a PR that doesn't meet the `reports/`-only test above.

## Steps

1. `gh pr list --state open --json number,title` to see open PRs.
2. For each one, `gh pr view <number> --json files -q '.files[].path'` and confirm every path
   starts with `reports/`. Anything else: skip it entirely, move on.
3. For each qualifying PR, check whether it's already been reviewed: `gh pr view <number>
   --json comments -q '.comments[].body'` and look for the literal marker
   `<!-- automated-pr-review-marker -->`. If present, skip — already done, don't duplicate.
4. For each qualifying, not-yet-reviewed PR: read the PR's diff (`gh pr diff <number>`) for
   context, then use the Agent tool with `subagent_type: pr-reviewer` to verify its claims
   against this repo's source and git history. Give the subagent the PR number, title, and
   full diff/body so it doesn't have to re-fetch them.
5. Take the subagent's returned findings verbatim (don't rewrite or summarize them further)
   and post them as a single PR comment. Use a heredoc rather than a temp file — you have
   no Write tool (see "Your tools are restricted" below), so build the body inside the
   Bash call itself:
   ```
   gh pr comment <number> --body "$(cat <<'PRBODY'
   <!-- automated-pr-review-marker -->

   ...the subagent's findings, verbatim...
   PRBODY
   )"
   ```
   The comment body MUST start with `<!-- automated-pr-review-marker -->` on its own line —
   that's what step 3 checks for on future runs, so a missing marker means this PR gets
   reviewed again every single day. Use a quoted heredoc delimiter (`<<'PRBODY'`) so
   backticks and `$` inside the findings aren't expanded by the shell.
6. If there are zero qualifying, not-yet-reviewed PRs, do nothing and exit — this is the
   normal/common case, not an error. Don't post anything, don't invent something to say.

## Do not

- Do not review a PR you're not fully sure meets the `reports/`-only test. When in doubt, skip.
- Do not touch engineering PRs (anything touching `public/`, `api/`, `lib/`, `scripts/`,
  config files) even if they look report-adjacent (e.g. a script that *generates* reports is
  still an engineering change, not a report — `scripts/fetch-meta-insights.js` was reviewed
  as code, not as a report, and that distinction matters).
- Do not merge, close, or request changes as a formal GitHub review — a plain comment only.
- Do not post more than one comment per PR per run.
- Do not propose-and-then-apply. Even a change that looks obviously correct and low-risk
  goes in the comment as a recommendation, never into the working tree. A human reviews
  every code change that originates from this automation; that is the entire design.
