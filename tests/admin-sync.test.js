// tests/admin-sync.test.js
//
// The dashboard's "Sync now" buttons do not contain the sync — they dispatch
// .github/workflows/sync-eventbrite.yml and sync-ad-spend.yml. That indirection
// is the right design (see the header of api/admin-sync.js) and it buys one
// specific failure mode: the endpoint and the workflow can drift apart with
// nothing to catch it.
//
// Both workflows decide whether to WRITE by comparing an input in shell:
//
//     if [ "$EXECUTE" = "true" ] ...
//
// so an `execute` sent as a JSON boolean, or renamed, or dropped, does not
// error — the workflow runs green as a DRY RUN and the dashboard reports a
// successful sync that enrolled nobody. A renamed workflow file is louder (404
// on dispatch) but equally invisible until someone presses the button.
//
// So the first half of this file cross-checks the endpoint against the YAML it
// dispatches, the way tests/view-promotion.test.js cross-checks pages against
// each other. The second half covers the handler's own decisions.

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

// The handler requires ../lib/auth, which initialises firebase-admin with real
// service-account credentials at module load — importing it here fails before
// a single assertion runs. So it is loaded in a vm with require() stubbed, the
// same way tests/testimonial-rotator.test.js runs shipped browser code: this
// executes the ACTUAL api/admin-sync.js, just with its two ambient
// dependencies (auth, fetch) supplied.
//
// Loading per test rather than once also keeps env and fetch stubs from
// leaking between cases.
const SRC = fs.readFileSync(path.join(process.cwd(), 'api', 'admin-sync.js'), 'utf8');

function loadHandler({ env = {}, requireAdmin, fetchImpl } = {}) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (id === '../lib/auth') return { requireAdmin };
      throw new Error(`unexpected require(${id}) — the handler grew a dependency this test does not stub`);
    },
    process: { env },
    fetch: fetchImpl,
    // The real one is only used to bound GitHub calls; the stub fetches
    // resolve immediately, so a token that is never read is correct here.
    AbortSignal: { timeout: () => undefined },
    console,
  };
  vm.runInNewContext(SRC, sandbox);
  return mod.exports;
}

const okAdmin = async () => ({ uid: 'admin1', admin: true });
const { JOBS, isRunning } = loadHandler({ requireAdmin: okAdmin });

const WORKFLOWS = path.join(process.cwd(), '.github', 'workflows');
const yaml = (f) => fs.readFileSync(path.join(WORKFLOWS, f), 'utf8');

/** Input names declared under a workflow's workflow_dispatch block. */
function declaredInputs(src) {
  const block = src.match(/workflow_dispatch:\s*\n\s*inputs:\s*\n([\s\S]*?)(?=\n[a-z_]+:\s*\n|\n[a-z_]+:\s*$)/);
  if (!block) return [];
  // Input names sit one indent level under `inputs:`; nested keys
  // (description/default/type) sit deeper, so key off the shallowest indent.
  const lines = block[1].split('\n').filter((l) => /^\s+\S/.test(l));
  if (!lines.length) return [];
  const base = Math.min(...lines.map((l) => l.match(/^\s*/)[0].length));
  return lines
    .filter((l) => l.match(/^\s*/)[0].length === base)
    .map((l) => (l.trim().match(/^([A-Za-z0-9_-]+):/) || [])[1])
    .filter(Boolean);
}

function mkRes() {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('admin-sync ↔ workflow contract', () => {
  it('knows about both syncs', () => {
    expect(Object.keys(JOBS).sort()).toEqual(['eventbrite', 'meta']);
  });

  describe.each(Object.entries(JOBS))('%s', (name, job) => {
    it('dispatches a workflow file that exists', () => {
      expect(fs.existsSync(path.join(WORKFLOWS, job.file))).toBe(true);
    });

    it('is dispatchable at all', () => {
      // No workflow_dispatch trigger means every button press is a 422.
      expect(yaml(job.file)).toMatch(/workflow_dispatch:/);
    });

    it('sends only inputs the workflow declares', () => {
      const declared = declaredInputs(yaml(job.file));
      expect(declared.length).toBeGreaterThan(0);
      for (const key of Object.keys(job.inputs)) expect(declared).toContain(key);
    });

    it("sends execute as the string 'true', because the workflow tests it in shell", () => {
      // The failure this pins is silent: a boolean true stringifies to
      // something [ "$EXECUTE" = "true" ] still matches, but a JSON `true`
      // sent where GitHub expects a string input is rejected for
      // type: boolean inputs and coerced elsewhere. Pinning the literal keeps
      // the dashboard's "sync" from quietly becoming a dry run.
      expect(job.inputs.execute).toBe('true');
      expect(yaml(job.file)).toContain('"true"');
    });
  });

  it('the dashboard asks for exactly the jobs the endpoint serves', () => {
    // Drift the other way: a button wired to a job name the API rejects.
    const adminHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');
    const block = adminHtml.match(/const SYNC_JOBS = \{([\s\S]*?)\n {8}\};/);
    expect(block).toBeTruthy();
    const uiJobs = [...block[1].matchAll(/^\s{12}([a-z]+):\s*\{/gm)].map((m) => m[1]);
    expect(uiJobs.sort()).toEqual(Object.keys(JOBS).sort());
  });

  it('renders no sync button until the endpoint confirms it is provisioned', () => {
    // The graceful-when-unprovisioned promise, asserted in the UI as well as
    // the API: without this guard the strip would show buttons that 200 with
    // configured:false and do nothing.
    const adminHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');
    expect(adminHtml).toMatch(/const syncBtn = \(job\) => \{\s*\n\s*(\/\/[^\n]*\n\s*)*if \(!syncConfigured\) return '';/);
  });
});

describe('admin-sync handler', () => {
  const TOKEN_ENV = { GITHUB_SYNC_TOKEN: 'ghp_test', GITHUB_SYNC_REPO: 'o/r' };

  it('rejects a non-admin before touching GitHub', async () => {
    const fetchImpl = vi.fn();
    const handler = loadHandler({
      env: TOKEN_ENV,
      fetchImpl,
      requireAdmin: async () => {
        const e = new Error('Admin privileges required');
        e.statusCode = 403;
        throw e;
      },
    });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { job: 'meta' } }, res);
    expect(res.statusCode).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports "not provisioned" rather than failing when the token is absent', async () => {
    const handler = loadHandler({ env: {}, requireAdmin: okAdmin, fetchImpl: vi.fn() });
    const res = mkRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ configured: false, jobs: {} });
  });

  it('refuses an unknown job name', async () => {
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl: vi.fn() });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { job: 'payroll' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('dispatches with the workflow ref and inputs, and reports 202', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url: String(url), opts });
      if (String(url).includes('/runs?')) {
        return { ok: true, json: async () => ({ workflow_runs: [{ status: 'completed', conclusion: 'success', created_at: '2020-01-01T00:00:00Z' }] }) };
      }
      return { status: 204, ok: true, text: async () => '' };
    };
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { job: 'eventbrite' } }, res);

    expect(res.statusCode).toBe(202);
    const dispatch = calls.find((c) => c.url.endsWith('/dispatches'));
    expect(dispatch.url).toBe('https://api.github.com/repos/o/r/actions/workflows/sync-eventbrite.yml/dispatches');
    const sent = JSON.parse(dispatch.opts.body);
    expect(sent.ref).toBe('main');
    expect(sent.inputs.execute).toBe('true');
  });

  it('accepts a JSON string body, the shape Vercel hands raw POSTs', async () => {
    const fetchImpl = async (url) =>
      String(url).includes('/runs?')
        ? { ok: true, json: async () => ({ workflow_runs: [] }) }
        : { status: 204, ok: true, text: async () => '' };
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: '{"job":"meta"}' }, res);
    expect(res.statusCode).toBe(202);
  });

  it('refuses to start a second run while one is in flight', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('/runs?')) {
        return { ok: true, json: async () => ({ workflow_runs: [{ status: 'in_progress', conclusion: null, created_at: '2020-01-01T00:00:00Z', html_url: 'u' }] }) };
      }
      throw new Error('should not dispatch while a run is in flight');
    };
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { job: 'meta' } }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.run.status).toBe('in_progress');
  });

  it('relays a refused dispatch instead of reporting success', async () => {
    // A 404 here is the shape a mis-scoped token takes. Reporting it as a
    // started sync would leave the admin waiting on a run that never exists.
    const fetchImpl = async (url) =>
      String(url).includes('/runs?')
        ? { ok: true, json: async () => ({ workflow_runs: [] }) }
        : { status: 404, ok: false, text: async () => 'Not Found' };
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl });
    const res = mkRes();
    await handler({ method: 'POST', headers: {}, body: { job: 'meta' } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/404/);
  });

  it('returns both jobs status on GET', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ workflow_runs: [{ status: 'completed', conclusion: 'success', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:05:00Z', html_url: 'https://gh/run/1' }] }),
    });
    const handler = loadHandler({ env: TOKEN_ENV, requireAdmin: okAdmin, fetchImpl });
    const res = mkRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(Object.keys(res.body.jobs).sort()).toEqual(['eventbrite', 'meta']);
    expect(res.body.jobs.meta.run.runUrl).toBe('https://gh/run/1');
  });

  it('treats queued and in_progress as running, completed as not', () => {
    expect(isRunning({ status: 'queued' })).toBe(true);
    expect(isRunning({ status: 'in_progress' })).toBe(true);
    expect(isRunning({ status: 'completed' })).toBe(false);
    expect(isRunning(null)).toBe(false);
  });
});
