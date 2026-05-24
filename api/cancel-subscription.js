// api/cancel-subscription.js
//
// Toggles `cancel_at_period_end` on the user's Stripe subscription.
//
//   POST {}                       → cancel (default)
//   POST { reactivate: true }     → uncancel (audit M6)
//
// Both branches live in this single endpoint to stay under Vercel
// Hobby's 12-function cap.
//
// Auth model: Bearer token required; decoded.uid is the only trusted
// identity. Subscription ID is read from the user's Firestore doc —
// the client never supplies it.

const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { stripe } = require('../lib/stripe');

const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Reactivate mode flips `cancel_at_period_end` back to false so the
  // subscription renews as normal. Only meaningful while the current
  // period hasn't expired yet — after that, Stripe has already
  // canceled and the user has to re-subscribe.
  const reactivate = req.body?.reactivate === true;

  try {
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
      return res.status(400).json({
        error: reactivate ? 'No subscription to reactivate' : 'No active subscription to cancel',
      });
    }

    if (reactivate) {
      // Idempotent: if it's not currently set to cancel, return success
      // without bothering Stripe.
      if (!userData.cancelAtPeriodEnd) {
        return res.status(200).json({ success: true, alreadyActive: true });
      }

      let subscription;
      try {
        subscription = await stripe.subscriptions.update(userData.subscriptionId, {
          cancel_at_period_end: false,
        });
      } catch (err) {
        if (err.type === 'StripeInvalidRequestError') {
          return res.status(400).json({
            error: 'Cannot reactivate',
            message: 'Your subscription has already ended. Please subscribe again to continue.',
          });
        }
        throw err;
      }

      await userDoc.ref.update({
        cancelAtPeriodEnd: false,
        // Clear the canceled-at timestamp so the UI doesn't keep showing
        // "you canceled on X" after the user changed their mind.
        canceledAt: null,
      });

      await db.collection('activity').add({
        userId: firebaseUid,
        userEmail: userData.email,
        userName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        type: 'subscription_reactivated',
        details: { tier: userData.tier },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        reactivated: true,
        subscriptionStatus: subscription.status,
      });
    }

    // Cancel at period end — user keeps access until their billing cycle ends.
    const subscription = await stripe.subscriptions.update(userData.subscriptionId, {
      cancel_at_period_end: true,
    });

    await userDoc.ref.update({
      cancelAtPeriodEnd: true,
      canceledAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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
    console.error('[cancel-subscription] error', { reactivate, message: err.message, type: err.type, code: err.code });

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Subscription not found',
        message: 'We could not find your subscription. Please contact support.',
      });
    }

    return res.status(500).json({
      error: reactivate ? 'Reactivation failed' : 'Cancellation failed',
      message: reactivate
        ? 'Could not reactivate your subscription. Please try again or contact support@sparkdate.date.'
        : 'Could not cancel your subscription. Please try again or contact support@sparkdate.date.',
    });
  }
};
