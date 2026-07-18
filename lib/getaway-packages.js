// lib/getaway-packages.js
//
// Canonical list of the coming-soon multi-day retreat packages shown on
// the events page's "Getaways" section. This is the server-side source
// of truth for validation (api/lead-signup.js's getaway_interest action
// rejects any packageId not in this list, so a client can't write an
// arbitrary Firestore document). There's no shared client/server JS
// bundle in this repo (every page's JS is inline), so public/events.html
// keeps its own copy of this same list for rendering — if a package is
// ever added, renamed, or removed, update both places together.

const GETAWAY_PACKAGES = [
  { id: 'island-paradise', name: 'Remote Island Paradise' },
  { id: 'cruise', name: 'Singles Cruise' },
  { id: 'fiji-volcano', name: 'Fiji & Volcano Adventure' },
  { id: 'spa-resort', name: 'Spa Getaway & Resort' },
  { id: 'cabin-retreat', name: 'Cabin Retreat' },
  { id: 'palm-springs', name: 'Palm Springs Desert Escape' },
  { id: 'taos-new-mexico', name: 'Taos, New Mexico' },
];

const GETAWAY_PACKAGE_IDS = new Set(GETAWAY_PACKAGES.map((p) => p.id));

function isValidGetawayPackageId(id) {
  return typeof id === 'string' && GETAWAY_PACKAGE_IDS.has(id);
}

module.exports = { GETAWAY_PACKAGES, GETAWAY_PACKAGE_IDS, isValidGetawayPackageId };
