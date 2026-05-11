const Stripe = require('stripe');
const admin = require('firebase-admin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Initialize Firebase Admin (singleton)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
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

      default:
        console.log(`[webhook] unhandled event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
