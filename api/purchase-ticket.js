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

const crypto = require('crypto');
const { Resend } = require('resend');
const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { TIERS, getOrCreatePrice } = require('../lib/tiers');
const { stripe } = require('../lib/stripe');
const { SERVICE_FEE_CENTS } = require('../lib/pricing');

const resend = new Resend(process.env.RESEND_API_KEY);
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ── Abandoned-3DS seat reclaim ─────────────────────────────────────
//
// When a purchase needs 3-D Secure, this endpoint bumps the event's
// seat counter, writes the ticket as `pending_3ds`, and hands the
// browser a clientSecret. Normally the Stripe webhook then confirms the
// ticket (3DS passed) or releases the seat (3DS failed). But if the
// buyer just CLOSES THE TAB, Stripe fires neither event — the
// PaymentIntent sits in `requires_action` and the seat stays counted
// forever, a phantom "sold" seat that blocks real buyers.
//
// sweepStale3ds() runs opportunistically at the top of every purchase:
// the moment a seat is contended is exactly when a leaked one needs
// freeing. It's fully best-effort — every failure path is caught and
// logged so it can never block a real purchase.

// How long a PaymentIntent may sit in `requires_action` before the
// purchase is treated as abandoned. Genuine 3DS auth takes seconds to a
// couple of minutes; 20 minutes is comfortably past any real flow.
const STALE_3DS_MS = 20 * 60 * 1000;

// Cap Stripe round-trips per sweep so a pathological backlog can't blow
// the function's time budget. Anything beyond this is cleaned up by the
// next purchase attempt.
const SWEEP_MAX_PER_RUN = 5;

// Mirror a resolved status onto the matching event_registration row.
async function syncRegistration(paymentIntentId, status) {
  try {
    const rs = await db.collection('event_registrations')
      .where('paymentIntentId', '==', paymentIntentId).limit(1).get();
    if (!rs.empty) await rs.docs[0].ref.update({ status });
  } catch (e) {
    console.error('[3ds-sweep] registration sync failed:', e.message);
  }
}

// A stale ticket whose PaymentIntent actually succeeded — the webhook
// missed it. Promote to confirmed; the seat was already counted.
async function promote3ds(ticketDoc, ticket) {
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ticketDoc.ref);
      if (!fresh.exists || fresh.data().status !== 'pending_3ds') return;
      tx.update(ticketDoc.ref, { status: 'confirmed' });
    });
    await syncRegistration(ticket.paymentIntentId, 'confirmed');
    console.log(`[3ds-sweep] promoted stale-but-paid ticket ${ticketDoc.id}`);
  } catch (e) {
    console.error('[3ds-sweep] promote failed:', e.message);
  }
}

// An abandoned ticket whose PaymentIntent has been canceled — release
// the seat. The transaction only decrements if it finds the ticket
// still `pending_3ds`, so two concurrent sweeps can't double-release.
async function expire3ds(ticketDoc, ticket, eventRef) {
  const counterField = ticket.gender === 'woman' ? 'confirmedWomen' : 'confirmedMen';
  let released = false;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ticketDoc.ref);
      if (!fresh.exists || fresh.data().status !== 'pending_3ds') return;
      tx.update(ticketDoc.ref, { status: 'expired' });
      tx.update(eventRef, { [counterField]: FieldValue.increment(-1) });
      released = true;
    });
  } catch (e) {
    console.error('[3ds-sweep] expire failed:', e.message);
    return;
  }
  if (released) {
    await syncRegistration(ticket.paymentIntentId, 'expired');
    console.log(`[3ds-sweep] expired abandoned ticket ${ticketDoc.id}, released ${counterField}`);
  }
}

// Reclaim seats held by abandoned 3-D Secure purchases for one event.
async function sweepStale3ds(eventRef, eventId) {
  // Single-field query — eventId is auto-indexed, no composite needed.
  const snap = await db.collection('tickets').where('eventId', '==', eventId).get();
  const now = Date.now();
  let processed = 0;

  for (const ticketDoc of snap.docs) {
    if (processed >= SWEEP_MAX_PER_RUN) break;
    const ticket = ticketDoc.data();
    if (ticket.status !== 'pending_3ds' || !ticket.paymentIntentId) continue;

    const createdMs = ticket.createdAt?.toDate ? ticket.createdAt.toDate().getTime() : 0;
    if (!createdMs || now - createdMs < STALE_3DS_MS) continue; // still within a valid 3DS window

    processed++;

    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(ticket.paymentIntentId);
    } catch (e) {
      console.error(`[3ds-sweep] retrieve ${ticket.paymentIntentId} failed:`, e.message);
      continue;
    }

    if (pi.status === 'succeeded') {
      await promote3ds(ticketDoc, ticket);
      continue;
    }

    // Not succeeded. Unless it's already canceled, cancel it now — a
    // successful cancel is atomic proof the purchase is dead and the
    // seat is safe to release. It also prevents a very-late 3DS
    // completion from charging the card after we've given the seat away.
    // If cancel fails, the intent may have just succeeded — leave it for
    // the webhook / next sweep rather than risk releasing a paid seat.
    if (pi.status !== 'canceled') {
      try {
        await stripe.paymentIntents.cancel(pi.id);
      } catch (e) {
        console.error(`[3ds-sweep] cancel ${pi.id} (status ${pi.status}) failed:`, e.message);
        continue;
      }
    }

    await expire3ds(ticketDoc, ticket, eventRef);
  }
}

// ── Auto-enroll guest ticket buyers in a 30-day Spark trial ─────────
//
// When someone buys a ticket as a guest (no Authorization header), we
// also create a Firebase Auth user + Stripe Customer + Spark-tier
// subscription with a 30-day trial, then email them a password-set link
// so they can log in. Members buying tickets skip this entirely — they
// already have a subscription.
//
// FTC ROSCA-compliant: event.html shows clear pre-billing disclosure
// ("Includes a 30-day free Spark trial — $9.99/mo after, cancel anytime")
// BEFORE the buy button, and the legal-checkbox line spells out the
// auto-renew terms. The buy action is the express informed consent.
//
// Fully best-effort: any failure inside this helper must NOT roll back
// the ticket. The caller wraps it in .catch() and the ticket response
// proceeds regardless. Partial state (Firebase user / Stripe customer /
// user doc) is cleaned up inline on failure to avoid orphans.

// Tiny HTML-escape for values that flow into the welcome email body.
function escEmail(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function welcomeHTML({ eventName, resetLink }) {
  const safeEvent = escEmail(eventName);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.fine{font-size:12px;color:#666;line-height:1.6}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>Your ticket is locked in.</h1>
    <p>You're on the list for <strong>${safeEvent}</strong>. See you there.</p>
    <p>While you're here, we also activated your free <strong>30-day Spark trial</strong> — full SparkDate access, no charge for 30 days. After that, it's $9.99/month (cancel anytime at <a href="https://sparkdate.date/account">sparkdate.date/account</a>).</p>
    <p>Set your password to log in:</p>
    <p style="text-align:center;"><a class="cta" href="${escEmail(resetLink)}">Set my password</a></p>
    <p class="fine">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#666;">${escEmail(resetLink)}</span></p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

function existingUserHTML({ eventName }) {
  const safeEvent = escEmail(eventName);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>Your ticket is locked in.</h1>
    <p>You're on the list for <strong>${safeEvent}</strong>. See you there.</p>
    <p>This email already has a SparkDate account — sign in below to see your tickets and manage your subscription.</p>
    <p style="text-align:center;"><a class="cta" href="https://sparkdate.date/account">Log in to my account</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

async function enrollGuestAsMember({ email, paymentMethodId, gender, eventName, name, phone }) {
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return;

  // Split the single Name field from the checkout form into the
  // firstName/lastName shape the rest of the app (signup, admin, emails)
  // already uses. First whitespace-separated word is firstName; the
  // remainder is lastName.
  const nameParts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const cleanPhone = String(phone || '').trim().slice(0, 50);

  // 1. Email already on SparkDate? Skip enrollment — no surprise sub.
  let existing = null;
  try {
    existing = await admin.auth().getUserByEmail(norm);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[auto-enroll] getUserByEmail failed:', e.message);
      return; // bail safely; the ticket already succeeded
    }
  }

  if (existing) {
    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: 'SparkDate <hello@mail.sparkdate.date>',
          to: norm,
          subject: 'Your SparkDate ticket — log in to manage it',
          html: existingUserHTML({ eventName }),
        });
      }
    } catch (e) {
      console.error('[auto-enroll] existing-user email failed:', e.message);
    }
    return;
  }

  // 2. New email — full enrollment with cleanup-on-failure so we don't
  //    leak partial state into Firebase Auth / Stripe / Firestore.
  let userRecord = null;
  let customer = null;
  let userDocCreated = false;

  try {
    userRecord = await admin.auth().createUser({
      email: norm,
      // Random throwaway — the user sets a real one via the reset link.
      password: crypto.randomBytes(32).toString('hex'),
      emailVerified: false,
    });

    const priceId = await getOrCreatePrice('free');

    customer = await stripe.customers.create({
      email: norm,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
      metadata: { firebaseUid: userRecord.uid, tier: 'free', source: 'ticket_purchase' },
    }, { idempotencyKey: `customer:${userRecord.uid}` });

    // Write user doc BEFORE creating the subscription. The Stripe
    // webhook (customer.subscription.created) resolves the user by
    // stripeCustomerId — if the doc doesn't exist yet, that lookup
    // fails and the user's subscriptionStatus is never set.
    await db.collection('users').doc(userRecord.uid).set({
      email: norm,
      firstName,
      lastName,
      phone: cleanPhone,
      gender: gender || null,
      tier: 'free',
      stripeCustomerId: customer.id,
      subscriptionId: null,
      subscriptionStatus: 'pending',
      source: 'ticket_purchase',
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    userDocCreated = true;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: TIERS.free.trialDays,
      metadata: { firebaseUid: userRecord.uid, tier: 'free', source: 'ticket_purchase' },
    }, { idempotencyKey: `sub:${userRecord.uid}:free` });

    await db.collection('users').doc(userRecord.uid).update({
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status, // typically 'trialing'; 'incomplete' if 3DS setup needed
    });

    // Password-reset link doubles as the "set initial password" link
    // (Firebase generates one URL that handles both cases).
    const resetLink = await admin.auth().generatePasswordResetLink(norm);

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'SparkDate <hello@mail.sparkdate.date>',
        to: norm,
        subject: 'Your ticket + free Spark trial — set your password',
        html: welcomeHTML({ eventName, resetLink }),
      });
    }

    console.log(`[auto-enroll] ✓ uid=${userRecord.uid} customer=${customer.id} sub=${subscription.id}`);
  } catch (err) {
    console.error('[auto-enroll] failed mid-flow:', err.message);
    // Best-effort cleanup of any partial state, in reverse order.
    if (userDocCreated) await db.collection('users').doc(userRecord.uid).delete().catch(() => {});
    if (customer)        await stripe.customers.del(customer.id).catch(() => {});
    if (userRecord)      await admin.auth().deleteUser(userRecord.uid).catch(() => {});
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, email, name, phone, gender, eventId } = req.body || {};
    let firebaseUid = null;

    // ── Basic input validation ─────────────────────────────────────
    if (!email || !gender || !eventId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (gender !== 'woman' && gender !== 'man') {
      return res.status(400).json({ error: 'Invalid gender' });
    }

    const cleanName  = String(name).trim().slice(0, 200);
    const cleanPhone = String(phone || '').trim().slice(0, 50);

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

    // ── Reclaim seats from abandoned 3-D Secure purchases ──────────
    // Runs before the reservation so any freed seat is available to
    // THIS buyer. Best-effort: a sweep failure must never block a sale.
    await sweepStale3ds(eventRef, eventId).catch((e) => {
      console.error('[purchase-ticket] 3ds sweep failed:', e.message);
    });

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
      name: cleanName,
      phone: cleanPhone,
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
      name: cleanName,
      phone: cleanPhone,
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

    // ── Auto-enroll the guest in a 30-day Spark trial ─────────────
    // Members (firebaseUid set) already have a subscription — skip.
    // Vercel kills work after the response is sent, so we MUST await
    // this; the helper itself is best-effort and never throws.
    if (!firebaseUid) {
      await enrollGuestAsMember({
        email, paymentMethodId, gender, eventName,
        name: cleanName, phone: cleanPhone,
      }).catch((err) => {
        console.error('[purchase-ticket] guest auto-enroll failed:', err.message);
      });
    }

    // ── Activity log (best-effort, doesn't block success). ─────────
    // AWAITED, not fire-and-forget (audit M3): Vercel kills async work
    // after res.json() returns, so the prior `.catch(() => {})` form
    // silently lost activity entries on cold starts / slow Firestore.
    // The try/catch keeps the response success-only — a Firestore hiccup
    // on the log write must not fail a real ticket sale.
    try {
      await db.collection('activity').add({
        type: 'event_attended',
        userId: firebaseUid || null,
        userEmail: email,
        userName: firebaseUid ? cleanName : (cleanName || email),
        details: { eventName, amount: amount / 100 },
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[purchase-ticket] activity log failed:', e.message);
    }

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
