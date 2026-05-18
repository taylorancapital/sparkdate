const Stripe = require('stripe');
const { admin, requireAuth } = require('./_auth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();

// Server-side ticket pricing. MUST match SERVICE_FEE in public/event.html ($2.50).
// Storing this on the server closes the "pay $0.50 for a ticket" exploit — the
// client-supplied `amount` is ignored and we recompute from the event doc.
const SERVICE_FEE_CENTS = 250;

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = /^https:\/\/(www\.)?sparkdate\.date$|^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
  if (allowed.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, email, gender, eventId } = req.body || {};
    let { firebaseUid } = req.body || {};

    if (!email || !gender || !eventId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (gender !== 'woman' && gender !== 'man') {
      return res.status(400).json({ error: 'Invalid gender' });
    }

    // ─── Auth: members MUST present a valid ID token. ─────────────
    // Guests (no firebaseUid) pay with a fresh paymentMethodId; that flow
    // is anonymous by design. Members charging a saved card MUST prove they
    // are who they say they are, otherwise anyone with a UID could charge
    // anyone else's saved card.
    if (firebaseUid) {
      let decoded;
      try {
        decoded = await requireAuth(req);
      } catch (e) {
        return res.status(e.statusCode || 401).json({ error: e.message });
      }
      // Always trust the token's uid, never the body-supplied one.
      firebaseUid = decoded.uid;
    } else if (!paymentMethodId) {
      return res.status(400).json({ error: 'Must provide either paymentMethodId or be authenticated' });
    }

    // ─── Event lookup is REQUIRED. ────────────────────────────────
    // Previously the handler silently bypassed capacity + price checks
    // when the event doc was missing — an attacker could submit a junk
    // eventId and any amount they liked. Now we 404.
    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventSnap.data();
    const cap = gender === 'woman' ? (event.spotsWomen ?? 0) : (event.spotsMen ?? 0);
    const side = gender === 'woman' ? "women's" : "men's";

    if (cap <= 0) {
      return res.status(409).json({
        error: 'No spots for this gender',
        message: `This event has no ${side} spots available.`,
      });
    }

    const ticketsSnap = await db.collection('tickets')
      .where('eventId', '==', eventId)
      .get();
    const sameGenderCount = ticketsSnap.docs.filter(d => {
      const t = d.data();
      return t.gender === gender && (t.status || 'confirmed') === 'confirmed';
    }).length;

    if (sameGenderCount >= cap) {
      return res.status(409).json({
        error: 'Event full',
        message: `This event is full on the ${side} side.`,
      });
    }

    // ─── Server-side price computation. ───────────────────────────
    // The client's `amount` field is intentionally ignored. We recompute
    // from the event doc + service fee. Storing prices in dollars in
    // Firestore (not cents), so multiply by 100.
    const baseDollars = gender === 'woman'
      ? Number(event.priceWomen || 0)
      : Number(event.priceMen || 0);
    if (!isFinite(baseDollars) || baseDollars < 0) {
      return res.status(500).json({ error: 'Invalid event pricing' });
    }
    const amount = Math.round(baseDollars * 100) + SERVICE_FEE_CENTS;
    const eventName = event.title || 'SparkDate event';

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
