const Stripe = require('stripe');
const admin = require('firebase-admin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, firebaseUid, email, gender, amount, eventId, eventName } = req.body;

    if (!email || !gender || !amount || !eventId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!paymentMethodId && !firebaseUid) {
      return res.status(400).json({ error: 'Must provide either paymentMethodId or firebaseUid' });
    }

    // Build PaymentIntent params — two paths:
    //  1. Logged-in member: charge their saved Stripe customer's default card off-session
    //  2. Guest: charge the new paymentMethodId they just entered
    let intentParams = {
      amount,
      currency: 'usd',
      receipt_email: email,
      description: `SparkDate ticket — ${eventName}`,
      metadata: { eventId, gender, type: 'ticket' },
      confirm: true,
    };

    if (firebaseUid) {
      const userSnap = await db.collection('users').doc(firebaseUid).get();
      if (!userSnap.exists) {
        return res.status(404).json({ error: 'User not found' });
      }
      const { stripeCustomerId, stripePaymentMethodId } = userSnap.data();
      if (!stripeCustomerId) {
        return res.status(400).json({ error: 'No payment method on file. Please add a card to your subscription first.' });
      }

      // Get the customer's default payment method (or fall back to the one from signup)
      let pmId = stripePaymentMethodId;
      if (!pmId) {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        pmId = customer.invoice_settings?.default_payment_method;
        if (!pmId) {
          const methods = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
          pmId = methods.data[0]?.id;
        }
      }
      if (!pmId) {
        return res.status(400).json({ error: 'No card on file. Please update your payment method.' });
      }

      intentParams.customer = stripeCustomerId;
      intentParams.payment_method = pmId;
      intentParams.off_session = true;
      intentParams.metadata.firebaseUid = firebaseUid;
    } else {
      intentParams.payment_method = paymentMethodId;
      intentParams.automatic_payment_methods = { enabled: true, allow_redirects: 'never' };
    }

    const paymentIntent = await stripe.paymentIntents.create(intentParams);

    if (paymentIntent.status === 'requires_action') {
      return res.status(200).json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
      });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment did not succeed.' });
    }

    // Record ticket in Firestore
    await db.collection('tickets').add({
      firebaseUid: firebaseUid || null,
      email,
      gender,
      eventId,
      eventName,
      amount,
      paymentIntentId: paymentIntent.id,
      paidWithCardOnFile: !!firebaseUid,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log activity
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!userSnap.empty) {
      const user = userSnap.docs[0];
      await db.collection('activity').add({
        userId: user.id,
        userEmail: email,
        userName: `${user.data().firstName || ''} ${user.data().lastName || ''}`.trim(),
        type: 'event_attended',
        details: { eventName, amount: amount / 100 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ success: true, ticketId: paymentIntent.id });
  } catch (err) {
    console.error('[purchase-ticket] error', { message: err.message, type: err.type, code: err.code });

    if (err.type === 'StripeCardError') {
      return res.status(402).json({
        error: 'Card declined',
        message: err.message || 'Your card was declined. Please try a different payment method.',
      });
    }
    if (err.code === 'authentication_required' || err.decline_code === 'authentication_required') {
      return res.status(402).json({
        error: 'Authentication required',
        message: 'Your bank requires authentication for this purchase. Please try a different card.',
      });
    }
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Something went wrong with the payment details. Please try again.',
      });
    }

    return res.status(500).json({
      error: 'Ticket purchase failed',
      message: 'We could not process your ticket. Please try again or contact support.',
    });
  }
};
