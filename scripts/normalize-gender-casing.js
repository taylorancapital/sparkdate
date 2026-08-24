#!/usr/bin/env node
/**
 * scripts/normalize-gender-casing.js
 *
 * Lowercases capitalized gender values ("Woman"/"Man" → "woman"/"man") on
 * tickets, event_registrations and users.
 *
 * The Eventbrite/Meetup import stored gender exactly as the CSV spelled it,
 * while the site's own checkout stores lowercase — leaving 63 of 104 tickets
 * capitalized. Every exact-string comparison then saw two vocabularies:
 * seatFields() would have bumped the MEN'S counter for an imported "Woman" on
 * a legacy split event, and any per-gender count that didn't defensively
 * .toLowerCase() undercounted both sides. Same disease as GA4's
 * "Facebook / facebook / fb" source fragmentation, in ticket form.
 *
 * The import path now normalizes at write (api/lead-signup.js) and
 * seatFields() normalizes at read; this fixes the documents already written.
 * Idempotent — a second run finds nothing to change.
 *
 * Usage:
 *   node scripts/normalize-gender-casing.js             # dry run
 *   node scripts/normalize-gender-casing.js --execute
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const COLLECTIONS = ['tickets', 'event_registrations', 'users'];

async function main() {
  let total = 0;
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    // Anything whose lowercase form is a known value but whose stored form
    // isn't already lowercase. "Female"/"Male" or other spellings are NOT
    // silently coerced — they get listed so a human decides.
    const fix = [];
    const odd = [];
    for (const doc of snap.docs) {
      const g = doc.data().gender;
      if (typeof g !== 'string' || g === '') continue;
      const lower = g.trim().toLowerCase();
      if (g !== lower && (lower === 'woman' || lower === 'man')) fix.push({ doc, to: lower });
      else if (lower !== 'woman' && lower !== 'man') odd.push({ id: doc.id, g });
    }
    console.log(`${col}: ${snap.size} docs, ${fix.length} to lowercase${odd.length ? `, ${odd.length} UNRECOGNIZED (left alone)` : ''}`);
    for (const o of odd) console.log(`    ? ${o.id}  gender=${JSON.stringify(o.g)}`);

    if (EXECUTE && fix.length) {
      // 400 per batch, same chunking as sync-meta-spend's writer.
      for (let i = 0; i < fix.length; i += 400) {
        const batch = db.batch();
        for (const { doc, to } of fix.slice(i, i + 400)) batch.update(doc.ref, { gender: to });
        await batch.commit();
      }
    }
    total += fix.length;
  }

  console.log('');
  if (!EXECUTE) console.log(`Dry run — ${total} doc(s) would change. Re-run with --execute.`);
  else console.log(`Done — ${total} doc(s) lowercased. Dashboards read correctly on next load.`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
