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

module.exports = { logEventAttended, lockId };
