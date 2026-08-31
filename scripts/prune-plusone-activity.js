#!/usr/bin/env node
/**
 * scripts/prune-plusone-activity.js
 *
 * Removes the activity-feed entries that describe the FREE HALF of a 2-for-1
 * as if it were a purchase.
 *
 * WHY THIS EXISTS: scripts/backfill-activity-from-tickets.js was run once
 * (2026-08-30, between #361 landing and #362 landing) with the version that
 * had no plus-one guard. api/purchase-ticket.js writes TWO ticket docs for one
 * 2-for-1 purchase — the buyer, and an `isPlusOne` guest at amount 0 sharing
 * the same PaymentIntent — and exactly ONE activity entry. That run wrote an
 * entry for the guest too, so six events now read
 *
 *     <guest> bought a ticket to <event> ($0.00)
 *
 * next to the buyer's real entry. Two rows, one sale. #362 stopped the
 * backfill producing them; this removes the six that already exist.
 *
 * IT ONLY EVER DELETES DOCS IT CAN PROVE ARE THIS CASE. A doc qualifies only
 * when ALL of the following hold:
 *   - id starts with `tix_`         (written by the backfill / enrollment path,
 *                                    never by checkout, which uses auto ids)
 *   - type === 'ticket_purchased'
 *   - details.ticketId resolves to a real ticket doc
 *   - that ticket has isPlusOne === true
 * Anything failing any of those is left alone and reported. There is
 * deliberately no way to pass it a doc id by hand.
 *
 * DELETION IS THE RIGHT CORRECTION HERE, not an edit: the entry describes a
 * sale that never happened. Rewriting it to $0.00-and-comped would replace one
 * false statement with another — nobody comped that seat, it is the second
 * half of one purchase that already has its own entry.
 *
 * USAGE
 *   node scripts/prune-plusone-activity.js             # DRY RUN, lists them
 *   node scripts/prune-plusone-activity.js --execute   # delete
 *
 * Dry run by default, like every other script here. Read the list, then re-run
 * with --execute.
 *
 * Env:
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`x Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

need('FIREBASE_PROJECT_ID'); need('FIREBASE_CLIENT_EMAIL'); need('FIREBASE_PRIVATE_KEY');

const { admin } = require('../lib/auth');
const db = admin.firestore();

async function main() {
  console.log(EXECUTE ? 'EXECUTING — matching entries will be deleted\n' : 'DRY RUN — nothing deleted\n');

  const tixSnap = await db.collection('tickets').get();
  const ticketById = new Map(tixSnap.docs.map((d) => [d.id, d.data()]));

  const actSnap = await db.collection('activity').where('type', '==', 'ticket_purchased').get();
  console.log(`${actSnap.size} ticket_purchased entries in the feed\n`);

  const doomed = [];
  let notTixPrefixed = 0, noTicketId = 0, ticketMissing = 0, notPlusOne = 0;

  for (const doc of actSnap.docs) {
    const a = doc.data();
    if (!doc.id.startsWith('tix_')) { notTixPrefixed++; continue; }
    const tid = a.details && a.details.ticketId;
    if (!tid) { noTicketId++; continue; }
    const t = ticketById.get(tid);
    if (!t) {
      // The ticket is gone but its feed entry remains. Not this bug — report
      // it rather than deleting on a guess.
      ticketMissing++;
      console.log(`  ? ${doc.id} — details.ticketId ${tid} matches no ticket doc; left alone`);
      continue;
    }
    if (!t.isPlusOne) { notPlusOne++; continue; }
    doomed.push({ ref: doc.ref, id: doc.id, a, t });
  }

  // All tickets once, so the buyer lookup below is a map scan and not a query
  // per doomed entry.
  const allTickets = tixSnap.docs.map((x) => ({ id: x.id, ...x.data() }));

  console.log(`\nqualifying (2-for-1 plus-one entries): ${doomed.length}\n`);
  for (const d of doomed) {
    // Who actually paid: the non-plus-one ticket sharing this PaymentIntent.
    // Printed so the deletion can be sanity-checked against a real purchase
    // rather than taken on trust.
    const buyer = d.t.paymentIntentId
      ? allTickets.find((x) => x.paymentIntentId === d.t.paymentIntentId
          && x.id !== d.a.details.ticketId && !x.isPlusOne)
      : null;
    const buyerNote = d.t.paymentIntentId
      ? (buyer ? buyer.email : '(buyer not found)')
      : '(no PaymentIntent)';
    console.log(`  ${EXECUTE ? 'deleting' : 'would delete'}: ${d.id}`);
    console.log(`     ${d.a.userEmail}  "${d.a.details.eventName}"  $${d.a.details.amount}`);
    console.log(`     free +1 on the purchase by ${buyerNote}, which keeps its own entry`);
    if (EXECUTE) await d.ref.delete();
  }

  console.log(`\n${EXECUTE ? 'deleted' : 'would delete'} ${doomed.length}`
    + ` · left: checkout-written ${notTixPrefixed}`
    + ` · no ticketId ${noTicketId}`
    + ` · real sales ${notPlusOne}`
    + (ticketMissing ? ` · ticket doc missing ${ticketMissing}` : ''));
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute to delete.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
