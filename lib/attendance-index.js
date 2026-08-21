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
  const registeredUpcomingEmails = new Set(); // holds a ticket for a FUTURE event — sales-pitch suppression
  const pastAttendeeUids = new Set();      // attended a PAST event — invite-back audience
  const registeredForNextUids = new Set(); // already signed up for the next event — don't re-invite
  const attendeeNameByUid = new Map();     // uid → reg `name` (source of truth post-consolidation)
  const nameByEmail = new Map();           // lowercased email → reg `name` — personalizes marketing
                                            // emails for ticket-holders whose leads doc has no name
  // uid → Set(past eventId). A SET, not a counter: one person can hold more
  // than one registration for the SAME event (a canonical reg_{uid}_{eventId}
  // plus an unadopted guest row — see the backfill note in
  // api/lead-signup.js), and counting those twice would promote a first-timer
  // to a "returning" attendee who never came back. Distinct events is the
  // only honest definition of "how many times have you been."
  const attendedEventIdsByUid = new Map();

  // An event whose id is in neither set has no valid date (or was deleted);
  // its registrations trigger no suppression of either kind.
  const pastIds = new Set();
  const upcomingIds = new Set();
  for (const e of events) {
    const dt = e.date?.toDate ? e.date.toDate() : (e.date ? new Date(e.date) : null);
    if (!dt || isNaN(dt.getTime())) continue;
    if (dt.getTime() < nowMs) pastIds.add(e.id);
    else upcomingIds.add(e.id);
  }

  for (const r of registrations) {
    const remail = r.email ? String(r.email).toLowerCase().trim() : null;
    // Gate on pastIds — a confirmed ticket for an event that hasn't happened
    // yet is not "attended."
    if (remail && pastIds.has(r.eventId)) attendedEmails.add(remail);
    // Holding a ticket for an upcoming event suppresses the buy-a-ticket
    // pitches (day2/5/25 + post-nurture campaign) by STATE, not by flag:
    // if the ticket is refunded the suppression lifts on its own, and once
    // the event passes, attendedEmails takes over. The pre-event countdown
    // emails (cron-send-emails.js sendPreEventEmails) own this audience.
    if (remail && upcomingIds.has(r.eventId)) registeredUpcomingEmails.add(remail);
    if (remail && r.name && !nameByEmail.has(remail)) nameByEmail.set(remail, r.name);
    if (r.userId && r.name && !attendeeNameByUid.has(r.userId)) attendeeNameByUid.set(r.userId, r.name);
    if (r.userId && pastIds.has(r.eventId)) {
      pastAttendeeUids.add(r.userId);
      if (!attendedEventIdsByUid.has(r.userId)) attendedEventIdsByUid.set(r.userId, new Set());
      attendedEventIdsByUid.get(r.userId).add(r.eventId);
    }
    if (r.userId && nextEvent && r.eventId === nextEvent.id) registeredForNextUids.add(r.userId);
  }

  // uid → how many DISTINCT past events they've attended. Lets copy say
  // "round two" vs "you're a regular" instead of staying round-agnostic.
  const attendanceCountByUid = new Map();
  for (const [uid, ids] of attendedEventIdsByUid) attendanceCountByUid.set(uid, ids.size);

  return {
    attendedEmails, registeredUpcomingEmails, pastAttendeeUids, registeredForNextUids,
    attendeeNameByUid, nameByEmail, attendedEventIdsByUid, attendanceCountByUid,
  };
}

module.exports = { buildAttendanceIndex };
