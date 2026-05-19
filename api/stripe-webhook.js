const Stripe = require('stripe');
const { admin } = require('../lib/auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const db = admin.firestore();

// Disable Vercel's body parsing — Stripe needs raw body for signature verification
module.exports.config = { api: { bodyParser: false } };

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
          await userDoc.ref.update({
            subscriptionStatus: sub.status,
            subscriptionId: sub.id,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
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
        if (!ticketSnap.empty) {
          await ticketSnap.docs[0].ref.update({ status: 'confirmed' });
        }
        const regSnap = await db.collection('event_registrations')
          .where('paymentIntentId', '==', pi.id).limit(1).get();
        if (!regSnap.empty) {
          await regSnap.docs[0].ref.update({ status: 'confirmed' });
        }
        console.log(`[webhook] ticket confirmed via 3DS: ${pi.id}`);
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
          // Only refund the counter once — if already failed, skip.
          if (t.status !== 'failed') {
            const counterField = t.gender === 'woman' ? 'confirmedWomen' : 'confirmedMen';
            await db.collection('events').doc(t.eventId)
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

      default:
        console.log(`[webhook] unhandled event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
