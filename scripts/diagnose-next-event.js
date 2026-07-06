#!/usr/bin/env node
/**
 * scripts/diagnose-next-event.js
 *
 * Read-only. Explains why the homepage/lp.html "upcoming event" banner is
 * showing generic fallback copy instead of a real event — i.e. why
 * GET /api/next-event is returning { event: null } even though an event
 * exists in Firestore.
 *
 * Replicates api/next-event.js's EXACT selection logic (same query, same
 * per-document filter, same ordering) against every doc in `events/`, and
 * prints why each one is or isn't a match. The real endpoint picks the
 * first (soonest) doc, in date-ascending order, where:
 *   1. `date` parses to a valid Date (Timestamp via .toDate(), or new Date(date))
 *   2. that date is >= right now
 *   3. `status` is not exactly the string 'full'
 *
 * Usage:
 *   node scripts/diagnose-next-event.js
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

(async () => {
  console.log('────────────────────────────────────────────────────');
  console.log(`Now (server time): ${new Date().toISOString()}`);
  console.log('────────────────────────────────────────────────────');

  let snap;
  try {
    // Exact same query api/next-event.js runs.
    snap = await db.collection('events').orderBy('date', 'asc').get();
  } catch (e) {
    console.error('✗ The orderBy(\'date\',\'asc\') query itself threw — this is');
    console.error('  almost certainly the bug. Firestore error:');
    console.error(' ', e.message);
    console.error('\n  Common cause: a doc in events/ has `date` stored as a type');
    console.error('  Firestore can\'t order (e.g. a plain map/array), or a required');
    console.error('  index is missing/building. Check the Firestore console\'s');
    console.error('  Indexes tab for a "requires an index" link in the error above.');
    process.exit(1);
  }

  if (snap.empty) {
    console.log('events/ collection is completely empty — nothing to pick from.');
    console.log('That fully explains { event: null }. Create an event in admin.html.');
    process.exit(0);
  }

  console.log(`Found ${snap.docs.length} doc(s) in events/, in date-ascending order:\n`);

  const now = Date.now();
  let picked = null;

  for (const doc of snap.docs) {
    const e = doc.data();
    const rawDate = e.date;
    const dateType = rawDate == null ? 'missing'
      : (rawDate.toDate ? 'Firestore Timestamp' : (rawDate instanceof Date ? 'JS Date' : typeof rawDate));

    const dt = rawDate && rawDate.toDate ? rawDate.toDate()
             : (rawDate ? new Date(rawDate) : null);
    const validDate = !!dt && !isNaN(dt.getTime());
    const isFuture = validDate && dt.getTime() >= now;
    const isFull = e.status === 'full';

    console.log(`• ${doc.id}`);
    console.log(`    title: ${JSON.stringify(e.title)}`);
    console.log(`    date field type: ${dateType}`);
    console.log(`    date parsed: ${validDate ? dt.toISOString() : '(INVALID — new Date() could not parse it)'}`);
    if (validDate) {
      const diffHrs = ((dt.getTime() - now) / 3600000).toFixed(1);
      console.log(`    vs now: ${isFuture ? `${diffHrs}h in the future` : `${Math.abs(diffHrs)}h in the PAST`}`);
    }
    console.log(`    status: ${JSON.stringify(e.status)}${isFull ? '  <-- excluded: status is exactly "full"' : ''}`);

    let verdict;
    if (!validDate) verdict = 'SKIPPED — invalid/unparseable date';
    else if (!isFuture) verdict = 'SKIPPED — date is in the past';
    else if (isFull) verdict = 'SKIPPED — status is "full"';
    else if (!picked) { verdict = '✅ THIS is what /api/next-event would return'; picked = doc.id; }
    else verdict = '(would be eligible, but an earlier doc above already won)';
    console.log(`    verdict: ${verdict}\n`);
  }

  console.log('────────────────────────────────────────────────────');
  if (picked) {
    console.log(`Result: /api/next-event should be returning event "${picked}".`);
    console.log('If the live endpoint is still returning { event: null }, the');
    console.log('deployed function may be running stale code, or is reading a');
    console.log('different Firestore project than this script (double-check');
    console.log('FIREBASE_PROJECT_ID matches the one set in Vercel).');
  } else {
    console.log('Result: no doc passes all three checks — this fully explains');
    console.log('{ event: null }. Look at the per-doc verdicts above for exactly');
    console.log('which check your event is failing (most common: date already');
    console.log('in the past due to a timezone mismatch when it was created, or');
    console.log('status accidentally left as something read as "full").');
  }
  console.log('────────────────────────────────────────────────────');

  process.exit(0);
})().catch((e) => {
  console.error('✗ error:', e.message);
  process.exit(1);
});
