// api/admin-sync.js
//
// "Sync now" for the admin dashboard's freshness strip.
//
// The strip already tells an admin that Meta spend is 9h stale or that an
// Eventbrite sale from this morning is not in any number on the page. Until
// now the only answer was to wait: Meta lands on a 4-hour cron, Eventbrite on
// a 6-hour one, and a "+3 unsynced" badge on the Events tab sits there in the
// meantime. This endpoint turns that reading into an action.
//
// IT DISPATCHES THE EXISTING WORKFLOWS; IT DOES NOT RE-IMPLEMENT THEM.
// .github/workflows/sync-eventbrite.yml and sync-ad-spend.yml already declare
// workflow_dispatch with an `execute` input -- they were built to be pressed.
// Running the sync logic here instead was the obvious alternative and is the
// wrong one on three counts:
//
//   1. scripts/sync-eventbrite.js and scripts/sync-meta-spend.js both call
//      main() at module load and then process.exit(). Importing either from a
//      serverless function runs it on require and kills the function; making
//      them importable means editing two scheduled, business-critical scripts
//      to add a second way of being invoked.
//   2. The Eventbrite sync enrolls attendees AND sends each of them a welcome
//      email. A partial run killed by a function duration cap is a set of
//      people half-enrolled. An Actions runner has six hours; Vercel gives
//      this route sixty seconds.
//   3. Dispatching reuses the exact path the schedule uses, including its
//      concurrency group -- so a hand-pressed sync and a scheduled one cannot
//      race, without a second lock being invented here.
//
// The cost is one credential (below) and that results arrive by polling rather
// than in the POST response. Both are cheap next to duplicating the syncs.
//
// GRACEFUL WHEN UNPROVISIONED, same as api/eventbrite-live.js: with no
// GITHUB_SYNC_TOKEN this answers { configured: false } and the dashboard
// renders the strip exactly as it does today, with no buttons. Merging before
// the secret exists is safe.
//
// PROVISIONING: GITHUB_SYNC_TOKEN must be a fine-grained personal access token
// scoped to this repository alone, with Repository permissions -> Actions:
// Read and write. That is the least privilege that can both start a workflow
// and read back whether it finished. Nothing here needs contents:write.
// GITHUB_SYNC_REPO and GITHUB_SYNC_REF override the defaults if the repo is
// ever renamed or the workflows move off main.

'use strict';

const { requireAdmin } = require('../lib/auth');

// Keyed by the name the dashboard sends. `inputs` mirrors each workflow's own
// declared inputs -- both are read in shell as [ "$EXECUTE" = "true" ], so
// these are the strings 'true'/'45', not booleans/numbers. `days` matches each
// workflow's documented default rather than inventing a third window.
const JOBS = {
  eventbrite: {
    file: 'sync-eventbrite.yml',
    label: 'Eventbrite',
    inputs: { days: '45', execute: 'true' },
  },
  meta: {
    file: 'sync-ad-spend.yml',
    label: 'Meta spend',
    inputs: { days: '30', execute: 'true' },
  },
};

const GH = 'https://api.github.com';
const REPO = process.env.GITHUB_SYNC_REPO || 'taylorancapital/sparkdate';
const REF = process.env.GITHUB_SYNC_REF || 'main';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sparkdate-admin-sync',
  };
}

/**
 * The most recent run of one workflow, or null if it has never run.
 *
 * Deliberately the newest run rather than a run id captured at dispatch:
 * workflow_dispatch returns 204 with no body and no id, so there is nothing to
 * capture. createdAt is returned so the client can tell a run it just started
 * from one that finished yesterday.
 */
async function latestRun(token, file) {
  const r = await fetch(
    `${GH}/repos/${REPO}/actions/workflows/${file}/runs?per_page=1`,
    { headers: ghHeaders(token), signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) return { error: `GitHub ${r.status}` };
  const data = await r.json();
  const run = data && Array.isArray(data.workflow_runs) ? data.workflow_runs[0] : null;
  if (!run) return null;
  return {
    // 'queued' | 'in_progress' | 'completed'
    status: run.status,
    // null until completed, then 'success' | 'failure' | 'cancelled' | ...
    conclusion: run.conclusion,
    runUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

const isRunning = (run) => !!run && (run.status === 'queued' || run.status === 'in_progress');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  // Admin-only, and load-bearing rather than decorative: POST starts a job
  // that writes to Firestore and emails newly-enrolled attendees. Same
  // Bearer-ID-token + requireAdmin pattern as eventbrite-live and the Enroll
  // tab.
  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const token = process.env.GITHUB_SYNC_TOKEN;
  if (!token) {
    // Not an error -- "feature not provisioned". The dashboard hides the
    // buttons and the freshness strip reads exactly as it did before.
    return res.status(200).json({ configured: false, jobs: {} });
  }

  // ── GET: what is each sync doing right now ──
  if (req.method === 'GET') {
    try {
      const names = Object.keys(JOBS);
      const runs = await Promise.all(names.map((n) => latestRun(token, JOBS[n].file)));
      const jobs = {};
      names.forEach((n, i) => { jobs[n] = { label: JOBS[n].label, run: runs[i] }; });
      return res.status(200).json({ configured: true, jobs });
    } catch (e) {
      return res.status(502).json({ error: `Could not read workflow status: ${e.message}` });
    }
  }

  // ── POST: start one ──
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = body.job;
  const job = JOBS[name];
  if (!job) {
    return res.status(400).json({ error: `Unknown job. Expected one of: ${Object.keys(JOBS).join(', ')}` });
  }

  try {
    // Refuse rather than queue. The workflow's concurrency group would hold a
    // second run safely, but an admin who clicks twice wants one sync and a
    // clear answer -- not a second one running ten minutes later against data
    // the first already fixed.
    const current = await latestRun(token, job.file);
    if (isRunning(current)) {
      return res.status(409).json({
        error: `${job.label} sync is already running.`,
        run: current,
      });
    }

    const r = await fetch(
      `${GH}/repos/${REPO}/actions/workflows/${job.file}/dispatches`,
      {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: REF, inputs: job.inputs }),
        signal: AbortSignal.timeout(8000),
      },
    );

    // 204 No Content is success for this endpoint. Anything else carries a
    // message worth relaying verbatim -- a 404 here almost always means the
    // token cannot see Actions on this repo, not that the workflow is missing.
    if (r.status !== 204) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({
        error: `GitHub refused the dispatch (${r.status}).`,
        detail: detail.slice(0, 400),
      });
    }

    // The run does not appear in the API instantly, so there is nothing
    // truthful to return about it yet. The client polls GET and treats a run
    // created at or after this moment as the one it started.
    return res.status(202).json({ ok: true, job: name, label: job.label, dispatchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: `Could not start the sync: ${e.message}` });
  }
};

// Exported for tests; not part of the HTTP surface.
module.exports.JOBS = JOBS;
module.exports.isRunning = isRunning;
