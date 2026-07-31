#!/usr/bin/env node
/**
 * scripts/backfill-checkins.js
 *
 * Marks attendees as checked in when they were physically present but never
 * used the check-in flow (phone died, missed the QR, walked past the host).
 *
 * `checkedInAt` is narrower than it looks: grep shows it is read ONLY by the
 * admin roster (the "Checked in" stat and the ✓ column, public/admin.html).
 * Matching (api/declare-connection.js), the match-link email
 * (api/cron-send-emails.js) and retention/nurture suppression
 * (lib/attendance-index.js) all key on `status === 'confirmed'` plus a past
 * event date and never look at check-in. So someone missing it still got their
 * match link and still counts as having attended — this is a reporting fix, not
 * a functional one. Worth doing so the roster can be trusted, not urgent.
 *
 * Mirrors what api/lead-signup.js handleCheckin writes, so a backfilled row is
 * consistent with a real one:
 *   - event_registrations: checkedInAt (a real Firestore Timestamp, so it sorts
 *     against genuine check-ins in the roster) + checkedInSource:
 *     'manual_backfill' so a later audit can tell these apart from live scans
 *   - users: lastCheckedInEventId
 *   - event_attendance_logged / activity feed, via lib/activity-log's
 *     logEventAttended, which has its own idempotency lock
 *
 * Timestamp used is the EVENT'S START TIME, not now() — we don't know the real
 * minute they arrived, and stamping "now" would put a July check-in in
 * whatever month this is run.
 *
 * Emails are matched with lib/email-identity's rule, so a case variant or an
 * Apple alias still resolves to the right row.
 *
 * Usage:
 *   node scripts/backfill-checkins.js <eventId> --emails=a@b.com,c@d.com
 *   node scripts/backfill-checkins.js <eventId> --file=attended.txt
 *   node scripts/backfill-checkins.js <eventId> --file=attended.txt --apply
 *
 * The file form accepts one email per line, or a single semicolon/comma
 * separated blob; blank lines, `#` comments and surrounding punctuation are
 * ignored, and anything in (parentheses) is stripped so a pasted note like
 * "a@b.com (checked in under other@c.com)" doesn't break parsing.
 *
 * Requires env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 * FIREBASE_PRIVATE_KEY
 */

'use strict';

const fs = require('fs');
const admin = require('firebase-admin');
const { sameEmailIdentity, normalizeEmail } = require('../lib/email-identity');

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
const FieldValue = admin.firestore.FieldValue;
const { logEventAttended } = require('../lib/activity-log');

const APPLY = process.argv.includes('--apply');
const eventId = process.argv.slice(2).find((a) => !a.startsWith('--'));
const emailsArg = (process.argv.find((a) => a.startsWith('--emails=')) || '').slice('--emails='.length);
const fileArg = (process.argv.find((a) => a.startsWith('--file=')) || '').slice('--file='.length);

if (!eventId || (!emailsArg && !fileArg)) {
  console.error('✗ Usage: node scripts/backfill-checkins.js <eventId> --emails=a@b.com,c@d.com [--apply]');
  console.error('         node scripts/backfill-checkins.js <eventId> --file=attended.txt [--apply]');
  process.exit(2);
}

// Tolerant parse — a real hand-written attendee list has stray semicolons,
// angle brackets and trailing punctuation in it.
//
// Deliberately extracts EVERY address it can see, including ones inside
// parenthetical notes. An earlier version stripped `(...)` groups as "notes"
// and silently swallowed an entire person, because the list it was given wrote
// one attendee as "(a@b.com <checked in under c@d.com, ticket under e@f.com>)"
// — primary address and all. Dropping someone from an attendance list without
// saying so is the worst possible failure here, so instead every address is
// kept and the parsed set is echoed back for the operator to eyeball. Extra
// addresses are harmless: an already-checked-in row reports as "already" and a
// nonexistent one reports as "not found". Neither writes anything.
function parseEmails(raw) {
  return raw
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))       // strip comments
    .join('\n')
    .split(/[\s;,()]+/)
    .map((s) => s.replace(/^[<>"']+|[<>"'.]+$/g, '').trim())
    .filter((s) => s.includes('@') && s.indexOf('@') > 0 && s.lastIndexOf('.') > s.indexOf('@'));
}

(async () => {
  console.log(APPLY ? '── APPLYING ──' : '── DRY RUN (pass --apply to write) ──');

  const raw = fileArg ? fs.readFileSync(fileArg, 'utf8') : emailsArg;
  const wanted = [...new Set(parseEmails(raw).map(normalizeEmail))];
  if (!wanted.length) {
    console.error('✗ No parseable email addresses found.');
    process.exit(2);
  }

  const evSnap = await db.collection('events').doc(eventId).get();
  if (!evSnap.exists) {
    console.error(`✗ Event ${eventId} not found.`);
    process.exit(2);
  }
  const ev = evSnap.data();
  const evTitle = ev.title || eventId;
  const evDate = ev.date && ev.date.toDate ? ev.date.toDate() : new Date(ev.date);
  if (isNaN(evDate.getTime())) {
    console.error('✗ Event has no usable date — cannot choose a check-in timestamp.');
    process.exit(2);
  }

  console.log(`Event: ${evTitle} [${eventId}]`);
  console.log(`Backfill timestamp: ${evDate.toISOString()} (event start)`);
  console.log();
  // Echo the parsed set — the input is hand-written, so the operator needs to
  // see exactly what was understood before anything is written.
  console.log(`── Parsed ${wanted.length} address(es) from input ──`);
  wanted.forEach((e) => console.log(`   ${e}`));
  console.log();

  const regSnap = await db.collection('event_registrations')
    .where('eventId', '==', eventId).get();
  const regs = regSnap.docs.filter((d) => {
    const s = d.data().status;
    return s === 'confirmed' || !s;
  });

  const already = [], toBackfill = [], notFound = [];
  for (const email of wanted) {
    const hits = regs.filter((d) => sameEmailIdentity(d.data().email, email));
    if (!hits.length) { notFound.push(email); continue; }
    // If somehow more than one row survives for this identity, the duplicate
    // tooling hasn't finished — say so rather than guessing which to stamp.
    if (hits.length > 1) {
      notFound.push(`${email}  (AMBIGUOUS — ${hits.length} rows: ${hits.map((h) => h.id).join(', ')})`);
      continue;
    }
    const doc = hits[0];
    if (doc.data().checkedInAt) already.push({ email, doc });
    else toBackfill.push({ email, doc });
  }

  if (already.length) {
    console.log(`── Already checked in (${already.length}) — no action ──`);
    already.forEach(({ email, doc }) => {
      const d = doc.data();
      const at = d.checkedInAt.toDate ? d.checkedInAt.toDate() : new Date(d.checkedInAt);
      console.log(`   ${email}  ${d.name || ''}  ${at.toISOString()}${d.checkedInSource === 'manual_backfill' ? '  (previously backfilled)' : ''}`);
    });
    console.log();
  }

  if (toBackfill.length) {
    console.log(`── Will be marked checked in (${toBackfill.length}) ──`);
    toBackfill.forEach(({ email, doc }) => {
      const d = doc.data();
      console.log(`   ${email}  ${d.name || '(no name)'}  uid=${d.userId || 'NULL'}  source=${d.source || '—'}`);
      console.log(`      ${doc.id}`);
    });
    console.log();
  }

  if (notFound.length) {
    console.log(`── No confirmed registration for this event (${notFound.length}) ──`);
    notFound.forEach((e) => console.log(`   ${e}`));
    console.log('   These need a registration first — marking attendance on a person who');
    console.log('   has no row would not show up on the roster at all. Check the spelling,');
    console.log('   or enroll them via the admin panel, then re-run.');
    console.log();
  }

  const checkedInNow = regs.filter((d) => d.data().checkedInAt).length;
  console.log(`Roster now: ${regs.length} confirmed · ${checkedInNow} checked in`);
  console.log(`After apply: ${regs.length} confirmed · ${checkedInNow + toBackfill.length} checked in`);
  console.log();

  if (!APPLY) {
    console.log('No changes made. Re-run with --apply to write.');
    process.exit(0);
  }
  if (!toBackfill.length) {
    console.log('Nothing to backfill.');
    process.exit(0);
  }

  let ok = 0, failed = 0;
  for (const { email, doc } of toBackfill) {
    const d = doc.data();
    try {
      await doc.ref.set({
        checkedInAt: admin.firestore.Timestamp.fromDate(evDate),
        checkedInSource: 'manual_backfill',
        checkedInBackfilledAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      if (d.userId) {
        await db.collection('users').doc(d.userId)
          .set({ lastCheckedInEventId: eventId }, { merge: true })
          .catch((e) => console.error(`     users doc update skipped: ${e.message}`));
        await logEventAttended(db, FieldValue, {
          uid: d.userId, email: d.email, name: d.name,
          eventId, eventName: evTitle, method: 'manual_backfill',
        }).catch((e) => console.error(`     activity log skipped: ${e.message}`));
      }
      console.log(`  ✓ ${email}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${email}: ${e.message}`);
      failed++;
    }
  }
  console.log();
  console.log(`Done. ${ok} marked checked in${failed ? `, ${failed} failed` : ''}.`);
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
