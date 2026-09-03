// lib/add-guest.js
//
// Shared helper for the "add your +1 after you've already bought" links.
//
// Tokens are HMAC-SHA256 over `<ticketId>.<email>`, the same shape and the
// same secret discipline as lib/unsubscribe.js — a leaked URL can't be
// replayed against a different ticket, and a ticket id can't be guessed
// without the secret. Required by:
//   - api/add-guest.js         (verifies, then writes the companion seat)
//   - api/cron-send-emails.js  (renders the per-ticket URL in t7/t1)
//
// WHY THIS EXISTS
//
// The 2-for-1 was reachable from exactly one place: the checkout modal.
// `plusOne` was only ever read from the purchase request body, so the free
// second seat expired at the moment a buyer was least able to use it —
// deciding on her phone, before she had texted anyone. This is the path back.

const crypto = require('crypto');

// Resolve at call-time, not module-load, so a misconfigured deploy fails
// LOUDLY on the first send rather than silently signing with a guessable
// fallback. Same reasoning (and the same legacy fallback) as
// lib/unsubscribe.js — see the long comment there.
const SECRET = () => {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    throw new Error(
      'lib/add-guest: neither UNSUBSCRIBE_SECRET nor STRIPE_WEBHOOK_SECRET is set. ' +
      'Set UNSUBSCRIBE_SECRET in Vercel env to a long random string.'
    );
  }
  return s;
};

// Namespaced with a literal prefix so an add-guest token can never be a
// valid unsubscribe token (or vice versa) even though both sign an
// `<id>.<email>` pair with the same secret.
function sign(ticketId, email) {
  return crypto.createHmac('sha256', SECRET())
    .update(`addguest.${ticketId}.${(email || '').toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

// Public URL to put inside a pre-event email body.
function makeAddGuestUrl(ticketId, email) {
  const token = `${ticketId}.${sign(ticketId, email)}`;
  return `https://sparkdate.date/api/add-guest?token=${encodeURIComponent(token)}`;
}

// Parse the token portion of an incoming GET/POST. Returns null on malformed
// input so callers can render the generic "invalid link" page. lastIndexOf,
// not split: a Firestore doc id cannot contain a dot, but reading the
// signature off the END is correct regardless of what the id holds.
function parseToken(raw) {
  const dot = String(raw || '').lastIndexOf('.');
  if (dot < 1) return null;
  return { ticketId: String(raw).slice(0, dot), sig: String(raw).slice(dot + 1) };
}

// Constant-time compare so timing can't be used to brute-force a signature.
function verifySignature(ticketId, email, sig) {
  const expected = sign(ticketId, email);
  if (String(sig || '').length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
}

module.exports = { makeAddGuestUrl, parseToken, verifySignature };
