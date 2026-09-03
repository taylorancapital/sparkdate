#!/usr/bin/env node
/**
 * scripts/backfill-lead-gender.js
 *
 * One-time backfill: stamp `gender` onto `leads` docs from the ticket and
 * registration records that already carry it.
 *
 * WHY THIS EXISTS
 *
 * `leads` is the ONLY collection the engagement email passes read — the
 * day2/5/14/25 nurture, the biweekly newsletter, the post-nurture campaign and
 * the returning-attendee invite all iterate it and nothing else. Until the
 * change that ships alongside this script, NOT ONE of the six `leads` write
 * paths recorded gender:
 *
 *   api/lead-signup.js:166   getaway interest        (gender genuinely unknown)
 *   api/lead-signup.js:726   newsletter/blog/exit-intent/waitlist  (unknown)
 *   api/purchase-ticket.js   recordLead()            (KNOWN — validated in the
 *                                                     same request, dropped)
 *   lib/enroll.js            Eventbrite enrollment   (KNOWN — resolved from the
 *                                                     gendered ticket class,
 *                                                     dropped)
 *   api/cron-send-emails.js  lazy attendee lead      (KNOWN, dropped)
 *   scripts/backfill-leads-from-registrations.js     (KNOWN, dropped)
 *
 * So a woman who bought a ticket was, on the email list, indistinguishable
 * from an anonymous exit-intent capture. Those four "KNOWN" paths are fixed
 * going forward; this script catches everyone they already missed.
 *
 * WHAT IT WILL NOT DO
 *
 * - It never overwrites. Blanks only, tested with hasGender() from
 *   lib/eventbrite.js — which also rejects the literal strings "null" and
 *   "undefined" that survive a round trip through a spreadsheet. Records were
 *   hand-corrected on 2026-08-30 and an inferred value must never replace a
 *   human's correction.
 * - It never guesses. A person whose records disagree with each other is
 *   REPORTED and SKIPPED, not resolved by a tie-break. (This is not
 *   hypothetical: the door creates a second account when its email lookup
 *   misses — see reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md.)
 * - It never infers gender from a name. Leads with no ticket history stay
 *   blank, which is the correct outcome and the reason consumers must treat
 *   missing as "unknown" rather than filtering it out in the query.
 *
 * READING IT BACK
 *
 * Do NOT add `where('gender','==','woman')` to a recipient query. A Firestore
 * equality filter skips documents that LACK the field, which is exactly how
 * the nurture sequence went silently dead once before — see the comment above
 * the `subscribed` query in api/cron-send-emails.js. Fetch as today and filter
 * gender in code, where missing reads as untagged rather than excluded.
 *
 * Usage:
 *   node scripts/backfill-lead-gender.js            # dry-run (default)
 *   node scripts/backfill-lead-gender.js --apply    # actually write
 *
 * Requires env vars (vercel env pull .env.local --environment=production):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

'use strict';

const { normalizeGender, hasGender } = require('../lib/eventbrite');

const norm = (s) => String(s || '').toLowerCase().trim();

// Firestore caps a batch at 500 writes.
const BATCH_LIMIT = 500;

/**
 * Resolve one gender per email from our own ticket/registration records.
 *
 * Exported and kept free of Firestore so it is testable without credentials —
 * the same reason lib/eventbrite.js holds genderByEmail(). This is the
 * decision that can corrupt rather than merely fail: an email whose records
 * disagree must NOT be resolved by arrival order, or whichever document
 * Firestore happened to return last would decide someone's segment.
 *
 * @param {Array<{email: string, gender: *, source: string}>} records
 * @returns {{byEmail: Map<string, {gender: string, sources: Set<string>}>,
 *            conflicts: Set<string>}}
 */
function resolveGenderByEmail(records) {
  const byEmail = new Map();
  const conflicts = new Set();

  for (const rec of records || []) {
    const email = norm(rec && rec.email);
    const gender = normalizeGender(rec && rec.gender);
    // No email means nothing to join on; no recognisable gender means we
    // learned nothing. Neither is a conflict.
    if (!email || !gender) continue;

    if (!byEmail.has(email)) {
      byEmail.set(email, { gender, sources: new Set([rec.source]) });
      continue;
    }
    const entry = byEmail.get(email);
    entry.sources.add(rec.source);
    if (entry.gender !== gender) conflicts.add(email);
  }

  // A contradicted email is removed outright rather than left holding
  // whichever value happened to land first.
  for (const email of conflicts) byEmail.delete(email);
  return { byEmail, conflicts };
}

module.exports = { resolveGenderByEmail };

// ── Main ─────────────────────────────────────────────────────────
// Everything below runs only when this file is executed directly. Importing it
// (the test does) must not demand credentials or touch Firestore.
async function main() {
  const admin = require('firebase-admin');

  const need = (k) => {
    if (!process.env[k]) {
      console.error(`✗ Missing env var: ${k}`);
      console.error('  vercel env pull .env.local --environment=production');
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

  console.log(DRY
    ? '── DRY RUN (pass --apply to write) ──'
    : '── APPLYING: stamping gender onto leads ──');
  console.log();

  // 1. Gather every known gender, per email, from BOTH record types.
  //
  // event_registrations is canonical — all three purchase paths converge on
  // reg_{uid}_{eventId} — but tickets are read too, because a ticket can exist
  // without a matching registration (the Eventbrite import path creates the
  // ticket first).
  const records = [];

  const regsSnap = await db.collection('event_registrations').get();
  for (const doc of regsSnap.docs) {
    records.push({ email: doc.data().email, gender: doc.data().gender, source: 'registration' });
  }
  console.log(`Read ${regsSnap.size} event_registrations doc(s).`);

  const ticketsSnap = await db.collection('tickets').get();
  for (const doc of ticketsSnap.docs) {
    records.push({ email: doc.data().email, gender: doc.data().gender, source: 'ticket' });
  }
  console.log(`Read ${ticketsSnap.size} tickets doc(s).`);

  const { byEmail, conflicts } = resolveGenderByEmail(records);
  console.log(`Resolved a gender for ${byEmail.size} unique email(s).`);
  console.log();

  // 2. Walk the leads and decide.
  const leadsSnap = await db.collection('leads').get();

  const toFill = [];        // { ref, email, gender, sources }
  const blockedByConflict = [];
  let alreadyTagged = 0;
  let noRecord = 0;
  let noEmail = 0;

  for (const doc of leadsSnap.docs) {
    const d = doc.data();
    const email = norm(d.email);
    if (!email) { noEmail++; continue; }
    if (hasGender(d.gender)) { alreadyTagged++; continue; }
    if (conflicts.has(email)) { blockedByConflict.push(email); continue; }

    const entry = byEmail.get(email);
    if (!entry) { noRecord++; continue; }

    toFill.push({
      ref: doc.ref,
      email,
      gender: entry.gender,
      sources: [...entry.sources].join('+'),
    });
  }

  // 3. Report before doing anything.
  const women = toFill.filter((t) => t.gender === 'woman').length;
  const men   = toFill.filter((t) => t.gender === 'man').length;

  console.log('── Coverage ──');
  console.log(`  leads docs total:            ${leadsSnap.size}`);
  console.log(`  already carry a gender:      ${alreadyTagged}  (left untouched)`);
  console.log(`  no ticket/registration:      ${noRecord}  (stay blank — correct)`);
  console.log(`  no email on the lead doc:    ${noEmail}`);
  console.log(`  records disagree — SKIPPED:  ${blockedByConflict.length}`);
  console.log(`  to fill:                     ${toFill.length}  (${women} woman, ${men} man)`);
  console.log();

  if (blockedByConflict.length) {
    console.log('── Conflicts (resolve by hand; nothing written for these) ──');
    for (const e of blockedByConflict) console.log(`  ${e}`);
    console.log();
  }

  if (toFill.length === 0) {
    console.log('Nothing to fill.');
    process.exit(0);
  }

  console.log('── Fill plan ──');
  for (const t of toFill) console.log(`  ${t.email}  →  ${t.gender}  (from ${t.sources})`);
  console.log();

  if (DRY) {
    console.log('No changes made. Re-run with --apply to write.');
    process.exit(0);
  }

  // 4. Write, chunked to Firestore's batch limit.
  let written = 0;
  for (let i = 0; i < toFill.length; i += BATCH_LIMIT) {
    const chunk = toFill.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const t of chunk) batch.update(t.ref, { gender: t.gender });
    await batch.commit();
    written += chunk.length;
    console.log(`  committed ${written}/${toFill.length}`);
  }

  console.log();
  console.log(`✅ Stamped gender on ${written} lead(s). ${alreadyTagged} were already tagged and untouched.`);
  console.log(`   ${noRecord} lead(s) have no ticket history and remain blank — treat as unknown, never as men.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('✗ Backfill failed:', err);
    process.exit(1);
  });
}
