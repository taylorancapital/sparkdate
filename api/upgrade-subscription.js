// /api/upgrade-subscription.js
// Upgrades or downgrades a user's subscription tier using their saved payment method.
// Uses Stripe Subscription update with proration - they're billed/credited for the difference immediately.

const Stripe = require('stripe');
const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { TIERS, getOrCreatePrice } = require('../lib/tiers');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify ID token — the authenticated UID is the only trusted identity.
    // Body-supplied `userId` is ignored to prevent cross-account upgrades.
    let decoded;
    try {
      decoded = await requireAuth(req);
    } catch (e) {
      return res.status(e.statusCode || 401).json({ error: e.message });
    }
    const userId = decoded.uid;
    const { newTier } = req.body || {};

    if (!newTier) {
      return res.status(400).json({ error: 'Missing newTier' });
    }

    if (!TIERS[newTier]) {
      return res.status(400).json({ error: 'Invalid tier', message: `Tier "${newTier}" not found. Expected: free, mid, or premium.` });
    }

    // 1. Get the user's Firestore document
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    // NOTE: field name is "subscriptionId" to match the signup flow's schema
    const { subscriptionId, tier: currentTier } = userData;

    if (!subscriptionId) {
      return res.status(400).json({
        error: 'No active subscription',
        message: 'Your account does not have an active subscription. Please complete signup or contact support.'
      });
    }

    if (currentTier === newTier) {
      return res.status(400).json({ error: 'Already on this tier' });
    }

    // 2. Get the current Stripe subscription + resolve target price.
    // getOrCreatePrice reads from the SAME source create-subscription uses,
    // so the tier→price mapping can never drift between endpoints.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItemId = subscription.items.data[0].id;
    const newPriceId = await getOrCreatePrice(newTier);

    // 3. Build update params — handle trial-active subs differently
    const updateParams = {
      items: [{ id: currentItemId, price: newPriceId }],
      payment_behavior: 'error_if_incomplete',
    };

    const isTrialing = subscription.status === 'trialing';
    if (isTrialing) {
      // User is on free trial: end trial now and bill new price immediately.
      // Skip proration since there's nothing to prorate from a $0 trial.
      updateParams.trial_end = 'now';
      updateParams.proration_behavior = 'none';
    } else {
      // Active paid subscription: prorate the change across the current billing cycle
      updateParams.proration_behavior = 'create_prorations';
    }

    console.log('[upgrade-subscription] updating', {
      subscriptionId,
      fromTier: currentTier,
      toTier: newTier,
      isTrialing,
      proration: updateParams.proration_behavior,
    });

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, updateParams);

    // 4. Update Firestore
    await db.collection('users').doc(userId).update({
      tier: newTier,
      tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      monthlyPrice: TIERS[newTier].amount / 100,
    });

    // 5. Log to activity feed
    const isUpgrade = TIERS[newTier].amount > (TIERS[currentTier]?.amount || 0);
    await db.collection('activity').add({
      type: 'subscription_tier_changed',
      userId: userId,
      userEmail: userData.email,
      userName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
      fromTier: currentTier,
      toTier: newTier,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: `${userData.firstName || userData.email} ${isUpgrade ? 'upgraded' : 'downgraded'} from ${TIERS[currentTier]?.displayName || currentTier} to ${TIERS[newTier].displayName}`,
    });

    return res.status(200).json({
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: updatedSubscription.current_period_end,
      },
      newTier: newTier,
      message: `Successfully changed to ${TIERS[newTier].displayName} tier.`,
    });
  } catch (error) {
    console.error('[upgrade-subscription] error', {
      type: error.type,
      code: error.code,
      message: error.message,
      raw: error.raw?.message,
    });

    if (error.type === 'StripeCardError') {
      return res.status(402).json({
        error: 'Payment failed',
        message: 'Your saved card was declined. Please update your payment method.',
      });
    }
    if (error.code === 'authentication_required') {
      return res.status(402).json({
        error: 'Authentication required',
        message: 'Your bank requires 3-D Secure authentication for this charge. Please update your card or try a different one.',
      });
    }
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Invalid subscription state',
        message: error.message || 'Could not update your subscription in its current state. Please contact support.',
      });
    }

    return res.status(500).json({
      error: 'Failed to update subscription',
      message: error.message || 'Unexpected error. Please try again or contact support.',
    });
  }
}
