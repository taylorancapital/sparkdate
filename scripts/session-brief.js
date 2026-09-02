#!/usr/bin/env node
/**
 * scripts/session-brief.js
 *
 * Prints the state a NEW chat needs and cannot derive from CLAUDE.md: which
 * worktrees exist, which are corpses of already-merged work, what PRs are open,
 * and what HANDOFF.md says the last session was mid-way through.
 *
 * Written because the hand-maintained version of this list rotted within hours.
 * On 2026-08-30 HANDOFF.md claimed PRs #313 and #318 were open (#313 had
 * merged) and named three worktrees, none of which still existed, while missing
 * all four that did. Anything git or `gh` already knows must be DERIVED here,
 * never typed into a file. HANDOFF.md is for intent only.
 *
 * Designed to run from a SessionStart hook, so it fails soft and fast: no
 * dependency, every subprocess is timed out, and a missing or unauthenticated
 * `gh` degrades to "PR data unavailable" rather than blocking session start.
 *
 * Usage:
 *   node scripts/session-brief.js
 *   node scripts/session-brief.js --no-pr     # skip the gh call entirely
 *
 * Always exits 0. A session brief must never be the reason a session fails.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SKIP_PR = process.argv.includes('--no-pr');
const MAIN_COMMITS = 5;

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: opts.timeout || 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: opts.cwd || process.cwd(),
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

const git = (args, cwd) => run('git', args, { cwd });

// ---------------------------------------------------------------- repo layout

const topLevel = git(['rev-parse', '--show-toplevel']);
if (!topLevel) {
  console.log('session-brief: not a git repository, nothing to report.');
  process.exit(0);
}

// In a worktree, --git-common-dir points at the main checkout's .git
const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
const mainRepo = commonDir ? path.dirname(commonDir) : topLevel;
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
const inWorktree = path.resolve(topLevel) !== path.resolve(mainRepo);
// The unattended nightly runs in a dedicated clone that nobody shares. It is
// neither the main checkout nor a worktree, and the EnterWorktree nudge below
// would send it off the branch its launcher inspects. See CLAUDE.md.
const isNightlyClone = path.basename(topLevel) === 'sparkdate-nightly';

const out = [];
const say = (s = '') => out.push(s);

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
say(`== SparkDate session brief == ${stamp}`);
say(
  `cwd: ${isNightlyClone ? 'NIGHTLY CLONE' : inWorktree ? path.basename(topLevel) + ' (worktree)' : 'MAIN CHECKOUT'}` +
    `  branch: ${branch}`,
);
if (isNightlyClone) {
  say('!! Nightly clone, dedicated to run-nightly-claude-code.ps1. Do NOT call EnterWorktree; commit on the current branch and stop.');
} else if (!inWorktree) {
  say('!! You are in the main checkout. CLAUDE.md: call EnterWorktree before touching anything.');
}
say();

// ------------------------------------------------------------------- PR index

const prByBranch = new Map();
let prNote = null;
if (SKIP_PR) {
  prNote = 'skipped (--no-pr)';
} else {
  const raw = run(
    'gh',
    ['pr', 'list', '--state', 'all', '--limit', '60', '--json', 'number,state,headRefName,title'],
    { cwd: mainRepo, timeout: 9000 },
  );
  if (!raw) {
    prNote = 'unavailable (gh missing, unauthenticated, or offline)';
  } else {
    try {
      for (const pr of JSON.parse(raw)) prByBranch.set(pr.headRefName, pr);
    } catch {
      prNote = 'unavailable (could not parse gh output)';
    }
  }
}

// ------------------------------------------------------------------ worktrees

const wtRaw = git(['worktree', 'list', '--porcelain'], mainRepo) || '';
const worktrees = [];
for (const block of wtRaw.split('\n\n')) {
  const dir = /^worktree (.+)$/m.exec(block)?.[1];
  const br = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
  if (!dir || path.resolve(dir) === path.resolve(mainRepo)) continue;
  worktrees.push({ dir, branch: br || '(detached)', name: path.basename(dir) });
}

// Squash-merge detection. A session names its worktree `worktree-foo` but
// pushes the PR from `claude/foo`, so branch names alone miss half the matches
// (they missed #354 and #355 the first time this ran). What IS reliable: main's
// squash commit subject is the PR title plus " (#N)", and the worktree still
// holds the commit that title came from. Match on the subject.
const mergedSubjects = new Map();
for (const line of (git(['log', '--format=%s', '-300', 'origin/main'], mainRepo) || '').split('\n')) {
  const m = /^(.*) \(#(\d+)\)$/.exec(line.trim());
  if (m) mergedSubjects.set(m[1], m[2]);
}

function findPr(wt) {
  const stripped = wt.branch.replace(/^worktree-/, '');
  for (const cand of [wt.branch, `claude/${stripped}`, stripped]) {
    if (prByBranch.has(cand)) return prByBranch.get(cand);
  }
  const subjects = (git(['log', '--format=%s', '-20', 'origin/main..HEAD'], wt.dir) || '').split('\n');
  for (const s of subjects) {
    const num = mergedSubjects.get(s.trim());
    if (num) return { number: num, state: 'MERGED', bySubject: true };
  }
  return null;
}

say(`WORKTREES (${worktrees.length})`);
if (!worktrees.length) say('  none');

for (const wt of worktrees) {
  const isSelf = path.resolve(wt.dir) === path.resolve(topLevel);
  const dirty = (git(['status', '--porcelain'], wt.dir) || '').split('\n').filter(Boolean).length;
  const ahead = git(['rev-list', '--count', 'origin/main..HEAD'], wt.dir);
  const pr = findPr(wt);
  const merged = git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], wt.dir) !== null;

  let verdict;
  if (Number(ahead) === 0) verdict = 'fresh, no commits of its own';
  else if (pr && pr.state === 'MERGED') verdict = `PR #${pr.number} MERGED -- safe to ExitWorktree remove`;
  else if (merged) verdict = 'merged into origin/main -- safe to ExitWorktree remove';
  else if (pr && pr.state === 'OPEN') verdict = `PR #${pr.number} OPEN`;
  else if (pr && pr.state === 'CLOSED') verdict = `PR #${pr.number} CLOSED without merging`;
  else verdict = 'unmerged commits, NO PR -- work in flight';

  const flags = [];
  if (Number(ahead) > 0) flags.push(`+${ahead} commit${ahead === '1' ? '' : 's'}`);
  if (dirty && isSelf) flags.push(`${dirty} uncommitted (this session)`);
  else if (dirty) flags.push(`${dirty} uncommitted -- may be a LIVE session, leave alone`);

  say(`  ${wt.name.padEnd(26)} ${verdict}`);
  say(`  ${''.padEnd(26)} ${flags.length ? flags.join(', ') : 'clean'}  [${wt.branch}]`);

  // A handoff edited but not yet merged is invisible to every other session.
  if (git(['status', '--porcelain', 'HANDOFF.md'], wt.dir)) {
    say(`  ${''.padEnd(26)} ** uncommitted HANDOFF.md here -- read it before trusting the one below **`);
  }
}
say();

// -------------------------------------------------------------------- open PRs

if (prNote) {
  say(`OPEN PRS: ${prNote}`);
} else {
  const open = [...prByBranch.values()].filter((p) => p.state === 'OPEN');
  say(`OPEN PRS (${open.length})`);
  if (!open.length) say('  none');
  for (const p of open) say(`  #${p.number}  ${p.title}  [${p.headRefName}]`);
}
say();

// ----------------------------------------------------------------- recent main

git(['fetch', '--quiet', 'origin', 'main'], mainRepo);
const log = git(['log', '--oneline', `-${MAIN_COMMITS}`, 'origin/main'], mainRepo);
say(`RECENT origin/main (${MAIN_COMMITS})`);
for (const line of (log || '  unavailable').split('\n')) say(`  ${line}`);
say();

// --------------------------------------------------------------------- stashes

const stashes = (git(['stash', 'list'], mainRepo) || '').split('\n').filter(Boolean);
if (stashes.length) {
  say(`STASHES (${stashes.length}) -- pre-existing, do not drop without asking`);
  for (const s of stashes) say(`  ${s}`);
  say();
}

// --------------------------------------------------------------------- handoff

const handoff = path.join(topLevel, 'HANDOFF.md');
say('HANDOFF.md -- what the last session was mid-way through');
if (fs.existsSync(handoff)) {
  for (const line of fs.readFileSync(handoff, 'utf8').trimEnd().split('\n')) say(`  ${line}`);
} else {
  say('  (missing -- if this worktree is fresh from origin/main, it was never merged)');
}

console.log(out.join('\n'));
