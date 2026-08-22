// lib/tiktok-auth.js
//
// Keeping a TikTok access token alive.
//
// WHY THIS EXISTS
//
// Facebook and Instagram publish with a long-lived system-user token that is
// minted once and effectively never expires. TikTok does not work that way:
// an access token lasts about 24 hours. A run that reads TIKTOK_ACCESS_TOKEN
// straight from the environment therefore works on the day it is set up and
// then silently stops -- the failure arrives a day later, in a scheduled run
// nobody is watching, as a 401 on a post that simply never appears.
//
// So the token is not configuration. It is derived, per run, from a refresh
// token.
//
// THE ROTATION TRAP
//
// TikTok returns a NEW refresh_token on most refreshes and the old one stops
// working. Refresh tokens last ~365 days, so a stored one does not expire on
// any timescale you would notice -- but if a refresh rotates the token and we
// throw the new value away, the NEXT refresh fails with the stale one and
// TikTok publishing dies permanently until someone re-authorises by hand.
//
// This module cannot fix that on its own: the refresh token lives in a GitHub
// secret (or a .env), and a Node process cannot write either. What it can do
// is REFUSE TO BE SILENT -- parseRefresh flags rotation loudly so the run
// tells you to update the secret while the old token still works.
//
// Everything here is pure except getAccessToken, so the rotation logic is
// testable without a network or credentials.

'use strict';

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// Refresh a little early rather than at the boundary. A token that expires
// mid-run is the same outage as one that expired before it.
const EXPIRY_SKEW_SECONDS = 300;

/**
 * Build the refresh request. TikTok's OAuth endpoint takes form encoding, not
 * JSON -- posting JSON here returns a confusingly generic invalid_request.
 */
function refreshRequest(env = process.env) {
  const clientKey = env.TIKTOK_CLIENT_KEY;
  const clientSecret = env.TIKTOK_CLIENT_SECRET;
  const refreshToken = env.TIKTOK_REFRESH_TOKEN;

  const missing = [
    !clientKey && 'TIKTOK_CLIENT_KEY',
    !clientSecret && 'TIKTOK_CLIENT_SECRET',
    !refreshToken && 'TIKTOK_REFRESH_TOKEN',
  ].filter(Boolean);
  if (missing.length) {
    const err = new Error(`TikTok refresh needs ${missing.join(', ')}`);
    err.missing = missing;
    throw err;
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return {
    method: 'POST',
    url: TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    // Carried through so parseRefresh can tell rotation from reuse without
    // reading the environment a second time.
    sentRefreshToken: refreshToken,
  };
}

/**
 * Read the refresh response.
 *
 * TikTok reports failure two different ways and only one of them is an HTTP
 * error: a 200 can still carry {error: 'invalid_grant'}. Both are treated as
 * failure here, because a caller that only checked res.ok would sail on with
 * access_token === undefined and send `Bearer undefined` to the publish API.
 */
function parseRefresh(json, sentRefreshToken) {
  if (!json || typeof json !== 'object') {
    throw new Error('TikTok refresh returned no JSON');
  }
  if (json.error) {
    const desc = json.error_description || json.log_id || '';
    throw new Error(`TikTok refresh failed: ${json.error}${desc ? ` -- ${desc}` : ''}`);
  }
  if (!json.access_token) {
    throw new Error('TikTok refresh returned no access_token');
  }

  const rotated = Boolean(json.refresh_token) && json.refresh_token !== sentRefreshToken;

  return {
    accessToken: json.access_token,
    // Seconds. Reported so a caller can log how long it has, not to cache
    // across runs -- each run refreshes.
    expiresIn: Number(json.expires_in) || 0,
    refreshToken: json.refresh_token || sentRefreshToken,
    refreshExpiresIn: Number(json.refresh_expires_in) || 0,
    rotated,
  };
}

/**
 * True when a token we already hold is too close to expiry to trust.
 * Exported mainly so the skew is stated once rather than inlined at call
 * sites that would each pick a different number.
 */
function isExpired(obtainedAtMs, expiresInSeconds, nowMs = Date.now()) {
  if (!obtainedAtMs || !expiresInSeconds) return true;
  return nowMs >= obtainedAtMs + (expiresInSeconds - EXPIRY_SKEW_SECONDS) * 1000;
}

/**
 * The one impure function: get a usable access token for this run.
 *
 * TIKTOK_ACCESS_TOKEN still works as an override so a human can paste a fresh
 * token from TikTok's own tooling to debug -- but it is deliberately NOT the
 * normal path, and the caller is told when it is being used, because a pasted
 * token is the thing that expires overnight.
 */
async function getAccessToken(env = process.env, { fetchImpl = fetch, log = () => {} } = {}) {
  if (env.TIKTOK_REFRESH_TOKEN) {
    const req = refreshRequest(env);
    const res = await fetchImpl(req.url, {
      method: req.method, headers: req.headers, body: req.body,
    });
    let json = null;
    try { json = await res.json(); } catch { /* handled below */ }
    if (!json) throw new Error(`TikTok refresh failed: HTTP ${res.status}`);

    const out = parseRefresh(json, req.sentRefreshToken);
    log(`tiktok: token refreshed, valid ${Math.round(out.expiresIn / 60)} min`);

    if (out.rotated) {
      // Loud on purpose. The old refresh token is now dead; the next run uses
      // whatever is in the secret, so this message is the only warning before
      // TikTok publishing stops.
      log('');
      log('  !! TikTok rotated the refresh token. Update TIKTOK_REFRESH_TOKEN now:');
      log(`  !!   ${out.refreshToken}`);
      log('  !! The previous value no longer works. The next run WILL fail without this.');
      log('');
    }
    return out;
  }

  if (env.TIKTOK_ACCESS_TOKEN) {
    log('tiktok: using TIKTOK_ACCESS_TOKEN directly -- this expires in ~24h.');
    log('        Set TIKTOK_CLIENT_KEY/SECRET and TIKTOK_REFRESH_TOKEN for unattended runs.');
    return { accessToken: env.TIKTOK_ACCESS_TOKEN, expiresIn: 0, refreshToken: null, rotated: false };
  }

  return null;
}

module.exports = {
  TOKEN_URL, EXPIRY_SKEW_SECONDS,
  refreshRequest, parseRefresh, isExpired, getAccessToken,
};
