#!/usr/bin/env node
/**
 * scripts/backfill-refunds.js
 *
 * Marks tickets refunded for Stripe refunds that happened BEFORE the webhook
 * learned to handle charge.refunded (added 2026-08-24). Until then a refunded
 * ticket stayed status:'confirmed' forever — still counted in revenue, CAC,
 * the charts and the event P&L, and still holding its seat.
 *
 * Idempotent: only flips tickets that are still 'confirmed', so running it
 * twice — or running it after the webhook has already handled a refund —
 * changes nothing. Same guard the webhook uses.
 *
 * Partial refunds are recorded on the ticket but do NOT void it: the buyer
 * still holds a seat. Only full refunds flip status and release the seat.
 *
 * Usage:
 *   node scripts/backfill-refunds.js             # dry run (default)
 *   node scripts/backfill-refunds.js --execute   # write
 *
 * Env: STRIPE_SECRET_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 *      FIREBASE_PRIVATE_KEY  (same names as the Vercel functions).
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    console.error('  Copy from your Vercel project settings or .env.local');
    process.exit(2);
  }
  return process.env[k];
};

need('STRIPE_SECRET_KEY');
const { stripe } = require('../lib/stripe');
const { seatFields } = require('../lib/seat-model');

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

async function main() {
  // Every refund on the account. Auto-pagination is fine here: this account
  // has a handful, and the loop below is a no-op for any already handled.
  const refunds = [];
  for await (const r of stripe.refunds.list({ limit: 100 })) refunds.push(r);
  console.log(`${refunds.length} refund(s) on the Stripe account\n`);

  let flipped = 0, alreadyDone = 0, noTicket = 0, partial = 0;

  for (const refund of refunds) {
    const piId = refund.payment_intent;
    if (!piId) { noTicket++; continue; }

    // Full vs partial: compare against the charge's own totals rather than
    // trusting one refund object — two partials can add up to full.
    const charge = await stripe.charges.retrieve(refund.charge);
    const fullyRefunded = charge.refunded === true;

    const snap = await db.collection('tickets')
      .where('paymentIntentId', '==', piId).get();
    if (snap.empty) {
      console.log(`  — ${piId}  $${(refund.amount / 100).toFixed(2)}  no matching ticket (subscription or pre-tickets) — skipped`);
      noTicket++;
      continue;
    }

    for (const doc of snap.docs) {
      const t = doc.data();

      if (!fullyRefunded) {
        console.log(`  ~ ${piId}  PARTIAL $${(charge.amount_refunded / 100).toFixed(2)} of $${(charge.amount / 100).toFixed(2)} — recording, ticket kept`);
        partial++;
        if (EXECUTE) {
          await doc.ref.update({
            amountRefunded: charge.amount_refunded,
            partialRefundAt: new Date().toISOString(),
          });
        }
        continue;
      }

      if (t.status !== 'confirmed') {
        console.log(`  = ${piId}  ticket ${doc.id} already '${t.status}' — nothing to do`);
        alreadyDone++;
        continue;
      }

      const evSnap = await db.collection('events').doc(t.eventId).get();
      const { counterField } = seatFields(evSnap.exists ? evSnap.data() : {}, t.gender);
      console.log(`  ✓ ${piId}  ticket ${doc.id}  ${t.eventName || t.eventId}  $${((t.amount || 0) / 100).toFixed(2)}${t.isPlusOne ? '  (plus-one)' : ''}  → refunded, release ${counterField}`);
      flipped++;

      if (EXECUTE) {
        await doc.ref.update({
          status: 'refunded',
          refundedAt: new Date(refund.created * 1000).toISOString(),
          amountRefunded: t.isPlusOne ? 0 : charge.amount_refunded,
        });
        await evSnap.ref
          .update({ [counterField]: admin.firestore.FieldValue.increment(-1) })
          .catch(() => {});
      }
    }

    if (fullyRefunded && EXECUTE) {
      const regs = await db.collection('event_registrations')
        .where('paymentIntentId', '==', piId).get();
      for (const doc of regs.docs) {
        await doc.ref.update({ status: 'refunded' }).catch(() => {});
      }
    }
  }

  console.log('');
  console.log(`flipped ${flipped} · already handled ${alreadyDone} · partial ${partial} · no ticket ${noTicket}`);
  if (!EXECUTE) {
    console.log('\nDry run. Nothing written. Re-run with --execute.\n');
  } else {
    console.log('\nDone. The admin dashboard nets these out on next load — no deploy needed.\n');
  }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
