// lib/resend-webhook.js
//
// The verification half of api/resend-events.js, split out so it can be unit
// tested the way everything else in lib/ is. Signature checking is the one
// part of a webhook that fails silently when wrong — either rejecting every
// real event (engagement quietly stops flowing) or accepting forged ones
// (anyone can mark leads bounced/unsubscribed) — so it gets locked by tests
// rather than trusted.

'use strict';

const crypto = require('crypto');

// Svix signature verification (Resend signs with Svix), dependency-free to
// match the rest of this codebase. Scheme: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{rawBody}" keyed with the base64-decoded secret
// (after the whsec_ prefix); the svix-signature header carries one or more
// space-separated "v1,<base64>" candidates, any one matching passes.
function verifySvix(rawBody, headers, secret) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !timestamp || !sigHeader) return { ok: false, reason: 'missing svix headers' };

  // Reject stale timestamps: a replayed capture should not update leads.
  const skewSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skewSec) || skewSec > 5 * 60) return { ok: false, reason: 'timestamp outside tolerance' };

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  const ok = sigHeader.split(' ').some((candidate) => {
    const [version, sig] = candidate.split(',');
    if (version !== 'v1' || !sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
  return ok ? { ok: true, id } : { ok: false, reason: 'no signature matched' };
}

// Which lead field holds this Resend id → which email it was. Checked in
// send-frequency order so the common case (a fresh welcome) hits on query one.
// Five equality queries worst-case, on single-field auto-indexes — at this
// account's send volume that is nothing, and it needs no cron change and no
// backfill, unlike an id→lead index collection.
const ID_FIELDS = [
  ['resend_id', 'welcome'],
  ['day2_resend_id', 'day2'],
  ['day5_resend_id', 'day5'],
  ['day14_resend_id', 'day14'],
  ['day25_resend_id', 'day25'],
];

module.exports = { verifySvix, ID_FIELDS };
