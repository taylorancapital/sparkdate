#!/usr/bin/env node
/**
 * scripts/audit-event-gender-mix.js
 *
 * READ-ONLY. For one event: who bought, what they paid, and who actually
 * turned up — split by gender, and with the free seats called out separately.
 *
 * WHY THIS EXISTS. Good Good (2026-08-31) sold 23 tickets, 4 of them to women,
 * and one woman attended. "4 women" and "1 woman" are very different numbers to
 * plan against, and the gap between them was invisible until someone counted
 * heads in the room. The roster alone cannot explain it either: a comped seat
 * and a bought seat both read as one confirmed registration, and they do not
 * behave alike.
 *
 * WHAT IT SEPARATES, and why each one matters:
 *
 *   PAID vs FREE. The only $0 seat the product can issue is the 2-for-1
 *     companion (api/purchase-ticket.js — `amount: 0`). A free seat carries no
 *     financial commitment, so it is the first thing to suspect in a no-show
 *     gap. Counting it inside "tickets sold" flatters both the mix and the CAC.
 *
 *   COMPANION vs BUYER. A +1 never chose to come. The buyer chose for them and
 *     typed their contact details. That is a different intent and a different
 *     failure mode -- including a typo'd address that no reminder ever reaches.
 *
 *   HAS-ACCOUNT vs GUEST. Companions are created with `userId: null`, and the
 *     chemistry-profile reminder in api/cron-send-emails.js skips any
 *     registration without one. So a comped +1 gets the pre-event reminders
 *     (those go by registration) but NEVER the profile prompt -- they arrive
 *     unmatched, if they arrive.
 *
 *   SHARED EMAIL. If a buyer puts their own address on the +1 (or two rows
 *     collide), the pre-event pass dedupes by email and one of them silently
 *     gets no mail at all. Reported, because it looks like nothing.
 *
 * Attendance is read as `checkedInAt` first and `attended` second, and both are
 * a FLOOR -- see the check-in undercount note in reports/ANALYTICS_METHOD.md.
 * A person who came but was never scanned reads here as a no-show.
 *
 * Makes NO writes.
 *
 * Usage:
 *   node scripts/audit-event-gender-mix.js <eventId>
 *   node scripts/audit-event-gender-mix.js --match="good good"
 *   node scripts/audit-event-gender-mix.js --list
 *   node scripts/audit-event-gender-mix.js <eventId> --json
 *
 * CREDENTIALS. Needs three vars:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Unlike the other scripts/ tools, this one reads `.env.local` itself if the
 * vars are not already in the environment, so the usual flow is just:
 *
 *   vercel env pull .env.local          # or --environment=production
 *   node scripts/audit-event-gender-mix.js --match="good good"
 *
 * Note the repo's existing `.env.local` has had these three EMPTY (`""`), which
 * reads as "present but blank" — the loader skips empty values so they fall
 * through to the missing-var error rather than producing a confusing
 * "Service account object must contain a string project_id" from deep inside
 * firebase-admin.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { normalizeEmail } = require('../lib/email-identity');

// Read .env.local if it is there, without overriding anything already in the
// environment. Nothing in this repo loads that file — no dotenv dependency —
// so every script here has so far required the three Firebase vars to be set by
// hand in the shell first. That is a real barrier for a one-off audit, and the
// values are already sitting in .env.local after `vercel env pull`.
//
// Deliberately does NOT fail if the file is missing or unreadable: the vars may
// legitimately come from the environment, and a missing optional file is not an
// error. Values may be quoted; FIREBASE_PRIVATE_KEY in particular arrives as
// one line with literal \n sequences, which the cert() call below un-escapes.
(function loadDotEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    if (v !== '' && process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const need = (k) => {
  if (!process.env[k]) {
    console.error(`x Missing env var: ${k}`);
    console.error('  Copy from your Vercel project settings or .env.local');
    process.exit(2);
  }
  return process.env[k];
};

const arg = (n) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const asJson = process.argv.includes('--json');
const wantList = process.argv.includes('--list');
const match = arg('match');
const eventId = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!eventId && !match && !wantList) {
  console.error('x Usage: node scripts/audit-event-gender-mix.js <eventId> [--json]');
  console.error('         node scripts/audit-event-gender-mix.js --match="good good"');
  console.error('         node scripts/audit-event-gender-mix.js --list');
  process.exit(2);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const toDate = (t) => (t && t.toDate ? t.toDate() : (t ? new Date(t) : null));
const iso = (t) => { const d = toDate(t); return d && !isNaN(d) ? d.toISOString().slice(0, 16).replace('T', ' ') : ''; };
const g = (v) => String(v || 'unknown').toLowerCase();
const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// `amount` on a ticket is CENTS and includes the service fee. A comped seat is
// exactly 0; anything else is a real charge. Deliberately not `< some floor` --
// there is no partial-comp path, so a nonzero amount is always a sale.
const isFree = (t) => !Number(t.amount);

async function pickEvents() {
  const snap = await db.collection('events').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0));
  if (wantList) {
    for (const e of rows) console.log(`${e.id}  ${iso(e.date).slice(0, 10)}  ${e.title || ''}`);
    process.exit(0);
  }
  if (eventId) {
    const hit = rows.find((e) => e.id === eventId);
    if (!hit) { console.error(`x No event with id ${eventId}. Try --list.`); process.exit(1); }
    return [hit];
  }
  const re = new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hits = rows.filter((e) => re.test(`${e.title || ''} ${e.venue || ''} ${e.venueName || ''}`));
  if (!hits.length) { console.error(`x Nothing matched "${match}". Try --list.`); process.exit(1); }
  return hits;
}

async function auditEvent(ev) {
  const [tixSnap, regSnap] = await Promise.all([
    db.collection('tickets').where('eventId', '==', ev.id).get(),
    db.collection('event_registrations').where('eventId', '==', ev.id).get(),
  ]);

  // Registrations keyed by normalized email, using the SAME rule the check-in
  // flow uses, so this audit cannot disagree with the page it is checking.
  const regByEmail = new Map();
  const emailCount = new Map();
  for (const d of regSnap.docs) {
    const r = { id: d.id, ...d.data() };
    const k = normalizeEmail(r.email || '');
    if (k) {
      if (!regByEmail.has(k)) regByEmail.set(k, r);
      emailCount.set(k, (emailCount.get(k) || 0) + 1);
    }
  }

  const tickets = tixSnap.docs.map((d) => ({ id: d.id, ...d.data() })).map((t) => {
    const k = normalizeEmail(t.email || '');
    const reg = regByEmail.get(k) || {};
    return {
      ...t,
      _key: k,
      _reg: reg,
      _showed: !!(reg.checkedInAt || reg.attended),
      _free: isFree(t),
      _guest: !t.firebaseUid,
      _shared: (emailCount.get(k) || 0) > 1,
    };
  });

  const buckets = {};
  for (const t of tickets) {
    const key = g(t.gender);
    const b = buckets[key] || (buckets[key] = {
      n: 0, paid: 0, free: 0, plusOne: 0, guests: 0, revenue: 0,
      showed: 0, showedPaid: 0, showedFree: 0,
    });
    b.n++;
    if (t._free) b.free++; else { b.paid++; b.revenue += Number(t.amount) || 0; }
    if (t.isPlusOne) b.plusOne++;
    if (t._guest) b.guests++;
    if (t._showed) { b.showed++; if (t._free) b.showedFree++; else b.showedPaid++; }
  }

  const result = {
    eventId: ev.id,
    title: ev.title || '',
    date: iso(ev.date),
    ticketCount: tickets.length,
    registrationCount: regSnap.size,
    buckets,
    tickets: tickets.map((t) => ({
      gender: g(t.gender), amount: Number(t.amount) || 0, free: t._free,
      isPlusOne: !!t.isPlusOne, guest: t._guest, sharedEmail: t._shared,
      showed: t._showed, channel: t.channel || null, createdAt: iso(t.createdAt),
      // No names or addresses in --json: this gets pasted into reports.
    })),
  };

  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log(`\n=== ${result.title || ev.id} — ${result.date} ===`);
  console.log(`tickets ${result.ticketCount}   registrations ${result.registrationCount}\n`);

  console.log('gender  amt      free  +1  guest  showed  channel                     name');
  console.log('-'.repeat(100));
  for (const t of tickets.sort((a, b) => g(a.gender).localeCompare(g(b.gender)) || a.amount - b.amount)) {
    console.log(
      `${g(t.gender).padEnd(7)} ${money(t.amount).padStart(8)}  `
      + `${(t._free ? 'FREE' : '  . ').padEnd(4)}  ${(t.isPlusOne ? '+1' : ' .')}  `
      + `${(t._guest ? 'guest' : '  .  ').padEnd(5)}  `
      + `${(t._showed ? ' YES  ' : '  -   ')}  `
      + `${String(t.channel || '(direct)').slice(0, 26).padEnd(26)}  ${t.name || ''}`
      + (t._shared ? '   [SHARED EMAIL]' : ''));
  }

  console.log('\n--- by gender ---');
  for (const [k, b] of Object.entries(buckets)) {
    const rate = b.n ? Math.round((b.showed / b.n) * 100) : 0;
    console.log(`  ${k.padEnd(8)} seats ${String(b.n).padStart(2)}  `
      + `paid ${String(b.paid).padStart(2)}  free ${String(b.free).padStart(2)}  `
      + `+1 ${String(b.plusOne).padStart(2)}  revenue ${money(b.revenue).padStart(9)}  `
      + `showed ${String(b.showed).padStart(2)}/${String(b.n).padStart(2)} (${rate}%)`);
    if (b.free) {
      const freeRate = Math.round((b.showedFree / b.free) * 100);
      const paidRate = b.paid ? Math.round((b.showedPaid / b.paid) * 100) : 0;
      console.log(`  ${''.padEnd(8)}   -> paid seats showed ${b.showedPaid}/${b.paid} (${paidRate}%), `
        + `free seats showed ${b.showedFree}/${b.free} (${freeRate}%)`);
    }
  }

  // The things that look like nothing on the roster.
  const noProfilePrompt = tickets.filter((t) => t._guest && !t._showed);
  const shared = tickets.filter((t) => t._shared);
  console.log('\n--- quiet failure modes ---');
  console.log(`  guest seats (userId null -> NEVER get the chemistry-profile reminder,`);
  console.log(`  api/cron-send-emails.js skips !r.userId): ${tickets.filter((t) => t._guest).length}`);
  if (noProfilePrompt.length) console.log(`  of those, no-showed: ${noProfilePrompt.length}`);
  if (shared.length) {
    console.log(`  SHARED/duplicate email addresses: ${shared.length} — the pre-event pass`);
    console.log('  dedupes by email, so one of each pair got no reminder at all.');
  } else {
    console.log('  shared/duplicate emails: none');
  }
}

(async () => {
  for (const ev of await pickEvents()) await auditEvent(ev);
  process.exit(0);
})().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
