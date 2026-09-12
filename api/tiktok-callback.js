// api/tiktok-callback.js
//
// The OAuth redirect target. THIS PATH IS REGISTERED WITH TIKTOK and must stay
// exactly `https://sparkdate.date/tiktok/callback` -- no trailing slash, apex
// host, https. It is reached through the rewrite in vercel.json rather than by
// living at that path, because every other serverless function in this project
// lives in api/. Changing either half without the other silently breaks the
// connect flow with TikTok's generic `invalid_request`, which names nothing.
//
// WHY THIS ONE ENDPOINT IS NOT ADMIN-GATED
//
// It is a browser navigation arriving from tiktok.com, so it carries no
// Authorization header and cannot: requireAdmin() would reject the redirect
// that the whole flow depends on. The CSRF `state` cookie is the control
// instead -- it is minted by the admin-gated connect action, so a request that
// presents a matching state is one this site started while an admin was signed
// in. Without that check, anyone who reached this URL could bind THEIR TikTok
// account to our token store by completing an authorization of their own.
//
// The code itself is useless to an attacker: exchanging it needs the client
// secret, which only Vercel holds.

'use strict';

const crypto = require('crypto');
const { ENDPOINTS } = require('../lib/tiktok-publish');
const TikTokStore = require('../lib/tiktok-token-store');

const STATE_COOKIE = 'tt_oauth_state';
const ADMIN_PAGE = '/admin/tiktok';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function back(res, message) {
  const url = message ? `${ADMIN_PAGE}?error=${encodeURIComponent(message)}` : `${ADMIN_PAGE}?connected=1`;
  // Clear the state cookie either way -- it is single-use, and leaving a spent
  // one behind makes a later mismatch harder to read.
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const q = req.query || {};
  if (q.error) {
    return back(res, String(q.error_description || q.error));
  }

  const code = q.code ? String(q.code) : '';
  const state = q.state ? String(q.state) : '';
  const expected = parseCookies(req.headers.cookie)[STATE_COOKIE] || '';

  if (!code) return back(res, 'TikTok returned no authorization code.');

  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a length mismatch rather than returning false.
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  const stateOk = expected && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!stateOk) {
    return back(res, 'State mismatch -- authorization rejected. Start again from Connect TikTok.');
  }

  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || '',
    client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI || 'https://sparkdate.date/tiktok/callback',
  });

  let json;
  try {
    // Form encoding, not JSON. Posting JSON here returns a generic
    // invalid_request -- the same trap lib/tiktok-auth.js documents.
    const r = await fetch(ENDPOINTS.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    json = await r.json().catch(() => null);
    if (!json) return back(res, `Token exchange failed: HTTP ${r.status}`);
  } catch (e) {
    return back(res, `Token exchange failed: ${e.message}`);
  }

  if (json.error) {
    return back(res, `${json.error}: ${json.error_description || ''}`.trim());
  }
  if (!json.refresh_token) {
    return back(res, 'No refresh token returned -- check the granted scopes.');
  }

  // Into the SAME store the scheduled publisher reads, so connecting here also
  // credentials the queue. See lib/tiktok-publish.js for why they share one.
  const store = TikTokStore.openStore();
  if (!store) {
    return back(res, 'Connected, but Firebase is not configured so the token could not be saved.');
  }
  try {
    await store.write(json.refresh_token, {
      open_id: json.open_id || null,
      scope: json.scope || null,
      connected_at: new Date().toISOString(),
      connected_via: 'admin-ui',
    });
  } catch (e) {
    // The access token is live but unsaved: this connection works until it
    // expires and then nothing does. Better to say so than to show success.
    return back(res, `Authorized, but saving the token failed: ${e.message}`);
  }

  return back(res, null);
};

module.exports.STATE_COOKIE = STATE_COOKIE;
