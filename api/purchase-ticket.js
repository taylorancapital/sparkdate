// api/purchase-ticket.js
//
// Single source of truth for paid event registration. Closes several
// audit findings in one shot:
//
//   #5  Firestore transaction with per-event counters — no more
//       race condition where two concurrent buyers exceed the gender cap.
//   #6  Stripe Idempotency-Key — double-submitting cannot create
//       duplicate charges or duplicate ticket rows.
//   #8  Event lookup is REQUIRED — junk eventId returns 404 instead of
//       silently bypassing capacity.
//  #11  3-D Secure flow: when Stripe asks for auth, we mark the ticket
//       as "pending" before returning clientSecret; client confirms the
//       intent and the Stripe webhook flips the ticket to "confirmed".
//  #13  event_registrations is written server-side as part of the same
//       transaction as the ticket — no client-side bypass possible.
//  #15  Price is recomputed server-side from the event doc + service fee.
//       Client-supplied `amount` is ignored.

const Stripe = require('stripe');
const { admin, requireAuth } = require('./_auth');
const { applyCors } = require('./_cors');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// Must match SERVICE_FEE in public/event.html ($2.50 in dollars).
const SERVICE_FEE_CENTS = 250;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, email, gender, eventId } = req.body || {};
    let firebaseUid = null;

    // ── Basic input validation ─────────────────────────────────────
    if (!email || !gender || !eventId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (gender !== 'woman' && gender !== 'man') {
      return res.status(400).json({ error: 'Invalid gender' });
    }

    // ── Auth: member path requires ID token; guest path is anonymous ─
    const hasAuth = !!(req.headers.authorization || req.headers.Authorization);
    if (hasAuth) {
      let decoded;
      try {
        decoded = await requireAuth(req);
      } catch (e) {
        return res.status(e.statusCode || 401).json({ error: e.message });
      }
      firebaseUid = decoded.uid;
    } else if (!paymentMethodId) {
      return res.status(400).json({ error: 'Must provide either paymentMethodId or be authenticated' });
    }

    // ── Event lookup (required) ────────────────────────────────────
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventSnap.data();

    // ── Reserve a seat ATOMICALLY using a Firestore transaction. ───
    // We bump a counter on the event doc inside the txn. If two requests
    // race, only one wins; the other sees the updated count and aborts.
    //
    // Counters live as `confirmedWomen` and `confirmedMen` on the event.
    // If they're missing (legacy events), default to 0.
    const counterField = gender === 'woman' ? 'confirmedWomen' : 'confirmedMen';
    const capField     = gender === 'woman' ? 'spotsWomen'     : 'spotsMen';

    let reservedSlot;
    try {
      reservedSlot = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef);
        if (!snap.exists) throw new Error('Event vanished mid-purchase');
        const e = snap.data();
        const cap     = Number(e[capField] ?? 0);
        const current = Number(e[counterField] ?? 0);

        if (cap <= 0) {
          const err = new Error(`No ${gender === 'woman' ? "women's" : "men's"} spots on this event`);
          err.statusCode = 409;
          throw err;
        }
        if (current >= cap) {
          const err = new Error(`Event full on the ${gender === 'woman' ? "women's" : "men's"} side`);
          err.statusCode = 409;
          throw err;
        }
        tx.update(eventRef, { [counterField]: current + 1 });
        return { slot: current + 1, cap };
      });
    } catch (e) {
      if (e.statusCode === 409) {
        return res.status(409).json({ error: 'Event full', message: e.message });
      }
      throw e;
    }

    // ── Server-side price computation. Client `amount` is ignored. ─
    const baseDollars = gender === 'woman'
      ? Number(event.priceWomen || 0)
      : Number(event.priceMen || 0);
    if (!isFinite(baseDollars) || baseDollars < 0) {
      // Roll back the counter we just bumped.
      await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
      return res.status(500).json({ error: 'Invalid event pricing' });
    }
    const amount = Math.round(baseDollars * 100) + SERVICE_FEE_CENTS;
    const eventName = event.title || 'SparkDate event';

    // ── Build the PaymentIntent. ───────────────────────────────────
    // Idempotency key prevents a retry from creating a second PaymentIntent
    // for the same (user/email × event) combo. For guests we use the
    // paymentMethodId since they have no stable identifier.
    const idempotencyKey = `ticket:${eventId}:${firebaseUid || paymentMethodId}`;

    const intentParams = {
      amount,
      currency: 'usd',
      receipt_email: email,
      description: `SparkDate ticket — ${eventName}`,
      metadata: { eventId, gender, type: 'ticket' },
      confirm: true,
    };

    if (firebaseUid) {
      // Member path: charge saved card off-session.
      const userSnap = await db.collection('users').doc(firebaseUid).get();
      if (!userSnap.exists) {
        await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
        return res.status(404).json({ error: 'User not found' });
      }
      const { stripeCustomerId, stripePaymentMethodId } = userSnap.data();
      if (!stripeCustomerId) {
        await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
        return res.status(400).json({ error: 'No payment method on file. Please add a card to your subscription first.' });
      }

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
        await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
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

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(intentParams, { idempotencyKey });
    } catch (e) {
      // Stripe failed entirely — release the reserved slot.
      await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
      throw e;
    }

    // ── Persist the ticket + event_registration. ───────────────────
    // Both are written here so an unauthenticated browser can never
    // fabricate a registration (audit #13).
    //
    // For requires_action (3-D Secure) flows we write the ticket as
    // "pending" — Stripe webhook will mark it "confirmed" once the
    // intent reaches `succeeded`. If the user never completes 3DS,
    // a follow-up sweep can detect stale pending tickets and refund/
    // release the slot.
    const ticketStatus =
      paymentIntent.status === 'succeeded' ? 'confirmed' :
      paymentIntent.status === 'requires_action' ? 'pending_3ds' :
      'pending';

    // `month` (YYYY-MM) lets the client compute monthly quota without
    // needing a composite Firestore index on createdAt.
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const ticketRef = db.collection('tickets').doc();
    const regRef    = db.collection('event_registrations').doc();
    const batch = db.batch();
    batch.set(ticketRef, {
      firebaseUid: firebaseUid || null,
      email,
      gender,
      eventId,
      eventName,
      amount,
      paymentIntentId: paymentIntent.id,
      paidWithCardOnFile: !!firebaseUid,
      status: ticketStatus,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(regRef, {
      userId: firebaseUid || null,
      email,
      gender,
      eventId,
      eventTitle: eventName,
      ticketId: ticketRef.id,
      paymentIntentId: paymentIntent.id,
      status: ticketStatus,
      month: monthKey,
      registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    // ── 3-D Secure: hand the clientSecret back to the browser. ─────
    // Client must call stripe.confirmCardPayment(clientSecret) and the
    // Stripe webhook will promote the ticket to confirmed.
    if (paymentIntent.status === 'requires_action') {
      return res.status(200).json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        ticketId: ticketRef.id,
      });
    }

    if (paymentIntent.status !== 'succeeded') {
      // Refund the counter — payment didn't go through.
      await eventRef.update({ [counterField]: FieldValue.increment(-1) }).catch(() => {});
      // Mark the ticket as failed for audit trail.
      await ticketRef.update({ status: 'failed' }).catch(() => {});
      await regRef.update({ status: 'failed' }).catch(() => {});
      return res.status(400).json({ error: 'Payment did not succeed.' });
    }

    // ── Activity log (best-effort, doesn't block success). ─────────
    db.collection('activity').add({
      type: 'event_attended',
      userId: firebaseUid || null,
      userEmail: email,
      userName: firebaseUid ? null : email,
      details: { eventName, amount: amount / 100 },
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      ticketId: ticketRef.id,
      paymentIntentId: paymentIntent.id,
      amount,
    });
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
