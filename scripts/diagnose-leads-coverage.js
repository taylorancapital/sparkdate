#!/usr/bin/env node
/**
 * scripts/diagnose-leads-coverage.js
 *
 * Read-only. For each event (or one specific event via --event=<id>),
 * reports how many event_registrations exist, how many of those emails
 * have a corresponding `leads` doc, and lists the ones that don't.
 *
 * Every ongoing engagement email (day2/5/14/25 nurture, the biweekly
 * newsletter, the post-nurture campaign, the returning-attendee "Round
 * two?" invite) is sourced exclusively from `leads` — a registered person
 * missing a leads doc is invisible to all of it. Use this to confirm
 * scripts/backfill-leads-from-registrations.js actually closed the gap,
 * or to catch this same bug class early if it recurs.
 *
 * Usage:
 *   node scripts/diagnose-leads-coverage.js                # all events
 *   node scripts/diagnose-leads-coverage.js --event=abc123  # one event
 *
 * Requires the same env vars as the Vercel functions:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

'use strict';

const admin = require('firebase-admin');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
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

const eventArg = process.argv.find((a) => a.startsWith('--event='));
const filterEventId = eventArg ? eventArg.slice('--event='.length) : null;

(async () => {
  console.log('────────────────────────────────────────────────────');
  console.log(filterEventId ? `Scoped to event: ${filterEventId}` : 'Scanning all events');
  console.log('────────────────────────────────────────────────────');

  // Load every lead email once — avoids one query per registration.
  const leadEmails = new Set();
  const leadsSnap = await db.collection('leads').get();
  for (const doc of leadsSnap.docs) {
    const email = String(doc.data().email || '').toLowerCase().trim();
    if (email) leadEmails.add(email);
  }
  console.log(`Loaded ${leadEmails.size} lead email(s) from leads/.\n`);

  let eventDocs;
  if (filterEventId) {
    const one = await db.collection('events').doc(filterEventId).get();
    if (!one.exists) {
      console.error(`✗ No event doc found with ID "${filterEventId}"`);
      process.exit(1);
    }
    eventDocs = [one];
  } else {
    const snap = await db.collection('events').orderBy('date', 'asc').get();
    eventDocs = snap.docs;
  }

  if (eventDocs.length === 0) {
    console.log('events/ collection is empty — nothing to check.');
    process.exit(0);
  }

  let totalRegistered = 0, totalCovered = 0, totalMissing = 0;

  for (const evDoc of eventDocs) {
    const e = evDoc.data();
    const regSnap = await db.collection('event_registrations').where('eventId', '==', evDoc.id).get();

    const seen = new Set(); // dedupe by email within this event
    const missing = [];
    let covered = 0;

    for (const reg of regSnap.docs) {
      const r = reg.data();
      const email = String(r.email || '').toLowerCase().trim();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (leadEmails.has(email)) {
        covered++;
      } else {
        missing.push({ email, name: r.name || '(none)', source: r.source || '(unknown)' });
      }
    }

    const registered = seen.size;
    totalRegistered += registered;
    totalCovered += covered;
    totalMissing += missing.length;

    console.log(`• ${evDoc.id}  "${e.title || '(untitled)'}"`);
    console.log(`    registered (unique emails): ${registered}`);
    console.log(`    covered by a leads doc:     ${covered}`);
    console.log(`    MISSING a leads doc:        ${missing.length}`);
    if (missing.length) {
      for (const m of missing) {
        console.log(`      - ${m.email}  name=${m.name}  src=${m.source}`);
      }
    }
    console.log();
  }

  console.log('────────────────────────────────────────────────────');
  console.log(`Totals across ${eventDocs.length} event(s): ${totalRegistered} registered, ${totalCovered} covered, ${totalMissing} missing.`);
  if (totalMissing > 0) {
    console.log('Run scripts/backfill-leads-from-registrations.js to close this gap.');
  } else {
    console.log('Every registered email has a leads doc. Coverage looks complete.');
  }
  console.log('────────────────────────────────────────────────────');

  process.exit(0);
})().catch((e) => {
  console.error('✗ error:', e.message);
  process.exit(1);
});
