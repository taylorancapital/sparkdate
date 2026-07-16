#!/usr/bin/env node
/**
 * scripts/backfill-leads-from-registrations.js
 *
 * One-time backfill: find everyone in `event_registrations` who has no
 * corresponding `leads` doc, and create one. Every ongoing engagement email
 * (day2/5/14/25 nurture, the biweekly newsletter, the post-nurture
 * campaign, and the returning-attendee "Round two?" invite) is sourced
 * exclusively from `leads` — anyone missing a doc there is invisible to
 * all of it. This was primarily caused by api/lead-signup.js's
 * enrollEventbriteOne() never writing a `leads` doc (now fixed going
 * forward); this script catches everyone it already missed.
 *
 * Usage:
 *   node scripts/backfill-leads-from-registrations.js            # dry-run (default)
 *   node scripts/backfill-leads-from-registrations.js --apply    # actually write
 *
 * Requires env vars:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Run scripts/diagnose-leads-coverage.js before and after to confirm the
 * gap this closes.
 */

'use strict';

const admin = require('firebase-admin');

// ── Init ─────────────────────────────────────────────────────────
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

const db  = admin.firestore();
const DRY = !process.argv.includes('--apply');

function parseDate(d) {
  const dt = d && d.toDate ? d.toDate() : (d ? new Date(d) : null);
  return dt && !isNaN(dt.getTime()) ? dt : null;
}

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log(DRY ? '── DRY RUN (pass --apply to write) ──' : '── APPLYING: backfilling leads from event_registrations ──');
  console.log();

  // 1. Load every event doc once, so past-vs-upcoming can be resolved
  //    without a per-registration Firestore round trip.
  const eventDates = new Map(); // eventId -> Date | null
  const eventsSnap = await db.collection('events').get();
  for (const doc of eventsSnap.docs) {
    eventDates.set(doc.id, parseDate(doc.data().date));
  }
  console.log(`Loaded ${eventDates.size} event(s).`);

  // 2. Load every existing lead's email once, so coverage can be checked
  //    with a Set lookup instead of one query per registration.
  const leadEmails = new Set();
  const leadsSnap = await db.collection('leads').get();
  for (const doc of leadsSnap.docs) {
    const email = String(doc.data().email || '').toLowerCase().trim();
    if (email) leadEmails.add(email);
  }
  console.log(`Loaded ${leadEmails.size} existing lead email(s).`);

  // 3. Read every registration, group by email (one person can have
  //    registrations across multiple events).
  const regsSnap = await db.collection('event_registrations').get();
  console.log(`Total event_registrations docs: ${regsSnap.size}`);
  console.log();

  const byEmail = new Map(); // email -> { name, source, regs: [{eventId, status}] }
  let skippedNoEmail = 0;
  for (const doc of regsSnap.docs) {
    const r = doc.data();
    const email = String(r.email || '').toLowerCase().trim();
    if (!email) { skippedNoEmail++; continue; }
    if (!byEmail.has(email)) {
      byEmail.set(email, { name: r.name || '', source: r.source || 'unknown', regs: [] });
    }
    const entry = byEmail.get(email);
    if (!entry.name && r.name) entry.name = r.name;
    entry.regs.push({ eventId: r.eventId || null, status: r.status || 'unknown' });
  }

  const toBackfill = [];
  for (const [email, info] of byEmail) {
    if (leadEmails.has(email)) continue; // already covered
    // "Upcoming" if ANY of their registrations is for a future event —
    // they should still get the pre-event day14 guide and the day25
    // "don't miss the next one" nudge for that event. Only treat as fully
    // past if every registration they have is for an already-happened event.
    const hasUpcoming = info.regs.some(({ eventId }) => {
      const dt = eventId ? eventDates.get(eventId) : null;
      return dt && dt.getTime() >= Date.now();
    });
    toBackfill.push({ email, name: info.name, source: info.source, eventCount: info.regs.length, hasUpcoming });
  }

  console.log(`Unique emails in event_registrations: ${byEmail.size}  (${skippedNoEmail} doc(s) had no email — skipped)`);
  console.log(`Already have a leads doc:             ${byEmail.size - toBackfill.length}`);
  console.log(`To backfill:                          ${toBackfill.length}`);
  console.log();

  if (toBackfill.length === 0) {
    console.log('Nothing to backfill. Every registered email already has a leads doc.');
    process.exit(0);
  }

  console.log('── Backfill plan ──');
  for (const b of toBackfill) {
    console.log(`  ${b.email}  name=${b.name || '(none)'}  events=${b.eventCount}  ${b.hasUpcoming ? 'has upcoming event' : 'past events only'}  src=${b.source}`);
  }
  console.log();

  if (DRY) {
    console.log('No changes made. Re-run with --apply to backfill.');
    process.exit(0);
  }

  // Safety cap
  if (toBackfill.length > 500 && !process.argv.includes('--yes-i-am-sure')) {
    console.error(`✗ Refusing to backfill ${toBackfill.length} leads without --yes-i-am-sure`);
    process.exit(3);
  }

  // ── Execute backfill ──
  const FieldValue = admin.firestore.FieldValue;
  let created = 0, skipped = 0;

  for (const b of toBackfill) {
    try {
      await db.collection('leads').add({
        name: b.name,
        email: b.email,
        phone: '',
        source: 'registration_backfill',
        referredBy: null,
        createdAt: FieldValue.serverTimestamp(),
        subscribed: true,
        // Already got a ticket/registration confirmation email at the time —
        // don't also send the generic "Your app matched you" welcome pitch.
        welcome_sent: true,
        // Already converted, so skip the pre-purchase persuasion pitches
        // (day2/day5). day14/day25 stay active only if they have an
        // upcoming event to still hear about; fully past registrants rely
        // on sendReturningAttendeeInvites for future re-engagement instead.
        day2_sent: true,
        day5_sent: true,
        day14_sent: !b.hasUpcoming,
        day25_sent: !b.hasUpcoming,
      });
      console.log(`  ✓ created leads doc for ${b.email}`);
      created++;
    } catch (e) {
      console.error(`  ✗ ${b.email}: ${e.message}`);
      skipped++;
    }
  }

  console.log();
  console.log(`Done. Created ${created}, skipped ${skipped}.`);
  console.log('Run diagnose-leads-coverage.js to confirm the gap closed.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
