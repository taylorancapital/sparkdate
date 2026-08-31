// tests/click-tracking-chain.test.js
//
// Covers followChain in scripts/verify-click-tracking.js — the redirect walker
// that decides whether email UTMs survive Resend's click tracker.
//
// This is the part of that script most able to be confidently wrong. It has
// already produced two false alarms of the same shape — reporting "UTM
// parameters did NOT survive", which reads as live attribution being broken,
// when the truth was that the script had not looked at a destination at all:
//
//   #368  a link that was never click-tracked, judged as a failure.
//   here  only the FIRST hop was read, so any chained tracker looked like a
//         dropped query string.
//
// And while fixing the second, the fix itself invented a third: body-sniffing
// for `location.href = "..."` matched sparkdate.date's webview-escape script —
// conditional code that had not run — and "followed" it to intent://. Hence
// the tracker-host confinement, which is what most of these tests pin.
//
// A local server is used rather than mocked fetch: the bugs above were all in
// how real HTTP behaves (relative Locations, 200-with-a-body, chains), which a
// mock would have been written to agree with.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { followChain } = require('../scripts/verify-click-tracking.js');

let base;
let server;
const quiet = () => {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url, base || 'http://localhost');
    const p = u.pathname;

    if (p === '/hop1') { res.writeHead(302, { location: `${base}/hop2?${u.searchParams}` }); return res.end(); }
    if (p === '/hop2') { res.writeHead(302, { location: `${base}/dest?${u.searchParams}` }); return res.end(); }
    if (p === '/dest') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>done</html>'); }

    // Relative Location, which new URL() cannot parse on its own.
    if (p === '/relative') { res.writeHead(302, { location: `/dest?${u.searchParams}` }); return res.end(); }

    // 200 whose body carries the forward.
    if (p === '/meta') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<meta http-equiv="refresh" content="0;url=${base}/dest?${u.searchParams}">`);
    }

    // A page containing conditional JS that must NOT be treated as a redirect.
    if (p === '/webview-escape') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<script>if (isWebview) { location.href = "intent://scan/#Intent;end"; }</script>');
    }

    if (p === '/loop') { res.writeHead(302, { location: `${base}/loop` }); return res.end(); }

    res.writeHead(404); return res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

const q = (u) => Object.fromEntries(new URL(u).searchParams);
const UTM = 'utm_source=email&utm_medium=nurture&utm_campaign=day5';

describe('followChain', () => {
  it('walks a multi-hop chain to the destination, not just the first hop', async () => {
    const out = await followChain(`${base}/hop1?${UTM}`, { trackerHost: '127.0.0.1', log: quiet });
    expect(out.error).toBeUndefined();
    expect(new URL(out.url).pathname).toBe('/dest');
  });

  it('carries every UTM through the whole chain', async () => {
    const out = await followChain(`${base}/hop1?${UTM}`, { trackerHost: '127.0.0.1', log: quiet });
    expect(q(out.url)).toEqual({
      utm_source: 'email', utm_medium: 'nurture', utm_campaign: 'day5',
    });
  });

  it('preserves a pre-existing query param alongside the UTMs', async () => {
    const out = await followChain(`${base}/hop1?tier=mid&${UTM}`, { trackerHost: '127.0.0.1', log: quiet });
    expect(q(out.url).tier).toBe('mid');
    expect(q(out.url).utm_campaign).toBe('day5');
  });

  it('resolves a relative Location instead of throwing on it', async () => {
    const out = await followChain(`${base}/relative?${UTM}`, { trackerHost: '127.0.0.1', log: quiet });
    expect(new URL(out.url).pathname).toBe('/dest');
    expect(q(out.url).utm_source).toBe('email');
  });

  it('follows a meta refresh served BY THE TRACKER', async () => {
    const out = await followChain(`${base}/meta?${UTM}`, { trackerHost: '127.0.0.1', log: quiet });
    expect(new URL(out.url).pathname).toBe('/dest');
  });

  it('does NOT follow a meta refresh on a non-tracker host', async () => {
    // Same page, but now the host is not the tracker: the body must be ignored
    // and the page treated as the destination.
    const out = await followChain(`${base}/meta?${UTM}`, { trackerHost: 'tracker.example', log: quiet });
    expect(new URL(out.url).pathname).toBe('/meta');
  });

  it('ignores conditional location.href in page JS — the intent:// trap', async () => {
    const out = await followChain(`${base}/webview-escape?${UTM}`, { trackerHost: 'tracker.example', log: quiet });
    expect(out.error).toBeUndefined();
    expect(out.url).not.toContain('intent://');
    expect(new URL(out.url).pathname).toBe('/webview-escape');
  });

  it('gives up on a redirect loop instead of hanging', async () => {
    const out = await followChain(`${base}/loop`, { trackerHost: '127.0.0.1', log: quiet });
    expect(out.error).toMatch(/still redirecting/);
  });

  it('reports a network error against the hop it happened on', async () => {
    const out = await followChain('http://127.0.0.1:1/nope', { trackerHost: '127.0.0.1', log: quiet });
    expect(out.error).toMatch(/network error on hop 1/);
  });
});
