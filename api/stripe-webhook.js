const { admin } = require('../lib/auth');
const { stripe } = require('../lib/stripe');
const { seatFields } = require('../lib/seat-model');
// Reuse the EXACT guest enrollment + lead capture from the purchase path so a
// 3-D Secure guest (who completes payment asynchronously, after the purchase
// handler has already returned `requiresAction`) still gets the welcome email,
// the Spark trial, the profile magic link, and a nurture-lead row (audit P1).
const { enrollGuestAsMember, recordLead } = require('./purchase-ticket');
const { sendMetaEvent } = require('../lib/meta-capi');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const db = admin.firestore();

// Read raw body from request stream
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Find Firestore user document by Stripe customer ID
async function findUserByCustomer(customerId) {
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0];
}

// Log event to activity feed
async function logActivity(userDoc, type, details) {
  if (!userDoc) return;
  await db.collection('activity').add({
    userId: userDoc.id,
    userEmail: userDoc.data().email,
    userName: `${userDoc.data().firstName} ${userDoc.data().lastName}`,
    type,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Idempotency: Stripe delivers events at-least-once, so a slow
  // handler (or a 5xx) can trigger redelivery. Without this guard the
  // same `invoice.paid` would log a duplicate row in /payments, and the
  // same `payment_intent.payment_failed` would double-decrement the
  // event counter. We use Firestore's `create` as a uniqueness lock:
  // the first delivery creates `stripe_events/{event.id}`, subsequent
  // deliveries fail the create with ALREADY_EXISTS and we 200 quickly
  // so Stripe stops retrying.
  try {
    await db.collection('stripe_events').doc(event.id).create({
      type: event.type,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message || '')) {
      console.log(`[webhook] duplicate ${event.type} (${event.id}) — skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    // Any other error means we couldn't even record the lock — log and
    // return 500 so Stripe retries.
    console.error('[webhook] idempotency lock failed:', e.message);
    return res.status(500).json({ error: 'lock failed' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userDoc = await findUserByCustomer(sub.customer);
        if (userDoc) {
          // In Stripe API ≥ 2024-12-18, current_period_end moved from the
          // top-level Subscription to subscription.items.data[0].current_period_end.
          // cancel_at_period_end remains at the top level.
          const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
          await userDoc.ref.update({
            subscriptionStatus: sub.status,
            subscriptionId: sub.id,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          });
          await logActivity(userDoc, 'subscription_update', {
            status: sub.status,
            tier: userDoc.data().tier,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userDoc = await findUserByCustomer(sub.customer);
        if (userDoc) {
          await userDoc.ref.update({
            subscriptionStatus: 'canceled',
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await logActivity(userDoc, 'subscription_canceled', { tier: userDoc.data().tier });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const userDoc = await findUserByCustomer(invoice.customer);
        if (userDoc) {
          await db.collection('payments').add({
            userId: userDoc.id,
            userEmail: userDoc.data().email,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            invoiceId: invoice.id,
            stripeCustomerId: invoice.customer,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await logActivity(userDoc, 'payment_succeeded', {
            amount: invoice.amount_paid / 100,
            tier: userDoc.data().tier,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userDoc = await findUserByCustomer(invoice.customer);
        if (userDoc) {
          await userDoc.ref.update({ subscriptionStatus: 'past_due' });
          await logActivity(userDoc, 'payment_failed', {
            amount: invoice.amount_due / 100,
            tier: userDoc.data().tier,
          });
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object;
        const userDoc = await findUserByCustomer(sub.customer);
        if (userDoc) {
          await logActivity(userDoc, 'trial_ending_soon', {
            trialEnd: new Date(sub.trial_end * 1000),
            tier: userDoc.data().tier,
          });
        }
        break;
      }

      // ── Ticket purchases (only relevant when 3-D Secure was required). ──
      // purchase-ticket.js writes the ticket as `pending_3ds` and the
      // client confirms the PaymentIntent. Stripe sends us this event
      // when confirmation succeeds — we promote the ticket to confirmed.
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        if (pi.metadata?.type !== 'ticket') break;
        const ticketSnap = await db.collection('tickets')
          .where('paymentIntentId', '==', pi.id).limit(1).get();
        const ticketData = !ticketSnap.empty ? ticketSnap.docs[0].data() : null;

        // Atomically flip pending_3ds/pending → confirmed. Only the txn that
        // WINS the flip should trigger guest enrollment, so a non-3DS echo
        // (the ticket is already 'confirmed' from the synchronous purchase
        // path) or a Stripe redelivery can never double-enroll / double-email.
        let confirmedTicket = null;
        if (!ticketSnap.empty) {
          const ref = ticketSnap.docs[0].ref;
          confirmedTicket = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(ref);
            if (!fresh.exists) return null;
            const d = fresh.data();
            if (d.status === 'pending_3ds' || d.status === 'pending') {
              tx.update(ref, { status: 'confirmed' });
              return d; // we performed the confirmation
            }
            return null; // already confirmed / terminal — leave as-is
          });
        }

        const regSnap = await db.collection('event_registrations')
          .where('paymentIntentId', '==', pi.id).limit(1).get();
        if (!regSnap.empty) {
          await regSnap.docs[0].ref.update({ status: 'confirmed' });
        }
        console.log(`[webhook] ticket confirmed via 3DS: ${pi.id}`);

        // Guest enrollment for the 3DS path (audit P1). Guests (no firebaseUid)
        // are enrolled inline only on the synchronous-success path in
        // purchase-ticket.js; a 3DS guest skips that, so we run the identical
        // enrollment + lead capture here — but ONLY when this handler is the one
        // that just confirmed a previously-pending ticket. Both calls are
        // best-effort and never throw (a failure must not 500 the webhook and
        // trigger a redelivery that the idempotency lock would then swallow).
        if (confirmedTicket && !confirmedTicket.firebaseUid) {
          console.log(`[webhook] enrolling 3DS guest for ${pi.id}`);
          await enrollGuestAsMember({
            email: confirmedTicket.email,
            paymentMethodId: pi.payment_method,
            gender: confirmedTicket.gender,
            eventName: confirmedTicket.eventName,
            name: confirmedTicket.name,
            phone: confirmedTicket.phone,
          }).catch((e) => console.error('[webhook] 3DS guest enroll failed:', e.message));
          await recordLead({
            email: confirmedTicket.email,
            name: confirmedTicket.name,
            phone: confirmedTicket.phone,
            eventId: confirmedTicket.eventId,
            eventName: confirmedTicket.eventName,
          }).catch((e) => console.error('[webhook] 3DS guest lead failed:', e.message));
        }

        // Meta CAPI Purchase. Stripe delivers payment_intent.succeeded for
        // EVERY successful charge, not just the 3DS-recovery path this case
        // is named for — so this covers the synchronous checkout path too.
        // The idempotency lock above already deduped webhook redelivery, so
        // this runs exactly once per real payment. event_id = the
        // PaymentIntent id, the SAME id event.html passes as fbq's eventID
        // (see purchasePaymentIntentId there) — that's what lets Meta
        // collapse the browser + server copies of one purchase instead of
        // double-counting it. No client_ip_address/user_agent here: this
        // handler runs from Stripe's servers, not the buyer's browser, so we
        // don't have the buyer's real IP/UA at this point — email alone is
        // still valid match data, just lower quality than the Lead path.
        if (ticketData) {
          await sendMetaEvent({
            eventName: 'Purchase',
            eventId: pi.id,
            userData: {
              email: ticketData.email,
              // Recorded on the ticket doc at purchase time by
              // api/purchase-ticket.js. fbp in particular is the strongest
              // match signal available on this path, which otherwise has
              // only a hashed email -- no IP, no user agent.
              fbp: ticketData.fbp || undefined,
              fbc: ticketData.fbc || undefined,
              externalId: ticketData.userId || ticketData.firebaseUid || undefined,
            },
            customData: {
              value: (pi.amount_received || pi.amount || 0) / 100,
              currency: (pi.currency || 'usd').toUpperCase(),
            },
          });
        }
        break;
      }

      // 3DS failed (user closed the popup, bank denied, etc.). Release
      // the reserved seat by decrementing the event counter, and mark
      // the ticket as failed.
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        if (pi.metadata?.type !== 'ticket') break;
        const ticketSnap = await db.collection('tickets')
          .where('paymentIntentId', '==', pi.id).limit(1).get();
        if (!ticketSnap.empty) {
          const t = ticketSnap.docs[0].data();
          // Decrement the seat counter ONLY while the ticket is still in
          // a pending state. A terminal status (failed / expired /
          // confirmed) means the seat was already released or kept by
          // some other path — decrementing again would double-count.
          // In particular `expired` is set by the abandoned-3DS sweep in
          // purchase-ticket.js, which already releases the seat; a
          // late-arriving payment_failed for that same intent must not
          // release it a second time.
          if (t.status === 'pending_3ds' || t.status === 'pending') {
            // Release the SAME counter the reservation bumped: single-pool
            // `confirmed` for new events, per-gender for legacy ones.
            const evRef = db.collection('events').doc(t.eventId);
            const evSnap = await evRef.get();
            const { counterField } = seatFields(evSnap.exists ? evSnap.data() : {}, t.gender);
            await evRef
              .update({ [counterField]: admin.firestore.FieldValue.increment(-1) })
              .catch(() => {});
            await ticketSnap.docs[0].ref.update({ status: 'failed' });
          }
        }
        const regSnap = await db.collection('event_registrations')
          .where('paymentIntentId', '==', pi.id).limit(1).get();
        if (!regSnap.empty) {
          await regSnap.docs[0].ref.update({ status: 'failed' });
        }
        console.log(`[webhook] ticket failed: ${pi.id}`);
        break;
      }

      // ── Refund issued (usually from the Stripe dashboard). Until this
      // case existed a refunded ticket stayed status:'confirmed' forever:
      // it kept counting in revenue, CAC, the charts and the event P&L,
      // and the seat it held was never released. Taylor's own test
      // purchase-and-refund on 2026-08-23 was still being reported as
      // revenue a day later.
      //
      // NOTE FOR STRIPE CONFIG: the webhook endpoint must be subscribed to
      // charge.refunded or this case never fires. If refunds stop being
      // reflected, check the endpoint's event list first.
      case 'charge.refunded': {
        const charge = event.data.object;
        const piId = charge.payment_intent;
        if (!piId) break;

        // Partial refunds are recorded but do NOT void the ticket — the
        // buyer still holds a seat. Only a full refund releases it.
        if (!charge.refunded) {
          const partialSnap = await db.collection('tickets')
            .where('paymentIntentId', '==', piId).get();
          for (const doc of partialSnap.docs) {
            await doc.ref.update({
              amountRefunded: charge.amount_refunded,
              partialRefundAt: new Date().toISOString(),
            }).catch(() => {});
          }
          console.log(`[webhook] partial refund recorded, ticket kept: ${piId}`);
          break;
        }

        // NO limit(1): a 2-for-1 purchase writes TWO ticket docs (primary +
        // isPlusOne guest) sharing one paymentIntentId, and refunding the
        // charge voids the whole party. Each releases its OWN seat counter —
        // the guest may be a different gender on a legacy split event.
        const ticketSnap = await db.collection('tickets')
          .where('paymentIntentId', '==', piId).get();
        if (ticketSnap.empty) {
          // A subscription invoice charge, or something predating tickets.
          console.log(`[webhook] refund for ${piId} matches no ticket — ignored`);
          break;
        }

        for (const doc of ticketSnap.docs) {
          // Atomic flip, same shape as the 3DS confirm above: only the txn
          // that wins confirmed→refunded releases the seat, so a Stripe
          // redelivery of this event can never decrement twice.
          const flipped = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            if (!fresh.exists) return null;
            const d = fresh.data();
            if (d.status !== 'confirmed') return null; // pending/failed/expired seats were handled elsewhere
            tx.update(doc.ref, {
              status: 'refunded',
              refundedAt: new Date().toISOString(),
              amountRefunded: d.isPlusOne ? 0 : charge.amount_refunded,
            });
            return d;
          });

          if (flipped) {
            const evRef = db.collection('events').doc(flipped.eventId);
            const evSnap = await evRef.get();
            const { counterField } = seatFields(evSnap.exists ? evSnap.data() : {}, flipped.gender);
            await evRef
              .update({ [counterField]: admin.firestore.FieldValue.increment(-1) })
              .catch(() => {});
            console.log(`[webhook] ticket refunded: ${doc.id} (released ${counterField})`);
          }
        }

        // Registrations share the PI too (primary + plusone reg docs).
        const regSnap = await db.collection('event_registrations')
          .where('paymentIntentId', '==', piId).get();
        for (const doc of regSnap.docs) {
          await doc.ref.update({ status: 'refunded' }).catch(() => {});
        }
        break;
      }

      // ── Customer deleted in Stripe (manually via dashboard, or via
      // the future account-deletion flow tracked as audit M7). Clear
      // the Firestore user's stripeCustomerId so subsequent API calls
      // don't try to talk to a 404'd customer (audit M8).
      case 'customer.deleted': {
        const customer = event.data.object;
        const userDoc = await findUserByCustomer(customer.id);
        if (userDoc) {
          await userDoc.ref.update({
            stripeCustomerId: null,
            subscriptionId: null,
            subscriptionStatus: 'canceled',
            stripeCustomerDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await logActivity(userDoc, 'customer_deleted', { customerId: customer.id });
          console.log(`[webhook] cleared stripeCustomerId for user/${userDoc.id} (customer.deleted)`);
        }
        break;
      }

      // ── Setup intents fire when a subscription is created with 3DS
      // requirements on the setup (e.g. SCA-region cards on the trial
      // flow in enrollGuestAsMember). When the user finishes auth, the
      // SetupIntent succeeds and the linked subscription becomes valid;
      // we promote subscriptionStatus from 'incomplete' to whatever the
      // current Stripe state says (audit M8).
      case 'setup_intent.succeeded': {
        const si = event.data.object;
        if (!si.customer) break;
        const userDoc = await findUserByCustomer(si.customer);
        if (!userDoc) break;
        // Re-fetch the subscription to get the current status — the SI
        // event itself doesn't carry it.
        const { subscriptionId } = userDoc.data();
        if (!subscriptionId) break;
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await userDoc.ref.update({ subscriptionStatus: sub.status });
          console.log(`[webhook] setup_intent.succeeded → user/${userDoc.id} subscriptionStatus=${sub.status}`);
        } catch (e) {
          console.error('[webhook] setup_intent.succeeded retrieve failed:', e.message);
        }
        break;
      }

      // ── User abandoned 3DS during signup/upgrade. The subscription
      // sits in 'incomplete' and Stripe will cancel it after ~23h.
      // Log to activity so the admin sees the drop-off (audit M8).
      case 'setup_intent.setup_failed': {
        const si = event.data.object;
        if (!si.customer) break;
        const userDoc = await findUserByCustomer(si.customer);
        if (userDoc) {
          await logActivity(userDoc, 'setup_intent_failed', {
            reason: si.last_setup_error?.message || 'unknown',
          });
        }
        break;
      }

      default:
        console.log(`[webhook] unhandled event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Disable Vercel's body parser — Stripe signature verification needs the
// EXACT raw request body. This MUST come after the `module.exports = handler`
// assignment above: assigning to `module.exports` replaces the whole object,
// so setting `.config` beforehand would be silently wiped. With the parser
// left enabled, Vercel consumes the request stream before getRawBody() runs,
// constructEvent() receives an empty buffer, and EVERY webhook 400s with
// "No signatures found matching the expected signature for payload".
module.exports.config = { api: { bodyParser: false } };
