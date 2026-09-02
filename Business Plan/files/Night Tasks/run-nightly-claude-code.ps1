# run-nightly-claude-code.ps1
#
# The nightly, end to end, on this machine. Six steps, in order:
#
#   1. Pull Meta Ads insights into the Night Tasks folder (last 7 days).
#   2. Pull the core GA4 tables from the Data API, dated by pull day.
#   3. Refresh the "Paid Ad UTMs" sheet from the live Meta ads.
#   4. Prepare the dedicated nightly clone (sparkdate-nightly): fetch, reset.
#   5. Open PRs for any claude/* branch that was pushed without one.
#   6. Run tonight's analysis: headless Claude Code in the clone, on a fresh
#      claude/nightly-ga4-<date> branch, following the tracked prompt at
#      .claude/commands/nightly-ga4.md. Claude commits; this script checks the
#      commit is exactly one reports/*.md file, then pushes and opens the PR.
#      Claude is launched without push and without gh, so the gate is the only
#      way a report reaches GitHub.
#
# Until 2026-09-02 step 6 ran in a Cowork cloud session that could not reach
# api.github.com, so it pushed a branch and relied on step 5 the NEXT night to
# open the PR. Two runners for one job, a day of lag, and a copy of
# ANALYTICS_CONTEXT.md that forked. That Cowork task must stay paused, or the
# two runs race for one branch name.
#
# Launched by Windows Task Scheduler ("Meta Ads Results Pull", 02:00 local --
# misnamed, leave it; see CLAUDE.md). Switches, all optional:
#
#   -AnalysisOnly  skip steps 1-3 and 5: a re-run on data already pulled.
#   -Force         run step 6 even if today's branch already exists on origin
#                  (the new branch gets a -HHmm suffix) or today's GA4 pull is
#                  missing.
#   -NoPush        step 6 commits in the clone but pushes nothing and opens no
#                  PR. For testing the launcher.
#   -SmokeTest     -AnalysisOnly and -NoPush with a trivial built-in prompt:
#                  proves the CLI resolves, authenticates, runs in the clone and
#                  commits. Run it after upgrading the CLI or editing this file.
#
# Steps 1-3 are non-fatal (a stale sheet or a missing Meta file degrades the
# report). Steps 4 and 6 are fatal: a failed analysis IS the night, and Task
# Scheduler should show it red.
#
# Known gap: the Claude call in step 6 has no timeout. A run that hangs holds
# the task open (the 72h limit is the only stop), and Task Scheduler ignores
# the next trigger while an instance is still running. If a night is missing
# from the logs, look for a stuck powershell.exe before anything else.

param(
    [switch]$AnalysisOnly,
    [switch]$Force,
    [switch]$NoPush,
    [switch]$SmokeTest
)
if ($SmokeTest) { $AnalysisOnly = $true; $NoPush = $true }

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 decodes a child process's console output using the
# active codepage, not UTF-8, regardless of how that output is captured --
# confirmed by testing: even plain variable-capture (not just *>> redirection)
# garbled non-ASCII text from node. This makes that decoding correct for any
# UTF-8 output this script's children produce (node, the claude CLI), as
# defense in depth alongside keeping fetch-meta-insights.js's own output
# ASCII-only.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoPath   = "C:\Users\penns\source\repos\sparkdate"
# The repo has two "Night Tasks" folders. This one -- under "Business
# Plan\files\" -- is the live one: it's where fresh GA4 exports actually land
# (confirmed by file dates, not assumed) and where TONIGHT_PROMPT.md gets
# refreshed. The bare "Night Tasks" folder at the repo root is a dormant
# leftover; an earlier version of this script pointed here by mistake, based
# on a one-time snapshot comparison that didn't hold up under a second look.
$NightTasks = Join-Path $RepoPath "Business Plan\files\Night Tasks"
$LogDir     = Join-Path $NightTasks "logs"
$Today      = Get-Date -Format "yyyy-MM-dd"
$LogFile    = Join-Path $LogDir "$Today.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LogFile -Value $line -Encoding Unicode
    Write-Host $line
}

# *>> file-redirection writes raw bytes straight from a native process's
# output handles under an ambient encoding assumption that doesn't match
# Add-Content's -Encoding Unicode above -- confirmed empirically: mixing the
# two in one file produced unreadable CJK-range garbage, not just wrong
# characters here and there. Capturing through PowerShell's own string layer
# (plain variable assignment) instead avoids the mismatch entirely, since
# PowerShell decodes the child process's output into .NET strings itself
# before this ever touches a file.
#
# Merging stderr via 2>&1 wraps each stderr line in an ErrorRecord whose
# default ToString() prepends "System.Management.Automation.RemoteException"
# -- unwrap to .Exception.Message so the log reads as plain text either way.
function Write-ProcessOutputToLog($output) {
    foreach ($item in $output) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            Add-Content -Path $LogFile -Value $item.Exception.Message -Encoding Unicode
        } else {
            Add-Content -Path $LogFile -Value $item.ToString() -Encoding Unicode
        }
    }
}

Log "=== Nightly run starting ==="

if ($AnalysisOnly) {
    Log "SKIP (steps 1-3): -AnalysisOnly -- using the data already in Night Tasks."
} else {
    # ── Step 1: Meta Ads insights ────────────────────────────────────────────
    # Deliberately non-fatal. A Meta API hiccup or an expired token must not stop
    # the rest of the night: the GA4 files are already in place and the review can
    # run without the Meta numbers, just less completely.
    try {
        if (-not $env:META_ADS_ACCESS_TOKEN -and -not $env:META_CAPI_ACCESS_TOKEN) {
            Log "SKIP (meta): neither META_ADS_ACCESS_TOKEN nor META_CAPI_ACCESS_TOKEN is set for this user. Insights need a token carrying ads_read -- see scripts/fetch-meta-insights.js."
        } else {
            Log "Pulling Meta Ads insights (last 7 days)..."
            Push-Location $RepoPath
            try {
                # 7 days, not 1: gives the review a trend to read rather than a
                # single day, and covers nights this didn't run.
                $metaOutput = & node "scripts\fetch-meta-insights.js" --days=7 2>&1
                Write-ProcessOutputToLog $metaOutput
                if ($LASTEXITCODE -eq 0) {
                    Log "Meta insights written to Night Tasks."
                } else {
                    Log "WARN (meta): fetch-meta-insights.js exited $LASTEXITCODE -- see output above. Continuing."
                }
            } finally {
                Pop-Location
            }
        }
    } catch {
        Log "WARN (meta): pull threw '$_'. Continuing -- this does not block the review."
    }

    # ── Step 2: pull the core GA4 tables ─────────────────────────────────────
    # The review used to depend on someone exporting 38 CSVs by hand, so a missed
    # export was a missed night. These nine tables come straight from the Data API
    # and were verified against the 2026-08-27 manual export: revenue by source 35
    # transactions / $946.16 and revenue by item $863.66, both exact, and the daily
    # series matching day for day.
    #
    # Running on a SCHEDULE is half the point. The manual numbers depended on what
    # time the export was pulled -- the same day read 54 sessions at 13:12 and 172
    # at 23:19 -- and a fixed hour removes that variable rather than documenting it.
    # Every file still records its own pull time in the header.
    #
    # Does NOT replace the Explorations (funnel steps, the webview A/B segments,
    # cohort retention). Those use hand-built segments the Data API cannot express
    # and still need exporting by hand when a report needs them.
    #
    # Writes ga4-api-*.csv, never download*.csv -- an automated job must not
    # overwrite a file a human put there.
    #
    # Non-fatal like the steps around it: yesterday's tables are better than none,
    # and the log says which it is.
    try {
        if (-not $env:GOOGLE_APPLICATION_CREDENTIALS) {
            Log "SKIP (ga4): GOOGLE_APPLICATION_CREDENTIALS is not set for this user. It must point at the service account JSON, and the account needs Viewer on the GA4 property -- see scripts/fetch-ga4-tables.js."
        } elseif (-not (Test-Path $env:GOOGLE_APPLICATION_CREDENTIALS)) {
            Log "SKIP (ga4): GOOGLE_APPLICATION_CREDENTIALS points at '$env:GOOGLE_APPLICATION_CREDENTIALS' but nothing exists there."
        } else {
            Log "Pulling core GA4 tables..."
            Push-Location $RepoPath
            try {
                $ga4Output = & node "scripts\fetch-ga4-tables.js" 2>&1
                Write-ProcessOutputToLog $ga4Output
                if ($LASTEXITCODE -eq 0) {
                    Log "GA4 tables written to Night Tasks."
                } else {
                    Log "WARN (ga4): fetch-ga4-tables.js exited $LASTEXITCODE -- see output above. Continuing."
                }
            } finally {
                Pop-Location
            }
        }
    } catch {
        Log "WARN (ga4): pull threw '$_'. Continuing -- this does not block the review."
    }

    # ── Step 3: refresh the paid-UTM map in the campaign workbook ──────────
    # Writes a "Paid Ad UTMs" sheet mapping every utm_content back to the ad, ad
    # set, campaign and creative carrying it, and reports any two SERVING ads that
    # share a utm_content -- which is the state the account was in until
    # 2026-08-29, when every ad carried proof_rsa1 and GA4 could not tell one
    # creative from another.
    #
    # Placed before the analysis (step 6) so the sheet is fresh when the report
    # reads it.
    #
    # Read-only against Meta. The only write is one regenerated sheet in the
    # workbook; the hand-maintained "UTM Links" sheet is never touched.
    #
    # Non-fatal like Step 1: a stale sheet is worse than no sheet only if nobody
    # knows it is stale, and the log says so either way.
    try {
        if (-not $env:META_ADS_ACCESS_TOKEN) {
            Log "SKIP (utm): META_ADS_ACCESS_TOKEN is not set for this user. The sheet needs a token carrying ads_read -- see scripts/sync-utm-content.py."
        } else {
            Log "Refreshing the Paid Ad UTMs sheet..."
            Push-Location $RepoPath
            try {
                # Excel holds an exclusive lock while the workbook is open, and
                # openpyxl would fail late, after the API calls. Checking the lock
                # file first turns that into a clean skip. Note a CRASHED Excel
                # leaves the lock behind for weeks -- one sat stale from 2026-07-23
                # -- so the message says how to tell the two apart.
                $wb   = Join-Path $RepoPath ("Business Plan" + [char]92 + "files" + [char]92 + "Marketing & GTM" + [char]92 + "Content Calendar & UTM Links.xlsb.xlsx")
                $lock = Join-Path (Split-Path $wb) ("~$" + (Split-Path $wb -Leaf))
                if (Test-Path $lock) {
                    Log "SKIP (utm): lock file present next to the workbook. If Excel is not running this lock is stale -- delete it and the next run will write."
                } else {
                    $utmOutput = & python "scripts\sync-utm-content.py" 2>&1
                    Write-ProcessOutputToLog $utmOutput
                    if ($LASTEXITCODE -eq 0) {
                        Log "Paid Ad UTMs sheet refreshed."
                    } else {
                        Log "WARN (utm): sync-utm-content.py exited $LASTEXITCODE -- see output above. Continuing."
                    }
                }
            } finally {
                Pop-Location
            }
        }
    } catch {
        Log "WARN (utm): sync threw '$_'. Continuing -- this does not block the review."
    }

}

# ── Helpers for steps 4-6 ────────────────────────────────────────────────

# Native executables from here on. Windows PowerShell 5.1 wraps every stderr
# line of a native exe in an ErrorRecord when it is redirected with 2>&1, and
# under $ErrorActionPreference = "Stop" that promotes a routine notice ("remote:
# Create a pull request...", "this workspace has not been trusted") into a
# terminating error. Steps 1-3 above are guarded call by call; the rest of this
# file is nothing but git, gh and the Claude CLI, so it runs under Continue and
# checks $LASTEXITCODE explicitly instead. Write-ProcessOutputToLog unwraps the
# ErrorRecords, so stderr still reaches the log as plain text.
$ErrorActionPreference = 'Continue'

# Resolve the Claude Code CLI. Deliberately duplicated in
# review-nightly-reports.ps1 rather than dot-sourced: two independently
# scheduled scripts should not share an include whose absence breaks both.
function Resolve-ClaudeCli {
    if ($env:CLAUDE_CLI) {
        if (Test-Path $env:CLAUDE_CLI) { return $env:CLAUDE_CLI }
        Log "WARN: CLAUDE_CLI is set to '$($env:CLAUDE_CLI)' but nothing exists there -- ignoring it."
    }
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    try {
        $prefix = (& npm config get prefix 2>$null | Select-Object -First 1)
        if ($prefix) {
            foreach ($name in @('claude.cmd', 'claude.exe', 'claude.ps1', 'claude')) {
                $candidate = Join-Path $prefix.Trim() $name
                if (Test-Path $candidate) { return $candidate }
            }
        }
    } catch { }
    return $null
}

# Opens a PR for a branch from its tip commit: subject -> title, body -> body.
# Returns the PR URL, or $null.
#
# --body-file, never --body. PowerShell 5.1 re-quotes arguments to a native exe
# and does not escape embedded double quotes, so a multi-line body containing
# one splits into stray arguments and gh fails with "unknown arguments [...]
# please quote all values that have spaces". That is exactly what happened on
# 2026-09-01: GA4_ANALYSIS_2026-08-31.md was pushed and never got its PR.
# CLAUDE.md documents the same trap for `git commit -m`. The title is a single
# line, so escaping its quotes is enough there.
function Open-PrFromCommit {
    param([string]$Ref, [string]$Branch, [string]$Footer)
    $title = (& git log -1 --format='%s' $Ref 2>$null | Select-Object -First 1)
    if (-not $title) { Log "  WARN: no commit subject on $Ref -- not opening a PR."; return $null }
    $title = ($title -replace '"', '\"')
    $body  = (& git log -1 --format='%b' $Ref 2>$null) -join "`n"
    if (-not $body) { $body = "Opened automatically by run-nightly-claude-code.ps1." }
    if ($Footer) { $body = $body + "`n`n---`n" + $Footer }
    $bodyFile = Join-Path $LogDir ("pr-body-" + [guid]::NewGuid().ToString('N') + ".md")
    [System.IO.File]::WriteAllText($bodyFile, $body, (New-Object System.Text.UTF8Encoding $false))
    try {
        $out = & gh pr create --head $Branch --base main --title $title --body-file $bodyFile 2>&1
        Write-ProcessOutputToLog $out
        if ($LASTEXITCODE -ne 0) { Log "  WARN: gh pr create failed for $Branch (exit $LASTEXITCODE)."; return $null }
        $url = ($out | ForEach-Object { "$_" } | Where-Object { $_ -match '^https://github\.com/' } | Select-Object -Last 1)
        return "$url"
    } finally {
        Remove-Item $bodyFile -ErrorAction SilentlyContinue
    }
}

# ── Step 4: the nightly clone ────────────────────────────────────────────
# Everything git-related from here on happens in a dedicated clone: never the
# main checkout, never a worktree of it. CLAUDE.md records the day two sessions
# sharing that checkout overwrote each other's branches; an unattended job at
# 02:00 must not be a third. The clone is disposable: every run re-fetches and
# resets to origin/main, so nothing accumulates and nothing needs cleaning up.
$NightlyClone = "C:\Users\penns\source\repos\sparkdate-nightly"
$RemoteUrl    = "https://github.com/taylorancapital/sparkdate.git"

if (-not (Test-Path (Join-Path $NightlyClone ".git"))) {
    Log "Nightly clone not found -- creating it at $NightlyClone (one time, ~400 MB)..."
    $out = & git clone --quiet $RemoteUrl $NightlyClone 2>&1
    Write-ProcessOutputToLog $out
    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: git clone exited $LASTEXITCODE. Nothing else in this run can proceed without the clone."
        exit 1
    }
}
Push-Location $NightlyClone
try {
    $out = & git fetch --prune --quiet origin 2>&1
    Write-ProcessOutputToLog $out
    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: git fetch exited $LASTEXITCODE in $NightlyClone. Nothing else in this run can proceed."
        exit 1
    }
} finally {
    Pop-Location
}
Log "Nightly clone ready ($NightlyClone)."

# ── Step 5: open PRs for branches pushed without one ─────────────────────
# Originally for Cowork's branches, which could never open their own PR. Kept
# as a safety net: an interactive session that pushed and lost its context, or
# a step 6 whose push succeeded and whose gh call did not, both land here.
# Idempotent: only ever creates a PR where none exists.
#
# Deliberately NOT a GitHub Action on push. A workflow firing on every
# claude/** push would race interactive sessions and open PRs with generated
# titles before a real description is written. Sweeping at night catches the
# unattended runs and leaves daytime work alone.
if ($AnalysisOnly) {
    Log "SKIP (pr-sweep): -AnalysisOnly."
} else {
    try {
        Log "Checking for pushed branches with no PR..."
        Push-Location $NightlyClone
        try {
            # Two hours, so a branch pushed by an interactive session that is
            # still writing its PR description is left alone.
            $cutoff = (Get-Date).ToUniversalTime().AddHours(-2)
            # And a floor: this repo carries 300-odd claude/* branches, most of
            # them old and deliberately abandoned. Seven days catches an
            # unattended run that failed to open its PR and ignores archaeology.
            $floor = (Get-Date).ToUniversalTime().AddDays(-7)
            $opened = 0
            $branches = @(& git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/claude/*')

            # ONE API call, not one per branch. Per-branch queries across 271
            # branches took over two minutes in testing.
            $withPR = New-Object 'System.Collections.Generic.HashSet[string]'
            $prJson = & gh pr list --state all --limit 500 --json headRefName 2>$null
            if ($prJson) {
                foreach ($r in ($prJson | ConvertFrom-Json)) { [void]$withPR.Add($r.headRefName) }
            } else {
                Log "  WARN: could not list PRs -- skipping the sweep rather than opening duplicates."
                $branches = @()
            }

            foreach ($ref in $branches) {
                if (-not $ref) { continue }
                $branch = $ref -replace '^origin/', ''

                $ahead = (& git rev-list --count "origin/main..$ref" 2>$null | Select-Object -First 1)
                if (-not $ahead -or [int]$ahead -eq 0) { continue }

                $whenRaw = (& git log -1 --format='%cI' $ref 2>$null | Select-Object -First 1)
                if ($whenRaw) {
                    $when = [datetime]::Parse($whenRaw).ToUniversalTime()
                    if ($when -gt $cutoff) {
                        Log "  skip $branch -- pushed less than 2h ago, may still be in progress."
                        continue
                    }
                    if ($when -lt $floor) { continue }
                }

                if ($withPR.Contains($branch)) { continue }

                # A stale branch shows every intervening change as its own
                # (claude/paid-efficiency-analysis-2026-08-21: a 319-line report
                # that would open as a 15,686-file PR). Propose the easy case,
                # report the hard one; replaying onto main is a judgement call.
                $behind = (& git rev-list --count "$ref..origin/main" 2>$null | Select-Object -First 1)
                if ($behind -and [int]$behind -gt 20) {
                    Log "  STALE $branch -- $behind commits behind main, $ahead ahead. Not opening: the PR would show main's changes as its own. Replay it onto current main first (git cherry-pick), then open the PR."
                    continue
                }

                Log "  opening PR for $branch ($ahead commit(s) ahead)"
                $url = Open-PrFromCommit -Ref $ref -Branch $branch -Footer "PR opened by the nightly sweep in run-nightly-claude-code.ps1 -- this branch was pushed without one."
                if ($url) { $opened++; Log "  opened $url" }
            }

            if ($opened -eq 0) { Log "No branches needed a PR." }
            else { Log "Opened $opened PR(s) that had been pushed without one." }
        } finally {
            Pop-Location
        }
    } catch {
        # Non-fatal: a sweep failure must not stop tonight's analysis.
        Log "WARN (pr-sweep): threw '$_'. Continuing."
    }
}

# ── Step 6: tonight's analysis, on this machine ──────────────────────────
# Division of labour: Claude writes the report and commits it. This script
# checks the commit and does the push and the PR. Claude is launched with push
# and gh removed from its tools, so the gate below is the only route to GitHub.
$analysisFailed = $false
$todayGa4 = Join-Path $NightTasks "ga4-api-daily-trend-$Today.csv"
if ($SmokeTest) {
    $branch = "smoke-test-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
} else {
    $branch = "claude/nightly-ga4-$Today"
}

if (-not $SmokeTest -and -not $Force -and -not (Test-Path $todayGa4)) {
    Log "SKIP (analysis): no GA4 pull for today -- $todayGa4 is missing. A report on yesterday's data would only repeat last night's. Re-run with -Force to analyse whatever is there."
} else {
    $ClaudeCli = Resolve-ClaudeCli
    if (-not $ClaudeCli) {
        Log "ERROR: Claude Code CLI not found -- the analysis cannot run."
        Log "  Checked: CLAUDE_CLI override, PATH, and the npm global prefix."
        Log "  Fix: npm install -g @anthropic-ai/claude-code, or set CLAUDE_CLI to the executable's full path."
        exit 1
    }
    Log "Using Claude CLI: $ClaudeCli"

    Push-Location $NightlyClone
    try {
        $existing = & git ls-remote --heads origin $branch 2>$null
        if ($existing -and -not $Force) {
            Log "SKIP (analysis): $branch already exists on origin -- tonight's report was already produced. Re-run with -Force to make another."
        } else {
            if ($existing) {
                $suffixed = $branch + "-" + (Get-Date -Format 'HHmm')
                Log "-Force: $branch is already on origin, using $suffixed instead."
                $branch = $suffixed
            }
            & git reset -q --hard 2>&1 | Out-Null
            & git clean -fdq 2>&1 | Out-Null
            & git checkout -q -B $branch origin/main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Log "ERROR: could not cut $branch from origin/main in $NightlyClone (git checkout exited $LASTEXITCODE)."
                exit 1
            }
            Log "Analysis branch $branch cut from origin/main."

            # The clone tracks origin/main, so the prompt has to be merged before
            # the first unattended run can use it. Until then, skip cleanly rather
            # than launch Claude at a file that is not there.
            $promptFile = Join-Path $NightlyClone ".claude/commands/nightly-ga4.md"
            if (-not $SmokeTest -and -not (Test-Path $promptFile)) {
                Log "SKIP (analysis): .claude/commands/nightly-ga4.md is not on origin/main yet. Merge the PR that adds it; the next run will pick it up."
                exit 0
            }

            if ($SmokeTest) {
                $stamp = Get-Date -Format 's'
                $prompt = "SMOKE TEST of the nightly launcher, nothing more. Create the file reports/NIGHTLY_SMOKE_TEST.md containing exactly one line: smoke test $stamp. Stage only that file and commit it with the subject Nightly launcher smoke test, and a one-line body. Do not push, do not open a PR, do not touch any other file, do not call EnterWorktree, do not run npm. When the commit exists, print SMOKE OK and stop."
            } else {
                $prompt = "You were launched unattended by run-nightly-claude-code.ps1 in the dedicated nightly clone. Read and follow the instructions in the file .claude/commands/nightly-ga4.md in this checkout, exactly as written, in its UNATTENDED mode: write the report, commit it, do not push, do not open a PR. There is no one here to answer questions."
            }

            # Prompt FIRST: --disallowedTools is variadic and would swallow a
            # positional argument placed after it.
            #
            # --dangerously-skip-permissions: nobody is here to approve tool calls.
            # --add-dir: the data and the run log live under the main checkout's
            #   Night Tasks folder, outside this clone.
            # --disallowedTools: a bare tool name is removed from Claude's context
            #   outright. EnterWorktree would move Claude off the branch the gate
            #   inspects. The Bash(...) patterns are defence in depth against the
            #   actions the gate exists to prevent; the gate is the guarantee.
            $disallow = @(
                'EnterWorktree', 'ExitWorktree',
                'Bash(git push *)', 'Bash(gh *)',
                'Bash(git checkout *)', 'Bash(git switch *)', 'Bash(git worktree *)',
                'Bash(git merge *)', 'Bash(git rebase *)', 'Bash(git reset *)',
                'Bash(npm install *)', 'Bash(npm ci *)'
            )
            # CLAUDECODE=1 and the CLAUDE_CODE_* variables are set inside a Claude
            # Code session and tell a child CLI it is nested in one. Task Scheduler
            # never sets them; a hand-run from an interactive Claude session would.
            # Clear them so both paths behave alike.
            Get-ChildItem Env: | Where-Object { $_.Name -eq 'CLAUDECODE' -or $_.Name -like 'CLAUDE_CODE_*' } |
                ForEach-Object { Remove-Item ('Env:' + $_.Name) -ErrorAction SilentlyContinue }

            Log "Launching Claude Code for the analysis on $branch..."
            $claudeOutput = & $ClaudeCli --print "$prompt" --dangerously-skip-permissions --add-dir "$NightTasks" --disallowedTools @disallow 2>&1
            # Capture immediately: any later command can clobber $LASTEXITCODE.
            $claudeExit = $LASTEXITCODE
            Write-ProcessOutputToLog $claudeOutput

            if ($claudeOutput -match 'Not logged in|Please run /login') {
                Log "ERROR: the Claude Code CLI is installed but NOT AUTHENTICATED."
                Log "  Fix: run 'claude' in an interactive terminal as '$env:USERNAME' and complete /login."
                $analysisFailed = $true
            } elseif ($claudeExit -ne 0) {
                Log "ERROR: Claude Code exited $claudeExit. See the CLI output above."
                $analysisFailed = $true
            } else {
                Log "Claude Code finished (exit 0). Checking what it committed..."

                # The gate: exactly one commit ahead of main, changing exactly one
                # reports/*.md file, with no uncommitted change to any tracked
                # file. Untracked scratch is ignored: it is not pushed, and the
                # next run's git clean removes it. Anything else is not pushed,
                # whatever the prompt said. Report-only is enforced here, not in
                # the prompt.
                $ahead = [int](& git rev-list --count origin/main..HEAD 2>$null | Select-Object -First 1)
                $files = @(& git diff --name-only origin/main...HEAD 2>$null | Where-Object { $_ })
                $dirty = @(& git status --porcelain --untracked-files=no 2>$null | Where-Object { $_ })
                $ok = ($ahead -eq 1) -and ($files.Count -eq 1) -and ($files[0] -match '^reports/[^/]+\.md$') -and ($dirty.Count -eq 0)
                if (-not $ok) {
                    Log "ERROR: the run did not produce exactly one commit adding one reports/*.md file. Not pushing."
                    Log "  commits ahead of main: $ahead"
                    Log "  files changed: $($files -join ', ')"
                    Log "  uncommitted: $($dirty -join ' | ')"
                    Log "  The branch is left in $NightlyClone for inspection; the next run resets it."
                    $analysisFailed = $true
                } elseif ($NoPush) {
                    Log "OK: one commit, $($files[0]). -NoPush set, so it stays local in $NightlyClone on branch $branch."
                } else {
                    $out = & git push --quiet -u origin $branch 2>&1
                    Write-ProcessOutputToLog $out
                    if ($LASTEXITCODE -ne 0) {
                        Log "ERROR: git push exited $LASTEXITCODE. The commit is intact in $NightlyClone on $branch."
                        $analysisFailed = $true
                    } else {
                        Log "Pushed $branch ($($files[0]))."
                        $url = Open-PrFromCommit -Ref 'HEAD' -Branch $branch -Footer "Nightly analysis, run unattended by run-nightly-claude-code.ps1 on $env:COMPUTERNAME. The report is the only file this branch changes; the launcher checked that before pushing."
                        if ($url) { Log "PR opened: $url" }
                        else { Log "WARN: pushed, but the PR was not opened. The sweep will retry tomorrow night." }
                    }
                }
            }
        }
    } finally {
        Pop-Location
    }
}

if ($analysisFailed) {
    Log "=== Run complete (analysis FAILED) ==="
    exit 1
}
Log "=== Run complete ==="
