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

$RepoPath   = "C:\Users\penns\source\repos\sparkdate"
# The repo has two "Night Tasks" folders. This is the live one -- it holds the
# freshest GA4 exports and sparkdate-nightly-claude-code-prompts.md. The copy
# under "Business Plan\files\" is stale; writing there means the nightly review
# never sees the file.
$NightTasks = Join-Path $RepoPath "Night Tasks"
$PromptFile = Join-Path $NightTasks "TONIGHT_PROMPT.md"
$LogDir     = Join-Path $NightTasks "logs"
$Today      = Get-Date -Format "yyyy-MM-dd"
$LogFile    = Join-Path $LogDir "$Today.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
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
            & node "scripts\fetch-meta-insights.js" --days=7 *>> $LogFile
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

Set-Location $RepoPath

# --print runs one non-interactive turn and exits when done.
# --dangerously-skip-permissions is required for an unattended run -- there's no one here
# to click "yes" on file edits / bash commands, so without it Claude Code would just hang
# forever on the first permission prompt. This is only reasonable because TONIGHT_PROMPT.md
# itself carries the guardrails (no merge to main, no pricing/legal-copy changes, flag
# anything ambiguous instead of deciding it) -- verify those guardrails are still intact in
# the prompt library file if you ever change how it's generated.
#
# NOTE: verify these flag names against `claude --help` on this machine before trusting the
# schedule -- CLI flags can change between versions.
$metaPrompt = "Read and follow the instructions in the file 'Night Tasks\TONIGHT_PROMPT.md' exactly as written, including opening the PR at the end. There is no one here to answer questions -- if something is genuinely ambiguous, stop and document it in the PR instead of asking."

try {
    claude --print --dangerously-skip-permissions "$metaPrompt" *>> $LogFile
    Log "Claude Code run finished (exit code $LASTEXITCODE)."
} catch {
    Log "ERROR: Claude Code run threw an exception: $_"
    exit 1
}

Log "=== Run complete ==="
