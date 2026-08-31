#!/usr/bin/env node
/**
 * scripts/backfill-activity-from-tickets.js
 *
 * Writes the missing `activity` entries for every confirmed ticket that never
 * produced one — which is every ticket that did not come through the website's
 * own checkout.
 *
 * WHY THIS EXISTS: `activity` had exactly one ticket writer,
 * api/purchase-ticket.js. Everything sold through a marketplace or entered by
 * hand goes through lib/enroll.js instead — Eventbrite, Meetup, manual
 * imports, comps — and lib/enroll.js wrote users, tickets,
 * event_registrations, leads and the seat counter, but never the feed. The
 * admin Activity tab therefore showed direct web sales and presented them as
 * the whole picture. With Eventbrite at roughly half of all volume, an admin
 * reading that feed after a sync saw a fraction of the night's sales and no
 * indication anything was missing.
 *
 * lib/enroll.js now logs at enrollment time, so this is only needed once, for
 * the sales that predate that. New syncs need nothing from this script.
 *
 * IDEMPOTENT ON TWO LEVELS, both of which matter:
 *
 *   1. The doc id is derived from the ticket — activity/tix_{ticketId} — so
 *      re-running this script, or running it after a sync has already logged
 *      the same ticket, writes nothing the second time.
 *   2. Direct web-checkout tickets ALREADY have a feed entry, written by
 *      api/purchase-ticket.js with an auto-generated id that carries no
 *      ticketId to match on. Guard 1 cannot see those. So this script also
 *      indexes every existing ticket_purchased entry by
 *      userEmail|eventName and skips any ticket that matches one — otherwise
 *      the backfill would double every direct sale in the feed, which is
 *      precisely the kind of damage a "just fill in the gaps" script is
 *      supposed to avoid.
 *
 * TIMESTAMPS COME FROM THE TICKET, never from now. A feed is ordered by
 * createdAt and read newest-first; stamping two hundred historical imports
 * with the current time would bury every genuine recent entry under a wall of
 * simultaneous ones and make the tab useless in the act of repairing it.
 * Tickets with no usable createdAt are reported and skipped rather than given
 * a made-up date.
 *
 * CONFIRMED TICKETS ONLY, matching what the dashboard itself counts
 * (loadPayments filters status === 'confirmed'). Refunded and pending_3ds
 * tickets are reported in the totals but not written.
 *
 * USAGE
 *   node scripts/backfill-activity-from-tickets.js             # DRY RUN
 *   node scripts/backfill-activity-from-tickets.js --execute   # write
 *   node scripts/backfill-activity-from-tickets.js --limit=50  # cap the writes
 *
 * Dry run by default, like every other script here. Read the counts, then
 * re-run with --execute.
 *
 * Env:
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');
const LIMIT = parseInt((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1], 10) || Infinity;

const need = (k) => {
  if (!process.env[k]) {
    console.error(`x Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

need('FIREBASE_PROJECT_ID'); need('FIREBASE_CLIENT_EMAIL'); need('FIREBASE_PRIVATE_KEY');

const { admin } = require('../lib/auth');
const { logTicketEnrolled } = require('../lib/activity-log');
const db = admin.firestore();

const norm = (s) => String(s || '').toLowerCase().trim();
// Key for guard 2. eventName rather than eventId because that is the only
// field the legacy purchase-ticket.js entries carry about the event.
const legacyKey = (email, eventName) => `${norm(email)}|${norm(eventName)}`;

const toDate = (v) => {
  if (!v) return null;
  if (v.toDate) { const d = v.toDate(); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

async function main() {
  console.log(EXECUTE ? 'EXECUTING — missing activity entries will be written\n' : 'DRY RUN — nothing written\n');

  // 1. Everything the feed already knows about.
  const actSnap = await db.collection('activity').where('type', '==', 'ticket_purchased').get();
  const seenLegacy = new Set();
  let withTicketId = 0;
  actSnap.docs.forEach((d) => {
    const a = d.data();
    if (a.details && a.details.ticketId) withTicketId++;
    seenLegacy.add(legacyKey(a.userEmail, a.details && a.details.eventName));
  });
  console.log(`${actSnap.size} existing ticket_purchased entries (${withTicketId} already carry a ticketId)\n`);

  // 2. Every ticket.
  const tixSnap = await db.collection('tickets').get();
  console.log(`${tixSnap.size} ticket(s) in Firestore\n`);

  const bySource = {};
  let written = 0, already = 0, legacyDupe = 0, notConfirmed = 0, noDate = 0, capped = 0;

  // Oldest first, so a --limit run fills in history from the far end rather
  // than leaving a hole in the middle of the feed.
  const tickets = tixSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const da = toDate(a.createdAt), dbb = toDate(b.createdAt);
      return (da ? da.getTime() : 0) - (dbb ? dbb.getTime() : 0);
    });

  for (const t of tickets) {
    if (t.status !== 'confirmed') { notConfirmed++; continue; }

    if (seenLegacy.has(legacyKey(t.email, t.eventName))) { legacyDupe++; continue; }

    const createdAt = toDate(t.createdAt);
    if (!createdAt) {
      noDate++;
      console.log(`  ? tickets/${t.id} (${t.email || 'no email'}) — no usable createdAt, skipped`);
      continue;
    }

    if (written >= LIMIT) { capped++; continue; }

    const source = t.source || 'direct';
    if (!EXECUTE) {
      // Mirror guard 1 in the dry run so the count printed is the count a
      // real run would write, not an inflated one.
      const exists = (await db.collection('activity').doc(`tix_${t.id}`).get()).exists;
      if (exists) { already++; continue; }
      bySource[source] = (bySource[source] || 0) + 1;
      written++;
      console.log(`  would log: ${t.email}  ${t.eventName || '?'}  ${source}  ${createdAt.toISOString().slice(0, 10)}`);
      continue;
    }

    const r = await logTicketEnrolled(db, admin.firestore.FieldValue, {
      ticketId: t.id,
      uid: t.firebaseUid,
      email: t.email,
      name: t.name,
      eventId: t.eventId,
      eventName: t.eventName,
      amountCents: t.amount,
      channel: source,
      isComp: !!t.isComp,
      createdAt,
    });
    if (r.logged) {
      bySource[source] = (bySource[source] || 0) + 1;
      written++;
      console.log(`  logged: ${t.email}  ${t.eventName || '?'}  ${source}`);
    } else {
      already++;
    }
  }

  console.log(`\n${EXECUTE ? 'written' : 'would write'} ${written}`
    + ` · already logged ${already}`
    + ` · already in the feed from checkout ${legacyDupe}`
    + ` · not confirmed ${notConfirmed}`
    + ` · unusable createdAt ${noDate}`
    + (capped ? ` · left by --limit ${capped}` : ''));

  const srcLine = Object.entries(bySource).sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${n}`).join(' · ');
  if (srcLine) console.log(`by source: ${srcLine}`);
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute to write.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
