// lib/tiktok-publish.js
//
// The Content Posting API calls behind /admin/tiktok, and the rules TikTok's
// reviewers grade.
//
// WHY THE RULES LIVE HERE AND NOT IN THE PAGE
//
// TikTok grades the SERVER behaviour, not just the form. A reviewer will post
// with a tampered request to see whether the app enforces its own UI. So every
// constraint below is checked here, on a freshly-queried creator_info, and the
// page's copy of the same logic is a convenience for the operator rather than
// the enforcement point. `validatePost` is pure so those rules can be tested
// without credentials -- they are the difference between approval and a
// rejection that takes weeks to recover from.
//
// RELATIONSHIP TO THE QUEUE PUBLISHER
//
// This is the manual, one-video-at-a-time path that exists to demonstrate the
// integration for review. `scripts/social.js` is the scheduled path that posts
// content/queue.csv. They are NOT duplicates: the queue cannot demonstrate a
// privacy dropdown, and this page cannot post on a schedule.
//
// They deliberately share one credential. Both resolve their access token
// through lib/tiktok-token-store.js, so connecting here also feeds the queue,
// and a rotation from either side is persisted once. The cost is that
// disconnecting here disconnects the queue too -- said plainly in the UI,
// because one TikTok account with two independent token stores would be a
// worse trap than the shared one.

'use strict';

const ENDPOINTS = {
  authorize: 'https://www.tiktok.com/v2/auth/authorize/',
  token: 'https://open.tiktokapis.com/v2/oauth/token/',
  creatorInfo: 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
  publishInit: 'https://open.tiktokapis.com/v2/post/publish/video/init/',
  publishInbox: 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
  publishStatus: 'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
};

// video.upload cannot be removed in the portal -- it ships bundled with the
// Content Posting API and the Scopes list has no remove control. Since every
// requested scope has to be demonstrated in the review video, the drafts path
// exists to exercise it. Removing it from this list would not remove it from
// the app; it would only mean the demo cannot show it.
const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

const ACCEPTED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

// Vercel caps a serverless request body at ~4.5MB. The file travels
// browser -> this function -> TikTok, so that ceiling is ours too. Checked up
// front to fail with a sentence rather than a platform 413 with no body.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Every reason a post request should be refused, or null when it is allowed.
 *
 * Pure: `creator` is the `data` object from creator_info/query.
 */
function validatePost({ creator, privacyLevel, discloseCommercial, yourBrand, brandedContent, mime, size }) {
  if (!mime || !ACCEPTED_MIME.has(mime)) {
    return `Unsupported file type: ${mime || 'unknown'}. Use mp4, mov or webm.`;
  }
  if (!size || size <= 0) return 'The video file is empty.';
  if (size > MAX_UPLOAD_BYTES) {
    return `That video is ${(size / 1048576).toFixed(1)}MB. This route tops out at ${MAX_UPLOAD_BYTES / 1048576}MB `
      + 'because the file passes through a serverless function -- trim the clip, or migrate to PULL_FROM_URL.';
  }

  // No default privacy value is offered anywhere, so an empty one means the
  // operator never chose. TikTok requires an explicit selection.
  if (!privacyLevel) return 'Privacy level must be selected.';

  const allowed = Array.isArray(creator && creator.privacy_level_options) ? creator.privacy_level_options : [];
  if (!allowed.includes(privacyLevel)) {
    return `Privacy level ${privacyLevel} is not available for this account.`;
  }

  // TikTok's rule, not ours: branded content cannot be posted privately.
  if (brandedContent && privacyLevel === 'SELF_ONLY') {
    return 'Branded content cannot be set to private (Only me).';
  }

  // Disclosing commercial content means saying WHICH kind. Neither box ticked
  // is an incomplete declaration rather than a harmless default.
  if (discloseCommercial && !yourBrand && !brandedContent) {
    return 'Disclosing commercial content requires Your brand, Branded content, or both.';
  }

  return null;
}

/**
 * The interaction flags to send, given what the creator allows.
 *
 * A creator who has turned comments off in their TikTok settings must not have
 * them re-enabled by this tool, so the creator's setting always wins over the
 * form. Returned as TikTok's `disable_*` sense rather than the UI's "allow"
 * sense, because inverting it at the call site is how one of the three ends up
 * backwards.
 */
function interactionFlags(creator, { allowComment, allowDuet, allowStitch } = {}) {
  const c = creator || {};
  return {
    disable_comment: c.comment_disabled ? true : !allowComment,
    disable_duet: c.duet_disabled ? true : !allowDuet,
    disable_stitch: c.stitch_disabled ? true : !allowStitch,
  };
}

/** POST JSON to a TikTok endpoint with a bearer token. */
async function tiktokPost(url, accessToken, body, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** True when a creator_info response actually succeeded. */
function creatorInfoOk(json) {
  return Boolean(json && json.error && json.error.code === 'ok' && json.data);
}

/**
 * Read the raw request body as a Buffer.
 *
 * The video arrives as a raw body with a video/* content type rather than as
 * multipart form data, deliberately: parsing multipart in a plain Vercel
 * function means adding a dependency to a repo that has four, to solve a
 * problem that only exists because the metadata could travel in the query
 * string instead.
 *
 * Vercel's Node runtime may or may not have buffered the body already
 * depending on content type, so both cases are handled -- draining an
 * already-consumed stream returns empty, which would look like an empty file.
 */
function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** PUT the bytes to the upload_url TikTok handed back from init. */
async function uploadBytes(uploadUrl, buf, mime, { fetchImpl = fetch } = {}) {
  const size = buf.length;
  const res = await fetchImpl(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mime,
      'Content-Length': String(size),
      // Single chunk. TikTok permits this up to 64MB; our own ceiling is far
      // below that, so total_chunk_count is always 1.
      'Content-Range': `bytes 0-${size - 1}/${size}`,
    },
    body: buf,
  });
  if (res.ok) return null;
  const text = await res.text().catch(() => '');
  return `Upload failed (${res.status}). ${text.slice(0, 300)}`;
}

/** source_info for a single-chunk FILE_UPLOAD of `size` bytes. */
function sourceInfo(size) {
  return { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };
}

module.exports = {
  ENDPOINTS, SCOPES, ACCEPTED_MIME, MAX_UPLOAD_BYTES,
  validatePost, interactionFlags, tiktokPost, creatorInfoOk,
  readRawBody, uploadBytes, sourceInfo,
};
