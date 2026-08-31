// lib/activity-log.js
//
// Records a REAL "attended" activity-feed entry — one that can only ever be
// true after the event actually happened. This exists because the original
// event_attended write fired at ticket-PURCHASE time (see
// api/purchase-ticket.js's now-renamed `ticket_purchased` entry), so the
// admin Activity feed could show "X attended [future event]" before the
// event occurred. There are exactly two legitimate moments attendance is
// actually known:
//   1. Door check-in (api/lead-signup.js handleCheckin) — the person is
//      physically there, right now.
//   2. The post-event cron pass (api/cron-send-emails.js), which only ever
//      runs for events whose date has already passed — covers confirmed
//      registrants who never used the digital check-in flow.
//
// Idempotent via a dedicated event_attendance_logged/{uid}_{eventId} lock
// collection (same pattern as post_event_prompts — a separate collection
// that migration/enrollment scripts never touch, so it can't be silently
// cleared the way a flag on event_registrations was in a prior incident).
// Whichever trigger fires first wins; the other is a no-op.

function lockId(uid, eventId) {
  return `${uid}_${eventId}`;
}

// db         — Firestore instance
// FieldValue — admin.firestore.FieldValue (passed in so this stays unit-testable)
// uid        — required; event_registrations without a userId aren't logged
//              here (mirrors sendPostEventPrompts's existing r.userId gate)
// method     — 'checkin' | 'post_event_pass' — recorded on the lock doc for
//              observability, not used for any logic branch
async function logEventAttended(db, FieldValue, { uid, email, name, eventId, eventName, method }) {
  if (!uid || !eventId) return { logged: false, reason: 'missing uid/eventId' };

  const lockRef = db.collection('event_attendance_logged').doc(lockId(uid, eventId));
  const lockSnap = await lockRef.get();
  if (lockSnap.exists) return { logged: false, reason: 'already_logged' };

  await db.collection('activity').add({
    type: 'event_attended',
    userId: uid,
    userEmail: email || null,
    userName: name || email || null,
    details: { eventName: eventName || 'an event' },
    createdAt: FieldValue.serverTimestamp(),
  });
  await lockRef.set({
    userId: uid,
    eventId,
    method: method || 'unknown',
    loggedAt: new Date().toISOString(),
  });
  return { logged: true };
}

// Records the "bought a ticket" activity-feed entry for a seat that arrived
// through lib/enroll.js — Eventbrite, Meetup, a manual import, a comp, a
// correction.
//
// WHY THIS EXISTS: until now `activity` had exactly one ticket writer,
// api/purchase-ticket.js, so the admin Activity feed was a log of DIRECT
// web-checkout sales and nothing else. Eventbrite is the largest sales
// channel in the business; every one of those buyers landed in `tickets`,
// `event_registrations`, `leads` and the seat counter, and appeared in none
// of the feeds. An admin reading Activity saw a fraction of the night's
// sales and no marker saying the rest was missing.
//
// IDEMPOTENT BY DETERMINISTIC DOC ID — activity/tix_{ticketId} — rather than
// by a separate lock collection. Enrollment is re-run constantly (the sync
// runs every 6h over a 45-day window, the Enroll tab can be re-pasted, the
// backfill script can be re-run), so an .add() here would pile up duplicates
// of the same sale. One ticket is one feed entry, for ever, whoever writes it.
//
// createdAt is a PARAMETER, not always a server timestamp: the backfill
// (scripts/backfill-activity-from-tickets.js) passes each ticket's own
// createdAt so historical sales land in the feed at the moment they actually
// happened. Stamping them "now" would bury every real entry under a wall of
// same-second imports.
async function logTicketEnrolled(db, FieldValue, {
  ticketId, uid, email, name, eventId, eventName, amountCents, channel, isComp, createdAt,
}) {
  if (!ticketId) return { logged: false, reason: 'missing ticketId' };

  const ref = db.collection('activity').doc(`tix_${ticketId}`);
  const snap = await ref.get();
  if (snap.exists) return { logged: false, reason: 'already_logged' };

  const cents = parseInt(amountCents, 10);
  await ref.set({
    type: 'ticket_purchased',
    userId: uid || null,
    userEmail: email || null,
    userName: name || email || null,
    details: {
      eventName: eventName || 'an event',
      // Dollars, matching api/purchase-ticket.js's `amount: amount / 100` —
      // the feed renderer formats this field directly.
      amount: Number.isFinite(cents) ? cents / 100 : 0,
      // What the feed needs to say "via Eventbrite" instead of implying every
      // sale came through web checkout.
      channel: channel || 'direct',
      isComp: !!isComp,
      eventId: eventId || null,
      ticketId,
    },
    createdAt: createdAt || FieldValue.serverTimestamp(),
  });
  return { logged: true };
}

module.exports = { logEventAttended, logTicketEnrolled, lockId };
