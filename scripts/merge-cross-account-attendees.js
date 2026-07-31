#!/usr/bin/env node
/**
 * scripts/merge-cross-account-attendees.js
 *
 * One-time admin tool for the duplicates dedupe-registrations.js structurally
 * CANNOT fix: one real person holding TWO different Firebase accounts (or a
 * real account plus an unclaimed uid-less guest row) for the same event.
 * dedupe-registrations.js groups by userId, so different-uid pairs never meet.
 *
 * Cause is fixed going forward in lib/email-identity.js (check-in now matches
 * Apple aliases and case-variant guest rows before creating an account). This
 * cleans up the rows created before that landed.
 *
 * What it does per duplicate group:
 *   1. Picks the keeper — the row with a real `checkedInAt`, because that is
 *      the only evidence the person physically attended. Ties break toward the
 *      canonical reg_{uid}_{eventId} id, then earliest createdAt.
 *   2. Salvages fields the keeper lacks from the losers — critically the
 *      ticketId/paymentIntentId purchase linkage, which must not disappear
 *      with the row.
 *   3. RE-ATTRIBUTES, never deletes, any `tickets` doc belonging to a loser
 *      uid: its firebaseUid is repointed at the keeper uid. This is not
 *      optional bookkeeping — api/declare-connection.js builds the matches
 *      page's co-attendee list from a UNION of event_registrations AND
 *      tickets (keyed on firebaseUid), so a ticket left pointing at the
 *      orphaned uid would keep showing the person twice even after their
 *      duplicate registration row is gone. Payment records are never deleted.
 *   4. Deletes the loser event_registrations row.
 *
 * SAFETY GATE: if a loser uid already has connection_intents or a matches
 * lock, deleting its registration would orphan real match history (that uid
 * would stop appearing as a co-attendee, and anyone who picked them could
 * never resolve to a mutual match). Those groups are REPORTED AND SKIPPED
 * unless --include-matched is passed, so the default run can't quietly
 * discard someone's picks.
 *
 * Usage:
 *   node scripts/merge-cross-account-attendees.js <eventId>              # dry run
 *   node scripts/merge-cross-account-attendees.js --all                  # dry run, every event
 *   node scripts/merge-cross-account-attendees.js <eventId> --apply
 *   node scripts/merge-cross-account-attendees.js <eventId> --apply --include-matched
 *
 * Requires env vars (same as the other scripts/ tools):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Run scripts/audit-duplicate-attendees.js first and again afterwards.
 */

'use strict';

const admin = require('firebase-admin');
const { normalizeEmail, sameEmailIdentity } = require('../lib/email-identity');

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

const db = admin.firestore();
const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const INCLUDE_MATCHED = process.argv.includes('--include-matched');
const eventId = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!eventId && !ALL) {
  console.error('✗ Usage: node scripts/merge-cross-account-attendees.js <eventId> [--apply]');
  console.error('         node scripts/merge-cross-account-attendees.js --all [--apply]');
  process.exit(2);
}

const ms = (ts) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis()
  : (ts ? new Date(ts).getTime() || 0 : 0);

// Keeper preference: real attendance first, then the canonical doc id, then
// oldest. checkedInAt outranks the canonical id here (the opposite of
// dedupe-registrations.js) because in this shape the two rows belong to
// DIFFERENT uids — we're choosing which account represents the person, and
// the one that walked through the door is the right answer.
function score(doc, evId) {
  const d = doc.data();
  let s = 0;
  if (d.checkedInAt) s += 1000;
  if (doc.id === `reg_${d.userId}_${evId}`) s += 100;
  if (d.status === 'confirmed') s += 10;
  return s;
}

const SALVAGE_FIELDS = [
  'ticketId', 'paymentIntentId', 'phone', 'gender', 'name',
  'firstTimeAttendee', 'photoConsent', 'eventTitle', 'checkedInAt',
];

(async () => {
  console.log(APPLY ? '── APPLYING ──' : '── DRY RUN (pass --apply to write) ──');
  console.log(ALL ? 'Scope: all events' : `Event: ${eventId}`);
  console.log();

  let q = db.collection('event_registrations').where('status', '==', 'confirmed');
  if (!ALL) q = q.where('eventId', '==', eventId);
  const snap = await q.get();

  // Group by (eventId, email identity); keep only groups spanning >1 uid.
  const byEvent = new Map();
  for (const doc of snap.docs) {
    const r = doc.data();
    if (!r.email) continue;
    const ev = r.eventId;
    if (!byEvent.has(ev)) byEvent.set(ev, new Map());
    const m = byEvent.get(ev);
    const key = normalizeEmail(r.email);
    if (!key) continue;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(doc);
  }

  // Fetched once — the match-lock ids are all we need, and re-reading the
  // whole collection per candidate uid would be needlessly expensive.
  const allMatchLocks = (await db.collection('matches').get()).docs.map((d) => d.id);

  const plans = [];
  for (const [ev, m] of byEvent) {
    for (const [email, docs] of m) {
      if (docs.length < 2) continue;
      const uids = new Set(docs.map((d) => d.data().userId));
      if (uids.size < 2) continue; // same-uid → dedupe-registrations.js's job

      const sorted = [...docs].sort((a, b) => {
        const ds = score(b, ev) - score(a, ev);
        if (ds !== 0) return ds;
        return ms(a.data().createdAt) - ms(b.data().createdAt);
      });
      const keeper = sorted[0];
      const losers = sorted.slice(1);

      const k = keeper.data();
      const salvage = {};
      for (const f of SALVAGE_FIELDS) {
        if (k[f] == null) {
          const donor = losers.find((l) => l.data()[f] != null);
          if (donor) salvage[f] = donor.data()[f];
        }
      }

      // Real-uid losers may carry match history. uid-less guest rows can't.
      const loserUids = losers.map((l) => l.data().userId).filter(Boolean);
      let intents = 0, matchLocks = 0;
      for (const lu of loserUids) {
        const [out, inc] = await Promise.all([
          db.collection('connection_intents').where('fromUserId', '==', lu).where('eventId', '==', ev).get(),
          db.collection('connection_intents').where('toUserId', '==', lu).where('eventId', '==', ev).get(),
        ]);
        intents += out.size + inc.size;
        // Match locks are `${eventId}_${uidA}_${uidB}` (pair sorted), so scope
        // to this event before substring-matching the uid — an unscoped
        // includes() would count a lock from a different event this person
        // legitimately matched at, and needlessly block the merge.
        matchLocks += allMatchLocks.filter(
          (id) => id.startsWith(`${ev}_`) && id.includes(lu)
        ).length;
      }

      // Tickets owned by a loser uid get repointed at the keeper, not deleted.
      const ticketRepoints = [];
      for (const lu of loserUids) {
        const tk = await db.collection('tickets')
          .where('firebaseUid', '==', lu).where('eventId', '==', ev).get();
        tk.docs.forEach((d) => ticketRepoints.push(d.id));
      }

      plans.push({
        eventId: ev, email, keeper, losers, salvage,
        loserUids, intents, matchLocks, ticketRepoints,
        blocked: (intents > 0 || matchLocks > 0) && !INCLUDE_MATCHED,
      });
    }
  }

  if (!plans.length) {
    console.log('No cross-account duplicates found.');
    process.exit(0);
  }

  for (const p of plans) {
    console.log(`── ${p.email}  [event ${p.eventId}]`);
    console.log(`   KEEP   ${p.keeper.id}`);
    console.log(`            uid=${p.keeper.data().userId}  name=${p.keeper.data().name}  checkedInAt=${p.keeper.data().checkedInAt ? new Date(ms(p.keeper.data().checkedInAt)).toISOString() : 'none'}`);
    for (const l of p.losers) {
      console.log(`   DELETE ${l.id}`);
      console.log(`            uid=${l.data().userId}  name=${l.data().name}  source=${l.data().source}`);
    }
    if (Object.keys(p.salvage).length) console.log(`   salvage → keeper: ${Object.keys(p.salvage).join(', ')}`);
    if (p.ticketRepoints.length) console.log(`   re-attribute tickets → keeper uid: ${p.ticketRepoints.join(', ')}`);
    if (p.intents || p.matchLocks) {
      console.log(`   ⚠ loser uid has ${p.intents} connection_intent(s) and ${p.matchLocks} match lock(s) for this event`);
      console.log(`     ${p.blocked ? 'SKIPPED — pass --include-matched to merge anyway (match history WILL be orphaned)' : 'proceeding because --include-matched was passed'}`);
    }
    console.log();
  }

  const actionable = plans.filter((p) => !p.blocked);
  console.log(`${plans.length} group(s) found · ${actionable.length} actionable · ${plans.length - actionable.length} skipped for match history`);
  console.log();

  if (!APPLY) {
    console.log('No changes made. Re-run with --apply to write.');
    process.exit(0);
  }

  let merged = 0, deleted = 0, repointed = 0;
  for (const p of actionable) {
    try {
      if (Object.keys(p.salvage).length) {
        await p.keeper.ref.set(p.salvage, { merge: true });
        merged++;
      }
      for (const tid of p.ticketRepoints) {
        await db.collection('tickets').doc(tid).set(
          { firebaseUid: p.keeper.data().userId }, { merge: true }
        );
        repointed++;
      }
      for (const l of p.losers) {
        await l.ref.delete();
        deleted++;
      }
      console.log(`  ✓ ${p.email}: kept ${p.keeper.id}, deleted ${p.losers.length}, repointed ${p.ticketRepoints.length} ticket(s)`);
    } catch (e) {
      console.log(`  ✗ ${p.email}: ${e.message}`);
    }
  }
  console.log();
  console.log(`Done. ${merged} keeper(s) enriched, ${repointed} ticket(s) re-attributed, ${deleted} row(s) deleted.`);
  console.log('Re-run scripts/audit-duplicate-attendees.js to confirm.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
