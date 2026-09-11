#!/usr/bin/env node
/**
 * scripts/ga4-mp-validate.js
 *
 * Proves the server-side GA4 purchase (lib/ga4-mp.js) is wired to a secret
 * GA4 accepts, WITHOUT recording anything: it posts one synthetic purchase to
 * the Measurement Protocol DEBUG endpoint, which validates the payload and
 * answers with `validationMessages` instead of storing the event.
 *
 * Run once after creating the API secret and again after any change to the
 * payload shape:
 *
 *   GA4_MP_API_SECRET=<secret> node scripts/ga4-mp-validate.js
 *
 * Exit 0 with "validationMessages: []" means the live endpoint would accept
 * the same payload. Exit 1 prints why not. Exit 2 means no secret was given.
 *
 * The live endpoint returns 2xx and an empty body for ANY payload, valid or
 * not, so this is the only way to see a rejection; nothing in production
 * logs would. Nothing here touches Stripe, Firestore or a real transaction
 * id.
 */

'use strict';

const { sendGa4Purchase, DEFAULT_MEASUREMENT_ID } = require('../lib/ga4-mp');

(async () => {
  if (!process.env.GA4_MP_API_SECRET) {
    console.error('✗ GA4_MP_API_SECRET is not set. Create one in GA4 Admin → Data streams →');
    console.error('  the sparkdate.date web stream → Measurement Protocol API secrets, then:');
    console.error('  GA4_MP_API_SECRET=<secret> node scripts/ga4-mp-validate.js');
    process.exit(2);
  }
  const mid = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
  const transactionId = `validate_${Date.now()}`;
  console.log(`Posting a synthetic purchase (${transactionId}) to the DEBUG endpoint for ${mid} …`);

  const result = await sendGa4Purchase({
    transactionId,
    value: 32.49,
    currency: 'USD',
    items: [{ item_id: 'validate_event', item_name: 'Validation only', price: 29.99, quantity: 1 }],
    clientId: 'GA1.1.1234567890.1700000000',
    sessionId: '1700000000',
    timestampMicros: Date.now() * 1000,
    validate: true,
  });

  if (result.skipped) process.exit(2);
  console.log('validationMessages:', JSON.stringify(result.validationMessages || [], null, 2));
  if (!result.ok) {
    console.error('✗ GA4 would reject this payload (or the request failed):', result.error || '');
    process.exit(1);
  }
  console.log('✓ GA4 accepts the payload. The live endpoint will record real purchases with this secret.');
  console.log('  Nothing was recorded by this run.');
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
