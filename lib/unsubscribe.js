// lib/unsubscribe.js
//
// Shared helper for CAN-SPAM unsubscribe links.
//
// Tokens are HMAC-SHA256 over `<leadId>.<email>` so a leaked URL can't
// be replayed against a different lead, and the lead ID can't be
// guessed without the secret. Required by:
//   - api/unsubscribe.js          (verifies + writes subscribed:false)
//   - api/cron-send-emails.js     (renders per-lead unsubscribe URLs)
//   - api/lead-signup.js          (renders the welcome-email URL)

const crypto = require('crypto');

// Resolve at call-time (not module-load) so a misconfigured deploy fails
// LOUDLY on the first email send or unsubscribe click rather than
// silently signing with a publicly-known fallback (audit H3 — the prior
// `|| 'sparkdate-unsubscribe-fallback'` literal meant anyone with the
// source could forge unsubscribe URLs for any lead).
//
// STRIPE_WEBHOOK_SECRET is honored as a legacy fallback so existing
// signed URLs in the wild stay valid; new deploys MUST set
// UNSUBSCRIBE_SECRET in Vercel.
const SECRET = () => {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    // Loud: the cron stops sending nurture emails and /api/unsubscribe
    // returns 500. Both are easier to notice than silent forgeable URLs.
    throw new Error(
      'lib/unsubscribe: neither UNSUBSCRIBE_SECRET nor STRIPE_WEBHOOK_SECRET is set. ' +
      'Set UNSUBSCRIBE_SECRET in Vercel env to a long random string.'
    );
  }
  return s;
};

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
