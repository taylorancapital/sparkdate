const Stripe = require('stripe');
const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verify Firebase ID token — use the authenticated UID, NOT a body field.
    // This closes a critical hole where anyone could cancel anyone's subscription
    // by submitting their UID.
    let decoded;
    try {
      decoded = await requireAuth(req);
    } catch (e) {
      return res.status(e.statusCode || 401).json({ error: e.message });
    }
    const firebaseUid = decoded.uid;

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
    console.error('[cancel-subscription] error', { message: err.message, type: err.type, code: err.code });

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Subscription not found',
        message: 'We could not find your subscription. Please contact support.',
      });
    }

    return res.status(500).json({
      error: 'Cancellation failed',
      message: 'Could not cancel your subscription. Please try again or contact support@sparkdate.date.',
    });
  }
};
