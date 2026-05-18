// api/_auth.js
// Shared Firebase ID-token verifier used by mutating API endpoints.
// Vercel ignores files prefixed with `_` from routing, so this is internal-only.

const admin = require('firebase-admin');

// Initialize Admin SDK exactly once across all serverless invocations.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

/**
 * Extract and verify the Firebase ID token from the Authorization header.
 *
 * Returns the decoded token (`{ uid, email, ... }`) or throws an Error with
 * a `.statusCode` (401/403) suitable for the handler to relay.
 *
 * Callers MUST use `decoded.uid` rather than any UID supplied in the request
 * body — that is the entire point of this check.
 */
async function requireAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    const e = new Error('Missing or malformed Authorization header');
    e.statusCode = 401;
    throw e;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    const e = new Error('Invalid or expired auth token');
    e.statusCode = 401;
    throw e;
  }
}

/**
 * Verify the token AND require an `admin: true` custom claim.
 * Use on endpoints that should only be callable by admin dashboard users
 * (seed-venues, send-venue-outreach, future admin-only mutations).
 * Throws 401 if no token, 403 if the token lacks the admin claim.
 */
async function requireAdmin(req) {
  const decoded = await requireAuth(req);
  if (!decoded.admin) {
    const e = new Error('Admin privileges required');
    e.statusCode = 403;
    throw e;
  }
  return decoded;
}

module.exports = { admin, requireAuth, requireAdmin };
