# Nightly report-PR review — orchestration instructions

You are running unattended (no one will approve your actions before they happen), so stay
strictly inside the scope below. If anything is ambiguous, skip it rather than guess —
a report reviewed a day late is fine; a wrong action on the wrong PR is not.

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
   and post them as a single PR comment:
   ```
   gh pr comment <number> --body-file <path to a temp file containing the marker line,
   a blank line, then the subagent's findings>
   ```
   The comment body MUST start with `<!-- automated-pr-review-marker -->` on its own line —
   that's what step 3 checks for on future runs, so a missing marker means this PR gets
   reviewed again every single day.
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
