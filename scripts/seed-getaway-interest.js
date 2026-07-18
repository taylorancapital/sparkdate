#!/usr/bin/env node
/**
 * scripts/seed-getaway-interest.js
 *
 * One-time seed: writes a starting "interested" count for each coming-soon
 * retreat package (see lib/getaway-packages.js) into the getaway_interest
 * collection, so the new Getaways section on /events doesn't launch at
 * zero. After this runs, every real click just increments `count` from
 * here via /api/lead-signup's getaway_interest action.
 *
 * Writes TWO fields: `count` (live, incremented by real clicks) and
 * `seedCount` (frozen at this seed value forever — the API's increment
 * only ever touches `count`). events.html reads both so it can show a
 * live aggregate total alongside each package's seed baseline, without
 * the two being conflated into one number.
 *
 * Uses { merge: true } and only sets the count if the doc doesn't already
 * have one, so it's safe to re-run without clobbering real click activity
 * that's happened since the first run.
 *
 * Usage:
 *   node scripts/seed-getaway-interest.js
 *   node scripts/seed-getaway-interest.js --dry-run
 */

'use strict';

const admin = require('firebase-admin');
const { GETAWAY_PACKAGES } = require('../lib/getaway-packages');

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
const DRY_RUN = process.argv.includes('--dry-run');

// Starting counts — chosen to look like real early interest, most popular
// package first. Purely cosmetic seed data; real clicks add on top.
const SEED_COUNTS = {
  'island-paradise':  158,
  'cruise':           121,
  'fiji-volcano':      94,
  'spa-resort':        88,
  'cabin-retreat':     76,
  'palm-springs':      63,
  'taos-new-mexico':   52,
};

async function main() {
  console.log(DRY_RUN ? 'Dry run — no writes will be made.\n' : 'Seeding getaway_interest…\n');

  for (const pkg of GETAWAY_PACKAGES) {
    const ref = db.collection('getaway_interest').doc(pkg.id);
    const snap = await ref.get();
    if (snap.exists && typeof snap.data().count === 'number') {
      console.log(`- ${pkg.id.padEnd(18)} already has count=${snap.data().count}, skipping`);
      continue;
    }
    const seed = SEED_COUNTS[pkg.id] ?? 0;
    console.log(`+ ${pkg.id.padEnd(18)} → count=${seed}, seedCount=${seed}${DRY_RUN ? ' (dry run)' : ''}`);
    if (!DRY_RUN) {
      await ref.set({ count: seed, seedCount: seed, seededAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
