const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Tier config — prices auto-created in Stripe on first run
const TIER_CONFIG = {
  free:    { amount: 999,  name: 'SparkDate Spark',    lookupKey: 'sparkdate_spark',    trialDays: 30 },
  mid:     { amount: 1999, name: 'SparkDate Kindling',  lookupKey: 'sparkdate_kindling', trialDays: 0  },
  premium: { amount: 3999, name: 'SparkDate Fire',      lookupKey: 'sparkdate_fire',     trialDays: 0  },
};

async function getOrCreatePrice(tier) {
  const config = TIER_CONFIG[tier];

  // Try to find existing price by lookup key
  const existing = await stripe.prices.list({ lookup_keys: [config.lookupKey], limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  // First time: create product + price
  const product = await stripe.products.create({ name: config.name });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: config.amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: config.lookupKey,
  });

  return price.id;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, email, name, tier, firebaseUid } = req.body;

    // Validate inputs
    if (!paymentMethodId || !email || !name || !tier || !firebaseUid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!TIER_CONFIG[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Get or create Stripe price
    const priceId = await getOrCreatePrice(tier);

    // Create Stripe customer with card attached
    const customer = await stripe.customers.create({
      email,
      name,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
      metadata: { firebaseUid, tier },
    });

    // Build subscription
    const subParams = {
      customer: customer.id,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
      metadata: { firebaseUid, tier },
    };

    // Free trial: don't charge today
    if (TIER_CONFIG[tier].trialDays > 0) {
      subParams.trial_period_days = TIER_CONFIG[tier].trialDays;
    } else {
      // Paid tiers: charge immediately
      subParams.payment_settings = { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' };
    }

    const subscription = await stripe.subscriptions.create(subParams);

    // Handle 3D Secure (rare but required for compliance)
    const invoice = subscription.latest_invoice;
    if (invoice?.payment_intent) {
      const { status, client_secret } = invoice.payment_intent;
      if (status === 'requires_action') {
        return res.status(200).json({
          requiresAction: true,
          clientSecret: client_secret,
          customerId: customer.id,
          subscriptionId: subscription.id,
        });
      }
      if (status === 'requires_payment_method') {
        // Payment failed — clean up customer
        await stripe.customers.del(customer.id);
        return res.status(400).json({ error: 'Payment failed. Please check your card details and try again.' });
      }
    }

    // Success
    return res.status(200).json({
      success: true,
      customerId: customer.id,
      subscriptionId: subscription.id,
      status: subscription.status, // 'active' or 'trialing'
    });

  } catch (err) {
    console.error('[create-subscription]', err.message);
    return res.status(400).json({ error: err.message });
  }
};
