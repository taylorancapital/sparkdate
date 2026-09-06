#!/usr/bin/env node
/**
 * scripts/audit-duplicate-attendees.js
 *
 * READ-ONLY diagnostic for a DIFFERENT duplicate pattern than
 * dedupe-registrations.js catches. That script collapses duplicate
 * event_registrations docs that share the SAME userId (a query-then-add
 * race at the door). It can't catch a real person who ends up with TWO
 * DIFFERENT Firebase Auth accounts for one event, because the check-in
 * flow's email lookup (admin.auth().getUserByEmail) didn't match their
 * existing ticket/Eventbrite account — a case difference
 * (SomeName42@gmail.com vs somename42@gmail.com), an alias domain
 * (somename@me.com vs somename@mac.com), or a typo all produce a
 * genuinely different uid, hence a genuinely different
 * reg_{uid}_{eventId} doc — even though it's the same human, correctly
 * attached to the SAME event both times. That inflates roster counts and
 * makes the admin check-in list show the same person twice.
 *
 * This groups every CONFIRMED event_registrations doc by (eventId,
 * normalized email) and reports BOTH duplicate shapes separately, because
 * they need different fixes:
 *
 *   CROSS-ACCOUNT — one email spanning >1 distinct userId (or a real uid
 *     plus a uid-less guest/plus-one row). dedupe-registrations.js cannot
 *     fix these; it groups by userId and these have different ones.
 *
 *   SAME-ACCOUNT — one email, one userId, but >1 doc, meaning the
 *     deterministic reg_{uid}_{eventId} ID never took for at least one of
 *     them. This is exactly what dedupe-registrations.js is built for.
 *
 * Reporting both is deliberate: an earlier version of this script skipped
 * the same-account case as "another tool's job" and consequently
 * under-reported the real duplicate count by more than half, which made
 * the roster total impossible to reconcile against the admin page.
 *
 * Makes NO writes. Run this first, review the report, THEN decide on a
 * follow-up fix once the actual scope is known.
 *
 * Usage:
 *   node scripts/audit-duplicate-attendees.js <eventId>
 *   node scripts/audit-duplicate-attendees.js --all
 *   node scripts/audit-duplicate-attendees.js <eventId> --json
 *
 * Requires env vars (same as the other scripts/ tools — copy from
 * .env.local or the Vercel dashboard):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

'use strict';

const admin = require('firebase-admin');
const { normalizeEmail } = require('../lib/email-identity');

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
const asJson = process.argv.includes('--json');
const all = process.argv.includes('--all');
const eventId = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!eventId && !all) {
  console.error('✗ Usage: node scripts/audit-duplicate-attendees.js <eventId> [--json]');
  console.error('         node scripts/audit-duplicate-attendees.js --all [--json]');
  process.exit(2);
}

// Same identity rule the live check-in flow uses (lib/email-identity.js), so
// this audit can never disagree with the code that decides whether to create a
// second account. If that rule changes, both move together.
const normEmail = normalizeEmail;

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

(async () => {
  console.log('── Duplicate-attendee audit (read-only, no writes) ──\n');

  let query = db.collection('event_registrations').where('status', '==', 'confirmed');
  if (eventId) query = query.where('eventId', '==', eventId);
  const snap = await query.get();

  const byEvent = new Map(); // eventId -> Map(normEmail -> [{docId, ...}])
  for (const doc of snap.docs) {
    const r = doc.data();
    if (!r.email) continue;
    const ev = r.eventId;
    if (!byEvent.has(ev)) byEvent.set(ev, new Map());
    const m = byEvent.get(ev);
    const key = normEmail(r.email);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push({
      docId: doc.id,
      uid: r.userId || null,
      email: r.email,
      name: r.name || null,
      source: r.source || null,
      checkedInAt: toIso(r.checkedInAt),
      createdAt: toIso(r.createdAt),
    });
  }

  const eventIds = [...byEvent.keys()];
  const eventTitles = new Map();
  if (eventIds.length) {
    const evDocs = await Promise.all(eventIds.map((id) => db.collection('events').doc(id).get()));
    evDocs.forEach((d) => { if (d.exists) eventTitles.set(d.id, d.data().title || d.id); });
  }

  // Two DIFFERENT duplicate shapes, and they need different fixes — so they
  // are counted and reported separately rather than lumped together:
  //
  //   crossAccount — the same email spans >1 distinct userId (or a real uid
  //     plus a uid-less guest/plus-one doc). Check-in couldn't match their
  //     existing account, so a second Firebase account (or an orphan guest
  //     row) exists. dedupe-registrations.js CANNOT fix these — it groups by
  //     userId, and these have different ones.
  //
  //   sameAccount — the same email AND the same single userId across >1 doc.
  //     That means the deterministic reg_{uid}_{eventId} ID never took for at
  //     least one of them (a legacy auto-ID or eb_reg_ row that
  //     migrate-registrations.js hasn't collapsed). This IS what
  //     dedupe-registrations.js is built for. Reported here so the roster
  //     total actually reconciles — an earlier version of this script
  //     silently skipped these and under-reported the real duplicate count.
  const report = [];
  for (const [ev, m] of byEvent) {
    const crossAccount = [];
    const sameAccount = [];
    let totalConfirmed = 0;
    for (const [email, rows] of m) {
      totalConfirmed += rows.length;
      if (rows.length < 2) continue;
      const uids = new Set(rows.map((r) => r.uid));
      if (uids.size >= 2) crossAccount.push({ email, rows });
      else sameAccount.push({ email, rows });
    }
    if (crossAccount.length || sameAccount.length) {
      report.push({
        eventId: ev,
        eventTitle: eventTitles.get(ev) || ev,
        totalConfirmed,
        crossAccount,
        sameAccount,
      });
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (!report.length) {
    console.log('No duplicates found.');
    process.exit(0);
  }

  const printGroup = (g) => {
    console.log(`\n  ${g.email}`);
    for (const r of g.rows) {
      console.log(`    - ${r.docId}`);
      console.log(`        uid=${r.uid}  name=${r.name}  source=${r.source}  checkedInAt=${r.checkedInAt || 'not checked in'}`);
    }
  };

  let totalCross = 0;
  let totalSame = 0;
  for (const ev of report) {
    const dupPeople = ev.crossAccount.length + ev.sameAccount.length;
    const realPeople = ev.totalConfirmed - dupPeople;
    console.log(`\n══ ${ev.eventTitle} [${ev.eventId}] ══`);
    console.log(`   ${ev.totalConfirmed} confirmed registration docs`);
    console.log(`   ${dupPeople} duplicated ${dupPeople === 1 ? 'person' : 'people'} → ~${realPeople} real unique attendees`);

    if (ev.crossAccount.length) {
      console.log(`\n  ── CROSS-ACCOUNT (${ev.crossAccount.length}) — different uids; dedupe-registrations.js CANNOT fix these ──`);
      ev.crossAccount.forEach((g) => { totalCross++; printGroup(g); });
    }
    if (ev.sameAccount.length) {
      console.log(`\n  ── SAME-ACCOUNT (${ev.sameAccount.length}) — one uid, stale doc IDs; dedupe-registrations.js handles these ──`);
      ev.sameAccount.forEach((g) => { totalSame++; printGroup(g); });
    }
    console.log();
  }
  console.log('══ TOTALS across scanned event(s) ══');
  console.log(`  cross-account duplicates: ${totalCross}  (need the email-match fix + manual merge)`);
  console.log(`  same-account duplicates:  ${totalSame}  (run: node scripts/dedupe-registrations.js <eventId>)`);
  console.log(`  total duplicated people:  ${totalCross + totalSame}`);
  console.log('\nNo changes were made. This is a report only.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
