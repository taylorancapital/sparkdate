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
 *   1. Picks the keeper — the account holding MATCH HISTORY first, then the
 *      one with a real `checkedInAt`, then the canonical reg_{uid}_{eventId}
 *      id, then earliest createdAt. Match history leads because it is the one
 *      thing here that cannot be rebuilt (see the `score` comment); attendance
 *      is copied onto whichever row wins.
 *   2. Salvages fields the keeper lacks from the losers — critically the
 *      ticketId/paymentIntentId purchase linkage and `checkedInAt`, neither of
 *      which must disappear with the row.
 *   3. RE-ATTRIBUTES, never deletes, any `tickets` doc belonging to a loser
 *      uid: its firebaseUid is repointed at the keeper uid. This is not
 *      optional bookkeeping — api/declare-connection.js builds the matches
 *      page's co-attendee list from a UNION of event_registrations AND
 *      tickets (keyed on firebaseUid), so a ticket left pointing at the
 *      orphaned uid would keep showing the person twice even after their
 *      duplicate registration row is gone. Payment records are never deleted.
 *   4. Deletes the loser event_registrations row.
 *
 * SAFETY GATE: when TWO OR MORE accounts in a group each hold match history,
 * there is no safe deletion — whichever row goes takes irreplaceable matches
 * with it (that uid stops appearing as a co-attendee, and anyone who picked
 * them can never resolve to a mutual match). Those groups are REPORTED AND
 * SKIPPED for a human decision unless --include-matched is passed, so a
 * default run can never quietly discard someone's picks.
 *
 * A single account holding all the history is NOT blocked — the keeper rule
 * simply keeps that one.
 *
 * Usage:
 *   node scripts/merge-cross-account-attendees.js <eventId>              # dry run
 *   node scripts/merge-cross-account-attendees.js --all                  # dry run, every event
 *   node scripts/merge-cross-account-attendees.js <eventId> --apply
 *   node scripts/merge-cross-account-attendees.js <eventId> --apply --include-matched
 *
 *   # Same person under unrelated addresses — only a human can assert this:
 *   node scripts/merge-cross-account-attendees.js <eventId> \
 *     --alias=first.alias@gmail.com=first.real@gmail.com \
 *     --alias=second.alt@yahoo.com=second.real@gmail.com
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

// Human-asserted identity pairs, for the duplicates no algorithm can find.
// lib/email-identity only merges what is provably the same inbox (case, Apple
// aliases). It cannot know that first.alias@gmail.com and first.real@gmail.com
// are one person, or that second.alt@yahoo.com and second.real@gmail.com are —
// those share nothing to normalize on, and guessing from a shared first name
// would eventually join two strangers and leak one's phone number to the other
// on a mutual match. So the only safe source for these is a person who knows,
// stated explicitly here:
//
//   --alias=first.alias@gmail.com=first.real@gmail.com
//
// Both sides are normalized first, so casing/alias variants still work. Left
// side folds into the right side's identity group; the usual keeper rule,
// history gate and ticket re-attribution then apply unchanged.
const aliasMap = new Map();
for (const arg of process.argv.filter((a) => a.startsWith('--alias='))) {
  const [from, to] = arg.slice('--alias='.length).split('=');
  if (!from || !to || !from.includes('@') || !to.includes('@')) {
    console.error(`✗ Bad --alias (expected --alias=from@x.com=to@y.com): ${arg}`);
    process.exit(2);
  }
  aliasMap.set(normalizeEmail(from), normalizeEmail(to));
}

// Follow the alias chain, with a hard cap so a mistyped cycle
// (a=b plus b=a) can't hang the run.
function resolveIdentity(email) {
  let id = normalizeEmail(email);
  for (let i = 0; i < 8 && aliasMap.has(id); i++) {
    const next = aliasMap.get(id);
    if (next === id) break;
    id = next;
  }
  return id;
}

if (!eventId && !ALL) {
  console.error('✗ Usage: node scripts/merge-cross-account-attendees.js <eventId> [--apply]');
  console.error('         node scripts/merge-cross-account-attendees.js --all [--apply]');
  console.error('         ... [--alias=other@x.com=real@y.com]  (repeatable; same person, different addresses)');
  process.exit(2);
}

const ms = (ts) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis()
  : (ts ? new Date(ts).getTime() || 0 : 0);

// Keeper preference, highest priority first:
//
//   1. MATCH HISTORY (connection_intents / matches locks on that uid).
//      This outranks everything because it is the only thing here that cannot
//      be reconstructed: a match lock means contact info was already emailed
//      to two real people. An earlier version of this script ranked
//      checkedInAt first and would have deleted Helesha Shober's Eventbrite
//      account — the one holding 11 intents and 3 completed mutual matches —
//      purely because her check-in landed on the other account. Attendance is
//      recoverable (checkedInAt is in SALVAGE_FIELDS and gets copied onto the
//      keeper); a mutual match that stops resolving is not.
//   2. checkedInAt — real attendance, salvageable but still meaningful.
//   3. The canonical reg_{uid}_{eventId} id.
//   4. Oldest createdAt.
//
// `history` is precomputed per doc by the caller (uid-less guest rows can't
// have any, so they score 0 and never win against a real account).
// History is weighted by MAGNITUDE, not as a yes/no flag. When both accounts
// hold history the group is blocked anyway, but the reported keeper still has
// to be the one holding MORE — otherwise the plan reads as nonsense ("keeping
// the row with 5 matches, deleting the row with 14") and a later
// --include-matched run would discard the larger set. Live example: Helesha's
// check-in account holds 5 intents+locks and her Eventbrite account holds 14.
function score(doc, evId, history) {
  const d = doc.data();
  let s = 0;
  s += history * 10000;
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
  if (aliasMap.size) {
    // Echoed because these are human assertions, not derived facts — a wrong
    // one silently joins two different people, so it has to be visible in the
    // output that produced the change.
    console.log(`Manual identity aliases (${aliasMap.size}):`);
    for (const [from, to] of aliasMap) console.log(`   ${from}  →  ${to}`);
  }
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
    const key = resolveIdentity(r.email);
    if (!key) continue;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(doc);
  }

  // Fetched once — the match-lock ids are all we need, and re-reading the
  // whole collection per candidate uid would be needlessly expensive.
  const allMatchLocks = (await db.collection('matches').get()).docs.map((d) => d.id);

  // uid -> display name, so a blocked group can say WHO a surviving intent
  // points at instead of a bare uid. Only covers people with a confirmed
  // registration in the scanned scope — an intent pointing outside that
  // (a different event, or a deleted account) prints the uid, which is
  // itself useful information, not a bug.
  const nameByUid = new Map();
  for (const doc of snap.docs) {
    const r = doc.data();
    if (r.userId && !nameByUid.has(r.userId)) nameByUid.set(r.userId, r.name || r.email || r.userId);
  }
  const describeUid = (uid) => nameByUid.get(uid) || `(unknown uid ${uid})`;

  const plans = [];
  for (const [ev, m] of byEvent) {
    for (const [email, docs] of m) {
      if (docs.length < 2) continue;
      const uids = new Set(docs.map((d) => d.data().userId));
      if (uids.size < 2) continue; // same-uid → dedupe-registrations.js's job

      // Match history has to be measured for EVERY candidate, not just the
      // ones we were already planning to delete — it's the top-ranked keeper
      // signal, so we cannot know who the keeper is until we have it.
      const historyByDocId = new Map();
      for (const d of docs) {
        const u = d.data().userId;
        if (!u) { historyByDocId.set(d.id, { intents: 0, matchLocks: 0 }); continue; }
        const [out, inc] = await Promise.all([
          db.collection('connection_intents').where('fromUserId', '==', u).where('eventId', '==', ev).get(),
          db.collection('connection_intents').where('toUserId', '==', u).where('eventId', '==', ev).get(),
        ]);
        // Match locks are `${eventId}_${uidA}_${uidB}` (pair sorted), so scope
        // to this event before substring-matching the uid — an unscoped
        // includes() would count a lock from a different event this person
        // legitimately matched at, and needlessly block the merge.
        const matchLocks = allMatchLocks.filter(
          (id) => id.startsWith(`${ev}_`) && id.includes(u)
        ).length;
        // Keep the actual intent docs, not just a count — a blocked group
        // needs to say WHO the counterpart is and whether the pick was ever
        // reciprocated, not just "N connection_intent(s)". A single unrequited
        // intent (matchLocks 0) is a materially different risk than a
        // completed mutual match, and that distinction is invisible in a
        // bare number.
        const intentDocs = [
          ...out.docs.map((x) => ({ dir: 'sent to', other: x.data().toUserId, doc: x })),
          ...inc.docs.map((x) => ({ dir: 'received from', other: x.data().fromUserId, doc: x })),
        ];
        historyByDocId.set(d.id, { intents: out.size + inc.size, matchLocks, intentDocs });
      }
      const totalHistory = (d) => {
        const h = historyByDocId.get(d.id);
        return h.intents + h.matchLocks;
      };

      const sorted = [...docs].sort((a, b) => {
        const ds = score(b, ev, totalHistory(b)) - score(a, ev, totalHistory(a));
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

      // Only a loser's surviving history is a problem — the keeper's is safe
      // by definition. Blocking on "2+ docs have history" is the real test:
      // whichever one we delete then takes irreplaceable matches with it.
      const docsWithHistory = docs.filter((d) => totalHistory(d) > 0).length;
      const intents = losers.reduce((s, l) => s + historyByDocId.get(l.id).intents, 0);
      const matchLocks = losers.reduce((s, l) => s + historyByDocId.get(l.id).matchLocks, 0);
      const loserIntentDetails = losers.flatMap((l) => historyByDocId.get(l.id).intentDocs);

      // Tickets owned by a loser uid get repointed at the keeper, not deleted.
      const loserUids = losers.map((l) => l.data().userId).filter(Boolean);
      const ticketRepoints = [];
      for (const lu of loserUids) {
        const tk = await db.collection('tickets')
          .where('firebaseUid', '==', lu).where('eventId', '==', ev).get();
        tk.docs.forEach((d) => ticketRepoints.push(d.id));
      }

      plans.push({
        eventId: ev, email, keeper, losers, salvage,
        loserUids, intents, matchLocks, ticketRepoints, loserIntentDetails,
        keeperHistory: totalHistory(keeper),
        docsWithHistory,
        blocked: docsWithHistory >= 2 && !INCLUDE_MATCHED,
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
    if (p.keeperHistory > 0) {
      console.log(`   ✓ keeper holds the match history (${p.keeperHistory} intent(s)+lock(s)) — kept for that reason`);
    }
    if (p.intents || p.matchLocks) {
      console.log(`   ⚠ a row being DELETED has ${p.intents} connection_intent(s) and ${p.matchLocks} match lock(s) for this event`);
      // Spell out WHO and whether it's a completed match or a lone pick still
      // waiting on a reply — those are very different risks, and a bare count
      // can't tell them apart. This is exactly the distinction that mattered
      // for Amy: her losing row's only history is one UNREQUITED pick (0
      // match locks), not a completed match like Ed's and the Founders pairs.
      for (const { dir, other, doc } of p.loserIntentDetails) {
        const lockId = [p.eventId, ...[doc.data().fromUserId, doc.data().toUserId].sort()].join('_');
        const resolved = allMatchLocks.includes(lockId);
        console.log(`       - ${dir} ${describeUid(other)}${resolved ? '  [MUTUAL — contact info already emailed]' : '  [unrequited — no reply, nothing sent]'}`);
      }
      console.log(`     ${p.blocked ? 'SKIPPED — both accounts hold match history, so either deletion loses matches. Needs a manual call.' : 'proceeding because --include-matched was passed'}`);
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
