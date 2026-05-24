// tests/unsubscribe.test.js
//
// HMAC-based unsubscribe tokens — the security model is:
//   - You can sign/verify only if you hold UNSUBSCRIBE_SECRET.
//   - A leaked URL is good for exactly one lead+email pair.
//   - Tampering with leadId, email, or sig MUST fail.
//   - Compare is constant-time so timing can't be used to brute-force.
//
// The audit-H3 fix makes the module throw if neither UNSUBSCRIBE_SECRET
// nor STRIPE_WEBHOOK_SECRET is set — test that too.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  makeUnsubscribeUrl,
  parseToken,
  verifySignature,
} from '../lib/unsubscribe.js';

const origSecret = process.env.UNSUBSCRIBE_SECRET;
const origStripeSecret = process.env.STRIPE_WEBHOOK_SECRET;

function restoreEnv() {
  if (origSecret === undefined) delete process.env.UNSUBSCRIBE_SECRET;
  else process.env.UNSUBSCRIBE_SECRET = origSecret;
  if (origStripeSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = origStripeSecret;
}

describe('parseToken', () => {
  it('splits at the LAST dot so leadIds containing dots survive', () => {
    const parsed = parseToken('lead.with.dots.deadbeefdeadbeefdeadbeefdeadbeef');
    expect(parsed.leadId).toBe('lead.with.dots');
    expect(parsed.sig).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
  });

  it('returns null when token has no separator', () => {
    expect(parseToken('justaleadid')).toBeNull();
  });

  it('returns null on empty / nullish input', () => {
    expect(parseToken('')).toBeNull();
    expect(parseToken(null)).toBeNull();
    expect(parseToken(undefined)).toBeNull();
  });

  it('returns null when leading char is "."', () => {
    // dot at index 0 → dot < 1, rejected (would otherwise create empty leadId)
    expect(parseToken('.abc')).toBeNull();
  });
});

describe('sign + verifySignature roundtrip', () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'test-secret-do-not-ship';
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
  afterEach(restoreEnv);

  it('verifies a freshly-generated URL', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const u = new URL(url);
    const token = u.searchParams.get('token');
    const parsed = parseToken(token);
    expect(verifySignature(parsed.leadId, 'alice@example.com', parsed.sig)).toBe(true);
  });

  it('is case-insensitive on the email side', () => {
    // sign() lowercases the email so links survive Gmail/Outlook
    // mangling of the address case.
    const url = makeUnsubscribeUrl('lead123', 'Alice@Example.COM');
    const parsed = parseToken(new URL(url).searchParams.get('token'));
    expect(verifySignature(parsed.leadId, 'alice@example.com', parsed.sig)).toBe(true);
    expect(verifySignature(parsed.leadId, 'ALICE@EXAMPLE.COM', parsed.sig)).toBe(true);
  });

  it('rejects when email differs from the one signed', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const parsed = parseToken(new URL(url).searchParams.get('token'));
    expect(verifySignature(parsed.leadId, 'mallory@example.com', parsed.sig)).toBe(false);
  });

  it('rejects when leadId differs from the one signed', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const parsed = parseToken(new URL(url).searchParams.get('token'));
    expect(verifySignature('other-lead', 'alice@example.com', parsed.sig)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const parsed = parseToken(new URL(url).searchParams.get('token'));
    // Flip one hex char
    const tampered = parsed.sig.slice(0, -1) + (parsed.sig.at(-1) === '0' ? '1' : '0');
    expect(verifySignature(parsed.leadId, 'alice@example.com', tampered)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws if buffers differ in length — verifySignature
    // must guard against that and return false cleanly.
    expect(() => verifySignature('lead123', 'alice@example.com', 'short')).not.toThrow();
    expect(verifySignature('lead123', 'alice@example.com', 'short')).toBe(false);
  });

  it('a different SECRET cannot forge a valid sig', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const realSig = parseToken(new URL(url).searchParams.get('token')).sig;

    // Re-derive with a different secret and confirm the signature differs.
    process.env.UNSUBSCRIBE_SECRET = 'a-totally-different-secret';
    const url2 = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const forgedSig = parseToken(new URL(url2).searchParams.get('token')).sig;
    expect(forgedSig).not.toBe(realSig);
  });
});

describe('SECRET fallback behavior (audit H3)', () => {
  afterEach(restoreEnv);

  it('falls back to STRIPE_WEBHOOK_SECRET when UNSUBSCRIBE_SECRET is unset', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'stripe-fallback-secret';
    // Should not throw.
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    expect(url).toContain('lead123.');
  });

  it('throws loudly when BOTH env vars are unset', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => makeUnsubscribeUrl('lead123', 'alice@example.com')).toThrow(
      /UNSUBSCRIBE_SECRET/
    );
  });
});

describe('makeUnsubscribeUrl shape', () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'test-secret';
  });
  afterEach(restoreEnv);

  it('produces a URL pointing at the production unsubscribe endpoint', () => {
    const url = makeUnsubscribeUrl('lead123', 'alice@example.com');
    const u = new URL(url);
    expect(u.hostname).toBe('sparkdate.date');
    expect(u.pathname).toBe('/api/unsubscribe');
    expect(u.searchParams.get('token')).toMatch(/^lead123\.[0-9a-f]{32}$/);
  });

  it('URL-encodes the token so URL-unsafe leadIds survive transit', () => {
    const url = makeUnsubscribeUrl('lead with space', 'alice@example.com');
    // Firestore IDs are URL-safe in practice, but the API should still
    // handle pathological inputs without producing malformed URLs.
    const decoded = decodeURIComponent(new URL(url).searchParams.get('token'));
    expect(decoded.startsWith('lead with space.')).toBe(true);
  });
});
