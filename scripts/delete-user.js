#!/usr/bin/env node
/**
 * scripts/delete-user.js
 *
 * Hard-deletes a SparkDate user and ALL data keyed to them — required
 * to honor GDPR / CCPA "right to be deleted" requests (audit M7).
 *
 * What it removes, in order:
 *   1. Stripe subscription   — canceled immediately (no proration refund)
 *   2. Stripe customer       — fully deleted, all payment methods removed
 *   3. Firestore /users/{uid} doc
 *   4. Firestore /event_registrations where userId == uid
 *   5. Firestore /tickets where firebaseUid == uid
 *   6. Firestore /connection_intents where fromUserId == uid OR toUserId == uid
 *   7. Firestore /activity where userId == uid
 *   8. Firestore /payments where userId == uid
 *   9. Firestore /leads where email matches the user's email (case-insensitive)
 *  10. Firebase Auth user
 *
 * Usage:
 *   node scripts/delete-user.js taylor@sparkdate.date            # dry run (default)
 *   node scripts/delete-user.js taylor@sparkdate.date --execute  # actually delete
 *   node scripts/delete-user.js --uid <uid> --execute            # by uid instead of email
 *
 * Dry-run mode lists exactly what would be deleted without touching
 * anything. Always do that first.
 *
 * Audit trail: the script logs every deletion to stdout. Capture it
 * (`script -c 'node scripts/delete-user.js …' deletion.log`) and store
 * with the customer's deletion request.
 *
 * Requires the same env vars as the Vercel functions:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *   STRIPE_SECRET_KEY
 */

'use strict';

const admin = require('firebase-admin');
const Stripe = require('stripe');

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
const stripe = Stripe(need('STRIPE_SECRET_KEY'));

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const uidArg = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : null;
const email = !uidArg ? args.find(a => !a.startsWith('--')) : null;

if (!email && !uidArg) {
  console.error('Usage: node scripts/delete-user.js <email> [--execute]');
  console.error('       node scripts/delete-user.js --uid <uid> [--execute]');
  process.exit(2);
}

// Pretty-print every operation. In dry-run mode we PREFIX with [DRY]
// so a casual reader can never mistake the log for a real deletion.
const tag = execute ? '✗ DELETE' : '[DRY]   ';
const log = (...m) => console.log(tag, ...m);
const info = (...m) => console.log('•      ', ...m);

(async () => {
  // ── Resolve the Auth user ────────────────────────────────────────
  let user;
  try {
    user = uidArg
      ? await admin.auth().getUser(uidArg)
      : await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error(`✗ Auth user not found (${e.code}). If the user already lost their Auth account but you still want to clean up Firestore, supply --uid.`);
    process.exit(3);
  }

  const uid = user.uid;
  const userEmail = (user.email || '').toLowerCase();
  console.log('────────────────────────────────────────────────────');
  console.log(`User: ${user.email}  uid=${uid}`);
  console.log(`Mode: ${execute ? 'EXECUTE (live deletion)' : 'DRY RUN (no writes)'}`);
  console.log('────────────────────────────────────────────────────');

  // ── 1. Stripe subscription + customer ────────────────────────────
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const { stripeCustomerId, subscriptionId } = userData;

  if (subscriptionId) {
    log(`Stripe subscription ${subscriptionId}`);
    if (execute) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (e) {
        // Already canceled is fine; anything else surface.
        if (!/No such subscription|already canceled/i.test(e.message)) throw e;
        info(`(subscription was already gone: ${e.message})`);
      }
    }
  } else {
    info('no subscriptionId on Firestore user doc');
  }

  if (stripeCustomerId) {
    log(`Stripe customer ${stripeCustomerId}`);
    if (execute) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (e) {
        if (!/No such customer/i.test(e.message)) throw e;
        info(`(customer was already gone: ${e.message})`);
      }
    }
  } else {
    info('no stripeCustomerId on Firestore user doc');
  }

  // ── 2-7. Firestore collections keyed to this user ───────────────
  //
  // For each, query the matching docs, log them, and delete in
  // batches of 500 (Firestore's batch ceiling). Done sequentially so
  // a failure mid-stream leaves a clear partial-state log.
  async function deleteWhere(coll, field, value) {
    const snap = await db.collection(coll).where(field, '==', value).get();
    if (snap.empty) { info(`${coll}: no rows`); return; }
    log(`${coll}: ${snap.size} row(s)`);
    if (!execute) return;
    // Chunk into 500-op batches.
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      if (n % 500 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (n % 500 !== 0) await batch.commit();
  }

  if (userDoc.exists) {
    log(`users/${uid} document`);
    if (execute) await db.collection('users').doc(uid).delete();
  } else {
    info('no users/{uid} doc');
  }

  await deleteWhere('event_registrations', 'userId',     uid);
  await deleteWhere('tickets',             'firebaseUid', uid);
  // connection_intents has TWO sides — delete both.
  await deleteWhere('connection_intents',  'fromUserId', uid);
  await deleteWhere('connection_intents',  'toUserId',   uid);
  await deleteWhere('activity',            'userId',     uid);
  await deleteWhere('payments',            'userId',     uid);

  // Leads are keyed by email (lowercase). Skip if user had no email
  // (Auth user without email is unusual but technically possible via
  // phone auth or anon → upgrade flows).
  if (userEmail) {
    const leadSnap = await db.collection('leads')
      .where('email', '==', userEmail).get();
    if (leadSnap.empty) {
      info('leads: no rows');
    } else {
      log(`leads: ${leadSnap.size} row(s)`);
      if (execute) {
        let batch = db.batch();
        let n = 0;
        for (const d of leadSnap.docs) {
          batch.delete(d.ref);
          n++;
          if (n % 500 === 0) { await batch.commit(); batch = db.batch(); }
        }
        if (n % 500 !== 0) await batch.commit();
      }
    }
  }

  // ── 8. Firebase Auth user (last so cleanup runs even if it fails) ─
  log(`Firebase Auth user ${uid}`);
  if (execute) {
    await admin.auth().deleteUser(uid);
  }

  console.log('────────────────────────────────────────────────────');
  console.log(execute
    ? `✓ Deletion complete for ${user.email} (uid=${uid}).`
    : `Dry run complete. Re-run with --execute to actually delete.`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
