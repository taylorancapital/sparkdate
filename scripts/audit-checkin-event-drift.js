#!/usr/bin/env node
/**
 * scripts/audit-checkin-event-drift.js
 *
 * READ-ONLY diagnostic. Before the isEventOver() fix in lib/next-event.js and
 * api/next-event.js, any check-in opened without ?eventId= pinned (e.g. a QR
 * code or bookmarked /checkin link with no query string) would silently
 * attach to whatever event the drifted "next event" lookup returned once the
 * night's mixer had started — not the event actually happening at the door.
 * That produces a CONFIRMED event_registrations doc (source: 'checkin') whose
 * `eventId` doesn't match the event the person was physically standing at
 * when `checkedInAt` was stamped.
 *
 * This script finds those by checking whether each check-in's real timestamp
 * (checkedInAt, falling back to createdAt) falls inside the event it's filed
 * under's actual window [date - 90min, date + durationHours(default 3h) +
 * 60min]. A miss means the doc is very likely mis-filed; it then looks across
 * every other event for one whose window DOES contain that timestamp, as the
 * probable correct event.
 *
 * Makes NO writes. Run this first, review the report, THEN decide on a
 * follow-up fix script once the shape of the damage is known.
 *
 * Usage:
 *   node scripts/audit-checkin-event-drift.js
 *   node scripts/audit-checkin-event-drift.js --json   # machine-readable output
 *
 * Requires env vars (same as the other scripts/ tools — copy from .env.local
 * or the Vercel dashboard):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

'use strict';

const admin = require('firebase-admin');
const { DEFAULT_EVENT_DURATION_HOURS } = require('../lib/next-event');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    console.error('  Copy from your Vercel project settings or .env.local');
    process.exit(2);
  }
  return process.env[k];
};

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey:  need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();
const asJson = process.argv.includes('--json');

const HOUR = 3600000;
const PRE_DOORS_GRACE_MS = 90 * 60 * 1000;   // people arrive up to 90min early
const POST_EVENT_GRACE_MS = 60 * 60 * 1000;  // stragglers up to 60min after duration ends

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// Same duration default as lib/next-event.js's isEventOver, widened with
// arrival/straggler grace on both ends — this is an audit window, not the
// live "is this event still current" check, so it can afford to be a bit
// more generous in both directions.
function eventWindow(ev) {
  const start = toMillis(ev.date);
  if (start == null) return null;
  const hrs = Number(ev.durationHours) > 0 ? Number(ev.durationHours) : DEFAULT_EVENT_DURATION_HOURS;
  return { start: start - PRE_DOORS_GRACE_MS, end: start + hrs * HOUR + POST_EVENT_GRACE_MS };
}

(async () => {
  console.log('── Check-in event-drift audit (read-only, no writes) ──\n');

  const [evSnap, regSnap] = await Promise.all([
    db.collection('events').get(),
    db.collection('event_registrations').where('source', '==', 'checkin').get(),
  ]);

  const events = evSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const windowById = new Map(events.map((e) => [e.id, eventWindow(e)]));

  const flagged = [];
  let checked = 0;
  let noTimestamp = 0;

  for (const doc of regSnap.docs) {
    const r = doc.data();
    checked++;
    const stamp = toMillis(r.checkedInAt) ?? toMillis(r.createdAt);
    if (stamp == null) { noTimestamp++; continue; }

    const filedEvent = events.find((e) => e.id === r.eventId);
    const win = windowById.get(r.eventId);
    const inWindow = win && stamp >= win.start && stamp <= win.end;
    if (inWindow) continue;

    // Look for the event whose window actually contains this timestamp.
    const candidates = events.filter((e) => {
      if (e.id === r.eventId) return false;
      const w = windowById.get(e.id);
      return w && stamp >= w.start && stamp <= w.end;
    });

    flagged.push({
      docId: doc.id,
      uid: r.userId || null,
      email: r.email || null,
      name: r.name || null,
      checkedInAt: new Date(stamp).toISOString(),
      filedEvent: filedEvent
        ? { id: filedEvent.id, title: filedEvent.title || filedEvent.id, date: toMillis(filedEvent.date) ? new Date(toMillis(filedEvent.date)).toISOString() : null }
        : { id: r.eventId, title: r.eventTitle || '(deleted event)', date: null },
      likelyActualEvent: candidates.length === 1
        ? { id: candidates[0].id, title: candidates[0].title || candidates[0].id, date: new Date(toMillis(candidates[0].date)).toISOString() }
        : null,
      ambiguousCandidates: candidates.length > 1
        ? candidates.map((c) => ({ id: c.id, title: c.title || c.id, date: new Date(toMillis(c.date)).toISOString() }))
        : undefined,
    });
  }

  const summary = {
    totalCheckinRegistrations: checked,
    noTimestamp,
    flaggedMisfiled: flagged.length,
    withConfidentReplacement: flagged.filter((f) => f.likelyActualEvent).length,
    ambiguous: flagged.filter((f) => f.ambiguousCandidates).length,
    unresolved: flagged.filter((f) => !f.likelyActualEvent && !f.ambiguousCandidates).length,
  };

  if (asJson) {
    console.log(JSON.stringify({ summary, flagged }, null, 2));
    process.exit(0);
  }

  console.log(`Total check-in registrations scanned: ${summary.totalCheckinRegistrations}`);
  console.log(`Missing both checkedInAt and createdAt: ${summary.noTimestamp} (skipped)`);
  console.log(`Flagged as likely mis-filed:            ${summary.flaggedMisfiled}`);
  console.log(`  → confident replacement event found:  ${summary.withConfidentReplacement}`);
  console.log(`  → ambiguous (multiple candidates):     ${summary.ambiguous}`);
  console.log(`  → unresolved (no candidate event):     ${summary.unresolved}`);
  console.log();

  if (flagged.length) {
    console.log('── Flagged registrations ──');
    for (const f of flagged) {
      console.log(`\n• ${f.docId}  (${f.email || f.uid || 'unknown'})`);
      console.log(`  checked in at:     ${f.checkedInAt}`);
      console.log(`  currently filed:   ${f.filedEvent.title} [${f.filedEvent.id}]  (${f.filedEvent.date || 'unknown date'})`);
      if (f.likelyActualEvent) {
        console.log(`  likely SHOULD be:  ${f.likelyActualEvent.title} [${f.likelyActualEvent.id}]  (${f.likelyActualEvent.date})`);
      } else if (f.ambiguousCandidates) {
        console.log(`  ambiguous — candidates:`);
        f.ambiguousCandidates.forEach((c) => console.log(`    - ${c.title} [${c.id}] (${c.date})`));
      } else {
        console.log(`  no candidate event found for this timestamp — needs manual review`);
      }
    }
    console.log();
  }

  console.log('No changes were made. This is a report only.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
