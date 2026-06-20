// lib/profile-link.js
//
// Signed "complete your chemistry profile" magic links for ticket buyers.
// Tokens are HMAC-SHA256 over `profile.<uid>` so a leaked URL can't be
// replayed against a different user, and the uid can't be forged without the
// secret. No-login: the token IS the authorization for api/complete-profile.
// Mirrors lib/unsubscribe.js. Used by:
//   - api/purchase-ticket.js      (post-purchase email link)
//   - api/cron-send-emails.js     (pre-event reminder link)
//   - api/complete-profile.js     (verifies the token)

const crypto = require('crypto');

// Resolve at call-time so a misconfigured deploy fails loudly rather than
// signing with a guessable fallback. Shares the unsubscribe secret.
const SECRET = () => {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    throw new Error(
      'lib/profile-link: neither UNSUBSCRIBE_SECRET nor STRIPE_WEBHOOK_SECRET is set. ' +
      'Set UNSUBSCRIBE_SECRET in Vercel env to a long random string.'
    );
  }
  return s;
};

// Scoped signer: `<scope>.<uid>` so a token minted for one purpose (e.g.
// "profile") can't be replayed for another (e.g. "match").
function signScope(scope, uid) {
  return crypto.createHmac('sha256', SECRET())
    .update(`${scope}.${uid}`)
    .digest('hex')
    .slice(0, 32);
}

// Constant-time verify so timing can't be used to brute-force the signature.
function verifyScope(scope, uid, sig) {
  if (!uid || !sig) return false;
  const expected = signScope(scope, uid);
  const got = String(sig);
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

const sign = (uid) => signScope('profile', uid);

// "Complete your chemistry profile" magic link.
function makeProfileUrl(uid) {
  return `https://sparkdate.date/profile?uid=${encodeURIComponent(uid)}&t=${sign(uid)}`;
}
function verifyProfileToken(uid, sig) {
  return verifyScope('profile', uid, sig);
}

// "Who did you click with" post-event matching magic link (no login).
function makeMatchUrl(uid) {
  return `https://sparkdate.date/matches?uid=${encodeURIComponent(uid)}&t=${signScope('match', uid)}`;
}
function verifyMatchToken(uid, sig) {
  return verifyScope('match', uid, sig);
}

module.exports = { makeProfileUrl, verifyProfileToken, sign, makeMatchUrl, verifyMatchToken };
