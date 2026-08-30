// tests/eventbrite-retry.test.js
//
// On 2026-08-30 the Eventbrite sync was dispatched three times inside 35
// minutes. The middle run died:
//
//   x Eventbrite 403 on /users/me/organizations/: <!DOCTYPE HTML ...
//
// The body is the tell. Eventbrite answers API errors with JSON; an HTML error
// page is an edge/WAF response — rate limiting wearing a permission error's
// status code. The run four minutes later succeeded on the same token and
// reported 44 already enrolled, so nothing was actually wrong.
//
// Two things made a one-second blip fatal to the whole sync:
//
//   1. Neither eb() nor ebGetAll retried anything.
//   2. /users/me/organizations/ is fetched in the SETUP phase, upstream of the
//      per-event try/catch that already isolates a bad event. So the blip
//      landed in the one region of that script with no error containment.
//
// #348 raised the stakes: syncing went from "wait for a 6-hour cron" to
// "press a button", and pressing buttons is how you generate the request
// bursts that trip an edge in the first place.
//
// These tests pin the retry policy — including which statuses must NOT be
// retried, because retrying a revoked token is just a slower failure.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ebFetch, ebGetAll, RETRYABLE } from '../lib/eventbrite.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** A fetch stub that replays a queued list of outcomes, recording attempts. */
function stubFetch(outcomes) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url) => {
    calls.push(String(url));
    const next = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (h) => (next.headers || {})[h.toLowerCase()] ?? null },
      text: async () => next.body || '',
      json: async () => next.json || {},
    };
  });
  return calls;
}

// retryBaseMs: 0 everywhere below — the backoff schedule is not what these
// assert, and real sleeps would make the suite crawl.
const fast = { retryBaseMs: 0, label: '/test' };

describe('ebFetch retry policy', () => {
  it('returns the first response when it succeeds', async () => {
    const calls = stubFetch([{ status: 200 }]);
    const r = await ebFetch('https://x/?token=s', fast);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('retries the HTML 403 that broke the sync, and succeeds', async () => {
    const calls = stubFetch([
      { status: 403, body: '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><TITLE>ERROR' },
      { status: 200 },
    ]);
    const r = await ebFetch('https://x/?token=s', fast);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it.each([...RETRYABLE])('retries status %i', async (status) => {
    const calls = stubFetch([{ status }, { status: 200 }]);
    await ebFetch('https://x/?token=s', fast);
    expect(calls).toHaveLength(2);
  });

  it.each([400, 401, 404, 422])('does NOT retry status %i', async (status) => {
    // These are answers, not weather. Retrying a revoked token three times is
    // a slower failure and more load on an endpoint that may already be
    // rate-limiting us.
    const calls = stubFetch([{ status, body: '{"error":"NOT_AUTHORIZED"}' }]);
    await expect(ebFetch('https://x/?token=s', fast)).rejects.toThrow(String(status));
    expect(calls).toHaveLength(1);
  });

  it('retries a network failure or an aborted timeout', async () => {
    const calls = stubFetch([new Error('The operation was aborted due to timeout'), { status: 200 }]);
    await ebFetch('https://x/?token=s', fast);
    expect(calls).toHaveLength(2);
  });

  it('gives up after the configured number of RETRIES, not attempts', async () => {
    const calls = stubFetch([{ status: 503, body: 'nope' }]);
    await expect(ebFetch('https://x/?token=s', { ...fast, retries: 2 })).rejects.toThrow('503');
    expect(calls).toHaveLength(3); // 1 initial + 2 retries
  });

  it('can be told not to retry at all', async () => {
    // The budget api/eventbrite-live.js relies on: it has 30s for the whole
    // route and already stacks 8s timeouts.
    const calls = stubFetch([{ status: 429 }]);
    await expect(ebFetch('https://x/?token=s', { ...fast, retries: 0 })).rejects.toThrow('429');
    expect(calls).toHaveLength(1);
  });

  it('never puts the token in the error message', async () => {
    // Every Eventbrite URL carries token=<secret> in its query string, and an
    // error string is the thing most likely to reach a log or a screenshot.
    stubFetch([{ status: 404, body: 'gone' }]);
    const err = await ebFetch('https://x/events/?token=SUPERSECRET', { ...fast, label: '/events/' })
      .catch((e) => e);
    expect(err.message).not.toContain('SUPERSECRET');
    expect(err.message).toContain('/events/');
  });

  it('surfaces the response body, so an HTML 403 stays diagnosable', async () => {
    // The HTML-vs-JSON distinction is the whole diagnosis. Retrying must not
    // swallow it when the retries are exhausted.
    stubFetch([{ status: 403, body: '<!DOCTYPE HTML><TITLE>ERROR' }]);
    const err = await ebFetch('https://x/?token=s', { ...fast, retries: 1 }).catch((e) => e);
    expect(err.message).toContain('<!DOCTYPE HTML');
    expect(err.status).toBe(403);
  });

  it('honours Retry-After but caps it, so a long one cannot park a request', async () => {
    const slept = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => { slept.push(ms); fn(); return 0; });
    stubFetch([{ status: 429, headers: { 'retry-after': '3600' } }, { status: 200 }]);
    await ebFetch('https://x/?token=s', { label: '/t', retryBaseMs: 500 });
    expect(slept[0]).toBe(10000); // 3600s capped to 10s, not honoured literally
    vi.restoreAllMocks();
  });
});

describe('ebGetAll', () => {
  it('follows continuation tokens and concatenates pages', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      const more = call === 1;
      return {
        ok: true, status: 200,
        headers: { get: () => null },
        text: async () => '',
        json: async () => ({
          attendees: [{ id: call }],
          pagination: { has_more_items: more, continuation: more ? 'tok' : null },
        }),
      };
    });
    const out = await ebGetAll('/events/1/attendees/', 'attendees', 'S', { retryBaseMs: 0 });
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('applies the retry policy to each page', async () => {
    const calls = stubFetch([
      { status: 503 },
      { status: 200, json: { attendees: [{ id: 1 }], pagination: { has_more_items: false } } },
    ]);
    const out = await ebGetAll('/events/1/attendees/', 'attendees', 'S', { retryBaseMs: 0 });
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});
