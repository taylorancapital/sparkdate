# run-nightly-claude-code.ps1
#
# Nightly local prep for the Cowork review. Two jobs, in order:
#
#   1. Pull Meta Ads insights into the Night Tasks folder, so the Cowork
#      scheduled task finds them sitting next to the manually-exported GA4
#      files. Cowork cannot do this itself -- it runs in a cloud sandbox with
#      no access to this machine and no Meta token -- so it has to happen here.
#
#   2. If a fresh TONIGHT_PROMPT.md exists, run it through the local Claude
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

# ── Step 2: queued Claude Code prompt (usually absent) ───────────────────
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
