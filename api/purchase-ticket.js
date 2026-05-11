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
    const { paymentMethodId, email, gender, amount, eventId, eventName } = req.body;

    if (!paymentMethodId || !email || !gender || !amount || !eventId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // One-time charge with PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      receipt_email: email,
      description: `SparkDate ticket — ${eventName}`,
      metadata: { eventId, gender, type: 'ticket' },
    });

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
      email,
      gender,
      eventId,
      eventName,
      amount,
      paymentIntentId: paymentIntent.id,
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
    console.error('[purchase-ticket]', err.message);
    return res.status(400).json({ error: err.message });
  }
};
