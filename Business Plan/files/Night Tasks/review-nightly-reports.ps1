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

Log "=== Nightly report-PR review starting ==="

if (-not (Test-Path $PromptFile)) {
    Log "ERROR: REVIEW_PROMPT.md not found at '$PromptFile'. Nothing to run."
    exit 1
}

Set-Location $RepoPath

$reviewPrompt = "Read and follow the instructions in the file 'Business Plan\files\Night Tasks\REVIEW_PROMPT.md' exactly as written. There is no one here to approve actions before they happen -- if anything is ambiguous or a PR doesn't clearly meet the scope described there, skip it rather than guess."

try {
    $claudeOutput = claude --print --dangerously-skip-permissions "$reviewPrompt" 2>&1
    Write-ProcessOutputToLog $claudeOutput
    Log "Review run finished (exit code $LASTEXITCODE)."
} catch {
    Log "ERROR: review run threw an exception: $_"
    exit 1
}

Log "=== Run complete ==="
