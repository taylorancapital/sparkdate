#!/usr/bin/env node
/**
 * scripts/backfill-event-counters.js
 *
 * One-time migration: counts existing confirmed tickets per event/gender
 * and writes them to events/{id}.confirmedMen / confirmedWomen.
 *
 * Run ONCE after deploying the new purchase-ticket.js — it switches
 * from "count tickets live on every purchase" to "increment a counter
 * inside a transaction". Existing tickets aren't reflected in the
 * counter until this backfill runs.
 *
 * Idempotent: re-running re-computes the count, so it's safe to run
 * after fixing data issues.
 *
 * Usage:
 *   node scripts/backfill-event-counters.js
 *   node scripts/backfill-event-counters.js --dry-run
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
const DRY = process.argv.includes('--dry-run');

(async () => {
  const [eventsSnap, ticketsSnap] = await Promise.all([
    db.collection('events').get(),
    db.collection('tickets').get(),
  ]);

  // Tally confirmed tickets by (eventId, gender). pending_3ds counts too,
  // because the user has a reserved seat pending Stripe confirmation.
  const tally = {};
  for (const d of ticketsSnap.docs) {
    const t = d.data();
    if (!t.eventId) continue;
    if (!['confirmed', 'pending_3ds'].includes(t.status || 'confirmed')) continue;
    const key = `${t.eventId}|${t.gender}`;
    tally[key] = (tally[key] || 0) + 1;
  }

  console.log(DRY ? '── DRY RUN ──' : '── BACKFILLING COUNTERS ──');
  console.log(`Events:  ${eventsSnap.size}`);
  console.log(`Tickets: ${ticketsSnap.size}`);
  console.log();

  let updated = 0;
  for (const doc of eventsSnap.docs) {
    const id = doc.id;
    const confirmedWomen = tally[`${id}|woman`] || 0;
    const confirmedMen   = tally[`${id}|man`]   || 0;
    const current = doc.data();
    const sameW = (current.confirmedWomen ?? 0) === confirmedWomen;
    const sameM = (current.confirmedMen ?? 0)   === confirmedMen;
    if (sameW && sameM) {
      console.log(`  · ${current.title || id} — already correct (w=${confirmedWomen}, m=${confirmedMen})`);
      continue;
    }
    console.log(`  ✎ ${current.title || id} — w: ${current.confirmedWomen ?? 0} → ${confirmedWomen}, m: ${current.confirmedMen ?? 0} → ${confirmedMen}`);
    if (!DRY) {
      await doc.ref.update({ confirmedWomen, confirmedMen });
      updated++;
    }
  }

  console.log();
  console.log(DRY ? `Would update ${eventsSnap.size - updated} events.` : `Updated ${updated} events.`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
