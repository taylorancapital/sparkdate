// tests/ga4-mp.test.js
//
// Coverage for lib/ga4-mp.js — the server-side half of GA4 purchase tracking.
// A regression here either silently drops real sales from GA4 again (the
// failure this file exists to close: two Stripe sales on 2026-09-08 with no
// GA4 hit, read by the nightly as a dead checkout) or, worse, throws inside
// the Stripe webhook and turns a tracking hiccup into a 500 and a redelivery.
//
// Three things matter most, all pinned below:
//   - transaction_id must round-trip untouched: it is the PaymentIntent id
//     the browser copy also sends, and the only thing that lets GA4 count one
//     transaction when both copies arrive.
//   - a captured _ga cookie must become the SAME client_id the browser's tag
//     uses, or the two copies land on two "users" and dedupe cannot happen.
//   - every failure path resolves; nothing throws.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendGa4Purchase, parseGaCookies, parseGaClientId, parseGaSessionId, derivedClientId,
} from '../lib/ga4-mp.js';

const origSecret = process.env.GA4_MP_API_SECRET;
const origMid = process.env.GA4_MEASUREMENT_ID;

function restoreEnv() {
  if (origSecret === undefined) delete process.env.GA4_MP_API_SECRET;
  else process.env.GA4_MP_API_SECRET = origSecret;
  if (origMid === undefined) delete process.env.GA4_MEASUREMENT_ID;
  else process.env.GA4_MEASUREMENT_ID = origMid;
}

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseGaClientId', () => {
  it('takes the last two dotted segments of a _ga cookie', () => {
    expect(parseGaClientId('GA1.1.1234567890.1700000000')).toBe('1234567890.1700000000');
  });

  it('accepts the UA-era GA1.2 prefix too', () => {
    expect(parseGaClientId('GA1.2.987.654')).toBe('987.654');
  });

  it('passes an already-parsed id through unchanged', () => {
    expect(parseGaClientId('1234567890.1700000000')).toBe('1234567890.1700000000');
  });

  it('returns null for garbage or nothing', () => {
    expect(parseGaClientId('')).toBeNull();
    expect(parseGaClientId(null)).toBeNull();
    expect(parseGaClientId(undefined)).toBeNull();
    expect(parseGaClientId('GA1.1.x')).toBeNull();
    expect(parseGaClientId('not a cookie')).toBeNull();
  });
});

describe('parseGaSessionId', () => {
  it('reads the GS1 format', () => {
    expect(parseGaSessionId('GS1.1.1725800000.3.1.1725800100.0.0.0')).toBe('1725800000');
  });

  it('reads the GS2 format, which prefixes the session with a literal s', () => {
    expect(parseGaSessionId('GS2.1.s1725800000$o3$g1$t1725800100$j0$l0$h0')).toBe('1725800000');
  });

  it('returns null for garbage or nothing', () => {
    expect(parseGaSessionId('')).toBeNull();
    expect(parseGaSessionId(null)).toBeNull();
    expect(parseGaSessionId('GA1.1.1.2')).toBeNull(); // a _ga cookie, not a container cookie
    expect(parseGaSessionId('GS1.1.')).toBeNull();
  });
});

describe('parseGaCookies', () => {
  it('returns both ids from raw cookie values', () => {
    expect(parseGaCookies({ ga: 'GA1.1.11.22', gas: 'GS1.1.33.1.0.44.0.0.0' }))
      .toEqual({ clientId: '11.22', sessionId: '33' });
  });

  it('returns nulls, never throws, on nothing at all', () => {
    expect(parseGaCookies()).toEqual({ clientId: null, sessionId: null });
    expect(parseGaCookies({})).toEqual({ clientId: null, sessionId: null });
  });
});

describe('derivedClientId', () => {
  it('is deterministic and numeric-dotted, so a replay lands on the same pseudo-user', () => {
    const a = derivedClientId('pi_3ABC');
    expect(a).toMatch(/^\d+\.\d+$/);
    expect(derivedClientId('pi_3ABC')).toBe(a);
    expect(derivedClientId('pi_3ABD')).not.toBe(a);
  });
});

describe('sendGa4Purchase', () => {
  beforeEach(() => {
    process.env.GA4_MP_API_SECRET = 'test-secret';
    process.env.GA4_MEASUREMENT_ID = 'G-TEST1234';
  });

  const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });

  it('posts a purchase with the correct payload shape to the Measurement Protocol', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendGa4Purchase({
      transactionId: 'pi_3PQRxyzABC123',
      value: 32.49,
      currency: 'usd',
      items: [{ item_id: 'ev1', item_name: 'Loxleys', price: 29.99, quantity: 1 }],
      clientId: '1234567890.1700000000',
      sessionId: '1725800000',
      userId: 'uid_abc',
      timestampMicros: 1725800000 * 1e6,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://www.google-analytics.com/mp/collect');
    expect(url).not.toContain('/debug/');
    expect(url).toContain('measurement_id=G-TEST1234');
    expect(url).toContain('api_secret=test-secret');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.client_id).toBe('1234567890.1700000000');
    expect(body.user_id).toBe('uid_abc');
    expect(body.timestamp_micros).toBe(1725800000 * 1e6);
    expect(body.events).toHaveLength(1);
    const ev = body.events[0];
    expect(ev.name).toBe('purchase');
    expect(ev.params.transaction_id).toBe('pi_3PQRxyzABC123');
    expect(ev.params.value).toBe(32.49);
    expect(ev.params.currency).toBe('USD');
    expect(ev.params.items).toEqual([{ item_id: 'ev1', item_name: 'Loxleys', price: 29.99, quantity: 1 }]);
    expect(ev.params.session_id).toBe('1725800000');
    expect(ev.params.engagement_time_msec).toBeGreaterThan(0);
    expect(ev.params.send_path).toBe('server');
    expect(ev.params.client_id_source).toBe('cookie');
  });

  it('round-trips transaction_id untouched — required for browser/server dedupe', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const paymentIntentId = 'pi_3UDVe3RsTCYDr2LL0aMNy5Vg';
    await sendGa4Purchase({ transactionId: paymentIntentId, value: 27.49 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].params.transaction_id).toBe(paymentIntentId);
  });

  it('turns a raw _ga cookie into the same client_id the browser tag uses', async () => {
    // The ticket doc stores the parsed id, but a caller that hands over the raw
    // cookie must still land on the browser's client, not a derived one.
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await sendGa4Purchase({ transactionId: 'pi_x', value: 1, clientId: 'GA1.1.555.666' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.client_id).toBe('555.666');
    expect(body.events[0].params.client_id_source).toBe('cookie');
  });

  it('derives a stable client_id and omits session_id when no cookie was captured', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await sendGa4Purchase({ transactionId: 'pi_nocookie', value: 27.49 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.client_id).toBe(derivedClientId('pi_nocookie'));
    expect(body.client_id).toMatch(/^\d+\.\d+$/);
    expect(body.events[0].params).not.toHaveProperty('session_id');
    expect(body.events[0].params.client_id_source).toBe('derived');
    expect(body).not.toHaveProperty('user_id');
    expect(body).not.toHaveProperty('timestamp_micros');
  });

  it('uses the debug endpoint and surfaces validationMessages when validate is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ validationMessages: [{ description: 'bad', validationCode: 'VALUE_INVALID' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendGa4Purchase({ transactionId: 'pi_v', value: 1, validate: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/debug/mp/collect');
    expect(result.ok).toBe(false);
    expect(result.validationMessages).toHaveLength(1);
  });

  it('reports ok on the debug endpoint when there are no validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ validationMessages: [] }),
    }));
    const result = await sendGa4Purchase({ transactionId: 'pi_v', value: 1, validate: true });
    expect(result.ok).toBe(true);
    expect(result.validationMessages).toEqual([]);
  });

  it('skips without throwing when GA4_MP_API_SECRET is not set', async () => {
    delete process.env.GA4_MP_API_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendGa4Purchase({ transactionId: 'pi_x', value: 1 });
    expect(result).toEqual({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a call with no transactionId rather than sending an undedupable event', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await sendGa4Purchase({ value: 1 });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a call with no usable value', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await sendGa4Purchase({ transactionId: 'pi_x', value: NaN })).ok).toBe(false);
    expect((await sendGa4Purchase({ transactionId: 'pi_x', value: -1 })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails soft (never throws) when the endpoint returns an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' }));
    const result = await sendGa4Purchase({ transactionId: 'pi_x', value: 1 });
    expect(result.ok).toBe(false);
  });

  it('fails soft (never throws) on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(sendGa4Purchase({ transactionId: 'pi_x', value: 1 }))
      .resolves.toEqual(expect.objectContaining({ ok: false }));
  });

  it('fails soft (never throws) on a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_resolve, reject) => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      setTimeout(() => reject(err), 10);
    })));
    const result = await sendGa4Purchase({ transactionId: 'pi_x', value: 1 });
    expect(result.ok).toBe(false);
  }, 10000);

  it('defaults the measurement id to the production stream when none is set', async () => {
    delete process.env.GA4_MEASUREMENT_ID;
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await sendGa4Purchase({ transactionId: 'pi_x', value: 1 });
    expect(fetchMock.mock.calls[0][0]).toContain('measurement_id=G-21YLCC35F1');
  });
});
