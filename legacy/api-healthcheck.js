// legacy/api-healthcheck.js  (formerly api/healthcheck.js)
//
// Parked here because Vercel's Hobby plan caps at 12 serverless
// functions per deployment and `api/next-event.js` (used by the
// landing-page Get-Tickets block) needed the slot more.
//
// To restore: move this file back to `api/healthcheck.js`. You'll need
// to either upgrade to Vercel Pro (no function cap) or relocate a
// different endpoint to legacy/ to stay under the limit.
//
// Operational visibility endpoint. Lets you verify a fresh deploy is
// wired up correctly without poking at the actual product.
//
// Two response modes:
//
//   - Public (no auth): minimal `{ ok, ts, commit }`. Safe for uptime
//     monitors and load balancers — leaks nothing useful to attackers.
//
//   - Admin (Authorization: Bearer <id-token-with-admin-claim>):
//     full detail — which required env vars are missing (names only,
//     never values), which optional vars are set, Firestore round-trip
//     latency. Use this to debug a broken deploy.
//
// Always returns HTTP 200 even on partial failure; the body's `ok`
// flag is the source of truth. This avoids 5xx noise in uptime
// dashboards when one sub-check is flaky but the site otherwise works.

const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

// Names only — never serialize values into the response.
const REQUIRED_ENV = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'CRON_SECRET',
];

// Optional — useful to surface so admin can see what's set, but not
// fatal if missing.
const OPTIONAL_ENV = [
  'OUTREACH_FROM',
  'OUTREACH_PHONE',
  'OUTREACH_POSTAL_ADDRESS',
  'ALLOWED_ORIGINS',
];

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();

  // Cache at the edge for 30s — uptime monitors typically poll every
  // 60s and the check does a real Firestore round-trip.
  res.setHeader('Cache-Control', 'public, s-maxage=30, max-age=10');

  // Try to detect admin caller without erroring on missing token.
  let isAdmin = false;
  if (req.headers.authorization || req.headers.Authorization) {
    try {
      await requireAdmin(req);
      isAdmin = true;
    } catch (_) { /* fall through to public-mode response */ }
  }

  // Run the checks regardless — we always need `ok` for the public
  // response, even if we strip the detail.
  const envMissing = REQUIRED_ENV.filter(k => !process.env[k]);
  const envOptionalSet = OPTIONAL_ENV.filter(k => !!process.env[k]);

  let firestoreOk = false;
  let firestoreLatencyMs = null;
  let firestoreError = null;
  try {
    const t0 = Date.now();
    await db.collection('_healthcheck').doc('ping').get();
    firestoreLatencyMs = Date.now() - t0;
    firestoreOk = true;
  } catch (e) {
    firestoreError = e.code || e.message || 'unknown';
  }

  const ok = envMissing.length === 0 && firestoreOk;

  const publicResponse = {
    ok,
    ts: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
  };

  if (!isAdmin) {
    return res.status(200).json(publicResponse);
  }

  return res.status(200).json({
    ...publicResponse,
    region: process.env.VERCEL_REGION || null,
    checks: {
      env: {
        ok: envMissing.length === 0,
        missing: envMissing,
        optional_set: envOptionalSet,
      },
      firestore: {
        ok: firestoreOk,
        latencyMs: firestoreLatencyMs,
        error: firestoreError,
      },
    },
  });
};
