// tests/cors.test.js
//
// Coverage for the CORS allowlist in lib/cors.js. The regex matters
// because a leaky preview-URL match would let any random *.vercel.app
// deployment call /api/* with the user's credentials attached.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowed, applyCors } from '../lib/cors.js';

describe('isAllowed', () => {
  const origEnv = process.env.ALLOWED_ORIGINS;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = origEnv;
  });

  it('allows the apex production domain', () => {
    expect(isAllowed('https://sparkdate.date')).toBe(true);
  });

  it('allows www subdomain (legacy / redirect race)', () => {
    expect(isAllowed('https://www.sparkdate.date')).toBe(true);
  });

  it('allows this-project Vercel preview URLs', () => {
    expect(isAllowed('https://sparkdate-git-feature-abc.vercel.app')).toBe(true);
    expect(isAllowed('https://sparkdate-abc123.vercel.app')).toBe(true);
    // bare project URL with no branch suffix
    expect(isAllowed('https://sparkdate.vercel.app')).toBe(true);
  });

  it('rejects unrelated vercel.app subdomains', () => {
    expect(isAllowed('https://evil.vercel.app')).toBe(false);
    expect(isAllowed('https://sparkdate-attacker.com')).toBe(false);
    // Trying to smuggle the substring inside a different host
    expect(isAllowed('https://attacker.com/sparkdate.vercel.app')).toBe(false);
  });

  it('rejects consecutive-dash hostnames (audit L1)', () => {
    // Vercel never emits these but third parties could register them
    // adjacent to the legit project name. The tightened regex denies
    // any label with double dashes.
    expect(isAllowed('https://sparkdate--evil.vercel.app')).toBe(false);
    expect(isAllowed('https://sparkdate-git--feature.vercel.app')).toBe(false);
    expect(isAllowed('https://sparkdate---a.vercel.app')).toBe(false);
  });

  it('rejects http (not https)', () => {
    expect(isAllowed('http://sparkdate.date')).toBe(false);
  });

  it('rejects empty / null origin', () => {
    expect(isAllowed('')).toBe(false);
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
  });

  it('honors ALLOWED_ORIGINS env additions', () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://staging.sparkdate.date';
    expect(isAllowed('http://localhost:3000')).toBe(true);
    expect(isAllowed('https://staging.sparkdate.date')).toBe(true);
    expect(isAllowed('http://localhost:4000')).toBe(false);
  });

  it('ignores whitespace and empty entries in ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = ' http://localhost:3000 , , https://x.test ';
    expect(isAllowed('http://localhost:3000')).toBe(true);
    expect(isAllowed('https://x.test')).toBe(true);
  });
});

describe('applyCors', () => {
  // Minimal res mock that records setHeader calls.
  const makeRes = () => {
    const headers = {};
    return {
      headers,
      setHeader(name, value) { headers[name] = value; },
    };
  };

  it('returns true on OPTIONS preflight so handlers short-circuit', () => {
    const res = makeRes();
    const result = applyCors(
      { method: 'OPTIONS', headers: { origin: 'https://sparkdate.date' } },
      res
    );
    expect(result).toBe(true);
  });

  it('returns false on non-OPTIONS', () => {
    const res = makeRes();
    const result = applyCors(
      { method: 'POST', headers: { origin: 'https://sparkdate.date' } },
      res
    );
    expect(result).toBe(false);
  });

  it('echoes the Origin header when allowed', () => {
    const res = makeRes();
    applyCors({ method: 'POST', headers: { origin: 'https://sparkdate.date' } }, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://sparkdate.date');
    expect(res.headers['Vary']).toBe('Origin');
  });

  it('omits Allow-Origin when origin is rejected', () => {
    const res = makeRes();
    applyCors({ method: 'POST', headers: { origin: 'https://evil.com' } }, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    // Standard headers are still set so OPTIONS preflights aren't malformed.
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('omits Allow-Origin when origin header is missing entirely', () => {
    const res = makeRes();
    applyCors({ method: 'POST', headers: {} }, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
