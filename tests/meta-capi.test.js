// tests/meta-capi.test.js
//
// Coverage for lib/meta-capi.js — the server-side half of Meta attribution.
// A regression here either silently stops reporting real leads/purchases to
// Meta again (same failure mode this file exists to fix) or, worse, breaks
// a signup/webhook because a Meta API hiccup wasn't actually fail-soft.
//
// Two things are worth being extra careful about, both called out in the
// review that shaped this implementation:
//   - email/phone MUST be SHA-256 hashed; ip/userAgent MUST NOT be (Meta's
//     spec sends those two as plaintext — hashing them silently breaks
//     IP/UA matching instead of erroring).
//   - event_id must round-trip untouched — it's the value the paired
//     client-side fbq eventID has to match exactly for Meta to dedupe.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { sendMetaEvent, hashPii, buildUserData } from '../lib/meta-capi.js';

const origToken = process.env.META_CAPI_ACCESS_TOKEN;
const origPixelId = process.env.META_PIXEL_ID;

function restoreEnv() {
  if (origToken === undefined) delete process.env.META_CAPI_ACCESS_TOKEN;
  else process.env.META_CAPI_ACCESS_TOKEN = origToken;
  if (origPixelId === undefined) delete process.env.META_PIXEL_ID;
  else process.env.META_PIXEL_ID = origPixelId;
}

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hashPii', () => {
  it('lowercases, trims, and SHA-256 hashes', () => {
    const expected = crypto.createHash('sha256').update('person@example.com').digest('hex');
    expect(hashPii('  Person@Example.com  ')).toBe(expected);
  });

  it('returns null for empty/missing input', () => {
    expect(hashPii('')).toBeNull();
    expect(hashPii(null)).toBeNull();
    expect(hashPii(undefined)).toBeNull();
  });
});

describe('buildUserData', () => {
  it('hashes email into em', () => {
    const ud = buildUserData({ email: 'Person@Example.com' });
    expect(ud.em).toEqual([hashPii('person@example.com')]);
  });

  it('strips non-digits from phone before hashing into ph', () => {
    const ud = buildUserData({ phone: '(717) 555-0142' });
    expect(ud.ph).toEqual([hashPii('7175550142')]);
  });

  it('sends client_ip_address and client_user_agent as PLAINTEXT — never hashed', () => {
    // This is the exact mistake the original prompt asked for (SHA-256 IP/UA)
    // and would silently break Meta's IP/UA matching if reintroduced.
    const ud = buildUserData({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' });
    expect(ud.client_ip_address).toBe('203.0.113.7');
    expect(ud.client_user_agent).toBe('Mozilla/5.0 Test');
    expect(JSON.stringify(ud)).not.toContain(
      crypto.createHash('sha256').update('203.0.113.7').digest('hex')
    );
  });

  it('omits fields that were never provided (no empty-hash placeholders)', () => {
    const ud = buildUserData({ email: 'only@email.com' });
    expect(ud.ph).toBeUndefined();
    expect(ud.client_ip_address).toBeUndefined();
    expect(ud.client_user_agent).toBeUndefined();
  });
});

describe('sendMetaEvent', () => {
  beforeEach(() => {
    process.env.META_CAPI_ACCESS_TOKEN = 'test-token';
    process.env.META_PIXEL_ID = 'test-pixel-id';
  });

  it('posts the correct payload shape to the Graph API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaEvent({
      eventName: 'Lead',
      eventId: 'lead_abc123',
      userData: { email: 'buyer@example.com' },
      customData: { content_name: 'newsletter' },
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('graph.facebook.com');
    expect(url).toContain('test-pixel-id');
    expect(url).toContain('access_token=test-token');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    const event = body.data[0];
    expect(event.event_name).toBe('Lead');
    expect(event.event_id).toBe('lead_abc123');
    expect(event.action_source).toBe('website');
    expect(typeof event.event_time).toBe('number');
    expect(event.user_data.em).toEqual([hashPii('buyer@example.com')]);
    expect(event.custom_data).toEqual({ content_name: 'newsletter' });
  });

  it('round-trips eventId untouched — required for client/server pixel dedup', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const paymentIntentId = 'pi_3PQRxyzABC123';
    await sendMetaEvent({
      eventName: 'Purchase',
      eventId: paymentIntentId,
      userData: { email: 'buyer@example.com' },
      customData: { value: 45, currency: 'USD' },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.data[0].event_id).toBe(paymentIntentId);
  });

  it('skips without throwing when META_CAPI_ACCESS_TOKEN is not set', async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaEvent({ eventName: 'Lead', eventId: 'x' });

    expect(result).toEqual({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails soft (never throws) when the Graph API returns an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid parameter' } }),
    }));

    const result = await sendMetaEvent({ eventName: 'Lead', eventId: 'x' });
    expect(result.ok).toBe(false);
  });

  it('fails soft (never throws) on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      sendMetaEvent({ eventName: 'Lead', eventId: 'x' })
    ).resolves.toEqual(expect.objectContaining({ ok: false }));
  });

  it('fails soft (never throws) on a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, reject) => {
      // Never resolves on its own — sendMetaEvent's own AbortController
      // must be the thing that cuts this off, not this test.
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      setTimeout(() => reject(err), 10);
    })));

    const result = await sendMetaEvent({ eventName: 'Lead', eventId: 'x' });
    expect(result.ok).toBe(false);
  }, 10000);

  it('rejects a call missing eventName or eventId rather than sending a malformed event', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaEvent({ eventName: 'Lead' /* no eventId */ });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('advanced matching fields', () => {
  // Meta's account diagnostics flagged this pixel for low event match
  // quality. The Purchase path is the worst case: stripe-webhook runs on
  // Stripe's servers, so it has no IP and no user agent, and before this it
  // matched on a hashed email alone.

  it('sends fbp and fbc in PLAINTEXT', () => {
    // These are Meta's own cookies, not PII. Hashing them does not error --
    // it silently destroys the match, exactly the trap the existing note on
    // hashPii describes for client_ip_address.
    const u = buildUserData({ fbp: 'fb.1.1700000000.123456789', fbc: 'fb.1.1700000000.IwAR0abc' });
    expect(u.fbp).toBe('fb.1.1700000000.123456789');
    expect(u.fbc).toBe('fb.1.1700000000.IwAR0abc');
  });

  it('hashes external_id, because the browser pixel hashes the same uid', () => {
    // If the two sides disagree about hashing, Meta sees two different people
    // and the match is worse than sending nothing at all.
    const u = buildUserData({ externalId: 'firebase_uid_abc123' });
    expect(u.external_id[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(u.external_id[0]).toBe(hashPii('firebase_uid_abc123'));
  });

  it('normalises external_id the same way it normalises email', () => {
    // hashPii lowercases and trims. A uid captured with different casing on
    // one side would otherwise never match.
    expect(buildUserData({ externalId: '  ABC123  ' }).external_id[0])
      .toBe(buildUserData({ externalId: 'abc123' }).external_id[0]);
  });

  it('omits every new field when it is absent', () => {
    // Sending fbp: undefined or external_id: [null] is worse than omitting
    // them -- Meta counts a present-but-empty field against match quality.
    const u = buildUserData({ email: 'a@b.com' });
    expect(u).not.toHaveProperty('fbp');
    expect(u).not.toHaveProperty('fbc');
    expect(u).not.toHaveProperty('external_id');
  });

  it('still works with nothing at all, so a caller can pass partial data', () => {
    expect(buildUserData()).toEqual({});
    expect(buildUserData({})).toEqual({});
  });

  it('keeps the existing email and phone behaviour untouched', () => {
    // Regression guard: the new fields must not disturb what already worked.
    const u = buildUserData({ email: ' A@B.COM ', phone: '(555) 123-4567', fbp: 'fb.1.2.3' });
    expect(u.em[0]).toBe(hashPii('a@b.com'));
    expect(u.ph[0]).toBe(hashPii('5551234567'));
    expect(u.fbp).toBe('fb.1.2.3');
  });
});
