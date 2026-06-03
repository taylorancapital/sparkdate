#!/usr/bin/env node
/**
 * scripts/wipe-test-data.js
 *
 * Clears PRE-LAUNCH TEST DATA so the live (Stripe live-mode) launch starts
 * from a clean slate. Test signups/purchases made before go-live carry
 * test-mode Stripe IDs (cus_… / sub_…) that 404 against the live key, which
 * breaks the account / cancel / upgrade flows for those users — this removes
 * them so only real, live data exists going forward.
 *
 * WIPES (Firestore collections — all rows):
 *   leads, tickets, event_registrations, payments, activity,
 *   connection_intents, stripe_events
 *
 * USERS + AUTH:
 *   Deletes every users/{uid} doc and its Firebase Auth account, EXCEPT
 *   preserved accounts (see below).
 *
 * PRESERVES (never touched):
 *   - `events` and `venues` collections (real launch content)
 *   - Any Auth user with the admin custom claim (admin === true)
 *   - Any Auth user whose email is passed via --keep <email> (repeatable)
 *   The preserved users keep their Auth account and users/{uid} doc. (Their
 *   rows in the wiped data collections above are still cleared — pre-launch
 *   those only contain test data.)
 *
 * DOES NOT touch Stripe. Test-mode customers live in Stripe's separate test
 * environment and are harmless under the live key; there is nothing to clean
 * there with the live secret.
 *
 * Usage:
 *   node scripts/wipe-test-data.js                          # DRY RUN (default, no writes)
 *   node scripts/wipe-test-data.js --keep you@you.com       # dry run, preserve a user
 *   node scripts/wipe-test-data.js --keep a@b.com --execute # actually delete
 *
 * ALWAYS run the dry run first and read the counts. Re-run with --execute
 * only once the preview matches what you expect.
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

// ── Args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const keepEmails = new Set(
  argv
    .map((a, i) => (a === '--keep' ? argv[i + 1] : null))
    .filter(Boolean)
    .map((e) => e.toLowerCase())
);

// Collections wiped wholesale. NOTE: `events` and `venues` are deliberately
// absent — they are real content, not test data.
const DATA_COLLECTIONS = [
  'leads',
  'tickets',
  'event_registrations',
  'payments',
  'activity',
  'connection_intents',
  'stripe_events',
];

const tag = execute ? '✗ DELETE' : '[DRY]   ';
const log = (...m) => console.log(tag, ...m);
const info = (...m) => console.log('•      ', ...m);

// Count docs in a collection without loading huge result sets where the
// SDK supports it; fall back to a full read for older admin SDKs.
async function countCollection(name) {
  try {
    const agg = await db.collection(name).count().get();
    return agg.data().count;
  } catch (_) {
    const snap = await db.collection(name).get();
    return snap.size;
  }
}

// Delete every doc in a collection, 500 at a time, until empty.
async function clearCollection(name) {
  const coll = db.collection(name);
  let removed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await coll.limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
  }
  return removed;
}

(async () => {
  console.log('────────────────────────────────────────────────────');
  console.log(`Mode: ${execute ? 'EXECUTE (live deletion)' : 'DRY RUN (no writes)'}`);
  console.log(`Keep emails: ${keepEmails.size ? [...keepEmails].join(', ') : '(none beyond admins)'}`);
  console.log('Preserving collections: events, venues (untouched)');
  console.log('────────────────────────────────────────────────────');

  // ── Resolve preserved Auth users (admins + --keep) ─────────────────
  const preservedUids = new Set();
  const allUsers = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      allUsers.push(u);
      const isAdmin = u.customClaims && u.customClaims.admin === true;
      const isKept = u.email && keepEmails.has(u.email.toLowerCase());
      if (isAdmin || isKept) {
        preservedUids.add(u.uid);
        info(`preserve ${u.email || u.uid}${isAdmin ? ' (admin)' : ''}${isKept ? ' (--keep)' : ''}`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const toDeleteUsers = allUsers.filter((u) => !preservedUids.has(u.uid));
  console.log('────────────────────────────────────────────────────');

  // ── 1. Wipe the pure-data collections ──────────────────────────────
  for (const name of DATA_COLLECTIONS) {
    if (execute) {
      const n = await clearCollection(name);
      log(`${name}: deleted ${n} row(s)`);
    } else {
      const n = await countCollection(name);
      log(`${name}: ${n} row(s)`);
    }
  }

  console.log('────────────────────────────────────────────────────');

  // ── 2. users/{uid} docs (skip preserved) ───────────────────────────
  const usersSnap = await db.collection('users').get();
  const userDocsToDelete = usersSnap.docs.filter((d) => !preservedUids.has(d.id));
  log(`users docs: ${userDocsToDelete.length} to delete, ${usersSnap.size - userDocsToDelete.length} preserved`);
  if (execute && userDocsToDelete.length) {
    let batch = db.batch();
    let n = 0;
    for (const d of userDocsToDelete) {
      batch.delete(d.ref);
      if (++n % 500 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 500 !== 0) await batch.commit();
  }

  // ── 3. Firebase Auth accounts (skip preserved) ─────────────────────
  log(`Auth users: ${toDeleteUsers.length} to delete, ${preservedUids.size} preserved`);
  if (execute && toDeleteUsers.length) {
    const uids = toDeleteUsers.map((u) => u.uid);
    // deleteUsers handles up to 1000 per call.
    for (let i = 0; i < uids.length; i += 1000) {
      const chunk = uids.slice(i, i + 1000);
      const result = await admin.auth().deleteUsers(chunk);
      info(`auth chunk: ${result.successCount} deleted, ${result.failureCount} failed`);
      result.errors.forEach((e) => console.error('  auth delete error:', e.index, e.error.message));
    }
  }

  console.log('────────────────────────────────────────────────────');
  console.log(execute
    ? '✓ Wipe complete. Live data starts clean.'
    : 'Dry run complete. Re-run with --execute to actually delete.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
