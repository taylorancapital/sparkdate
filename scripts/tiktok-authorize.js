#!/usr/bin/env node
// scripts/tiktok-authorize.js
//
// One-time bootstrap: turn a TikTok developer app into a stored refresh token
// the unattended publisher can use forever.
//
// This exists because the refresh token cannot be created by a machine. It
// comes out of an OAuth authorization that a HUMAN performs while signed in
// as the SparkDate TikTok account -- that sign-in is the whole point of the
// handshake, and no API call substitutes for it. After this runs once, the
// token rotates itself in Firestore (see lib/tiktok-token-store.js) and
// nobody touches it again.
//
// Usage:
//
//   1. Put the app's credentials in this shell:
//        $env:TIKTOK_CLIENT_KEY    = "..."
//        $env:TIKTOK_CLIENT_SECRET = "..."
//      plus the three FIREBASE_* variables, so the result can be stored.
//
//   2. node scripts/tiktok-authorize.js
//      It prints a URL. Open it in a browser SIGNED IN AS SPARKDATE, approve,
//      and TikTok redirects to the app's configured redirect URI with a
//      `code=` parameter in the address bar.
//
//   3. node scripts/tiktok-authorize.js --code=<that code>
//      Exchanges the code, writes the refresh token to Firestore, and prints
//      nothing secret unless the write fails.
//
// The redirect URI must match the app's registered one EXACTLY, including
// scheme and any trailing slash -- TikTok rejects a mismatch with a generic
// invalid_request that names nothing. Override with --redirect= when the
// registered value is not the default below.

'use strict';

const crypto = require('crypto');
const TikTokStore = require('../lib/tiktok-token-store');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// A redirect URI has to exist and has to match, but nothing needs to be
// LISTENING on it -- the code arrives in the browser's address bar and is
// copied by hand. Pointing it at the real site avoids registering a localhost
// URI that would otherwise sit in the app config forever.
const DEFAULT_REDIRECT = 'https://sparkdate.date/tiktok/callback';

// video.publish is what UPLOAD_TO_DRAFT and DIRECT_POST both require.
// user.info.basic is what creator_info/query needs, which is how preflight
// reports the account's allowed privacy levels -- i.e. whether the audit has
// cleared. Asking for less makes preflight blind.
const SCOPES = 'user.info.basic,video.publish,video.upload';

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in this shell.`);
    console.error('See the header of this file for the full sequence.');
    process.exit(2);
  }
}

function printAuthUrl(redirect) {
  requireEnv('TIKTOK_CLIENT_KEY');

  // CSRF state. Nothing here can verify it -- there is no listener on the
  // other end -- but TikTok echoes it back, so a mismatched state in the
  // redirect is a visible sign the response did not come from this request.
  const state = crypto.randomBytes(12).toString('hex');

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('state', state);

  console.log('');
  console.log('1. Sign in to TikTok AS THE SPARKDATE ACCOUNT first, in the');
  console.log('   same browser. Whichever account is signed in is the one');
  console.log('   this token will post as -- there is no later prompt.');
  console.log('');
  console.log('2. Open:');
  console.log('');
  console.log(`   ${url.toString()}`);
  console.log('');
  console.log(`3. Approve. You land on ${redirect}?code=...&state=${state}`);
  console.log('   (that page will 404 -- expected, nothing is listening.)');
  console.log('   Copy the code value out of the address bar.');
  console.log('');
  console.log('4. node scripts/tiktok-authorize.js --code=<code>');
  console.log('');
  console.log('   The code expires in minutes and is single-use. If step 4');
  console.log('   reports an invalid code, just run this again for a new URL.');
  console.log('');
}

async function exchange(code, redirect) {
  requireEnv('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET');

  // Form encoding, not JSON -- same trap lib/tiktok-auth.js documents for the
  // refresh call. Posting JSON returns a generic invalid_request.
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code: decodeURIComponent(code),
    grant_type: 'authorization_code',
    redirect_uri: redirect,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`token exchange failed: HTTP ${res.status}`);
  if (json.error) {
    throw new Error(`${json.error}: ${json.error_description || ''}`);
  }
  if (!json.refresh_token) {
    throw new Error('no refresh_token in the response -- check the granted scopes');
  }

  console.log('');
  console.log(`  access token   valid ${Math.round((json.expires_in || 0) / 60)} min`);
  console.log(`  refresh token  valid ${Math.round((json.refresh_expires_in || 0) / 86400)} days`);
  console.log(`  scopes         ${json.scope || '(none reported)'}`);
  if (json.scope && !json.scope.includes('video.publish')) {
    console.log('');
    console.log('  !! video.publish was NOT granted. Publishing will fail.');
    console.log('     Add it to the app in the developer portal and re-authorize.');
  }

  const store = TikTokStore.openStore();
  if (!store) {
    console.log('');
    console.log('  !! Firebase is not configured in this shell, so the token was');
    console.log('     NOT stored. Set it as the TIKTOK_REFRESH_TOKEN secret:');
    console.log('');
    console.log(`     ${json.refresh_token}`);
    console.log('');
    console.log('     It will move itself into Firestore on the first run that');
    console.log('     has Firebase credentials.');
    return;
  }

  await store.write(json.refresh_token, { seeded_at: new Date().toISOString() });
  console.log('');
  console.log(`  stored in Firestore: ${TikTokStore.COLLECTION}/${TikTokStore.DOC_ID}`);
  console.log('');
  console.log('  Do NOT also set TIKTOK_REFRESH_TOKEN as a GitHub secret. The');
  console.log('  store wins, and a stale env copy is only there to confuse the');
  console.log('  next person debugging this.');
  console.log('');
  console.log('  Next: set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET as repo');
  console.log('  secrets, then run scripts/social-preflight.js to confirm.');
  console.log('');
}

async function main() {
  const redirect = arg('redirect') || DEFAULT_REDIRECT;
  const code = arg('code');
  if (!code) {
    printAuthUrl(redirect);
    return;
  }
  await exchange(code, redirect);
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}\n`);
  process.exit(1);
});
