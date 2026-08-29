# run-nightly-claude-code.ps1
#
# Nightly local prep for the Cowork review. Five jobs, in order:
#
#   1. Pull Meta Ads insights into the Night Tasks folder, so the Cowork
#      scheduled task finds them sitting next to the manually-exported GA4
#      files. Cowork cannot do this itself -- it runs in a cloud sandbox with
#      no access to this machine and no Meta token -- so it has to happen here.
#
#   2. Pull the core GA4 tables from the Data API, so the review has its own
#      data on disk whether or not anyone exported CSVs by hand that day.
#
#   3. Refresh the "Paid Ad UTMs" sheet in the campaign workbook from the
#      live Meta ads, so a GA4 utm_content row can be traced back to the ad
#      and creative that carries it. Also flags two serving ads sharing one
#      utm_content, which is what made per-ad attribution impossible until
#      2026-08-29.
#
#   4. Open PRs for any claude/* branch that was pushed without one. Cowork
#      CANNOT do this itself -- its sandbox blocks api.github.com, so `gh pr
#      create` fails there after the push succeeds, leaving the report on a
#      branch nobody is watching. This machine has working gh credentials.
#
#   5. If a fresh TONIGHT_PROMPT.md exists, run it through the local Claude
#      Code CLI (the one with working git/gh credentials). This is the older
#      half of the job and is now usually a no-op: Cowork writes its reports
#      directly as PRs rather than queuing a prompt for this script.
#
# Launched by Windows Task Scheduler. Schedule it far enough ahead of the
# Cowork task that step 1's CSV is on disk before Cowork starts reading.
#
# Why the local CLI for step 2: Cowork's sandbox blocks api.github.com (so `gh`
# can't work) and its mounted filesystem is too slow for git on this repo.

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
$PromptFile = Join-Path $NightTasks "TONIGHT_PROMPT.md"
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
# Placed HERE, not at the end, because Step 4 exits 0 in three places when no
# fresh TONIGHT_PROMPT.md is queued -- which its own comment calls the steady
# state. Anything after it would almost never run.
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

# ── Step 4: open PRs Cowork could not open ───────────────────────────────
# Cowork's sandbox blocks api.github.com, so `gh pr create` cannot run there.
# It commits the report and pushes the branch, and the PR never appears. That
# is not hypothetical: GA4_ANALYSIS_2026-08-23.md (393 lines) and
# DEPENDENCY_AUDIT_2026-08-23.md (377 lines) sat on origin for two days with no
# PR, while two later reports cited them as "still open" and as missing
# entirely. Nobody noticed because a branch with no PR is invisible.
#
# This machine has working gh credentials, which is the whole reason step 3
# exists at all, so it can close the gap. Idempotent: it only ever creates a PR
# where none exists.
#
# Deliberately NOT a GitHub Action on push. A workflow firing on every
# claude/** push would race interactive sessions and open PRs with generated
# titles before a real description is written. Sweeping at night catches the
# unattended runs and leaves daytime work alone.
try {
    Log "Checking for pushed branches with no PR..."
    Push-Location $RepoPath
    try {
        & git fetch --prune --quiet origin 2>&1 | Out-Null

        # Two hours, so a branch pushed by an interactive session that is still
        # writing its PR description is left alone. Cowork's branches are hours
        # old by the time this runs.
        $cutoff = (Get-Date).ToUniversalTime().AddHours(-2)
        # And a floor: this repo carries 271 claude/* branches, most of them old
        # and deliberately abandoned. Without a window the first sweep would open
        # a PR for every one of them. Seven days catches an unattended run that
        # failed to open its PR and ignores everything archaeological.
        $floor = (Get-Date).ToUniversalTime().AddDays(-7)
        $opened = 0
        $branches = & git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/claude/*'

        # ONE API call, not one per branch. Asking gh per branch across 271
        # branches took over two minutes in testing and would hammer the API
        # every night for an answer that fits in a single request.
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

            # Nothing to propose if it is already contained in main.
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

            # A PR is only useful if its diff is the work. These branches are cut
            # from whatever main looked like that night, and a stale one shows
            # every intervening change as its own: claude/paid-efficiency-analysis-
            # 2026-08-21 carries a 1-file, 319-line report and would open a PR of
            # 15,686 files, 15,370 of them node_modules that main has since
            # untracked. Opening that is worse than opening nothing.
            #
            # So: propose the easy case, report the hard one. A stale branch needs
            # its commits replayed onto current main before a PR means anything,
            # and that is a judgement call, not a sweep's job.
            $behind = (& git rev-list --count "$ref..origin/main" 2>$null | Select-Object -First 1)
            if ($behind -and [int]$behind -gt 20) {
                Log "  STALE $branch -- $behind commits behind main, $ahead ahead. Not opening: the PR would show main's changes as its own. Replay it onto current main first (git cherry-pick), then open the PR."
                continue
            }

            # --fill is NOT used on purpose: it resolves the head through a LOCAL
            # ref and fails with "unknown revision" for a branch that only exists
            # on origin, which is exactly the case here. Title and body are read
            # off the remote commit instead, so no local branch is needed.
            $title = (& git log -1 --format='%s' $ref 2>$null | Select-Object -First 1)
            $body  = (& git log -1 --format='%b' $ref 2>$null) -join "`n"
            if (-not $title) { continue }
            if (-not $body) { $body = "Opened automatically by the nightly sweep: this branch was pushed without a PR." }
            $body = $body + "`n`n---`nPR opened by the nightly sweep in run-nightly-claude-code.ps1 -- the run that pushed this branch could not reach api.github.com."

            Log "  opening PR for $branch ($ahead commit(s) ahead)"
            $out = & gh pr create --head $branch --base main --title $title --body $body 2>&1
            Write-ProcessOutputToLog $out
            if ($LASTEXITCODE -eq 0) { $opened++ } else { Log "  WARN: gh pr create failed for $branch (exit $LASTEXITCODE)." }
        }

        if ($opened -eq 0) { Log "No branches needed a PR." }
        else { Log "Opened $opened PR(s) that had been pushed without one." }
    } finally {
        Pop-Location
    }
} catch {
    # Non-fatal, like the Meta pull: a sweep failure must not stop the queued
    # prompt from running.
    Log "WARN (pr-sweep): threw '$_'. Continuing."
}

# ── Step 5: queued Claude Code prompt (usually absent) ───────────────────
if (-not (Test-Path $PromptFile)) {
    Log "No TONIGHT_PROMPT.md -- nothing queued for the local CLI. Done."
    exit 0
}

$content = Get-Content $PromptFile -Raw

if ($content -notmatch "# Tonight's Claude Code Prompt.*?(\d{4}-\d{2}-\d{2})") {
    Log "TONIGHT_PROMPT.md has no dated header -- format may have changed. Skipping rather than guessing."
    exit 0
}
$promptDate = $Matches[1]
if ($promptDate -ne $Today) {
    # Exit 0, not 1. Cowork no longer queues a prompt here nightly, so a stale
    # file is the steady state, not a failure -- and exiting non-zero made
    # Task Scheduler report this task as broken every single night.
    Log "TONIGHT_PROMPT.md is dated $promptDate, not today ($Today) -- nothing fresh queued. Skipping the CLI run (this is normal; Cowork writes its reports directly as PRs now)."
    exit 0
}

Log "Found today's prompt (dated $promptDate). Launching Claude Code..."

# ── Resolve the Claude Code CLI ───────────────────────────────────────
# See review-nightly-reports.ps1 for the full rationale. Short version: this
# called a bare `claude`, which isn't installed on this machine -- that failure
# has been masked because the date guard above skips the CLI run on almost every
# night, so the first day a fresh prompt IS queued would have been the first day
# this broke, with a raw CommandNotFoundException and no hint why.
#
# Deliberately duplicated rather than dot-sourced: two independently-scheduled
# scripts shouldn't share an include whose absence breaks both at once.
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

$ClaudeCli = Resolve-ClaudeCli
if (-not $ClaudeCli) {
    Log "ERROR: Claude Code CLI not found -- today's queued prompt cannot be run."
    Log "  Checked: CLAUDE_CLI override, PATH, and the npm global prefix."
    Log "  Fix: npm install -g @anthropic-ai/claude-code"
    Log "  ...or set the CLAUDE_CLI environment variable to the executable's full path."
    Log "  NOTE: TONIGHT_PROMPT.md is still dated today, so this prompt stays queued"
    Log "        and will be picked up on the next run once the CLI is available."
    exit 1
}
Log "Using Claude CLI: $ClaudeCli"

Set-Location $RepoPath

# --print runs one non-interactive turn and exits when done.
# --dangerously-skip-permissions is required for an unattended run -- there's no one here
# to click "yes" on file edits / bash commands, so without it Claude Code would just hang
# forever on the first permission prompt. This is only reasonable because TONIGHT_PROMPT.md
# itself carries the guardrails (no merge to main, no pricing/legal-copy changes, flag
# anything ambiguous instead of deciding it) -- verify those guardrails are still intact in
# the prompt library file if you ever change how it's generated.
#
# NOTE: verify these flag names against `& $ClaudeCli --help` before trusting the schedule
# -- CLI flags can change between versions. (Use the resolved path, not a bare `claude`:
# the CLI is not necessarily on PATH, which is the whole reason Resolve-ClaudeCli exists.)
$metaPrompt = "Read and follow the instructions in the file 'Business Plan\files\Night Tasks\TONIGHT_PROMPT.md' exactly as written, including opening the PR at the end. There is no one here to answer questions -- if something is genuinely ambiguous, stop and document it in the PR instead of asking."

$prevEAP = $ErrorActionPreference

try {
    # See review-nightly-reports.ps1 for the full explanation. Short version:
    # PS 5.1 + 2>&1 on a native exe turns every stderr line into an ErrorRecord,
    # and with $ErrorActionPreference = "Stop" that makes any stderr output a
    # terminating error even on exit 0. Claude Code writes routine notices to
    # stderr, so this aborted runs on warnings that weren't failures. Lowered to
    # Continue for the call so stderr arrives as data, restored in finally.
    $ErrorActionPreference = 'Continue'
    $claudeOutput = & $ClaudeCli --print --dangerously-skip-permissions "$metaPrompt" 2>&1
    # Capture immediately: any later command can clobber $LASTEXITCODE.
    $claudeExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP

    Write-ProcessOutputToLog $claudeOutput

    # See review-nightly-reports.ps1: installed != authenticated. A fresh global
    # install exits 1 with "Not logged in · Please run /login", which otherwise
    # looks like an ordinary run failure in the log.
    if ($claudeOutput -match 'Not logged in|Please run /login') {
        Log "ERROR: the Claude Code CLI is installed but NOT AUTHENTICATED."
        Log "  Fix: run 'claude' in an interactive terminal and complete /login."
        Log "  Credentials are per-Windows-user and this task runs as '$env:USERNAME',"
        Log "  so log in while signed in as that same user or it won't see them."
        Log "  TONIGHT_PROMPT.md stays dated today, so the prompt remains queued."
        exit 1
    }

    # A non-zero exit means today's queued prompt did not run. Surface it instead
    # of logging the code and exiting 0, which reported a broken run as healthy.
    # (Distinct from the deliberate exit 0 on the "nothing queued" path above --
    # that's a normal no-op, this is a genuine failure.)
    if ($claudeExit -ne 0) {
        Log "ERROR: Claude Code run failed (exit code $claudeExit). See the CLI output above."
        exit $claudeExit
    }

    Log "Claude Code run finished (exit code $claudeExit)."
} catch {
    Log "ERROR: Claude Code run threw an exception: $_"
    exit 1
} finally {
    $ErrorActionPreference = $prevEAP
}

Log "=== Run complete ==="
