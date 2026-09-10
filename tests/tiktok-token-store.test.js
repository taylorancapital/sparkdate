// tests/tiktok-token-store.test.js
//
// Covers lib/tiktok-token-store.js -- where the rotating TikTok refresh token
// lives.
//
// The failure this module exists to prevent is invisible and delayed, which
// is why it gets direct coverage rather than being inferred from a green
// publish run. TikTok issues a NEW refresh token on nearly every refresh and
// kills the old one. If the new value is not persisted, the run that dropped
// it SUCCEEDS -- it already has its access token -- and the breakage surfaces
// hours later as scheduled posts that silently never appear.
//
// So the properties worth asserting are about what happens AFTER a successful
// refresh, not about whether the refresh worked:
//
//   * a rotated token is written back
//   * the stored token beats the environment copy, which goes stale
//   * a failed write is loud, because the old token is already dead
//   * preflight and the publisher share this path, so neither can rotate
//     without persisting

import { describe, it, expect } from 'vitest';
import { resolveRefreshToken, acquireAccessToken } from '../lib/tiktok-token-store.js';

/** A store that records what it was asked to do. */
function fakeStore(initial = null, { failWrite = false } = {}) {
  return {
    value: initial,
    writes: [],
    async read() { return this.value; },
    async write(token, meta) {
      if (failWrite) throw new Error('permission denied');
      this.writes.push({ token, meta });
      this.value = token;
    },
  };
}

/** A stand-in for lib/tiktok-auth, so no network or credentials are needed. */
function fakeAuth({ rotatesTo = null, accessToken = 'access-1' } = {}) {
  return {
    seenRefreshTokens: [],
    async getAccessToken(env) {
      this.seenRefreshTokens.push(env.TIKTOK_REFRESH_TOKEN);
      if (!env.TIKTOK_REFRESH_TOKEN && !env.TIKTOK_ACCESS_TOKEN) return null;
      return {
        accessToken,
        expiresIn: 86400,
        refreshToken: rotatesTo || env.TIKTOK_REFRESH_TOKEN,
        rotated: Boolean(rotatesTo),
      };
    },
  };
}

const collect = () => {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)) };
};

describe('resolveRefreshToken', () => {
  it('prefers the stored token over the environment', () => {
    // The env copy is a seed, not a source of truth. It goes stale the first
    // time TikTok rotates, and preferring it reintroduces the whole bug.
    expect(resolveRefreshToken({ stored: 'fresh', env: { TIKTOK_REFRESH_TOKEN: 'stale' } }))
      .toEqual({ token: 'fresh', source: 'store' });
  });

  it('falls back to the environment when the store is empty', () => {
    expect(resolveRefreshToken({ stored: null, env: { TIKTOK_REFRESH_TOKEN: 'seed' } }))
      .toEqual({ token: 'seed', source: 'env' });
  });

  it('treats whitespace as empty on both sides', () => {
    // A secret pasted with a trailing newline is a real and very confusing
    // way to send TikTok a token it rejects.
    expect(resolveRefreshToken({ stored: '   ', env: { TIKTOK_REFRESH_TOKEN: '  seed  ' } }))
      .toEqual({ token: 'seed', source: 'env' });
  });

  it('reports nothing configured rather than an empty string', () => {
    expect(resolveRefreshToken({ stored: null, env: {} }))
      .toEqual({ token: null, source: null });
  });
});

describe('acquireAccessToken', () => {
  it('persists a rotated refresh token', async () => {
    const store = fakeStore('old-token');
    const auth = fakeAuth({ rotatesTo: 'new-token' });

    const out = await acquireAccessToken({}, { store, auth, log: () => {} });

    expect(out.accessToken).toBe('access-1');
    expect(out.persisted).toBe(true);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].token).toBe('new-token');
    expect(store.value).toBe('new-token');
  });

  it('sends the STORED token to TikTok, not the stale environment one', async () => {
    const store = fakeStore('fresh-from-store');
    const auth = fakeAuth();

    await acquireAccessToken(
      { TIKTOK_REFRESH_TOKEN: 'stale-in-env' },
      { store, auth, log: () => {} },
    );

    expect(auth.seenRefreshTokens).toEqual(['fresh-from-store']);
  });

  it('does not write when nothing rotated', async () => {
    // A write per run would be harmless but would also make "rotated_at" mean
    // nothing, and that field is the only way to tell a stopped rotation from
    // a stopped write after the fact.
    const store = fakeStore('same-token');
    const out = await acquireAccessToken({}, { store, auth: fakeAuth(), log: () => {} });

    expect(out.rotated).toBe(false);
    expect(store.writes).toHaveLength(0);
  });

  it('seeds the store from the environment on the first run', async () => {
    const store = fakeStore(null);
    const auth = fakeAuth({ rotatesTo: 'rotated-once' });
    const { lines, log } = collect();

    const out = await acquireAccessToken({ TIKTOK_REFRESH_TOKEN: 'seed' }, { store, auth, log });

    expect(auth.seenRefreshTokens).toEqual(['seed']);
    expect(out.source).toBe('env');
    expect(store.value).toBe('rotated-once');
    expect(lines.join('\n')).toMatch(/seeding from TIKTOK_REFRESH_TOKEN/);
  });

  it('shouts the new token when the write fails, because the old one is dead', async () => {
    // This is the one case where losing the value is unrecoverable without a
    // fresh browser authorization, so the log has to carry it.
    const store = fakeStore('old-token', { failWrite: true });
    const { lines, log } = collect();

    const out = await acquireAccessToken({}, { store, auth: fakeAuth({ rotatesTo: 'new-token' }), log });

    expect(out.persisted).toBe(false);
    const text = lines.join('\n');
    expect(text).toMatch(/SAVING IT FAILED/);
    expect(text).toContain('new-token');
  });

  it('still publishes with no store at all', async () => {
    // The laptop case: TikTok credentials in the shell, no Firebase service
    // account. Losing automatic persistence must not cost the ability to post.
    const out = await acquireAccessToken(
      { TIKTOK_REFRESH_TOKEN: 'local' },
      { store: null, auth: fakeAuth(), log: () => {} },
    );

    expect(out.accessToken).toBe('access-1');
    expect(out.persisted).toBe(false);
  });

  it('falls back to the environment when the store read throws', async () => {
    const store = {
      async read() { throw new Error('firestore unavailable'); },
      async write() { throw new Error('should not be reached'); },
    };
    const { lines, log } = collect();

    const out = await acquireAccessToken(
      { TIKTOK_REFRESH_TOKEN: 'seed' },
      { store, auth: fakeAuth(), log },
    );

    expect(out.accessToken).toBe('access-1');
    expect(lines.join('\n')).toMatch(/could not read the stored refresh token/);
  });

  it('returns null when nothing is configured', async () => {
    // An unconfigured TikTok must skip its rows, not fail the batch -- losing
    // scheduled Meta posts to a TikTok credential is a far worse outcome.
    const out = await acquireAccessToken({}, { store: null, auth: fakeAuth(), log: () => {} });
    expect(out).toBeNull();
  });
});
