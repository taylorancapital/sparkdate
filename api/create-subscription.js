// api/create-subscription.js
// Creates a Stripe customer + subscription for a freshly-signed-up user.
//
// Auth model:
//   - Caller must present a Firebase ID token (Bearer) for the user that
//     was just created via createUserWithEmailAndPassword.
//   - The body's `firebaseUid` is ignored; the verified uid wins.
//
// Idempotency:
//   - Stripe Idempotency-Key tied to the user uid prevents double-charging
//     if the request is retried after a network blip.

const Stripe = require('stripe');
const { requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { TIERS, getOrCreatePrice } = require('../lib/tiers');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify Firebase ID token.
    let decoded;
    try {
      decoded = await requireAuth(req);
    } catch (e) {
      return res.status(e.statusCode || 401).json({ error: e.message });
    }
    const firebaseUid = decoded.uid;

    // 2. Validate inputs.
    const { paymentMethodId, email, name, tier } = req.body || {};
    if (!paymentMethodId || !email || !name || !tier) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // 3. Resolve Stripe price (shared module — no drift with upgrade-subscription).
    const priceId = await getOrCreatePrice(tier);

    // 4. Create Stripe customer. Idempotency key prevents duplicate
    // customer creation on retry of the same signup.
    const customer = await stripe.customers.create(
      {
        email,
        name,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
        metadata: { firebaseUid, tier },
      },
      { idempotencyKey: `customer:${firebaseUid}` }
    );

    // 5. Create subscription. Idempotency key tied to uid + tier — if the
    // user signs up twice for the same tier (network retry), Stripe returns
    // the existing subscription instead of creating a second one.
    const subParams = {
      customer: customer.id,
      items: [{ price: priceId }],
      expand: ['latest_invoice.payment_intent'],
      metadata: { firebaseUid, tier },
    };
    if (TIERS[tier].trialDays > 0) {
      subParams.trial_period_days = TIERS[tier].trialDays;
    } else {
      subParams.payment_settings = { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' };
    }

    const subscription = await stripe.subscriptions.create(
      subParams,
      { idempotencyKey: `sub:${firebaseUid}:${tier}` }
    );

    // 6. 3-D Secure handling.
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
        // Payment failed cleanly — clean up the orphan customer.
        await stripe.customers.del(customer.id).catch(() => {});
        return res.status(400).json({ error: 'Payment failed. Please check your card details and try again.' });
      }
    }

    return res.status(200).json({
      success: true,
      customerId: customer.id,
      subscriptionId: subscription.id,
      status: subscription.status, // 'active' or 'trialing'
    });

  } catch (err) {
    console.error('[create-subscription] error', { message: err.message, type: err.type, code: err.code });

    if (err.type === 'StripeCardError') {
      return res.status(402).json({
        error: 'Card declined',
        message: err.message || 'Your card was declined. Please check your details and try again.',
      });
    }
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Something is wrong with the payment details. Please try again.',
      });
    }

    return res.status(500).json({
      error: 'Subscription failed',
      message: 'Something went wrong on our end. Please try again or contact support.',
    });
  }
};
