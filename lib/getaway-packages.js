// lib/getaway-packages.js
//
// Canonical list of the coming-soon multi-day retreat packages. This is the
// server-side source of truth for validation (api/lead-signup.js's
// getaway_interest action rejects any packageId not in this list, so a client
// can't write an arbitrary Firestore document).
//
// There's no shared client/server JS bundle in this repo (every page's JS is
// inline), so the same list is hand-copied for rendering. When a package is
// added, renamed, or removed, update ALL of these together:
//   1. this file (the server allowlist)
//   2. public/events.html  — the getaways widget's JS array
//   3. public/getaways.html — the STATIC card markup in the .getaways-grid
//   4. public/getaways.html — the ItemList JSON-LD in <head>
// A missed copy is silent: a stale card's vote 400s ("Unknown package"), and
// stale JSON-LD advertises packages that don't exist.

// NB on ids vs names, since the two carry very different risk:
//   `id` is a Firestore document key in `getaway_interest` (where the vote
//   counts live) and is also persisted on lead docs — renaming one orphans
//   every existing vote for that package. Treat ids as immutable.
//   `name` is display-only: nothing looks up, validates, or stores it, so a
//   rename can't corrupt data. It is NOT, however, a one-line change — it
//   still requires every copy in the 4-item list above, plus any prose that
//   names packages (getaways.html's meta/og description, its FAQ answers and
//   .seo-copy, and the blog posts that reference the lineup). Nothing
//   enforces this: tests/getaway-packages.test.js checks ids and non-empty
//   strings only, so name drift fails silently and visibly to users.
const GETAWAY_PACKAGES = [
  { id: 'island-paradise', name: 'Caribbean Island Paradise' },
  { id: 'cruise', name: '7-Day Singles Cruise' },
  { id: 'fiji-volcano', name: 'Fiji & Volcano Adventure' },
  { id: 'spa-resort', name: 'Spa & Wellness Weekend' },
  { id: 'cabin-retreat', name: 'Rocky Mountain Cabin Retreat' },
  { id: 'palm-springs', name: 'Palm Springs Desert Escape' },
  { id: 'taos-new-mexico', name: 'Taos, New Mexico' },
];

const GETAWAY_PACKAGE_IDS = new Set(GETAWAY_PACKAGES.map((p) => p.id));

function isValidGetawayPackageId(id) {
  return typeof id === 'string' && GETAWAY_PACKAGE_IDS.has(id);
}

module.exports = { GETAWAY_PACKAGES, GETAWAY_PACKAGE_IDS, isValidGetawayPackageId };
