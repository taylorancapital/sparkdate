# review-nightly-reports.ps1
#
# Verifies report-only PRs (nightly GA4/Meta analyses, Search Console reviews, etc.)
# against this repo's actual source and git history, and posts findings as a PR
# comment -- so a report's claims about the codebase get fact-checked before anyone
# trusts them, not just its claims about the exported data.
#
# Scheduled to run separately from -- and later than -- run-nightly-claude-code.ps1.
# That script runs early (~3:30 AM) to stage the Meta CSV before the Cowork nightly
# task reads it; this one needs to run AFTER that task has actually opened its report
# PR, which happens at a less predictable time. Recommended: mid-morning (e.g. 9 AM),
# adjust based on how consistently the nightly PR has landed by then.
#
# Safe to run more than once, or on a day with no new report PR -- the review prompt
# itself checks each candidate PR for an existing review comment before acting, so a
# re-run just finds nothing new to do and exits quietly.

$ErrorActionPreference = "Stop"

# See run-nightly-claude-code.ps1 for why this is needed: Windows PowerShell 5.1
# decodes a child process's console output using the active codepage, not UTF-8,
# regardless of capture method.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoPath    = "C:\Users\penns\source\repos\sparkdate"
$NightTasks  = Join-Path $RepoPath "Business Plan\files\Night Tasks"
$PromptFile  = Join-Path $NightTasks "REVIEW_PROMPT.md"
$LogDir      = Join-Path $NightTasks "logs"
$Today       = Get-Date -Format "yyyy-MM-dd"
$LogFile     = Join-Path $LogDir "review-$Today.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LogFile -Value $line -Encoding Unicode
    Write-Host $line
}

# Same fix as run-nightly-claude-code.ps1: capture through PowerShell's own string
# layer (not *>> redirection), and unwrap the ErrorRecord objects 2>&1 wraps
# stderr lines in.
function Write-ProcessOutputToLog($output) {
    foreach ($item in $output) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            Add-Content -Path $LogFile -Value $item.Exception.Message -Encoding Unicode
        } else {
            Add-Content -Path $LogFile -Value $item.ToString() -Encoding Unicode
        }
    }
}

# ── Resolve the Claude Code CLI ───────────────────────────────────────
# This used to call a bare `claude`, which produced a raw CommandNotFoundException
# when the CLI wasn't on PATH -- and it wasn't: the CLI had never been installed on
# this machine, so every run of this task failed at invocation with an error that
# didn't say what was actually wrong. Task Scheduler's environment is also narrower
# than an interactive shell, so "it works when I type it" does not imply "it works
# at 9 AM"; resolving explicitly and failing with instructions beats either.
#
# Deliberately duplicated in run-nightly-claude-code.ps1 rather than dot-sourced
# from a shared file: these are two independently-scheduled scripts, and a shared
# include would add a path-resolution failure mode that breaks BOTH when it breaks.
# Same reasoning as this repo's no-shared-bundle convention on the web side.
function Resolve-ClaudeCli {
    # 1. Explicit override wins -- lets you pin a version or an odd install path
    #    without editing this script.
    if ($env:CLAUDE_CLI) {
        if (Test-Path $env:CLAUDE_CLI) { return $env:CLAUDE_CLI }
        Log "WARN: CLAUDE_CLI is set to '$($env:CLAUDE_CLI)' but nothing exists there -- ignoring it."
    }
    # 2. Whatever PATH this process actually has.
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    # 3. npm's global prefix -- where `npm install -g` lands on Windows. Checked
    #    explicitly because the npm global bin is frequently absent from the PATH
    #    a scheduled task inherits, even when it's present interactively.
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

Log "=== Nightly report-PR review starting ==="

$ClaudeCli = Resolve-ClaudeCli
if (-not $ClaudeCli) {
    Log "ERROR: Claude Code CLI not found -- this task cannot run."
    Log "  Checked: CLAUDE_CLI override, PATH, and the npm global prefix."
    Log "  Fix: npm install -g @anthropic-ai/claude-code"
    Log "  ...or set the CLAUDE_CLI environment variable to the executable's full path."
    exit 1
}
Log "Using Claude CLI: $ClaudeCli"

if (-not (Test-Path $PromptFile)) {
    Log "ERROR: REVIEW_PROMPT.md not found at '$PromptFile'. Nothing to run."
    exit 1
}

Set-Location $RepoPath

$reviewPrompt = "Read and follow the instructions in the file 'Business Plan\files\Night Tasks\REVIEW_PROMPT.md' exactly as written. There is no one here to approve actions before they happen -- if anything is ambiguous or a PR doesn't clearly meet the scope described there, skip it rather than guess."

# Why both flags, and why the prompt comes FIRST:
#
#   --dangerously-skip-permissions stays because nobody is here to approve tool
#   calls; without it the run just hangs (same reason run-nightly-claude-code.ps1
#   uses it). But it does NOT restrict anything -- it only suppresses prompts, so
#   on its own the orchestrating Claude keeps full Edit/Write access and the only
#   thing stopping it editing the site is the wording of REVIEW_PROMPT.md.
#
#   --disallowedTools is what actually closes that. A BARE tool name removes the
#   tool from Claude's context entirely, which is a hard removal rather than a
#   permission gate -- so it still applies under skip-permissions. That makes the
#   orchestrator match the pr-reviewer subagent, which is already hard-gated by
#   simply not being granted Edit/Write in its frontmatter.
#
#   Note --allowedTools would NOT work here: skip-permissions takes precedence
#   over it (no prompts occur, so an allowlist gates nothing). Deny, not allow,
#   is the mechanism that bites.
#
#   The scoped Bash(...) rules are defence in depth: Bash necessarily stays
#   available for the gh calls, and Bash can still write files by other means, so
#   these block the specific commands that would ship or merge something. The
#   bare-name removals above are the guaranteed part; treat these as a backstop.
#
#   The prompt is passed BEFORE the flags because --disallowedTools is variadic
#   (space-separated) -- a positional argument after it would be swallowed into
#   the tool list.
$disallow = @(
    'Edit', 'Write', 'NotebookEdit',
    'Bash(git commit *)', 'Bash(git push *)',
    'Bash(gh pr merge *)', 'Bash(gh pr close *)', 'Bash(gh pr review *)'
)

try {
    $claudeOutput = & $ClaudeCli --print "$reviewPrompt" --dangerously-skip-permissions --disallowedTools @disallow 2>&1
    Write-ProcessOutputToLog $claudeOutput

    # Being installed is not the same as being usable: a fresh `npm install -g`
    # leaves the CLI unauthenticated, and it then exits 1 with "Not logged in ·
    # Please run /login". That reads as a generic failure in a log, so name it.
    if ($claudeOutput -match 'Not logged in|Please run /login') {
        Log "ERROR: the Claude Code CLI is installed but NOT AUTHENTICATED."
        Log "  Fix: run 'claude' in an interactive terminal and complete /login."
        Log "  Credentials are per-Windows-user and this task runs as '$env:USERNAME',"
        Log "  so log in while signed in as that same user or it won't see them."
        exit 1
    }

    Log "Review run finished (exit code $LASTEXITCODE)."
} catch {
    # A missing CLI can no longer reach here -- Resolve-ClaudeCli exits above with
    # actionable instructions -- so anything caught now is a genuine runtime fault.
    Log "ERROR: review run threw an exception: $_"
    exit 1
}

Log "=== Run complete ==="
