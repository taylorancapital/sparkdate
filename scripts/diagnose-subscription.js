#!/usr/bin/env node
/**
 * scripts/diagnose-subscription.js
 *
 * Read-only. Explains WHY a given person is (or isn't) still receiving email
 * after unsubscribing. Searches by name fragment OR email — case-insensitive,
 * substring — across the three collections that matter:
 *
 *   leads/                 — the marketing mailing list. `subscribed:false`
 *                            means unsubscribed. The cron's marketing passes
 *                            (nurture / newsletter / post-nurture) only send
 *                            to subscribed:true, so an unsubscribed lead here
 *                            should NOT get marketing mail.
 *   event_registrations/   — confirmed attendees. Transactional emails
 *                            (post-event "who did you click with" match link,
 *                            profile reminder) send to these REGARDLESS of the
 *                            leads unsubscribe state — that's correct/legal
 *                            under CAN-SPAM (they're about a ticket bought,
 *                            not marketing). So a match/profile email reaching
 *                            an "unsubscribed" person is expected, not a bug.
 *   users/                 — canonical account (to resolve email <-> name).
 *
 * The two mechanisms that make an "unsubscribed" person still get mail:
 *   (A) DUPLICATE lead docs for the same email — unsubscribe flips only the
 *       one whose id was in the clicked link; a second lead doc with
 *       subscribed:true keeps sending. This script flags any email with >1
 *       lead doc and mixed subscribed states.
 *   (B) TRANSACTIONAL email — they attended an event, so the match/profile
 *       cron mails them by design. Not a marketing-unsubscribe violation.
 *
 * Usage:
 *   node scripts/diagnose-subscription.js "Prosser"
 *   node scripts/diagnose-subscription.js paul@example.com
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

const term = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '').trim().toLowerCase();
if (!term) {
  console.error('Usage: node scripts/diagnose-subscription.js "<name fragment or email>"');
  process.exit(2);
}

const has = (v) => String(v == null ? '' : v).toLowerCase().includes(term);
const norm = (e) => String(e == null ? '' : e).toLowerCase().trim();

(async () => {
  console.log('────────────────────────────────────────────────────');
  console.log(`Searching for: "${term}"  (read-only, no writes)`);
  console.log('────────────────────────────────────────────────────');

  // ── leads ──────────────────────────────────────────────────────────
  const leadsSnap = await db.collection('leads').get();
  const matchedLeads = [];
  for (const d of leadsSnap.docs) {
    const x = d.data();
    if (has(x.email) || has(x.name) || has(x.firstName)) {
      matchedLeads.push({ id: d.id, ...x });
    }
  }

  // Collect the emails we care about (from matched leads + a name scan of
  // users/regs below) so we can cross-reference duplicate lead docs.
  const emailsOfInterest = new Set(matchedLeads.map((l) => norm(l.email)).filter(Boolean));

  // ── users (resolve name -> email for people with no/empty lead name) ─
  const usersSnap = await db.collection('users').get();
  const matchedUsers = [];
  for (const d of usersSnap.docs) {
    const x = d.data();
    const full = `${x.firstName || ''} ${x.lastName || ''}`.trim();
    if (has(x.email) || has(full) || has(x.firstName) || has(x.lastName)) {
      matchedUsers.push({ uid: d.id, ...x });
      if (x.email) emailsOfInterest.add(norm(x.email));
    }
  }

  // ── event_registrations (transactional-email eligibility) ───────────
  const regSnap = await db.collection('event_registrations').get();
  const matchedRegs = [];
  for (const d of regSnap.docs) {
    const x = d.data();
    if (has(x.email) || has(x.name)) {
      matchedRegs.push({ id: d.id, ...x });
      if (x.email) emailsOfInterest.add(norm(x.email));
    }
  }

  // For duplicate detection, pull EVERY lead doc that shares an email of
  // interest (not just the name/email substring hits, so we catch a dup that
  // happens to have an empty name).
  const leadsByEmail = new Map(); // email -> [lead,...]
  for (const d of leadsSnap.docs) {
    const x = d.data();
    const e = norm(x.email);
    if (e && emailsOfInterest.has(e)) {
      if (!leadsByEmail.has(e)) leadsByEmail.set(e, []);
      leadsByEmail.get(e).push({ id: d.id, ...x });
    }
  }

  // ── Report ──────────────────────────────────────────────────────────
  console.log(`\n== leads (${matchedLeads.length} name/email match) ==`);
  if (!matchedLeads.length) console.log('  (none)');
  for (const l of matchedLeads) {
    console.log(`  • ${l.id}`);
    console.log(`      email=${l.email || '(none)'}  name=${JSON.stringify(l.name || l.firstName || '')}`);
    console.log(`      subscribed=${l.subscribed}  unsubscribed_at=${l.unsubscribed_at || '(never)'}  source=${l.source || '?'}`);
  }

  console.log(`\n== duplicate-lead check (by email) ==`);
  let dupFound = false;
  for (const [email, list] of leadsByEmail.entries()) {
    if (list.length > 1) {
      dupFound = true;
      const states = list.map((l) => `${l.id}:subscribed=${l.subscribed}`).join('  ');
      const anySubscribed = list.some((l) => l.subscribed !== false);
      const anyUnsub = list.some((l) => l.subscribed === false);
      const bug = anySubscribed && anyUnsub ? '  <-- MIXED STATE: unsubscribe only flipped one; the other still sends' : '';
      console.log(`  • ${email}: ${list.length} lead docs${bug}`);
      console.log(`      ${states}`);
    }
  }
  if (!dupFound) console.log('  No email has more than one lead doc. (Not mechanism A.)');

  console.log(`\n== event_registrations (${matchedRegs.length}) — transactional-email eligibility ==`);
  if (!matchedRegs.length) console.log('  (none) — so no match/profile transactional email would reach them.');
  for (const r of matchedRegs) {
    console.log(`  • ${r.id}  email=${r.email || '(none)'}  name=${JSON.stringify(r.name || '')}  status=${r.status || '?'}  event=${r.eventId || '?'}`);
  }

  console.log(`\n== users (${matchedUsers.length}) ==`);
  for (const u of matchedUsers) {
    console.log(`  • ${u.uid}  email=${u.email || '(none)'}  name=${JSON.stringify(`${u.firstName || ''} ${u.lastName || ''}`.trim())}`);
  }

  // ── Verdict ─────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────');
  console.log('Likely explanation:');
  if (dupFound) {
    console.log('  (A) DUPLICATE lead docs with mixed subscribed state — the marketing');
    console.log('      cron still finds a subscribed:true doc for this email. Fix by');
    console.log('      unsubscribing ALL lead docs for the email (see the endpoint fix),');
    console.log('      or dedupe the leads collection.');
  }
  const unsubbedLeadExists = matchedLeads.some((l) => l.subscribed === false);
  if (unsubbedLeadExists && matchedRegs.length) {
    console.log('  (B) They are a confirmed attendee, so the post-event MATCH link and');
    console.log('      profile-reminder emails send by design regardless of unsubscribe');
    console.log('      (transactional, CAN-SPAM-exempt). If the "email" they saw was one');
    console.log('      of those, that is expected — not a marketing-unsubscribe leak.');
  }
  if (!dupFound && !(unsubbedLeadExists && matchedRegs.length)) {
    console.log('  Neither duplicate leads nor attendee-transactional detected. Check:');
    console.log('   - Did the unsubscribe actually persist? (subscribed should be false above.)');
    console.log('   - Email casing/whitespace on the lead doc vs what they typed.');
    console.log('   - Whether the email they received predates the unsubscribe (in flight).');
  }
  console.log('────────────────────────────────────────────────────');

  process.exit(0);
})().catch((e) => {
  console.error('✗ error:', e.message);
  process.exit(1);
});
