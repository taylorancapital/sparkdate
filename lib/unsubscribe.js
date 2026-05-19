// lib/unsubscribe.js
//
// Shared helper for CAN-SPAM unsubscribe links.
//
// Tokens are HMAC-SHA256 over `<leadId>.<email>` so a leaked URL can't
// be replayed against a different lead, and the lead ID can't be
// guessed without the secret. Required by:
//   - api/unsubscribe.js          (verifies + writes subscribed:false)
//   - api/cron-send-emails.js     (renders per-lead unsubscribe URLs)
//   - api/webhook-formspree.js    (renders the welcome-email URL)

const crypto = require('crypto');

// Falls back to a stable derived value if not explicitly set so links
// don't go invalid mid-flight on first deploy. Set UNSUBSCRIBE_SECRET in
// production so reverting STRIPE_WEBHOOK_SECRET (or any unrelated var)
// doesn't invalidate every outstanding unsubscribe link in the wild.
const SECRET = () =>
  process.env.UNSUBSCRIBE_SECRET
  || process.env.STRIPE_WEBHOOK_SECRET
  || 'sparkdate-unsubscribe-fallback';

function sign(leadId, email) {
  return crypto.createHmac('sha256', SECRET())
    .update(`${leadId}.${(email || '').toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

// Public URL to put inside a marketing email body.
function makeUnsubscribeUrl(leadId, email) {
  const token = `${leadId}.${sign(leadId, email)}`;
  return `https://sparkdate.date/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Parse the token portion of an incoming GET/POST. Returns null on
// malformed input so callers can render the generic "invalid link" page.
function parseToken(raw) {
  const dot = String(raw || '').lastIndexOf('.');
  if (dot < 1) return null;
  return { leadId: raw.slice(0, dot), sig: raw.slice(dot + 1) };
}

// Constant-time signature compare so timing can't be used to brute-force.
function verifySignature(leadId, email, sig) {
  const expected = sign(leadId, email);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

module.exports = { makeUnsubscribeUrl, parseToken, verifySignature };
