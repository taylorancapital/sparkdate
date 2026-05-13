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
    const { firebaseUid } = req.body;
    if (!firebaseUid) return res.status(400).json({ error: 'Missing firebaseUid' });

    const userDoc = await db.collection('users').doc(firebaseUid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    if (!userData.subscriptionId) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    // Cancel at period end — user keeps access until their billing cycle ends
    const subscription = await stripe.subscriptions.update(userData.subscriptionId, {
      cancel_at_period_end: true,
    });

    await userDoc.ref.update({
      cancelAtPeriodEnd: true,
      canceledAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log activity
    await db.collection('activity').add({
      userId: firebaseUid,
      userEmail: userData.email,
      userName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      type: 'subscription_canceled',
      details: { tier: userData.tier, accessUntil: new Date(subscription.current_period_end * 1000) },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      accessUntil: subscription.current_period_end,
    });
  } catch (err) {
    console.error('[cancel-subscription]', err.message);
    return res.status(400).json({ error: err.message });
  }
};
