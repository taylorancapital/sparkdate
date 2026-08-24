// tests/resend-webhook.test.js
//
// Locks the Svix signature verification behind api/resend-events.js. A
// webhook's signature check is the one part that fails silently when wrong:
// too strict and engagement quietly stops flowing (every event 400s and
// Resend eventually gives up), too loose and anyone who finds the URL can
// mark leads bounced or unsubscribed. Both failure modes look like "the
// webhook works" from the dashboard.
//
// Signatures are forged here exactly the way Svix builds them — HMAC-SHA256
// over "{svix-id}.{svix-timestamp}.{rawBody}" with the base64-decoded secret
// — so these tests break if the verification scheme drifts from Svix's.

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { verifySvix, ID_FIELDS } = require('../lib/resend-webhook.js');

const SECRET = 'whsec_' + Buffer.from('test-signing-key-0123456789').toString('base64');

function sign(body, { id = 'msg_1', ts = String(Math.floor(Date.now() / 1000)), secret = SECRET } = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
}

const BODY = Buffer.from(JSON.stringify({ type: 'email.opened', data: { email_id: 'abc' } }));

describe('verifySvix', () => {
  it('accepts a correctly signed payload', () => {
    const v = verifySvix(BODY, sign(BODY), SECRET);
    expect(v.ok).toBe(true);
    expect(v.id).toBe('msg_1');
  });

  it('rejects a signature made with a different secret', () => {
    const other = 'whsec_' + Buffer.from('some-other-key').toString('base64');
    expect(verifySvix(BODY, sign(BODY, { secret: other }), SECRET).ok).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    expect(verifySvix(Buffer.from('{"forged":true}'), sign(BODY), SECRET).ok).toBe(false);
  });

  it('rejects a replayed capture (timestamp outside the 5-minute window)', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    // re-sign WITH the stale timestamp: the signature itself is valid, only
    // the age is wrong — this is exactly what a replay looks like.
    expect(verifySvix(BODY, sign(BODY, { ts: stale }), SECRET).ok).toBe(false);
  });

  it('rejects when svix headers are missing entirely', () => {
    expect(verifySvix(BODY, {}, SECRET).ok).toBe(false);
    expect(verifySvix(BODY, { 'svix-id': 'msg_1' }, SECRET).ok).toBe(false);
  });

  it('accepts when the valid signature is one of several candidates', () => {
    const h = sign(BODY);
    h['svix-signature'] = 'v1,Zm9yZ2VkZm9yZ2VkZm9yZ2Vk ' + h['svix-signature'];
    expect(verifySvix(BODY, h, SECRET).ok).toBe(true);
  });

  it('rejects a v1 candidate of the wrong length rather than throwing', () => {
    const h = sign(BODY);
    h['svix-signature'] = 'v1,c2hvcnQ=';
    expect(verifySvix(BODY, h, SECRET).ok).toBe(false);
  });
});

describe('ID_FIELDS', () => {
  it('covers exactly the per-send id fields the senders write', () => {
    // lead-signup.js writes resend_id; cron-send-emails.js writes
    // `${emailKey}_resend_id` for the four nurture buckets. If a sender adds
    // a new id field, it must be added here or its engagement is unmatched.
    expect(ID_FIELDS.map(([f]) => f)).toEqual([
      'resend_id',
      'day2_resend_id',
      'day5_resend_id',
      'day14_resend_id',
      'day25_resend_id',
    ]);
  });
});
