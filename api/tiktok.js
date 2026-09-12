// api/tiktok.js
//
// Everything /admin/tiktok does except the OAuth redirect, behind one function
// dispatched on `action`.
//
// WHY ONE FUNCTION AND NOT SEVEN
//
// The delivered design had a route per operation, which is idiomatic in the
// App Router and wrong here: api/ already holds 16 functions and
// .github/workflows/social-publish.yml records that 12 is this project's
// Vercel plan cap -- the reason the social publisher runs on GitHub Actions
// instead of a Vercel cron at all. Seven more routes for one admin screen is
// not a trade this project can make. Only the callback needs its own URL,
// because TikTok has that one registered.
//
// EVERY ACTION HERE IS ADMIN-ONLY
//
// requireAdmin() verifies a Firebase ID token carrying the `admin: true`
// custom claim -- the same gate api/seed-venues.js and api/send-venue-outreach.js
// use, and the same one public/admin.html already signs in against. The
// delivered code shipped its own ADMIN_PASSWORD sha256 cookie; adding a second,
// weaker auth system next to the existing one was not worth the two routes it
// saved.

'use strict';

const crypto = require('crypto');
const { requireAdmin } = require('../lib/auth');
const TikTokStore = require('../lib/tiktok-token-store');
const {
  ENDPOINTS, SCOPES, validatePost, interactionFlags,
  tiktokPost, creatorInfoOk, readRawBody, uploadBytes, sourceInfo,
} = require('../lib/tiktok-publish');
const { STATE_COOKIE } = require('./tiktok-callback');

const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'https://sparkdate.date/tiktok/callback';

// A bare Vercel 502 with no log line is what a crashed function looks like,
// and it reaches the browser as a body-less response the page can only report
// as "Upload failed." Every stage therefore announces itself, so the next
// failure names the step it died on instead of the whole request.
const step = (msg) => console.error(`[tiktok] ${msg}`);

function json(res, status, body) {
  // Sending twice throws ERR_STREAM_WRITE_AFTER_END, which kills the process
  // and produces exactly the logless 502 described above -- so a handler that
  // has already answered must never be answered over by the outer catch.
  if (res.writableEnded || res.headersSent) {
    step(`suppressed a second response (${status}) -- already answered`);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** An access token for this run, or null when TikTok is not connected. */
async function token() {
  const t = await TikTokStore.acquireAccessToken(process.env, { log: () => {} });
  return (t && t.accessToken) || null;
}

/** creator_info, or an {error} object. Never trusts a cached copy. */
async function creatorInfo(accessToken) {
  const { json: body } = await tiktokPost(ENDPOINTS.creatorInfo, accessToken, {});
  if (!creatorInfoOk(body)) {
    return { error: (body && body.error && body.error.message) || 'creator_info failed' };
  }
  return { data: body.data };
}

// --------------------------------------------------------------- actions

async function actionConnect(req, res) {
  // The state cookie is set on this XHR response and read later by the browser
  // navigation TikTok redirects back to. SameSite must be Lax, not Strict:
  // Strict would withhold the cookie on a cross-site redirect and every
  // authorization would fail the state check.
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );

  const url = new URL(ENDPOINTS.authorize);
  url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY || '');
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);

  return json(res, 200, { authorizeUrl: url.toString() });
}

async function actionCreatorInfo(req, res) {
  const accessToken = await token();
  if (!accessToken) return json(res, 200, { connected: false });

  const info = await creatorInfo(accessToken);
  if (info.error) return json(res, 502, { connected: true, error: info.error });
  return json(res, 200, { connected: true, data: info.data });
}

async function actionPost(req, res) {
  const accessToken = await token();
  if (!accessToken) return json(res, 401, { error: 'Not connected to TikTok.' });

  const q = req.query || {};
  const buf = await readRawBody(req);
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  step(`post: received ${buf.length} bytes, content-type=${mime || '(none)'}`);

  // Re-query rather than trusting anything the page sent. TikTok grades the
  // server, and a reviewer will try a request the UI would not have produced.
  const info = await creatorInfo(accessToken);
  if (info.error) return json(res, 502, { error: info.error });
  step('post: creator_info ok');

  const opts = {
    creator: info.data,
    privacyLevel: String(q.privacy_level || ''),
    discloseCommercial: q.disclose === 'true',
    yourBrand: q.your_brand === 'true',
    brandedContent: q.branded_content === 'true',
    mime,
    size: buf.length,
  };
  const bad = validatePost(opts);
  if (bad) return json(res, 400, { error: bad });

  const flags = interactionFlags(info.data, {
    allowComment: q.allow_comment === 'true',
    allowDuet: q.allow_duet === 'true',
    allowStitch: q.allow_stitch === 'true',
  });

  const init = await tiktokPost(ENDPOINTS.publishInit, accessToken, {
    post_info: {
      title: String(q.title || '').slice(0, 2200),
      privacy_level: opts.privacyLevel,
      ...flags,
      brand_content_toggle: opts.discloseCommercial && opts.brandedContent,
      brand_organic_toggle: opts.discloseCommercial && opts.yourBrand,
    },
    source_info: sourceInfo(buf.length),
  });

  if (!init.json || !init.json.error || init.json.error.code !== 'ok') {
    step(`post: init refused -- ${JSON.stringify(init.json && init.json.error)}`);
    return json(res, 502, {
      error: (init.json && init.json.error && init.json.error.message) || 'Publish init failed.',
      code: init.json && init.json.error && init.json.error.code,
    });
  }

  const { publish_id, upload_url } = init.json.data;
  step(`post: init ok, publish_id=${publish_id}, uploading ${buf.length} bytes`);

  const uploadError = await uploadBytes(upload_url, buf, mime);
  if (uploadError) {
    step(`post: ${uploadError}`);
    return json(res, 502, { error: uploadError, publish_id });
  }

  step(`post: upload complete, publish_id=${publish_id}`);
  return json(res, 200, { ok: true, publish_id });
}

async function actionDraft(req, res) {
  const accessToken = await token();
  if (!accessToken) return json(res, 401, { error: 'Not connected to TikTok.' });

  const buf = await readRawBody(req);
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();

  // The inbox path takes no post_info at all -- caption, privacy and
  // interaction settings are chosen by the creator inside the TikTok app when
  // they open the draft. So only the file itself is validated here.
  const bad = validatePost({
    creator: { privacy_level_options: ['__draft__'] },
    privacyLevel: '__draft__',
    mime,
    size: buf.length,
  });
  if (bad) return json(res, 400, { error: bad });

  const init = await tiktokPost(ENDPOINTS.publishInbox, accessToken, {
    source_info: sourceInfo(buf.length),
  });
  if (!init.json || !init.json.error || init.json.error.code !== 'ok') {
    return json(res, 502, {
      error: (init.json && init.json.error && init.json.error.message) || 'Draft init failed.',
      code: init.json && init.json.error && init.json.error.code,
    });
  }

  const { publish_id, upload_url } = init.json.data;
  const uploadError = await uploadBytes(upload_url, buf, mime);
  if (uploadError) return json(res, 502, { error: uploadError, publish_id });

  return json(res, 200, { ok: true, publish_id, draft: true });
}

async function actionStatus(req, res) {
  const publishId = String((req.query || {}).publish_id || '');
  if (!publishId) return json(res, 400, { error: 'publish_id required' });

  const accessToken = await token();
  if (!accessToken) return json(res, 401, { error: 'Not connected to TikTok.' });

  const { json: body } = await tiktokPost(ENDPOINTS.publishStatus, accessToken, { publish_id: publishId });
  return json(res, 200, body);
}

async function actionDisconnect(req, res) {
  // Deletes the shared refresh token, so this stops the SCHEDULED publisher
  // too. The UI says so on the button; repeating it here because a future
  // reader of this function will not have the button in front of them.
  const store = TikTokStore.openStore();
  if (!store) return json(res, 200, { ok: true, note: 'No store configured; nothing to clear.' });
  await store.write('', { disconnected_at: new Date().toISOString() });
  return json(res, 200, { ok: true });
}

const ACTIONS = {
  connect: actionConnect,
  'creator-info': actionCreatorInfo,
  post: actionPost,
  draft: actionDraft,
  status: actionStatus,
  disconnect: actionDisconnect,
};

module.exports = async function handler(req, res) {
  try {
    await requireAdmin(req);
  } catch (e) {
    // lib/auth.js sets `statusCode`, not `status` -- reading the wrong one
    // turns every 403 "not an admin" into a 401 "not signed in", which sends
    // the operator to re-authenticate against a problem that is not auth.
    return json(res, e.statusCode || 401, { error: e.message || 'unauthorized' });
  }

  const action = String((req.query || {}).action || '');
  const fn = ACTIONS[action];
  if (!fn) return json(res, 400, { error: `Unknown action: ${action || '(none)'}` });

  try {
    return await fn(req, res);
  } catch (e) {
    // Logged as well as returned: when the response has already been sent,
    // json() suppresses the write and the log line is the only record left.
    step(`${action} threw: ${e && e.stack ? e.stack : e}`);
    return json(res, 500, { error: e.message || 'Unexpected error' });
  }
};
