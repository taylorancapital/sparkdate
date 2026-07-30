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
 * (Redrose1246@gmail.com vs redrose1246@gmail.com), an alias domain
 * (lukedebonis@me.com vs lukedebonis@mac.com), or a typo all produce a
 * genuinely different uid, hence a genuinely different
 * reg_{uid}_{eventId} doc — even though it's the same human, correctly
 * attached to the SAME event both times. That inflates roster counts and
 * makes the admin check-in list show the same person twice.
 *
 * This groups every CONFIRMED event_registrations doc by (eventId,
 * normalized email) and flags any group with more than one doc AND more
 * than one distinct userId — the "different account, same person" case.
 * A group sharing one userId is dedupe-registrations.js's job, not this
 * script's, so it's deliberately excluded here to keep the two tools from
 * overlapping.
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

// Apple issues @me.com, @mac.com, and @icloud.com as interchangeable
// aliases for the SAME iCloud inbox — Luke DeBonis on the Round 2 roster
// (lukedebonis@me.com at check-in vs lukedebonis@mac.com on his Eventbrite
// ticket) is a real, confirmed instance of exactly this. Canonicalize all
// three to one domain so that pair groups together; case/whitespace are
// also normalized. Deliberately NOT doing Gmail dot/plus-tag folding here —
// no evidence of that pattern in this dataset, and it's a more speculative
// normalization with a higher false-positive risk.
const APPLE_ALIAS_DOMAINS = new Set(['me.com', 'mac.com', 'icloud.com']);
function normEmail(e) {
  const s = String(e || '').toLowerCase().trim();
  const at = s.lastIndexOf('@');
  if (at === -1) return s;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  return APPLE_ALIAS_DOMAINS.has(domain) ? `${local}@icloud.com` : s;
}

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

  const report = [];
  for (const [ev, m] of byEvent) {
    const dupGroups = [];
    for (const [email, rows] of m) {
      if (rows.length < 2) continue;
      const uids = new Set(rows.map((r) => r.uid));
      if (uids.size < 2) continue; // same-uid dupes are dedupe-registrations.js's job
      dupGroups.push({ email, rows });
    }
    if (dupGroups.length) {
      report.push({ eventId: ev, eventTitle: eventTitles.get(ev) || ev, duplicateGroups: dupGroups });
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  if (!report.length) {
    console.log('No cross-account duplicates found.');
    process.exit(0);
  }

  let totalDupPeople = 0;
  for (const ev of report) {
    console.log(`── ${ev.eventTitle} [${ev.eventId}] — ${ev.duplicateGroups.length} duplicated ${ev.duplicateGroups.length === 1 ? 'person' : 'people'} ──`);
    for (const g of ev.duplicateGroups) {
      totalDupPeople++;
      console.log(`\n  ${g.email}`);
      for (const r of g.rows) {
        console.log(`    - ${r.docId}  uid=${r.uid}  name=${r.name}  source=${r.source}  checkedInAt=${r.checkedInAt || 'not checked in'}`);
      }
    }
    console.log();
  }
  console.log(`Total duplicated people across scanned event(s): ${totalDupPeople}`);
  console.log('No changes were made. This is a report only.');
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
