// api/_cors.js
// Shared CORS helper. Replaces the loose `*.vercel.app` regex that allowed
// any random Vercel preview to call our APIs.
//
// Allowed origins:
//   - https://sparkdate.date and https://www.sparkdate.date (prod)
//   - Anything in process.env.ALLOWED_ORIGINS (comma-separated)
//     e.g. "https://sparkdate-git-feature-acme.vercel.app,http://localhost:3000"
//
// On OPTIONS preflight: returns 204 immediately.
// On disallowed origins: omits the Access-Control-Allow-Origin header,
// which the browser will treat as a CORS failure (request is blocked).

const STATIC_ALLOWLIST = new Set([
  'https://sparkdate.date',
  'https://www.sparkdate.date',
]);

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return new Set([...STATIC_ALLOWLIST, ...fromEnv]);
}

function isAllowed(origin) {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  if (allowed.has(origin)) return true;
  // Allow this project's own Vercel preview URLs by default. They follow
  // a stable pattern: https://sparkdate-<branch-hash>-<team>.vercel.app
  // We allow only deployments under the sparkdate project (NOT any vercel.app)
  // to keep the surface tight.
  if (/^https:\/\/sparkdate(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
  return false;
}

/**
 * Apply CORS headers. Call early in every handler, before any other logic.
 * Returns true if the request is an OPTIONS preflight that should short-
 * circuit (the handler must `return res.status(204).end()` in that case).
 */
function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  return req.method === 'OPTIONS';
}

module.exports = { applyCors, isAllowed };
