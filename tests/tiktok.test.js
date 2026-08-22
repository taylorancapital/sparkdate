// tests/tiktok.test.js
//
// Covers the TikTok path: token refresh (lib/tiktok-auth.js) and the request
// it builds (lib/social-requests.js).
//
// TikTok is the only surface here whose credentials expire on a timescale
// shorter than the posting calendar. Facebook's system-user token is minted
// once; a TikTok access token is dead in about 24 hours, and the refresh
// token that replaces it ROTATES. Both failure modes are silent and arrive
// later, in an unattended run -- which is exactly why they are pinned here
// rather than discovered in production.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { refreshRequest, parseRefresh, isExpired, getAccessToken } = require('../lib/tiktok-auth.js');
const { buildTikTok, assetUrls } = require('../lib/social-requests.js');

const BASE = 'https://sparkdate.date/social';
const CREDS = {
  TIKTOK_CLIENT_KEY: 'ck', TIKTOK_CLIENT_SECRET: 'cs', TIKTOK_REFRESH_TOKEN: 'rt-old',
};
const row = (over = {}) => ({
  row_id: 'MC-06', caption: 'Ten strangers, one long table.',
  caption_x: 'Ten strangers, one long table. Sep 12, Lancaster.',
  asset_files: 'MC-06_1of3.jpg,MC-06_2of3.jpg,MC-06_3of3.jpg',
  ...over,
});

describe('refreshRequest', () => {
  it('form-encodes, because TikTok rejects JSON here', () => {
    // Posting JSON to the OAuth endpoint returns a generic invalid_request
    // that says nothing about the content type. Pinned so nobody "tidies"
    // this into a JSON body.
    const r = refreshRequest(CREDS);
    expect(r.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(r.body).toContain('grant_type=refresh_token');
    expect(r.body).toContain('refresh_token=rt-old');
    expect(r.url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
  });

  it('names every missing variable at once', () => {
    // One run, one complete answer -- not three rounds of setting a variable
    // and re-running to discover the next.
    expect(() => refreshRequest({})).toThrow(/CLIENT_KEY.*CLIENT_SECRET.*REFRESH_TOKEN/);
    try { refreshRequest({ TIKTOK_CLIENT_KEY: 'ck' }); } catch (e) {
      expect(e.missing).toEqual(['TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN']);
    }
  });
});

describe('parseRefresh', () => {
  it('returns the access token and its lifetime', () => {
    const out = parseRefresh(
      { access_token: 'at-new', expires_in: 86400, refresh_token: 'rt-old' }, 'rt-old');
    expect(out.accessToken).toBe('at-new');
    expect(out.expiresIn).toBe(86400);
    expect(out.rotated).toBe(false);
  });

  it('flags rotation, which is the thing that kills TikTok publishing', () => {
    // TikTok hands back a new refresh token and retires the old one. If the
    // new value is not written into the secret, the NEXT run fails and
    // nothing posts until someone re-authorises by hand.
    const out = parseRefresh(
      { access_token: 'at', expires_in: 86400, refresh_token: 'rt-NEW' }, 'rt-old');
    expect(out.rotated).toBe(true);
    expect(out.refreshToken).toBe('rt-NEW');
  });

  it('treats a 200 carrying an error as failure', () => {
    // TikTok reports invalid_grant with HTTP 200. A caller checking only
    // res.ok would carry on and send "Bearer undefined" to the publish API,
    // where the error message is about the post, not the token.
    expect(() => parseRefresh({ error: 'invalid_grant', error_description: 'expired' }, 'rt'))
      .toThrow(/invalid_grant.*expired/);
  });

  it('refuses a response with no access token', () => {
    expect(() => parseRefresh({ expires_in: 86400 }, 'rt')).toThrow(/no access_token/);
    expect(() => parseRefresh(null, 'rt')).toThrow(/no JSON/);
  });
});

describe('isExpired', () => {
  const t0 = 1_700_000_000_000;
  it('expires early rather than at the boundary', () => {
    // A token valid for another 60 seconds is not valid for a run that takes
    // longer than that.
    expect(isExpired(t0, 86400, t0 + 86_100_000)).toBe(true);   // 5 min left
    expect(isExpired(t0, 86400, t0 + 80_000_000)).toBe(false);
  });
  it('treats unknown as expired', () => {
    expect(isExpired(0, 0)).toBe(true);
    expect(isExpired(t0, 0)).toBe(true);
  });
});

describe('getAccessToken', () => {
  it('prefers the refresh token over a pasted access token', async () => {
    // A pasted TIKTOK_ACCESS_TOKEN is the thing that expires overnight. When
    // both are present the durable one must win, or unattended runs inherit
    // whatever a human last debugged with.
    const fetchImpl = async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: 'from-refresh', expires_in: 86400, refresh_token: 'rt-old' }),
    });
    const out = await getAccessToken(
      { ...CREDS, TIKTOK_ACCESS_TOKEN: 'pasted' }, { fetchImpl });
    expect(out.accessToken).toBe('from-refresh');
  });

  it('falls back to a pasted token so a human can still debug', async () => {
    const out = await getAccessToken({ TIKTOK_ACCESS_TOKEN: 'pasted' }, {});
    expect(out.accessToken).toBe('pasted');
  });

  it('returns null when TikTok is simply not configured', async () => {
    // Not an error. Most runs are Facebook-only, and they must not fail
    // because TikTok credentials were never set.
    expect(await getAccessToken({}, {})).toBeNull();
  });

  it('says out loud when the refresh token rotated', async () => {
    const lines = [];
    const fetchImpl = async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: 'at', expires_in: 86400, refresh_token: 'rt-NEW' }),
    });
    await getAccessToken(CREDS, { fetchImpl, log: (m) => lines.push(m) });
    const all = lines.join('\n');
    expect(all).toMatch(/rotated the refresh token/);
    expect(all).toContain('rt-NEW');
  });
});

describe('assetUrls for TikTok', () => {
  it('prefers vertical _tt art when it has been rendered', () => {
    const r = row({ asset_files: 'MC-06_1of3.jpg,MC-06_1of3_tt.jpg,MC-06_2of3_tt.jpg' });
    expect(assetUrls(r, BASE, 'tiktok')).toEqual([
      `${BASE}/MC-06_1of3_tt.jpg`, `${BASE}/MC-06_2of3_tt.jpg`,
    ]);
  });

  it('still posts the squares when no vertical art exists', () => {
    // Letterboxed beats absent. This fallback is what keeps TikTok running
    // while the vertical set is still being exported.
    expect(assetUrls(row(), BASE, 'tiktok')).toHaveLength(3);
  });

  it('keeps _tt art out of the Instagram and Facebook feeds', () => {
    // The inverse of the bug this suffix exists to prevent: a 1080x1920
    // TikTok frame silently joining a square carousel.
    const r = row({ asset_files: 'MC-06_1of2.jpg,MC-06_2of2.jpg,MC-06_1of2_tt.jpg' });
    expect(assetUrls(r, BASE, 'fb')).toEqual([
      `${BASE}/MC-06_1of2.jpg`, `${BASE}/MC-06_2of2.jpg`,
    ]);
  });

  it('does not route _tt art to Stories, which are also 1080x1920', () => {
    const r = row({ asset_files: 'MC-06_story.jpg,MC-06_1of2_tt.jpg' });
    expect(assetUrls(r, BASE, 'ig_story')).toEqual([`${BASE}/MC-06_story.jpg`]);
  });

  it('never lets _tt art reach a feed through the empty-match fallback', () => {
    // The live bug: LX-24 carries only _story and _tt files, so the feed
    // filter emptied and the "use everything" fallback put VERTICAL art in a
    // Facebook post. Filtering the primary path was not enough -- on these
    // rows the FALLBACK is what fires.
    const r = row({ asset_files: 'LX-24_1of2_story.jpg,LX-24_2of2_story.jpg,LX-24_1of2_tt.jpg' });
    for (const surface of ['fb', 'ig']) {
      expect(assetUrls(r, BASE, surface)).toEqual([
        `${BASE}/LX-24_1of2_story.jpg`, `${BASE}/LX-24_2of2_story.jpg`,
      ]);
    }
  });

  it('never lets _tt art reach a Story through the empty-match fallback', () => {
    // Same shape of bug on the Story surface: no _story file, so it fell
    // back to everything -- including TikTok art, which is not Story art
    // however similar the pixel dimensions look.
    const r = row({ asset_files: 'GG-09_1of2.jpg,GG-09_1of2_tt.jpg' });
    expect(assetUrls(r, BASE, 'ig_story')).toEqual([`${BASE}/GG-09_1of2.jpg`]);
  });
});

describe('buildTikTok', () => {
  it('defaults to a draft, which needs no audit', () => {
    const req = buildTikTok(row(), { baseUrl: BASE });
    expect(req.steps[0].json.post_mode).toBe('MEDIA_UPLOAD');
    expect(req.steps[0].json.media_type).toBe('PHOTO');
    // A draft is not published, so it carries no privacy level. Sending one
    // is what produces TikTok's opaque invalid_params on MEDIA_UPLOAD.
    expect(req.steps[0].json.post_info.privacy_level).toBeUndefined();
  });

  it('sends a privacy level only when publishing for real', () => {
    const req = buildTikTok(row(), { baseUrl: BASE, mode: 'DIRECT_POST', privacyLevel: 'PUBLIC_TO_EVERYONE' });
    expect(req.steps[0].json.post_mode).toBe('DIRECT_POST');
    expect(req.steps[0].json.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE');
  });

  it('refuses a privacy level TikTok does not define', () => {
    // "PUBLIC" and "public_to_everyone" both look right and are both
    // rejected by the API with a message that does not name the field.
    expect(() => buildTikTok(row(), { baseUrl: BASE, mode: 'DIRECT_POST', privacyLevel: 'PUBLIC' }))
      .toThrow(/not one of/);
  });

  it('caps the title at 150 characters', () => {
    // TikTok's limit is far shorter than an Instagram caption, and it
    // rejects rather than truncates.
    const long = 'x'.repeat(400);
    const req = buildTikTok(row({ caption_x: '', caption: long }), { baseUrl: BASE });
    expect(req.steps[0].json.post_info.title).toHaveLength(150);
  });

  it('refuses more than 35 images, and refuses none', () => {
    const many = Array.from({ length: 36 }, (_, i) => `MC-06_${i}_tt.jpg`).join(',');
    expect(() => buildTikTok(row({ asset_files: many }), { baseUrl: BASE })).toThrow(/35/);
    expect(() => buildTikTok(row({ asset_files: '' }), { baseUrl: BASE })).toThrow(/no assets/);
  });
});
