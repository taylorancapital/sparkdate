#!/usr/bin/env node
/**
 * scripts/merge-duplicate-member.js
 *
 * Fixes the two ways one human ends up with the wrong account:
 *
 *   MERGE  — two Firebase accounts for the same person (usually because an
 *            Eventbrite/Meetup import used a different email than the one they
 *            originally signed up with, so the importer's exact-email lookup
 *            missed and created a second user). Moves everything onto the
 *            keeper and retires the loser.
 *
 *   RENAME — one account with the wrong email on it. Nothing to merge; just
 *            updates the Auth email and every Firestore doc that stores it.
 *
 * Which one runs is decided automatically by whether --to already exists as a
 * Firebase Auth user. That is the ONLY difference, so you don't have to know
 * which situation you're in before running it.
 *
 * Usage:
 *   node scripts/merge-duplicate-member.js --from old@x.com --to new@x.com
 *   node scripts/merge-duplicate-member.js --from old@x.com --to new@x.com --execute
 *   node scripts/merge-duplicate-member.js --from old@x.com --to new@x.com --execute --keep-loser-account
 *
 * Dry run is the DEFAULT. It prints the exact plan and touches nothing. Always
 * read a dry run before adding --execute — this moves ticket revenue and event
 * attendance between accounts, and there is no undo.
 *
 * Requires the same env vars as the Vercel functions:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   STRIPE_SECRET_KEY   (optional — only used to WARN about a live subscription)
 *
 * ── Design rules, and why ──────────────────────────────────────────────
 *
 * 1. TICKETS ARE NEVER DELETED OR COMBINED. They're the revenue record. This
 *    script only re-points firebaseUid/email onto the keeper. If both accounts
 *    hold a ticket for the SAME event, that's genuinely ambiguous — a real
 *    double purchase, or a duplicate record — so it's reported for you to
 *    decide rather than silently resolved. Guessing wrong either invents or
 *    destroys revenue.
 *
 * 2. REGISTRATIONS ARE MERGED, because they can't both survive: the doc id is
 *    deterministic (reg_{uid}_{eventId}), so keeper and loser rows for one
 *    event are two docs that must become one. Field salvage follows
 *    dedupe-registrations.js, including its hard-won lesson that `checkedInAt`
 *    must be carried across — the keeper is chosen by identity, not by who
 *    holds the check-in, so without salvage the only proof someone physically
 *    attended can be deleted.
 *
 * 3. STRIPE IS NEVER TOUCHED. A loser account with a live subscription is
 *    reported loudly and the merge refuses unless you pass --force-stripe.
 *    Cancelling someone's paid subscription as a side effect of a data cleanup
 *    is not a call this script gets to make.
 */

'use strict';

const admin = require('firebase-admin');

// ── Args ─────────────────────────────────────────────────────────
// Parsed and validated BEFORE Firebase is initialised, so running this with no
// arguments prints usage instead of an unrelated "missing env var" complaint.
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const has = (name) => argv.includes(name);

const fromEmail = (flag('--from') || '').toLowerCase().trim();
const toEmail   = (flag('--to')   || '').toLowerCase().trim();
const EXECUTE   = has('--execute');
const KEEP_LOSER = has('--keep-loser-account');
const FORCE_STRIPE = has('--force-stripe');

function usage(msg) {
  if (msg) console.error(`✗ ${msg}\n`);
  console.error('Usage: node scripts/merge-duplicate-member.js --from old@x.com --to new@x.com [--execute]');
  console.error('');
  console.error('  --execute               apply the changes (default is a dry run that writes nothing)');
  console.error('  --keep-loser-account    leave the old Auth user in place (data still moves off it)');
  console.error('  --force-stripe          proceed even if the old account has a live subscription');
  console.error('');
  console.error('If --to has no account, this RENAMES the --from account to that address.');
  console.error('If --to does have one, it MERGES --from into it and retires --from.');
  process.exit(2);
}

if (!fromEmail || !toEmail) usage('Both --from and --to are required.');
if (fromEmail === toEmail) usage('--from and --to are the same address; nothing to do.');
const looksLikeEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
if (!looksLikeEmail(fromEmail)) usage(`--from "${fromEmail}" doesn't look like an email address.`);
if (!looksLikeEmail(toEmail))   usage(`--to "${toEmail}" doesn't look like an email address.`);

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
const FieldValue = admin.firestore.FieldValue;

const tag = EXECUTE ? '→ WRITE ' : '[DRY]   ';
const log  = (...m) => console.log(tag, ...m);
const info = (...m) => console.log('•       ', ...m);
const warn = (...m) => console.log('⚠       ', ...m);

// Fields worth salvaging from the loser's registration onto the keeper's.
// checkedInAt is the load-bearing one — see the header note and the long
// comment in dedupe-registrations.js explaining how its absence silently
// dropped 8 of 21 real check-ins on a live event.
const MERGE_FIELDS = [
  'photoConsent', 'firstTimeAttendee', 'phone', 'gender', 'name', 'source',
  'eventTitle', 'ticketId', 'paymentIntentId', 'email',
  'checkedInAt', 'postEventPromptSent', 'postEventPromptSentAt',
  'isComp',
];

// Commit in <=500-op chunks (Firestore's batch ceiling).
async function commitAll(ops) {
  if (!EXECUTE || !ops.length) return;
  let batch = db.batch();
  let n = 0;
  for (const apply of ops) {
    apply(batch);
    if (++n % 450 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 450 !== 0) await batch.commit();
}

async function getAuthUser(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') return null;
    throw e;
  }
}

// ── RENAME: one account, wrong address ───────────────────────────
async function renameOnly(user) {
  console.log('Mode: RENAME (no account exists at --to, so nothing to merge)');
  console.log('────────────────────────────────────────────────────');
  const uid = user.uid;
  const ops = [];

  log(`Auth email  ${fromEmail}  ->  ${toEmail}`);

  const userRef = db.collection('users').doc(uid);
  if ((await userRef.get()).exists) {
    log(`users/${uid}.email -> ${toEmail}`);
    ops.push((b) => b.update(userRef, { email: toEmail }));
  } else {
    info('no users/{uid} doc');
  }

  for (const [coll, field] of [
    ['event_registrations', 'userId'],
    ['tickets', 'firebaseUid'],
  ]) {
    const snap = await db.collection(coll).where(field, '==', uid).get();
    if (snap.empty) { info(`${coll}: no rows`); continue; }
    log(`${coll}: ${snap.size} row(s) .email -> ${toEmail}`);
    snap.docs.forEach(d => ops.push((b) => b.update(d.ref, { email: toEmail })));
  }

  // Leads are keyed BY email, so this one is a real re-key, not a field edit.
  const leadSnap = await db.collection('leads').where('email', '==', fromEmail).get();
  if (leadSnap.empty) {
    info('leads: no rows');
  } else {
    const existingTo = await db.collection('leads').where('email', '==', toEmail).limit(1).get();
    if (!existingTo.empty) {
      warn(`leads: a lead already exists for ${toEmail} — leaving the old ${leadSnap.size} row(s) alone to avoid creating a duplicate subscriber. Tidy by hand if it matters.`);
    } else {
      log(`leads: ${leadSnap.size} row(s) .email -> ${toEmail}`);
      leadSnap.docs.forEach(d => ops.push((b) => b.update(d.ref, { email: toEmail })));
    }
  }

  await commitAll(ops);
  if (EXECUTE) {
    await admin.auth().updateUser(uid, { email: toEmail, emailVerified: false });
  }
  return true;
}

// ── MERGE: two accounts, one human ───────────────────────────────
async function mergeAccounts(loser, keeper) {
  console.log('Mode: MERGE (both addresses have an account)');
  console.log(`  loser  ${fromEmail}  uid=${loser.uid}`);
  console.log(`  keeper ${toEmail}  uid=${keeper.uid}`);
  console.log('────────────────────────────────────────────────────');

  const loserUid = loser.uid;
  const keeperUid = keeper.uid;
  const ops = [];
  let blocked = false;

  // ── Stripe guard (report only, never act) ──────────────────────
  const loserDocSnap = await db.collection('users').doc(loserUid).get();
  const loserData = loserDocSnap.exists ? loserDocSnap.data() : {};
  if (loserData.subscriptionId || loserData.stripeCustomerId) {
    warn(`the OLD account has Stripe data attached:`);
    if (loserData.subscriptionId)   warn(`    subscriptionId  ${loserData.subscriptionId}`);
    if (loserData.stripeCustomerId) warn(`    stripeCustomerId ${loserData.stripeCustomerId}`);
    warn('    This script never cancels or moves a subscription — do that in the Stripe');
    warn('    dashboard first, then re-run. Pass --force-stripe to proceed anyway.');
    if (!FORCE_STRIPE) blocked = true;
  }

  // ── users doc: fill gaps on the keeper, don't overwrite ─────────
  const keeperRef = db.collection('users').doc(keeperUid);
  const keeperSnap = await keeperRef.get();
  const keeperData = keeperSnap.exists ? keeperSnap.data() : {};
  const PROFILE_FIELDS = ['firstName', 'lastName', 'phone', 'age', 'gender',
    'interests', 'vibes', 'intent', 'bio', 'photoUrl', 'preferences'];
  const fill = {};
  PROFILE_FIELDS.forEach(f => {
    if (keeperData[f] == null && loserData[f] != null) fill[f] = loserData[f];
  });
  // profileCompleted is sticky-true: if EITHER account finished the profile the
  // person has done the work, and un-completing it would re-trigger the nag
  // emails at them.
  if (loserData.profileCompleted === true && keeperData.profileCompleted !== true) {
    fill.profileCompleted = true;
  }
  if (Object.keys(fill).length) {
    log(`users/${keeperUid}: filling missing [${Object.keys(fill).join(', ')}] from the old account`);
    ops.push((b) => b.set(keeperRef, fill, { merge: true }));
  } else {
    info('users: keeper already has everything worth copying');
  }

  // ── event_registrations: merge, because ids collide ─────────────
  const loserRegs = await db.collection('event_registrations').where('userId', '==', loserUid).get();
  if (loserRegs.empty) info('event_registrations: no rows on the old account');
  for (const d of loserRegs.docs) {
    const r = d.data();
    const eventId = r.eventId;
    if (!eventId) { warn(`registration ${d.id} has no eventId — skipping, review by hand`); continue; }
    const targetId = `reg_${keeperUid}_${eventId}`;
    const targetRef = db.collection('event_registrations').doc(targetId);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      log(`event_registrations: ${d.id} -> ${targetId} (move)`);
      const moved = { ...r, userId: keeperUid, email: toEmail };
      ops.push((b) => b.set(targetRef, moved, { merge: true }));
      ops.push((b) => b.delete(d.ref));
    } else {
      const t = targetSnap.data();
      const salvage = {};
      MERGE_FIELDS.forEach(f => { if (t[f] == null && r[f] != null) salvage[f] = r[f]; });
      const note = Object.keys(salvage).length ? ` salvaging [${Object.keys(salvage).join(', ')}]` : ' nothing to salvage';
      log(`event_registrations: ${d.id} merged into existing ${targetId} —${note}`);
      if (salvage.checkedInAt != null) {
        warn(`    ↳ the OLD row held the only check-in for this event; copying it across`);
      }
      if (Object.keys(salvage).length) ops.push((b) => b.set(targetRef, salvage, { merge: true }));
      ops.push((b) => b.delete(d.ref));
    }
  }

  // ── tickets: RE-POINT ONLY. Never delete, never combine. ────────
  const loserTix = await db.collection('tickets').where('firebaseUid', '==', loserUid).get();
  if (loserTix.empty) info('tickets: no rows on the old account');
  for (const d of loserTix.docs) {
    const t = d.data();
    const clash = t.eventId
      ? await db.collection('tickets')
          .where('firebaseUid', '==', keeperUid)
          .where('eventId', '==', t.eventId).limit(1).get()
      : { empty: true };
    if (!clash.empty) {
      warn(`tickets: BOTH accounts have a ticket for event ${t.eventId}`);
      warn(`    old=${d.id} ($${((Number(t.amount) || 0) / 100).toFixed(2)})  keeper=${clash.docs[0].id}`);
      warn('    Re-pointing anyway so nothing is lost, but check whether this is a real');
      warn('    double purchase (leave both) or a duplicate record (refund/void one).');
    }
    log(`tickets: ${d.id} firebaseUid -> ${keeperUid}`);
    ops.push((b) => b.update(d.ref, { firebaseUid: keeperUid, email: toEmail }));
  }

  // ── simple owner re-points ─────────────────────────────────────
  for (const [coll, field] of [
    ['connection_intents', 'fromUserId'],
    ['connection_intents', 'toUserId'],
    ['activity',           'userId'],
    ['payments',           'userId'],
  ]) {
    const snap = await db.collection(coll).where(field, '==', loserUid).get();
    if (snap.empty) { info(`${coll}.${field}: no rows`); continue; }
    log(`${coll}.${field}: ${snap.size} row(s) -> ${keeperUid}`);
    snap.docs.forEach(d => ops.push((b) => b.update(d.ref, { [field]: keeperUid })));
  }

  // ── matches: uid pair lives in an array AND in the doc id ───────
  // The doc id is `${eventId}_${sortedA}_${sortedB}` and is a uniqueness lock,
  // so a merged pair has to be rewritten under a new id, not updated in place.
  const matchSnap = await db.collection('matches').where('users', 'array-contains', loserUid).get();
  if (matchSnap.empty) {
    info('matches: no rows');
  } else {
    for (const d of matchSnap.docs) {
      const m = d.data();
      const other = (m.users || []).find(u => u !== loserUid);
      if (other === keeperUid) {
        // The two duplicate accounts matched EACH OTHER. Collapsing them would
        // produce a self-match, which is meaningless.
        warn(`matches: ${d.id} is a match between the two duplicate accounts — deleting rather than collapsing to a self-match`);
        ops.push((b) => b.delete(d.ref));
        continue;
      }
      const pair = [keeperUid, other].sort();
      const newId = `${m.eventId}_${pair[0]}_${pair[1]}`;
      if (newId === d.id) continue;
      log(`matches: ${d.id} -> ${newId}`);
      ops.push((b) => b.set(db.collection('matches').doc(newId),
        { ...m, users: pair, mergedFrom: d.id, mergedAt: FieldValue.serverTimestamp() }, { merge: true }));
      ops.push((b) => b.delete(d.ref));
    }
  }

  // ── leads ──────────────────────────────────────────────────────
  const loserLeads = await db.collection('leads').where('email', '==', fromEmail).get();
  const keeperLeads = await db.collection('leads').where('email', '==', toEmail).get();
  if (loserLeads.empty) {
    info('leads: no rows on the old address');
  } else if (!keeperLeads.empty) {
    log(`leads: ${loserLeads.size} old row(s) deleted (keeper already has a lead at ${toEmail})`);
    loserLeads.docs.forEach(d => ops.push((b) => b.delete(d.ref)));
  } else {
    log(`leads: ${loserLeads.size} row(s) .email -> ${toEmail}`);
    loserLeads.docs.forEach(d => ops.push((b) => b.update(d.ref, { email: toEmail })));
  }

  if (blocked) {
    console.log('────────────────────────────────────────────────────');
    console.error('✗ Refusing to execute: the old account has a live Stripe subscription.');
    console.error('  Handle it in Stripe first, or re-run with --force-stripe.');
    return false;
  }

  await commitAll(ops);

  // ── retire the loser, last ─────────────────────────────────────
  if (KEEP_LOSER) {
    info(`keeping the old Auth account (${fromEmail}) as requested`);
  } else {
    log(`users/${loserUid} document deleted`);
    log(`Firebase Auth user ${loserUid} (${fromEmail}) deleted`);
    if (EXECUTE) {
      if (loserDocSnap.exists) await db.collection('users').doc(loserUid).delete();
      await admin.auth().deleteUser(loserUid);
    }
  }
  return true;
}

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log('────────────────────────────────────────────────────');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (live writes)' : 'DRY RUN (no writes)'}`);
  console.log(`From: ${fromEmail}`);
  console.log(`To:   ${toEmail}`);
  console.log('────────────────────────────────────────────────────');

  const loser = await getAuthUser(fromEmail);
  if (!loser) {
    console.error(`✗ No Firebase Auth user for --from ${fromEmail}. Nothing to move.`);
    process.exit(3);
  }
  const keeper = await getAuthUser(toEmail);

  const ok = keeper ? await mergeAccounts(loser, keeper) : await renameOnly(loser);

  console.log('────────────────────────────────────────────────────');
  if (!ok) process.exit(4);
  console.log(EXECUTE
    ? '✓ Done. Re-run the dashboard Refresh to see updated rosters and P&L.'
    : 'Dry run complete — nothing was written. Re-run with --execute to apply.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
