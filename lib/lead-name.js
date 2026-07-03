// lib/lead-name.js
//
// Resolve a personalization first-name for a marketing email.
//
// The `leads` collection is the mailing list, but a lead's `name` field is
// frequently empty: every public signup form collects email only, and the
// Eventbrite/admin enrollment path historically wrote the buyer's name to
// users/tickets/event_registrations but never to their leads doc. The result
// was ticket-holders (who we DO have a name for) being greeted as "there".
//
// This mirrors the source-of-truth fallback the returning-attendee invite and
// the match email already use: prefer the lead's own stored name, then fall
// back to the ticket-holder name from event_registrations (keyed by email via
// a caller-supplied map), then a generic fallback. First word only, so
// "Fatima Ahmed" greets as "Fatima", not "Fatima Ahmed".

function firstWord(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  return s.split(/\s+/)[0];
}

// lead        — the leads/{id} doc data (may have `firstName` and/or `name`)
// nameByEmail — Map<lowercased email, full name> built from event_registrations
// fallback    — what to render when no name is known (e.g. 'there' / 'There')
function resolveLeadName(lead, nameByEmail, fallback) {
  const own = firstWord((lead && (lead.firstName || lead.name)) || '');
  if (own) return own;

  const email = ((lead && lead.email) || '').toLowerCase().trim();
  if (email && nameByEmail && typeof nameByEmail.get === 'function') {
    const fromReg = firstWord(nameByEmail.get(email) || '');
    if (fromReg) return fromReg;
  }

  return fallback;
}

module.exports = { resolveLeadName, firstWord };
