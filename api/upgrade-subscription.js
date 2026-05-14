// /api/upgrade-subscription.js
// Upgrades or downgrades a user's subscription tier using their saved payment method.
// Uses Stripe Subscription update with proration - they're billed/credited for the difference immediately.

import Stripe from 'stripe';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Firebase Admin (only once)
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

// Tier → Stripe Price ID mapping
// IMPORTANT: Replace these with your actual Stripe Price IDs
const TIER_PRICES = {
    spark: { priceId: 'prod_UUN8ewZIL5J8id',    name: 'Spark',    amount: 999 },   // $9.99
    kindling: { priceId: 'prod_UVoBn7v6L3Amyb', name: 'Kindling', amount: 1999 },  // $19.99
    fire: { priceId: 'prod_UVoCt3qybsyXBC',     name: 'Fire',     amount: 3999 },  // $39.99
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, newTier } = req.body;

    if (!userId || !newTier) {
      return res.status(400).json({ error: 'Missing userId or newTier' });
    }

    if (!TIER_PRICES[newTier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // 1. Get the user's Firestore document
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const { stripeSubscriptionId, tier: currentTier } = userData;

    if (!stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription to upgrade' });
    }

    if (currentTier === newTier) {
      return res.status(400).json({ error: 'Already on this tier' });
    }

    // 2. Get the current Stripe subscription
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const currentItemId = subscription.items.data[0].id;
    const newPriceId = TIER_PRICES[newTier].priceId;

    // 3. Update the subscription - swap the price, prorate immediately
    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{
        id: currentItemId,
        price: newPriceId,
      }],
      proration_behavior: 'always_invoice', // Charge the difference now (or credit if downgrading)
      payment_behavior: 'error_if_incomplete', // Fails clean if saved card declines
    });

    // 4. Update Firestore
    await db.collection('users').doc(userId).update({
      tier: newTier,
      tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      monthlyPrice: TIER_PRICES[newTier].amount / 100,
    });

    // 5. Log to activity feed
    await db.collection('activity').add({
      type: 'subscription_tier_changed',
      userId: userId,
      userEmail: userData.email,
      userName: userData.name || userData.email,
      fromTier: currentTier,
      toTier: newTier,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: `${userData.name || userData.email} ${
        TIER_PRICES[newTier].amount > (TIER_PRICES[currentTier]?.amount || 0)
          ? 'upgraded'
          : 'downgraded'
      } from ${currentTier} to ${newTier}`,
    });

    return res.status(200).json({
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        currentPeriodEnd: updatedSubscription.current_period_end,
      },
      newTier: newTier,
      message: `Successfully changed to ${TIER_PRICES[newTier].name} tier.`,
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);

    // Handle Stripe-specific errors gracefully
    if (error.type === 'StripeCardError') {
      return res.status(402).json({
        error: 'Payment failed',
        message: 'Your saved card was declined. Please update your payment method.',
        stripeError: error.message,
      });
    }

    return res.status(500).json({
      error: 'Failed to update subscription',
      message: error.message,
    });
  }
}
