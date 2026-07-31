// lib/email-identity.js
//
// Deciding whether two email strings belong to the SAME person. Used by the
// door check-in flow (api/lead-signup.js handleCheckin) and the duplicate
// audit (scripts/audit-duplicate-attendees.js) so both agree on identity.
//
// Why this exists: check-in looked people up with a single exact
// admin.auth().getUserByEmail(lowercased) call. When that missed, it created
// a SECOND Firebase account for someone who already had one, producing two
// event_registrations rows for one human — inflating rosters and splitting
// their match list. Confirmed live on two events:
//
//   Luke DeBonis  — lukedebonis@mac.com on his Eventbrite ticket vs
//                   lukedebonis@me.com at the door. Apple serves @me.com,
//                   @mac.com and @icloud.com as one inbox; Firebase Auth
//                   treats them as three unrelated addresses.
//   Rose / Casey  — a plus-one/guest registration row stored with different
//                   capitalization than what they typed at the door, so the
//                   guest-row backfill query (an exact `where email ==`)
//                   never matched it.
//
// Scope note: Gmail's dot-insensitivity and +tag folding are deliberately NOT
// implemented. Neither appeared in the real data, both are riskier (plenty of
// providers treat dots as significant), and a false merge joins two different
// people's contact info on a mutual match — much worse than a duplicate row.

'use strict';

// Apple issues these three as interchangeable aliases for one iCloud inbox.
const APPLE_ALIAS_DOMAINS = new Set(['me.com', 'mac.com', 'icloud.com']);

function splitEmail(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().trim();
  const at = s.lastIndexOf('@');
  if (at <= 0 || at === s.length - 1) return null;
  return { local: s.slice(0, at), domain: s.slice(at + 1), full: s };
}

// Canonical identity key for an email — compare these, don't compare raw
// strings. Case- and whitespace-insensitive, with Apple aliases collapsed to
// a single domain. Returns '' for anything unparseable so callers can skip it
// rather than grouping all the junk together.
function normalizeEmail(raw) {
  const p = splitEmail(raw);
  if (!p) return String(raw == null ? '' : raw).toLowerCase().trim();
  return APPLE_ALIAS_DOMAINS.has(p.domain) ? `${p.local}@icloud.com` : p.full;
}

// True when two raw email strings should be treated as the same person.
function sameEmailIdentity(a, b) {
  const na = normalizeEmail(a);
  return !!na && na === normalizeEmail(b);
}

// The concrete address strings worth trying against a store that only does
// exact lookups (Firebase Auth's getUserByEmail, or a Firestore `where email
// ==` query). Ordered most- to least-likely; always includes the plain
// lowercased input first so the common path costs exactly one lookup.
function emailLookupVariants(raw) {
  const p = splitEmail(raw);
  if (!p) return [];
  const out = [p.full];
  if (APPLE_ALIAS_DOMAINS.has(p.domain)) {
    for (const d of APPLE_ALIAS_DOMAINS) {
      const v = `${p.local}@${d}`;
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

module.exports = {
  APPLE_ALIAS_DOMAINS,
  normalizeEmail,
  sameEmailIdentity,
  emailLookupVariants,
};
