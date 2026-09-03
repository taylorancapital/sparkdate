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
const { stripe } = require('../lib/stripe');
const { SERVICE_FEE_CENTS } = require('../lib/pricing');
const { seatFields, effectivePrice } = require('../lib/seat-model');
const { makeProfileUrl } = require('../lib/profile-link');
const { sameEmailIdentity } = require('../lib/email-identity');
const { normalizeAttribution, toStripeMetadata, channelOf } = require('../lib/attribution');
const { EMAIL_FROM, EMAIL_REPLY_TO } = require('../lib/email-sender');
const { hasGender } = require('../lib/eventbrite');

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
  let released = false;
  // Hoisted to function scope so the post-transaction success log can read
  // it. The field is resolved INSIDE the txn (it depends on the freshly-read
  // event doc), but declaring it with `const` in the callback left it out of
  // scope for the log below, which threw a ReferenceError *after* the seat
  // had already been released.
  let counterField = null;
  try {
    await db.runTransaction(async (tx) => {
      // All reads must precede writes in a Firestore txn.
      const fresh = await tx.get(ticketDoc.ref);
      if (!fresh.exists || fresh.data().status !== 'pending_3ds') return;
      const evSnap = await tx.get(eventRef);
      // Decrement the SAME counter the reservation bumped (single-pool
      // `confirmed` for new events, per-gender for legacy).
      ({ counterField } = seatFields(evSnap.exists ? evSnap.data() : {}, ticket.gender));
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

// ── Auto-enroll guest ticket buyers as SparkDate users ──────────────
//
// When someone buys a ticket as a guest (no Authorization header), we
// create a Firebase Auth user + Firestore user doc + send a welcome email
// with a password-set link so they can log in and complete their profile.
// Members buying tickets skip this entirely — they already have an account.
//
// Memberships/subscriptions are currently paused — no Stripe customer or
// trial subscription is created. When memberships re-launch, re-add the
// Stripe customer creation + subscription.create call below.
//
// Fully best-effort: any failure inside this helper must NOT roll back
// the ticket. The caller wraps it in .catch() and the ticket response
// proceeds regardless. Partial state (Firebase user / user doc) is
// cleaned up inline on failure to avoid orphans.

// Tiny HTML-escape for values that flow into the welcome email body.
function escEmail(s) {
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner and drops this file from deploys.
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

function welcomeHTML({ eventName, resetLink, profileUrl }) {
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
    ${profileUrl ? `<p><strong>One quick thing</strong> — tell us a bit about yourself so we can seat you with the right people on the night. 60 seconds, no login needed:</p>
    <p style="text-align:center;"><a class="cta" href="${escEmail(profileUrl)}">Complete my profile</a></p>` : ''}
    <p>We created a SparkDate account for you — set a password to view your tickets and manage your profile:</p>
    <p style="text-align:center;"><a href="${escEmail(resetLink)}" style="color:#ff6b6b;font-weight:600;text-decoration:none;">Set my password →</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

function existingUserHTML({ eventName, profileUrl }) {
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
    ${profileUrl ? `<p><strong>One quick thing</strong> — tell us a bit about yourself so we can seat you with the right people on the night. 60 seconds, no login needed:</p>
    <p style="text-align:center;"><a class="cta" href="${escEmail(profileUrl)}">Complete my profile</a></p>
    <p style="font-size:13px;color:#666;">Want to view your tickets? <a href="https://sparkdate.date/account" style="color:#ff6b6b;">Log in to your account</a>.</p>`
    : `<p>This email already has a SparkDate account — sign in below to see your tickets.</p>
    <p style="text-align:center;"><a class="cta" href="https://sparkdate.date/account">Log in to my account</a></p>`}
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

async function enrollGuestAsMember({ email, paymentMethodId, gender, eventName, name, phone, eventId }) {
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
    // Stamp the uid onto the registration this purchase just wrote.
    //
    // The new-user branch below does this as part of promoting the guest reg
    // to reg_{uid}_{eventId}. This branch returned WITHOUT it, so a buyer (or
    // a 2-for-1 companion) whose email already had an account kept
    // `userId: null` for ever. Four passes in api/cron-send-emails.js skip a
    // registration without a userId — the chemistry-profile reminder, the
    // post-event prompt, the match flow and the attendance log — so that
    // person arrives unmatched and is invisible afterwards.
    //
    // Same matching rule as the promotion below: filter on the indexed fields,
    // compare email identity in code, because Firestore equality is exact and
    // a differently-cased or aliased address silently misses.
    if (eventId) {
      try {
        const orphans = await db.collection('event_registrations')
          .where('eventId', '==', eventId).where('userId', '==', null)
          .get();
        const mine = orphans.docs.filter((d) => sameEmailIdentity(d.data().email, norm));
        for (const d of mine) await d.ref.update({ userId: existing.uid });
        if (mine.length) console.log(`[auto-enroll] stamped uid on ${mine.length} reg(s) for existing user`);
      } catch (e) {
        console.error('[auto-enroll] existing-user uid stamp failed:', e.message);
      }
    }

    // "Magic link for everyone": existing buyers get the no-login profile link
    // too — but only when their chemistry profile isn't already done, so we
    // never nag someone who's finished. Read the user doc to decide; fail-open
    // to the plain login email on any hiccup (the ticket already succeeded).
    let profileUrl = '';
    try {
      const udoc = await db.collection('users').doc(existing.uid).get();
      if (udoc.exists && udoc.data().profileCompleted !== true) {
        profileUrl = makeProfileUrl(existing.uid);
      }
    } catch (e) {
      console.error('[auto-enroll] existing-user profile check skipped:', e.message);
    }
    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: EMAIL_FROM,
          reply_to: EMAIL_REPLY_TO,
          to: norm,
          subject: profileUrl
            ? 'Your ticket is in — one quick step to get matched'
            : 'Your SparkDate ticket — log in to manage it',
          html: existingUserHTML({ eventName, profileUrl }),
        });
      }
    } catch (e) {
      console.error('[auto-enroll] existing-user email failed:', e.message);
    }
    return;
  }

  // 2. New email — create Firebase Auth user + Firestore user doc + welcome email.
  //    Memberships are currently paused: no Stripe customer or subscription is created.
  //    When memberships re-launch, re-add Stripe customer + subscriptions.create here.
  //    Cleanup-on-failure: if anything throws we delete the partial Firebase/Firestore
  //    state so the next purchase attempt starts clean.
  let userRecord = null;
  let userDocCreated = false;

  try {
    userRecord = await admin.auth().createUser({
      email: norm,
      // Random throwaway — the user sets a real one via the reset link.
      password: crypto.randomBytes(32).toString('hex'),
      emailVerified: false,
    });

    await db.collection('users').doc(userRecord.uid).set({
      email: norm,
      firstName,
      lastName,
      phone: cleanPhone,
      gender: gender || null,
      tier: 'free',
      stripeCustomerId: null,
      subscriptionId: null,
      subscriptionStatus: null,
      source: 'ticket_purchase',
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    userDocCreated = true;

    // Backfill: find the guest temp reg doc (reg_guest_{paymentIntentId}_{eventId})
    // and promote it to the canonical reg_{uid}_{eventId} ID.
    if (eventId) {
      try {
        const canonicalId = `reg_${userRecord.uid}_${eventId}`;
        const canonicalRef = db.collection('event_registrations').doc(canonicalId);
        // Find the guest temp doc for this event. Deliberately NOT filtering on
        // email in the query: Firestore equality is exact, so a guest row saved
        // with different capitalization (or an Apple alias domain) than `norm`
        // silently failed to match and the row was orphaned — leaving the buyer
        // on the roster twice. Filter on the indexed fields, then compare email
        // identity in code with the same rule check-in uses.
        const guestSnap = await db.collection('event_registrations')
          .where('eventId', '==', eventId).where('userId', '==', null)
          .get();
        const guestMatches = guestSnap.docs.filter((d) => sameEmailIdentity(d.data().email, norm));
        if (guestMatches.length) {
          const guestDoc = guestMatches[0];
          // Write to canonical ID (merge in case a checkin already created it)
          await canonicalRef.set({ ...guestDoc.data(), userId: userRecord.uid }, { merge: true });
          // Delete the temp doc only if it's different from canonical
          if (guestDoc.id !== canonicalId) await guestDoc.ref.delete();
        } else {
          // Guest doc not found — just ensure canonical doc has userId set
          await canonicalRef.set({ userId: userRecord.uid }, { merge: true });
        }
      } catch (e) {
        console.error('[auto-enroll] reg backfill failed:', e.message);
      }
    }

    // Password-reset link doubles as the "set initial password" link
    // (Firebase generates one URL that handles both cases).
    const resetLink = await admin.auth().generatePasswordResetLink(norm);
    // Profile magic link is non-essential — never let it abort enrollment.
    let profileUrl = '';
    try { profileUrl = makeProfileUrl(userRecord.uid); }
    catch (e) { console.error('[auto-enroll] profile link skipped:', e.message); }

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: EMAIL_FROM,
        reply_to: EMAIL_REPLY_TO,
        to: norm,
        subject: 'Your ticket is in — one quick step to get matched',
        html: welcomeHTML({ eventName, resetLink, profileUrl }),
      });
    }

    console.log(`[auto-enroll] ✓ uid=${userRecord.uid}`);
  } catch (err) {
    console.error('[auto-enroll] failed mid-flow:', err.message);
    // Best-effort cleanup of any partial state, in reverse order.
    if (userDocCreated) await db.collection('users').doc(userRecord.uid).delete().catch(() => {});
    if (userRecord)      await admin.auth().deleteUser(userRecord.uid).catch(() => {});
  }
}

// ── Lead upsert from a guest ticket purchase ────────────────────────
//
// Mirrors the schema written by webhook-formspree.js so the same admin
// Leads tab + nurture-email cron can act on these rows.
//
// Upserts by email (case-insensitive). Existing leads get the latest
// ticket info MERGED in — we deliberately don't reset nurture flags,
// don't touch `source` or `subscribed`, and don't overwrite a name /
// phone the user previously provided. This way an existing lead who
// later buys a ticket keeps their original signup history AND picks up
// the ticket-purchase metadata.
//
// New leads are created with `welcome_sent: true` — the ticket-purchase
// welcome already went out via enrollGuestAsMember; we don't want the
// cron (or anything else) to send a second welcome on top of it. The
// day2/5/14/25 nurture flags are false so they enter the sequence
// normally.
//
// Best-effort: a lead-write failure must never affect the ticket response.

async function recordLead({ email, name, phone, gender, eventId, eventName, ref }) {
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return;
  // Same whitelist as the checkout validator above and lead-signup.js:
  // anything unrecognized becomes null, never silently the men's pool.
  // `leads` is the collection the nurture/newsletter passes iterate, and it
  // carried no gender from ANY write path — so a woman who bought a ticket
  // was indistinguishable there from an anonymous exit-intent capture.
  const normGender = gender === 'woman' || gender === 'man' ? gender : null;
  try {
    const snap = await db.collection('leads').where('email', '==', norm).limit(1).get();
    if (snap.empty) {
      await db.collection('leads').add({
        name:    String(name  || '').trim().slice(0, 120),
        email:   norm,
        phone:   String(phone || '').trim().slice(0, 40),
        // Written even when null, so the field is present rather than absent.
        // Consumers must still treat missing/null as "unknown" and filter in
        // code — see the warning at cron-send-emails.js sendNewsletter().
        gender:  normGender,
        source:  'ticket_purchase',
        // First-touch attribution, same as lead-signup.js — someone who
        // clicks a referral link and buys a ticket directly, without ever
        // touching a lead-capture form, was previously invisible as a
        // referral conversion entirely.
        referredBy: ref || null,
        createdAt: FieldValue.serverTimestamp(),
        // Ticket-purchase buyers got their welcome via the
        // enrollGuestAsMember email, not the cron — mark welcomed so
        // nothing tries to send a second welcome on top.
        welcome_sent: true,
        subscribed:   true,
        day2_sent:    false,
        day5_sent:    false,
        day14_sent:   false,
        day25_sent:   false,
        last_ticket_event_id:    eventId  || null,
        last_ticket_event_name:  eventName || null,
        last_ticket_purchased_at: FieldValue.serverTimestamp(),
        ticket_count: 1,
      });
      console.log(`[lead] new ticket-purchase lead created for ${norm}`);
    } else {
      const doc = snap.docs[0];
      const existing = doc.data();
      const patch = {
        last_ticket_event_id:    eventId  || null,
        last_ticket_event_name:  eventName || null,
        last_ticket_purchased_at: FieldValue.serverTimestamp(),
        ticket_count: FieldValue.increment(1),
      };
      // Only fill in name / phone if the existing row didn't already
      // have one — we never overwrite the user's prior input. Same
      // first-touch-wins rule for referredBy as lead-signup.js.
      if (!existing.name  && name)  patch.name  = String(name).trim().slice(0, 120);
      if (!existing.phone && phone) patch.phone = String(phone).trim().slice(0, 40);
      if (!existing.referredBy && ref) patch.referredBy = ref;
      // Fill-if-missing, same first-touch rule. Both values are self-reported
      // at a checkout, so a later one is no more authoritative than the one
      // already on file — and overwriting would silently rewrite the segment
      // a past campaign was measured against. hasGender() rather than a truthy
      // test, for the same reason lib/enroll.js uses it: a field that has been
      // through a sheet or JSON can arrive as the literal string "null".
      if (normGender && !hasGender(existing.gender)) patch.gender = normGender;
      await doc.ref.update(patch);
      console.log(`[lead] existing lead updated for ${norm} (count=${(existing.ticket_count || 0) + 1})`);
    }
  } catch (err) {
    console.error('[lead] write failed (non-fatal):', err.message);
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { paymentMethodId, email, name, phone, gender, eventId, ref, attribution, fbp, fbc } = req.body || {};
    // Untrusted -- length-capped and key-restricted before it touches Firestore.
    const attr = normalizeAttribution(attribution);
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

    // ── Optional +1 companion (2-for-1 promo) ──────────────────────
    // A second attendee riding on the SAME payment. Same validation rules
    // as the primary buyer, but they never authenticate — they're always
    // enrolled as a guest (own welcome email + lead row), independent of
    // whether the paying buyer is a member or a guest themselves.
    let plusOne = null;
    if (req.body && req.body.plusOne) {
      const po = req.body.plusOne;
      if (!po.email || !po.gender || !po.name || !String(po.name).trim()) {
        return res.status(400).json({ error: 'Missing +1 fields' });
      }
      if (po.gender !== 'woman' && po.gender !== 'man') {
        return res.status(400).json({ error: 'Invalid +1 gender' });
      }
      // The 2-for-1 is offered to EVERY buyer and only ADVERTISED to women.
      // For part of 2026-09-02 this block rejected a male buyer's +1; Taylor
      // reversed that the same day on legal grounds -- gender-conditioned
      // pricing at a place of public accommodation is the riskier shape, so
      // the product treats everyone alike and only the marketing is targeted
      // (content/brand.json caption_rules.banned_outside_female_ad_set is the
      // rule that survives, and it governs copy, not checkout). The +1's own
      // gender is validated below and otherwise unconstrained.
      plusOne = {
        name: String(po.name).trim().slice(0, 200),
        email: String(po.email).trim(),
        gender: po.gender,
        phone: String(po.phone || '').trim().slice(0, 50),
      };
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

    // ── Reclaim seats from abandoned 3-D Secure purchases ──────────
    // Runs before the reservation so any freed seat is available to
    // THIS buyer. Best-effort: a sweep failure must never block a sale.
    await sweepStale3ds(eventRef, eventId).catch((e) => {
      console.error('[purchase-ticket] 3ds sweep failed:', e.message);
    });

    // ── Reserve seat(s) ATOMICALLY using a Firestore transaction. ──
    // We bump counter(s) on the event doc inside the txn. If two requests
    // race, only one wins; the other sees the updated count and aborts.
    //
    // Resolve the seat model (lib/seat-model). New events share one pool
    // (`spots`/`confirmed`); legacy events split by gender
    // (`spotsWomen`/`confirmedWomen`, etc.). Without this, a new single-pool
    // event has no `spotsMen`/`spotsWomen` and every purchase is wrongly
    // rejected as "Event full".
    //
    // A 2-for-1 purchase reserves TWO seats in the same transaction — one
    // per attendee, each checked against ITS OWN gender's field. On a
    // single-pool event both attendees resolve to the same `confirmed`
    // field (so 2 attendees need +2 there); on a legacy gender-split event
    // they may resolve to two DIFFERENT fields (+1 each). Aggregating by
    // field, rather than assuming 1 seat total, is what makes this correct
    // for both shapes without special-casing plusOne.
    const attendees = [{ gender }];
    if (plusOne) attendees.push({ gender: plusOne.gender });

    let reservation;
    try {
      reservation = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef);
        if (!snap.exists) throw new Error('Event vanished mid-purchase');
        const e = snap.data();

        const need = {}; // counterField -> { capField, count }
        for (const a of attendees) {
          const { capField, counterField } = seatFields(e, a.gender);
          if (!need[counterField]) need[counterField] = { capField, count: 0 };
          need[counterField].count += 1;
        }

        for (const [counterField, { capField, count }] of Object.entries(need)) {
          const cap     = Number(e[capField] ?? 0);
          const current = Number(e[counterField] ?? 0);
          if (cap <= 0) {
            const err = new Error('No spots available on this event');
            err.statusCode = 409;
            throw err;
          }
          if (current + count > cap) {
            const err = new Error('Event full');
            err.statusCode = 409;
            throw err;
          }
        }

        const updates = {};
        for (const [counterField, { count }] of Object.entries(need)) {
          updates[counterField] = FieldValue.increment(count);
        }
        tx.update(eventRef, updates);
        return { need };
      });
    } catch (e) {
      if (e.statusCode === 409) {
        return res.status(409).json({ error: 'Event full', message: e.message });
      }
      throw e;
    }

    // Releases every seat this request reserved (all attendees) in one
    // update — used on every rollback path below instead of decrementing a
    // single hardcoded field, since a 2-for-1 purchase may hold seats on
    // one or two distinct counter fields.
    async function releaseSeats() {
      const updates = {};
      for (const [counterField, { count }] of Object.entries(reservation.need)) {
        updates[counterField] = FieldValue.increment(-count);
      }
      await eventRef.update(updates).catch(() => {});
    }

    // ── Server-side price computation. Client `amount` is ignored. ─
    // Early-bird-aware: charges the early-bird price while the window is open,
    // else the regular price. Same resolver the marketing block uses, so the
    // charge always matches what was advertised.
    const { price: baseDollars } = effectivePrice(event, gender);
    if (!isFinite(baseDollars) || baseDollars <= 0) {
      // Roll back the counter we just bumped.
      await releaseSeats();
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
      metadata: { eventId, gender, type: 'ticket', ...toStripeMetadata(attr) },
      confirm: true,
    };

    if (firebaseUid) {
      // Member path: charge saved card off-session.
      const userSnap = await db.collection('users').doc(firebaseUid).get();
      if (!userSnap.exists) {
        await releaseSeats();
        return res.status(404).json({ error: 'User not found' });
      }
      const { stripeCustomerId, stripePaymentMethodId } = userSnap.data();
      if (!stripeCustomerId) {
        await releaseSeats();
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
        await releaseSeats();
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
      await releaseSeats();
      throw e;
    }

    // ── Duplicate-submit guard (audit P2). ─────────────────────────
    // The Stripe idempotency key is stable per (member | card × event), so a
    // re-submit — double-click, or back-button then "buy" again — returns the
    // SAME PaymentIntent. But this request's transaction already bumped the
    // seat counter again, so without this guard we'd hold a phantom seat AND
    // write a second ticket row for a single charge (a member could even get a
    // free extra ticket). If a ticket already exists for this PaymentIntent,
    // release the seat we just reserved and return the ORIGINAL ticket instead
    // of writing a duplicate. (Residual: two perfectly-simultaneous submits can
    // still both miss here — the client should also disable the buy button on
    // first click. Worst case is an over-counted seat, never an oversell or a
    // double charge.)
    const dupSnap = await db.collection('tickets')
      .where('paymentIntentId', '==', paymentIntent.id).limit(1).get();
    if (!dupSnap.empty) {
      await releaseSeats();
      const dup = dupSnap.docs[0];
      const dupData = dup.data();
      console.log(`[purchase-ticket] duplicate submit for PI ${paymentIntent.id} — released seat, returning existing ticket ${dup.id}`);
      if (paymentIntent.status === 'requires_action') {
        return res.status(200).json({
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
          ticketId: dup.id,
          duplicate: true,
          amount: dupData.amount,
        });
      }
      // `duplicate` alone can't tell the browser what actually happened here,
      // and the two cases need opposite messages. If the existing ticket is
      // already `confirmed`, this submit bought nothing — the caller already
      // owns a seat, and telling them "You're confirmed" reads as a second
      // purchase that never happened. If it is still `pending_3ds`, the
      // payment simply hasn't cleared authentication yet. Say which.
      return res.status(200).json({
        success: true,
        duplicate: true,
        alreadyConfirmed: dupData.status === 'confirmed',
        ticketId: dup.id,
        paymentIntentId: paymentIntent.id,
        amount: dupData.amount,
      });
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
    // Deterministic reg ID so any write path (purchase, checkin, enroll) for the
    // same person+event merges into one doc instead of creating duplicates.
    // Guests have no uid yet — use a payment-keyed temp ID; enrollGuestAsMember
    // will copy it to reg_{uid}_{eventId} once the account is created.
    const regId  = firebaseUid ? `reg_${firebaseUid}_${eventId}` : `reg_guest_${paymentIntent.id}_${eventId}`;
    const regRef = db.collection('event_registrations').doc(regId);
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
      // Which channel produced this sale. `channel` is the short reporting
      // label ("facebook / paid_social"); `attribution` keeps the raw UTMs so
      // a per-campaign or per-post breakdown is possible later. Null when the
      // buyer arrived with no UTMs, which is itself the answer: direct.
      channel: channelOf(attr),
      attribution: attr,
      // Meta's own cookies, carried through so the Purchase event sent from
      // stripe-webhook can include them. That handler runs on Stripe's
      // servers, so it has no browser to read them from and no IP or user
      // agent either -- without this it matches on hashed email alone, which
      // is what Meta's diagnostics flagged. Length-capped and string-coerced
      // like every other browser-supplied field; see lib/attribution.js.
      fbp: typeof fbp === 'string' ? fbp.slice(0, 100) : null,
      fbc: typeof fbc === 'string' ? fbc.slice(0, 200) : null,
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
    }, { merge: true });

    // ── +1 companion (2-for-1 promo): own ticket + registration docs, ──
    // same shape as the primary buyer's, so check-in, attendee lists,
    // Connections/matching, and post-event emails all treat them as a
    // full attendee in their own right — not a footnote on the buyer's
    // ticket. `amount: 0` reflects that this seat rides free on the
    // buyer's single charge (see the price computation above, which is
    // NOT doubled for a 2-for-1 purchase). They're always a guest here —
    // a companion never authenticates in this flow, regardless of
    // whether the paying buyer is a member or a guest themselves.
    let plusOneTicketRef = null;
    let plusOneRegRef = null;
    if (plusOne) {
      plusOneTicketRef = db.collection('tickets').doc();
      const plusOneRegId = `reg_guest_${paymentIntent.id}_${eventId}_plusone`;
      plusOneRegRef = db.collection('event_registrations').doc(plusOneRegId);
      batch.set(plusOneTicketRef, {
        firebaseUid: null,
        email: plusOne.email,
        name: plusOne.name,
        phone: plusOne.phone,
        gender: plusOne.gender,
        eventId,
        eventName,
        amount: 0,
        paymentIntentId: paymentIntent.id,
        paidWithCardOnFile: false,
        status: ticketStatus,
        isPlusOne: true,
        linkedTicketId: ticketRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(plusOneRegRef, {
        userId: null,
        email: plusOne.email,
        name: plusOne.name,
        phone: plusOne.phone,
        gender: plusOne.gender,
        eventId,
        eventTitle: eventName,
        ticketId: plusOneTicketRef.id,
        paymentIntentId: paymentIntent.id,
        status: ticketStatus,
        month: monthKey,
        isPlusOne: true,
        linkedRegId: regRef.id,
        registeredAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();

    // ── 3-D Secure: hand the clientSecret back to the browser. ─────
    // Client must call stripe.confirmCardPayment(clientSecret) and the
    // Stripe webhook will promote the ticket to confirmed.
    if (paymentIntent.status === 'requires_action') {
      return res.status(200).json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        ticketId: ticketRef.id,
        plusOneTicketId: plusOneTicketRef ? plusOneTicketRef.id : undefined,
        amount,
      });
    }

    if (paymentIntent.status !== 'succeeded') {
      // Refund the counter(s) — payment didn't go through.
      await releaseSeats();
      // Mark the ticket(s) as failed for audit trail.
      await ticketRef.update({ status: 'failed' }).catch(() => {});
      await regRef.update({ status: 'failed' }).catch(() => {});
      if (plusOneTicketRef) await plusOneTicketRef.update({ status: 'failed' }).catch(() => {});
      if (plusOneRegRef) await plusOneRegRef.update({ status: 'failed' }).catch(() => {});
      return res.status(400).json({ error: 'Payment did not succeed.' });
    }

    // Trim/cap inline (matches lead-signup.js's MAX_REF=80) — shared by both
    // the primary buyer's and the +1's lead rows below.
    const cleanRef = String(ref || '').trim().slice(0, 80) || null;

    // ── Auto-enroll the guest as a SparkDate user ─────────────────
    // Members (firebaseUid set) already have an account — skip.
    // Vercel kills work after the response is sent, so we MUST await
    // this; the helper itself is best-effort and never throws.
    if (!firebaseUid) {
      await enrollGuestAsMember({
        email, paymentMethodId, gender, eventName,
        name: cleanName, phone: cleanPhone, eventId,
      }).catch((err) => {
        console.error('[purchase-ticket] guest auto-enroll failed:', err.message);
      });

      // Mirror the buyer into the leads collection so the admin Leads tab and
      // the nurture-email cron pick them up. recordLead upserts by email and
      // is fully best-effort (it never throws). Guests aren't otherwise
      // captured as leads; members already have a user doc.
      await recordLead({ email, name: cleanName, phone: cleanPhone, gender, eventId, eventName, ref: cleanRef });
    }

    // ── Same enrollment + lead capture for the +1 companion ────────
    // They're never authenticated in this flow (see the doc-write block
    // above), so this always runs when a +1 is present — independent of
    // whether the PAYING buyer above was a member or a guest.
    if (plusOne) {
      await enrollGuestAsMember({
        email: plusOne.email, paymentMethodId: null, gender: plusOne.gender, eventName,
        name: plusOne.name, phone: plusOne.phone, eventId,
      }).catch((err) => {
        console.error('[purchase-ticket] +1 auto-enroll failed:', err.message);
      });
      await recordLead({ email: plusOne.email, name: plusOne.name, phone: plusOne.phone, gender: plusOne.gender, eventId, eventName, ref: cleanRef });
    }

    // ── Activity log (best-effort, doesn't block success). ─────────
    // AWAITED, not fire-and-forget (audit M3): Vercel kills async work
    // after res.json() returns, so the prior `.catch(() => {})` form
    // silently lost activity entries on cold starts / slow Firestore.
    // The try/catch keeps the response success-only — a Firestore hiccup
    // on the log write must not fail a real ticket sale.
    //
    // NB: this is `ticket_purchased`, not `event_attended` — a purchase
    // just means the ticket was bought, which can be days or weeks before
    // the event happens. The admin Activity feed used to label this entry
    // "attended", so buying a ticket for a future event showed up as having
    // already attended it. The real "attended" signal (lib/activity-log.js)
    // fires at door check-in or via the post-event cron pass instead —
    // both of which can only be true once the event has actually occurred.
    try {
      await db.collection('activity').add({
        type: 'ticket_purchased',
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
      plusOneTicketId: plusOneTicketRef ? plusOneTicketRef.id : undefined,
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

// ── Shared with api/stripe-webhook.js (audit P1) ───────────────────────
// A guest paying with a 3-D Secure card never reaches the synchronous
// enrollment path above (the handler returns `requiresAction` first), so the
// webhook runs the SAME enrollment + lead capture when payment_intent.succeeded
// arrives. Exported here (rather than duplicated) so both paths stay in lockstep.
// Importing this file from the webhook only bundles the shared code — it does
// not create another serverless function.
module.exports.enrollGuestAsMember = enrollGuestAsMember;
module.exports.recordLead = recordLead;
