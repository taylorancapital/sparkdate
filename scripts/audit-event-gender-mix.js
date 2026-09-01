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
 *   COMP vs NO-PRICE. Both show `amount: 0` and they are NOT the same thing.
 *     `isComp` (or a 2-for-1 `isPlusOne`) is a seat genuinely given away.
 *     Everything else at zero got there through
 *     `parseInt(priceCents, 10) || 0` in lib/enroll.js, which means the
 *     importer had no price to record -- those people may well have PAID on
 *     Eventbrite. The first version of this script collapsed the two and
 *     labelled all of them FREE, which turned paying attendees into evidence
 *     for a comp-driven-no-show theory. They are separate columns now.
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

// `amount` on a ticket is CENTS and includes the service fee.
//
// A zero here is NOT automatically a comp, and the first run of this script
// implied it was. Three routes produce `amount: 0`, and they mean different
// things:
//
//   1. the 2-for-1 companion (api/purchase-ticket.js) -- a real free seat;
//   2. an explicit comp (lib/enroll.js, channel 'comp') -- also a real free
//      seat, and the only one that sets `isComp: true`;
//   3. `parseInt(priceCents, 10) || 0` in enrollEventbriteOne, which lands on
//      zero whenever the importer had no price to give it. That is "price not
//      recorded", NOT "seat given away", and reading it as a comp turns a
//      PAYING attendee into evidence for a comp-no-show theory.
//
// So zero-amount seats are reported by their SOURCE, and only isComp/+1 are
// called free without qualification.
const isZero = (t) => !Number(t.amount);
const isComp = (t) => !!t.isComp || !!t.isPlusOne;

// Imported tickets carry `source` (lib/enroll.js); only purchase-ticket.js sets
// `channel`. Reading one and not the other made every Eventbrite row print as
// "(direct)", which is exactly backwards -- they are the least direct rows in
// the file.
const originOf = (t) => t.source || t.channel || (t.paymentIntentId ? 'own-site' : 'unknown');

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
      _zero: isZero(t),
      _comp: isComp(t),
      _origin: originOf(t),
      _guest: !t.firebaseUid,
      _shared: (emailCount.get(k) || 0) > 1,
    };
  });

  const buckets = {};
  for (const t of tickets) {
    const key = g(t.gender);
    const b = buckets[key] || (buckets[key] = {
      n: 0, paid: 0, zero: 0, comp: 0, unpriced: 0, plusOne: 0, guests: 0, revenue: 0,
      showed: 0, showedPaid: 0, showedFree: 0,
    });
    b.n++;
    if (t._zero) { b.zero++; if (t._comp) b.comp++; else b.unpriced++; }
    else { b.paid++; b.revenue += Number(t.amount) || 0; }
    if (t.isPlusOne) b.plusOne++;
    if (t._guest) b.guests++;
    if (t._showed) { b.showed++; if (t._zero) b.showedFree++; else b.showedPaid++; }
  }

  const result = {
    eventId: ev.id,
    title: ev.title || '',
    date: iso(ev.date),
    ticketCount: tickets.length,
    registrationCount: regSnap.size,
    buckets,
    tickets: tickets.map((t) => ({
      gender: g(t.gender), amount: Number(t.amount) || 0,
      zeroAmount: t._zero, comped: t._comp, origin: t._origin,
      isPlusOne: !!t.isPlusOne, guest: t._guest, sharedEmail: t._shared,
      showed: t._showed, createdAt: iso(t.createdAt),
      // No names or addresses in --json: this gets pasted into reports.
    })),
  };

  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log(`\n=== ${result.title || ev.id} — ${result.date} ===`);
  console.log(`tickets ${result.ticketCount}   registrations ${result.registrationCount}\n`);

  console.log('gender  amt      kind      +1  guest  showed  origin              name');
  console.log('-'.repeat(100));
  for (const t of tickets.sort((a, b) => g(a.gender).localeCompare(g(b.gender)) || a.amount - b.amount)) {
    console.log(
      `${g(t.gender).padEnd(7)} ${money(t.amount).padStart(8)}  `
      + `${(t._comp ? 'COMP' : t._zero ? 'NOPRICE' : 'paid').padEnd(8)}  ${(t.isPlusOne ? '+1' : ' .')}  `
      + `${(t._guest ? 'guest' : '  .  ').padEnd(5)}  `
      + `${(t._showed ? ' YES  ' : '  -   ')}  `
      + `${String(t._origin).slice(0, 18).padEnd(18)}  ${t.name || ''}`
      + (t._shared ? '   [SHARED EMAIL]' : ''));
  }

  console.log('\n--- by gender ---');
  for (const [k, b] of Object.entries(buckets)) {
    const rate = b.n ? Math.round((b.showed / b.n) * 100) : 0;
    console.log(`  ${k.padEnd(8)} seats ${String(b.n).padStart(2)}  `
      + `paid ${String(b.paid).padStart(2)}  comp ${String(b.comp).padStart(2)}  `
      + `no-price ${String(b.unpriced).padStart(2)}  +1 ${String(b.plusOne).padStart(2)}  `
      + `revenue ${money(b.revenue).padStart(9)}  `
      + `showed ${String(b.showed).padStart(2)}/${String(b.n).padStart(2)} (${rate}%)`);
    if (b.zero) {
      const zeroRate = Math.round((b.showedFree / b.zero) * 100);
      const paidRate = b.paid ? Math.round((b.showedPaid / b.paid) * 100) : 0;
      console.log(`  ${''.padEnd(8)}   -> priced seats showed ${b.showedPaid}/${b.paid} (${paidRate}%), `
        + `zero-amount seats showed ${b.showedFree}/${b.zero} (${zeroRate}%)`);
    }
    if (b.unpriced) {
      console.log(`  ${''.padEnd(8)}   !! ${b.unpriced} seat(s) have amount 0 but are NOT comps. Check the`);
      console.log(`  ${''.padEnd(8)}      origin column -- an import with no priceCents lands here, and`);
      console.log(`  ${''.padEnd(8)}      those people may well have PAID on the other platform.`);
    }
  }

  // Registrations with no ticket doc. The first run of this reported "tickets
  // 20, registrations 23" and then listed only the 20 -- so three attendees
  // were dropped from every total on screen without a word. If the person who
  // actually turned up is one of them, the gender columns above are wrong.
  const ticketEmails = new Set(tickets.map((t) => t._key).filter(Boolean));
  const orphans = regSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !ticketEmails.has(normalizeEmail(r.email || '')));
  if (orphans.length) {
    console.log(`\n--- registrations with NO ticket doc (${orphans.length}) ---`);
    console.log('These are not in any total above. A seat exists for them, but nothing');
    console.log('records what it cost or where it came from.');
    for (const r of orphans) {
      console.log(`  ${g(r.gender).padEnd(7)} ${String(r.status || '').padEnd(10)} `
        + `showed=${(r.checkedInAt || r.attended) ? 'YES' : '-'}  `
        + `src=${r.source || 'unknown'}  ${iso(r.registeredAt)}  ${r.name || ''}`);
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
