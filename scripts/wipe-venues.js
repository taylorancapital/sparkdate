#!/usr/bin/env node
/**
 * scripts/wipe-venues.js
 *
 * One-time cleanup: deletes all venues with status === 'not_contacted'.
 * Preserves any venue you've already started outreach on (contacted /
 * interested / booked / event_created) so you don't lose pipeline state.
 *
 * After wiping, run the seed-venues endpoint (or just hit it from the
 * admin UI) to repopulate with the cleaned list.
 *
 * Usage:
 *   node scripts/wipe-venues.js              # dry-run, list only
 *   node scripts/wipe-venues.js --delete     # actually delete
 *   node scripts/wipe-venues.js --delete --all  # delete EVERYTHING (incl. contacted)
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
const DRY  = !process.argv.includes('--delete');
const ALL  = process.argv.includes('--all');

(async () => {
  const snap = await db.collection('venues').get();
  const all = snap.docs;
  const targets = ALL ? all : all.filter(d => (d.data().status || 'not_contacted') === 'not_contacted');
  const skipped = all.length - targets.length;

  console.log(DRY ? '── DRY RUN ──' : '── DELETING ──');
  console.log(`Total venues: ${all.length}`);
  console.log(`Targeted for delete: ${targets.length}  ${ALL ? '(--all: every venue)' : '(only not_contacted)'}`);
  console.log(`Preserved: ${skipped}`);
  console.log();

  targets.forEach(d => {
    console.log(`  ${DRY ? '·' : '✎'} ${d.data().name || '(no name)'}  [${d.data().status || 'not_contacted'}]`);
  });

  if (DRY) {
    console.log();
    console.log(`Re-run with --delete to actually remove ${targets.length} venues.`);
    process.exit(0);
  }

  if (targets.length > 100 && !process.argv.includes('--yes-i-am-sure')) {
    console.error(`✗ Refusing to delete ${targets.length} docs without --yes-i-am-sure`);
    process.exit(3);
  }

  // Delete in batches of 400 (under the 500-op Firestore batch cap).
  while (targets.length) {
    const batch = db.batch();
    const chunk = targets.splice(0, 400);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log();
  console.log('Done. Next step: re-run the seed-venues endpoint to repopulate with the cleaned list.');
  console.log('Either click the seed button in the admin UI, or curl /api/seed-venues with an admin token.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
