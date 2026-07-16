// lib/attendance-index.js
//
// Builds the "who has attended what" index api/cron-send-emails.js uses to
// decide who's still first-timer nurture audience vs. who's already walked
// in the door (returning-attendee audience instead). Pulled out into a pure
// function, taking plain data instead of Firestore snapshots, so the past-
// vs-upcoming distinction below — the exact thing that regressed once
// already — can be unit tested directly (tests/attendance-index.test.js)
// instead of only being checkable against a live cron run.
//
// A confirmed event_registrations doc means "has a ticket," not "has
// attended" — an UPCOMING event's confirmed registrants must NOT be treated
// as already-attended, or they're silently and permanently excluded from
// the day2/5/14/25 nurture sequence they're the actual intended audience
// for (`sendBucket` / `sendPostNurtureEventCampaign` in cron-send-emails.js
// both key off `attendedEmails` for exactly this suppression).

function buildAttendanceIndex(registrations, events, nowMs, nextEvent) {
  const attendedEmails = new Set();        // lowercased — first-timer nurture suppression
  const pastAttendeeUids = new Set();      // attended a PAST event — invite-back audience
  const registeredForNextUids = new Set(); // already signed up for the next event — don't re-invite
  const attendeeNameByUid = new Map();     // uid → reg `name` (source of truth post-consolidation)
  const nameByEmail = new Map();           // lowercased email → reg `name` — personalizes marketing
                                            // emails for ticket-holders whose leads doc has no name

  const pastIds = new Set();
  for (const e of events) {
    const dt = e.date?.toDate ? e.date.toDate() : (e.date ? new Date(e.date) : null);
    if (dt && !isNaN(dt.getTime()) && dt.getTime() < nowMs) pastIds.add(e.id);
  }

  for (const r of registrations) {
    const remail = r.email ? String(r.email).toLowerCase().trim() : null;
    // Gate on pastIds — a confirmed ticket for an event that hasn't happened
    // yet is not "attended."
    if (remail && pastIds.has(r.eventId)) attendedEmails.add(remail);
    if (remail && r.name && !nameByEmail.has(remail)) nameByEmail.set(remail, r.name);
    if (r.userId && r.name && !attendeeNameByUid.has(r.userId)) attendeeNameByUid.set(r.userId, r.name);
    if (r.userId && pastIds.has(r.eventId)) pastAttendeeUids.add(r.userId);
    if (r.userId && nextEvent && r.eventId === nextEvent.id) registeredForNextUids.add(r.userId);
  }

  return { attendedEmails, pastAttendeeUids, registeredForNextUids, attendeeNameByUid, nameByEmail };
}

module.exports = { buildAttendanceIndex };
