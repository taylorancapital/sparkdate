#!/usr/bin/env node
/**
 * scripts/migrate-registrations.js
 *
 * One-time migration: move all existing `event_registrations` docs to the
 * canonical deterministic ID format `reg_{userId}_{eventId}`. After this runs,
 * every person at every event has exactly ONE doc with a predictable ID, so
 * concurrent writes from any path (purchase, checkin, enroll) merge instead of
 * creating duplicates.
 *
 * Usage:
 *   node scripts/migrate-registrations.js            # dry-run (default)
 *   node scripts/migrate-registrations.js --apply    # actually migrate
 *   node scripts/migrate-registrations.js --report-missing   # list null-userId docs
 *
 * Requires env vars:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Run dedupe-registrations.js BEFORE this script to collapse duplicates first.
 * After this script, run dedupe-registrations.js again to confirm clean state.
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

const db           = admin.firestore();
const DRY          = !process.argv.includes('--apply');
const REPORT_MISS  = process.argv.includes('--report-missing');

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log(DRY ? '── DRY RUN (pass --apply to migrate) ──' : '── APPLYING: migrating event_registrations to reg_{uid}_{eventId} ──');
  console.log();

  const snap = await db.collection('event_registrations').get();
  console.log(`Total event_registrations docs: ${snap.size}`);
  console.log();

  const nullUserDocs  = [];
  const alreadyRight  = [];
  const toMigrate     = [];
  const conflicts     = []; // target ID already exists

  for (const doc of snap.docs) {
    const d = doc.data();
    const uid     = d.userId;
    const eventId = d.eventId;

    if (!uid) {
      nullUserDocs.push(doc);
      continue;
    }
    if (!eventId) {
      nullUserDocs.push(doc); // treat missing eventId the same as missing userId
      continue;
    }

    const targetId = `reg_${uid}_${eventId}`;

    if (doc.id === targetId) {
      alreadyRight.push(doc.id);
      continue;
    }

    toMigrate.push({ doc, targetId });
  }

  // ── Report null-userId docs ──
  if (REPORT_MISS || nullUserDocs.length) {
    console.log(`── Null-userId / null-eventId docs (${nullUserDocs.length}) — manual review needed ──`);
    if (nullUserDocs.length === 0) {
      console.log('  None.');
    } else {
      nullUserDocs.forEach(d => {
        const data = d.data();
        console.log(`  • ${d.id}  userId=${data.userId || '(null)'}  eventId=${data.eventId || '(null)'}  email=${data.email || '(none)'}  name=${data.name || '(none)'}  status=${data.status || '?'}`);
      });
    }
    console.log();
  }

  // ── Report already-correct docs ──
  console.log(`Already at correct ID format: ${alreadyRight.length}`);
  console.log(`Docs to migrate:              ${toMigrate.length}`);
  console.log();

  if (toMigrate.length === 0) {
    console.log('Nothing to migrate. All docs already have canonical IDs.');
    process.exit(0);
  }

  // ── Preview what will happen ──
  if (toMigrate.length > 0) {
    console.log('── Migration plan ──');
    for (const { doc, targetId } of toMigrate) {
      const d = doc.data();
      console.log(`  ${doc.id} → ${targetId}  (${d.email || '?'}  src=${d.source || '?'})`);
    }
    console.log();
  }

  if (DRY) {
    console.log('No changes made. Re-run with --apply to migrate.');
    process.exit(0);
  }

  // Safety cap
  if (toMigrate.length > 200 && !process.argv.includes('--yes-i-am-sure')) {
    console.error(`✗ Refusing to migrate ${toMigrate.length} docs without --yes-i-am-sure`);
    process.exit(3);
  }

  // ── Execute migration ──
  let migrated = 0, skipped = 0;

  for (const { doc, targetId } of toMigrate) {
    try {
      const targetRef = db.collection('event_registrations').doc(targetId);
      const targetSnap = await targetRef.get();

      if (targetSnap.exists) {
        // Target already exists — merge in any fields the target is missing, then delete source
        const existing = targetSnap.data();
        const source   = doc.data();
        const patch    = {};
        const KEEP = ['checkedInAt', 'photoConsent', 'firstTimeAttendee', 'phone', 'gender', 'name', 'source', 'postEventPromptSent', 'postEventPromptSentAt'];
        for (const f of KEEP) {
          if (existing[f] == null && source[f] != null) patch[f] = source[f];
        }
        // Confirmed-wins: never let a confirmed attendee get dropped because the
        // canonical doc happened to be a pending/abandoned-3DS row. A confirmed
        // source upgrades a non-confirmed target.
        if (source.status === 'confirmed' && existing.status !== 'confirmed') {
          patch.status = 'confirmed';
        }
        if (Object.keys(patch).length) await targetRef.set(patch, { merge: true });
        await doc.ref.delete();
        console.log(`  ✓ merged + deleted ${doc.id} → ${targetId}${patch.status ? ' (status→confirmed)' : ''}`);
      } else {
        // Simple rename: write to new ID, delete old
        await targetRef.set(doc.data());
        await doc.ref.delete();
        console.log(`  ✓ moved ${doc.id} → ${targetId}`);
      }
      migrated++;
    } catch (e) {
      console.error(`  ✗ ${doc.id}: ${e.message}`);
      skipped++;
    }
  }

  console.log();
  console.log(`Done. Migrated ${migrated}, skipped ${skipped}, null-userId (untouched) ${nullUserDocs.length}.`);
  console.log('Run dedupe-registrations.js to confirm zero duplicates.');
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
