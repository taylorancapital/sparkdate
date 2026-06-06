import { describe, it, expect, beforeAll } from 'vitest';

// Secret must be set before the module signs anything.
beforeAll(() => { process.env.UNSUBSCRIBE_SECRET = 'test-secret-please-ignore-0123456789'; });

const { makeProfileUrl, verifyProfileToken, sign } = await import('../lib/profile-link.js');

describe('profile-link tokens', () => {
  it('signs deterministically for a uid', () => {
    expect(sign('user_abc')).toBe(sign('user_abc'));
  });
  it('produces different signatures for different uids', () => {
    expect(sign('user_abc')).not.toBe(sign('user_xyz'));
  });
  it('verifies a freshly-signed token', () => {
    expect(verifyProfileToken('user_abc', sign('user_abc'))).toBe(true);
  });
  it("rejects another user's signature (no replay across uids)", () => {
    expect(verifyProfileToken('user_abc', sign('user_xyz'))).toBe(false);
  });
  it('rejects a tampered / empty / wrong-length signature', () => {
    expect(verifyProfileToken('user_abc', 'deadbeef')).toBe(false);
    expect(verifyProfileToken('user_abc', '')).toBe(false);
    expect(verifyProfileToken('', sign('user_abc'))).toBe(false);
  });
  it('builds a /profile URL carrying uid + token', () => {
    const url = makeProfileUrl('user_abc');
    expect(url).toContain('/profile?uid=user_abc&t=');
    const t = new URL(url).searchParams.get('t');
    expect(verifyProfileToken('user_abc', t)).toBe(true);
  });
});
