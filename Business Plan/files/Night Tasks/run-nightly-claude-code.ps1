# run-nightly-claude-code.ps1
#
# Reads TONIGHT_PROMPT.md (prepared nightly by the Cowork "sparkdate-nightly-claude-code"
# scheduled task, ~3:08 AM) and runs it through your LOCAL Claude Code CLI unattended --
# the one that already has working git/gh credentials (it's what made the 90+ existing
# claude/* branches in this repo). Meant to be launched by Windows Task Scheduler at
# 3:30 AM daily, giving the Cowork task a head start so this isn't racing an empty file.
#
# Why this exists / what it's NOT: Cowork's own sandbox cannot do this part of the job --
# its network policy blocks api.github.com (so `gh` can't work at all) and its mounted
# filesystem is too slow for git operations on this repo. This script runs on your actual
# machine instead, where neither problem applies.

$ErrorActionPreference = "Stop"

$RepoPath   = "C:\Users\penns\source\repos\sparkdate"
$PromptFile = Join-Path $RepoPath "Business Plan\files\Night Tasks\TONIGHT_PROMPT.md"
$LogDir     = Join-Path $RepoPath "Business Plan\files\Night Tasks\logs"
$Today      = Get-Date -Format "yyyy-MM-dd"
$LogFile    = Join-Path $LogDir "$Today.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Log "=== Nightly Claude Code run starting ==="

if (-not (Test-Path $PromptFile)) {
    Log "BLOCKED: TONIGHT_PROMPT.md not found at '$PromptFile'. The Cowork queue task may not have run yet tonight (it only fires if the Claude desktop app was open at 3am) -- skipping rather than guessing at a prompt."
    exit 1
}

$content = Get-Content $PromptFile -Raw

# Staleness check: the file's header line should read "# Tonight's Claude Code Prompt — YYYY-MM-DD"
if ($content -notmatch "# Tonight's Claude Code Prompt.*?(\d{4}-\d{2}-\d{2})") {
    Log "BLOCKED: couldn't find a dated header in TONIGHT_PROMPT.md -- format may have changed. Skipping rather than guessing."
    exit 1
}
$promptDate = $Matches[1]
if ($promptDate -ne $Today) {
    Log "BLOCKED: TONIGHT_PROMPT.md is dated $promptDate, not today ($Today) -- Cowork's 3am queue task likely didn't run (app closed?). Skipping rather than re-running a stale/already-handled prompt."
    exit 1
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
# schedule -- CLI flags can change between versions and this hasn't been run end-to-end yet.
$metaPrompt = "Read and follow the instructions in the file 'Business Plan\files\Night Tasks\TONIGHT_PROMPT.md' exactly as written, including opening the PR at the end. There is no one here to answer questions -- if something is genuinely ambiguous, stop and document it in the PR instead of asking."

try {
    claude --print --dangerously-skip-permissions "$metaPrompt" *>> $LogFile
    Log "Claude Code run finished (exit code $LASTEXITCODE)."
} catch {
    Log "ERROR: Claude Code run threw an exception: $_"
    exit 1
}

Log "=== Run complete ==="
