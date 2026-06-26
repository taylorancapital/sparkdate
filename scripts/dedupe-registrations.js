#!/usr/bin/env node
/**
 * scripts/dedupe-registrations.js
 *
 * One-time admin tool. The pre-fix check-in flow (a query-then-add race) wrote
 * DUPLICATE `event_registrations` for the same person at the door — same
 * `userId`, different random doc ids. This collapses each (userId) group for a
 * given event down to a single keeper and deletes the extras, so roster counts,
 * retention, and P&L stop double-counting.
 *
 * It does NOT touch the post-event email/match flow (that already dedups by
 * uid) — this is pure data hygiene.
 *
 * Usage:
 *   node scripts/dedupe-registrations.js <eventId>            # dry-run (default)
 *   node scripts/dedupe-registrations.js <eventId> --apply    # actually delete
 *
 * Requires env vars (same as Vercel — copy from .env.local or the dashboard):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * NEVER commit the values. Export them inline:
 *   FIREBASE_PROJECT_ID=... node scripts/dedupe-registrations.js <eventId>
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

// First non-flag arg is the eventId.
const eventId = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!eventId) {
  console.error('✗ Usage: node scripts/dedupe-registrations.js <eventId> [--apply]');
  process.exit(2);
}

// ── Helpers ──────────────────────────────────────────────────────
const ms = (ts) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis()
  : (ts ? new Date(ts).getTime() || 0 : 0);

// Higher score = better keeper. Prefer the canonical deterministic id, then a
// checked-in row, then a confirmed row; earliest createdAt breaks ties.
// (Legacy `ci_` ids are still preferred too, for data not yet migrated.)
function score(doc) {
  const d = doc.data();
  let s = 0;
  if (doc.id === `reg_${d.userId}_${eventId}`) s += 1000;
  else if (doc.id === `ci_${d.userId}_${eventId}`) s += 500;
  if (d.checkedInAt) s += 100;
  if (d.status === 'confirmed') s += 10;
  return s;
}

// Fields worth salvaging from a loser onto a keeper that's missing them.
const MERGE_FIELDS = ['photoConsent', 'firstTimeAttendee', 'phone', 'gender', 'name', 'source', 'eventTitle', 'ticketId', 'paymentIntentId', 'email'];

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log(DRY ? '── DRY RUN (pass --apply to delete) ──' : '── APPLYING: deleting duplicate registrations ──');
  console.log(`Event: ${eventId}`);
  console.log();

  const snap = await db.collection('event_registrations').where('eventId', '==', eventId).get();
  const byUser = new Map();   // userId → [docs]
  const nullUser = [];        // registrations with no userId (manual review)

  snap.docs.forEach((doc) => {
    const uid = doc.data().userId;
    if (!uid) { nullUser.push(doc); return; }
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(doc);
  });

  let dupGroups = 0, toDelete = 0;
  const plannedDeletes = [];   // { keeper, losers, mergeOnto }

  for (const [uid, docs] of byUser) {
    if (docs.length <= 1) continue;
    dupGroups++;
    // Pick the keeper: best score, then earliest createdAt.
    const sorted = [...docs].sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return ms(a.data().createdAt) - ms(b.data().createdAt);
    });
    const keeper = sorted[0];
    const losers = sorted.slice(1);

    // Salvage any fields the keeper is missing from the losers.
    const k = keeper.data();
    const merge = {};
    for (const f of MERGE_FIELDS) {
      if (k[f] == null) {
        const donor = losers.find(l => l.data()[f] != null);
        if (donor) merge[f] = donor.data()[f];
      }
    }

    plannedDeletes.push({ uid, keeperId: keeper.id, loserIds: losers.map(l => l.id), merge });
    toDelete += losers.length;
  }

  // ── Report ──
  const uniqueAttendees = byUser.size + nullUser.length;
  console.log(`Total registration docs:  ${snap.size}`);
  console.log(`Distinct userIds:          ${byUser.size}`);
  console.log(`Null-userId rows:          ${nullUser.length}  (not deduped — manual review)`);
  console.log(`Duplicate groups:          ${dupGroups}`);
  console.log(`Rows that would be deleted: ${toDelete}`);
  console.log(`True unique attendees:     ${uniqueAttendees}`);
  console.log();

  if (plannedDeletes.length) {
    console.log('── Duplicate groups ──');
    for (const p of plannedDeletes) {
      const mergeNote = Object.keys(p.merge).length ? `  (merging ${Object.keys(p.merge).join(', ')} → keeper)` : '';
      console.log(`  uid=${p.uid}  keep=${p.keeperId}  delete=[${p.loserIds.join(', ')}]${mergeNote}`);
    }
    console.log();
  }
  if (nullUser.length) {
    console.log('── Null-userId rows (review by hand) ──');
    nullUser.forEach(d => console.log(`  • ${d.id}  email=${d.data().email || '(none)'}  name=${d.data().name || '(none)'}  status=${d.data().status || '?'}`));
    console.log();
  }

  if (DRY) {
    console.log('No changes made. Re-run with --apply to merge keepers and delete duplicates.');
    process.exit(0);
  }

  // Safety: cap large deletes behind an extra flag.
  if (toDelete > 50 && !process.argv.includes('--yes-i-am-sure')) {
    console.error(`✗ Refusing to delete ${toDelete} rows without --yes-i-am-sure`);
    process.exit(3);
  }

  let deleted = 0, merged = 0;
  for (const p of plannedDeletes) {
    try {
      if (Object.keys(p.merge).length) {
        await db.collection('event_registrations').doc(p.keeperId).set(p.merge, { merge: true });
        merged++;
      }
      for (const id of p.loserIds) {
        await db.collection('event_registrations').doc(id).delete();
        deleted++;
      }
      console.log(`  ✓ uid=${p.uid}: kept ${p.keeperId}, deleted ${p.loserIds.length}`);
    } catch (e) {
      console.log(`  ✗ uid=${p.uid}: ${e.message}`);
    }
  }
  console.log();
  console.log(`Done. Merged ${merged} keepers, deleted ${deleted} duplicate rows.`);
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
