// api/lead-signup.js
// (Formerly api/webhook-formspree.js — renamed in audit L6 because it
// no longer talks to Formspree. This endpoint receives the site's various
// lead-capture forms (newsletter, blog, exit-intent, etc.) and writes the
// new lead + sends the welcome email.)
//
// SYNCHRONOUS — awaits all operations before responding.
// Previous version used fire-and-forget which Vercel kills after res.send().

const { Resend } = require('resend');
const { admin, requireAdmin } = require('../lib/auth');
const { makeUnsubscribeUrl } = require('../lib/unsubscribe');
const { buildUtmUrl } = require('../lib/utm');
const { getNextEvent, eventCardHtml, ctaButtonHtml, shell, h1, p } = require('../lib/next-event');
const { verifyProfileToken, makeProfileUrl, sign: signProfileToken } = require('../lib/profile-link');
const { logEventAttended } = require('../lib/activity-log');
const { isValidGetawayPackageId } = require('../lib/getaway-packages');
const { emailLookupVariants, sameEmailIdentity } = require('../lib/email-identity');
const { sendMetaEvent } = require('../lib/meta-capi');

const db = admin.firestore();

// Hash email for logging — lets us correlate a lead in logs without storing PII.
const crypto = require('crypto');
const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').toLowerCase()).digest('hex').slice(0, 12);

// ── Per-IP rate limiting ─────────────────────────────────────────────
// This endpoint is public and emails per accepted submission, so a scripted
// flood from one source could spam arbitrary addresses and burn the Resend
// quota. Cap submissions per client IP per rolling window using a Firestore
// doc as the shared counter (serverless containers don't share memory).
// Best-effort: any failure fails OPEN so a Firestore hiccup never blocks a
// real signup. The `rate_limits` collection is server-only (covered by the
// default-deny Firestore rule).
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RL_MAX = 5;                    // accepted submissions per IP per window

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  return xff.split(',')[0].trim()
    || req.headers['x-real-ip']
    || (req.socket && req.socket.remoteAddress)
    || '';
}

// True if within the limit, false if it should be rejected. Fails open.
async function withinRateLimit(ip) {
  if (!ip) return true; // can't identify the caller → don't block real users
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
  const ref = db.collection('rate_limits').doc(ipHash);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      if (!snap.exists || (now - (snap.data().windowStart || 0)) > RL_WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }
      const count = snap.data().count || 0;
      if (count >= RL_MAX) return false;
      tx.update(ref, { count: count + 1 });
      return true;
    });
  } catch (e) {
    console.error('[lead-signup] rate-limit check failed (fail-open):', e.message);
    return true;
  }
}

// ── Getaway-interest rate limiting ──────────────────────────────────
// Separate bucket from the limiter above, used ONLY for the anonymous vote
// path (no email sent, just a counter increment), so a higher ceiling is
// safe and clicking a few retreat cards can't exhaust the budget meant for
// actual lead-capture. The notify-me EMAIL path deliberately does NOT use
// this bucket — it writes a mailing-list lead, so handleGetawayInterest
// gates it with the strict main-form limiter (withinRateLimit) instead.
const RL_GETAWAY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RL_GETAWAY_MAX = 100;                  // accepted votes per IP per window (repeat voting is allowed by design; this is the spam ceiling)

async function withinGetawayRateLimit(ip) {
  if (!ip) return true; // can't identify the caller → don't block real users
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
  const ref = db.collection('rate_limits').doc(`${ipHash}_getaway`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      if (!snap.exists || (now - (snap.data().windowStart || 0)) > RL_GETAWAY_WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }
      const count = snap.data().count || 0;
      if (count >= RL_GETAWAY_MAX) return false;
      tx.update(ref, { count: count + 1 });
      return true;
    });
  } catch (e) {
    console.error('[lead-signup] getaway rate-limit check failed (fail-open):', e.message);
    return true;
  }
}

// "I'm interested" click on a coming-soon retreat package (events.html +
// getaways.html). Public + unauthenticated by necessity, so: honeypot,
// packageId validated against a fixed allowlist (lib/getaway-packages.js)
// so a caller can't write an arbitrary Firestore doc.
//
// Two modes on one action, decided by the presence of `email`, each with its
// OWN rate limit:
//   no email  → an anonymous vote: increment the package's interest counter.
//               Gated by the loose vote bucket (RL_GETAWAY_MAX) — no email is
//               sent, just a counter bump, so a higher ceiling is safe.
//   email     → a notify-me signup that writes a mailing-list lead. Gated by
//               the SAME strict per-IP limit as the main lead form (RL_MAX),
//               NOT the vote bucket, so it can't be used to mass-subscribe
//               arbitrary addresses at 20x the rate the main form allows.
async function handleGetawayInterest(req, res) {
  // Same hidden-field honeypot convention as the main lead form below.
  if (clean(req.body?.website, 200)) {
    return res.status(200).json({ success: true });
  }

  const packageId = clean(req.body?.packageId, 40);
  if (!isValidGetawayPackageId(packageId)) {
    return res.status(400).json({ error: 'Unknown package' });
  }

  const email = clean(req.body?.email, MAX_EMAIL).toLowerCase();
  if (email) {
    // Validate the address BEFORE spending a rate-limit token, so a typo'd
    // resubmit doesn't burn the budget.
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'That email doesn\'t look right — mind checking it?' });
    }
    // Notify-me creates a subscribed mailing-list lead → gate it with the
    // main lead-form limiter (5/hr/IP), not the 100/hr vote bucket.
    if (!(await withinRateLimit(clientIp(req)))) {
      return res.status(429).json({ error: 'Too many requests. Please try again in a bit.' });
    }
    // Upsert into the same `leads` list the mixers feed: subscribed:true
    // folds them into the weekly newsletter, and `getaway_packages` keeps
    // a launch list per package so "we're opening the Singles Cruise"
    // can email exactly the people who asked for it.
    const existing = await db.collection('leads').where('email', '==', email).limit(1).get();
    let leadId;
    if (!existing.empty) {
      // Re-subscribe on an explicit opt-in: typing your address into a
      // "notify me" form is fresh consent, so flip `subscribed` back on for a
      // previously-unsubscribed lead — otherwise the launch email we just
      // promised gets filtered out by every sender's subscribed==true gate.
      leadId = existing.docs[0].id;
      await existing.docs[0].ref.update({
        subscribed: true,
        getaway_packages: admin.firestore.FieldValue.arrayUnion(packageId),
        getaway_interest_at: new Date().toISOString(),
      });
    } else {
      // dayN_sent flags pre-set true: this lead asked for getaway launch news
      // + the newsletter, NOT the first-timer *mixer* nurture drip, so suppress
      // day2/5/14/25 the same way enrollEventbriteOne does. `welcome_sent`
      // stays false on purpose — no welcome was sent (the newsletter reaches
      // them regardless), so if they later sign up through a real lead form
      // they still get the welcome then (see the dedupe branch's resend below).
      const newLead = await db.collection('leads').add({
        email,
        name: '',
        source: 'getaway_interest',
        subscribed: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        welcome_sent: false,
        day2_sent: true,
        day5_sent: true,
        day14_sent: true,
        day25_sent: true,
        getaway_packages: [packageId],
        getaway_interest_at: new Date().toISOString(),
      });
      leadId = newLead.id;
    }
    console.log(`✅ getaway notify-me → ${packageId} (emailHash=${hashEmail(email)})`);
    // Both branches above are fresh opt-in intent (see the re-subscribe
    // comment) — a genuine Lead, unlike a plain duplicate-submit resend.
    // event_id = leadId, the same id returned as `lead_id` below for the
    // client's paired fbq('track','Lead',...,{eventID: lead_id}) call.
    await sendMetaEvent({
      eventName: 'Lead',
      eventId: leadId,
      userData: { email, ip: clientIp(req), userAgent: req.headers['user-agent'] },
      customData: { content_name: `getaway_notify_${packageId}` },
    });
    return res.status(200).json({ success: true, notified: true, lead_id: leadId });
  }

  // Anonymous vote path — loose bucket, counter only.
  if (!(await withinGetawayRateLimit(clientIp(req)))) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a bit.' });
  }
  await db.collection('getaway_interest').doc(packageId).set(
    { count: admin.firestore.FieldValue.increment(1), lastClickAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return res.status(200).json({ success: true });
}

// Length/shape limits — this endpoint is unauthenticated by necessity
// (called from public marketing pages). Tightens the spam surface without
// breaking real submissions.
const MAX_NAME = 120;
const MAX_EMAIL = 254; // RFC 5321 max
const MAX_PHONE = 40;
const MAX_REF = 80;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Allowlist of lead sources the client may declare. Anything else is
// coerced to 'founding_form' so an attacker can't inject arbitrary source
// strings into our analytics. Keep in sync with the public forms.
const ALLOWED_SOURCES = new Set(['founding_form', 'newsletter', 'referral', 'ad_landing', 'blog', 'exit_intent']);

// city.html sends `city_${cityParam}` (e.g. 'city_philadelphia'), one per
// live/future city — a regex instead of enumerating each one here, so a
// new city added to city.html's CITIES config doesn't silently get its
// signups mis-attributed to founding_form until this file is also updated.
// Matches cityParam's own normalization (lowercased, trimmed) plus the
// 'unknown' fallback city.html sends when no ?city= param is present.
const CITY_SOURCE_RE = /^city_[a-z0-9-]+$/;

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

// ── Chemistry-profile completion (folded in here to stay under Vercel's
// 12-function cap) ─────────────────────────────────────────────────────────
// A ticket buyer's post-purchase / pre-event email carries a signed magic
// link (?uid=&t=, see lib/profile-link). public/profile.html POSTs here with
// action:'complete_profile' to write the questionnaire to users/{uid} with NO
// login — the token IS the authorization (Admin SDK bypasses Firestore rules).
const PROFILE_INTENTS = new Set(['long_term', 'dating_around', 'friends_first']);
function splitTags(value) {
  return clean(value, 300).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
async function handleProfileCompletion(req, res) {
  const uid = clean(req.body?.uid, 128);
  const token = clean(req.body?.t, 64);
  if (!uid || !verifyProfileToken(uid, token)) {
    return res.status(401).json({ error: 'This link is invalid or has expired.' });
  }
  // Honeypot — token-gated already, but cheap defense in depth.
  if (clean(req.body?.website, 100)) return res.status(200).json({ success: true });

  const ageNum = parseInt(req.body?.age, 10);
  const age = (Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 99) ? ageNum : null;
  const intentRaw = clean(req.body?.intent, 40);
  const intent = PROFILE_INTENTS.has(intentRaw) ? intentRaw : null;
  if (age === null || !intent) {
    return res.status(400).json({ error: "Please add your age and what you're looking for." });
  }
  const interests = splitTags(req.body?.interests);
  const vibes = splitTags(req.body?.vibes);
  const phone = clean(req.body?.phone, MAX_PHONE);

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Account not found.' });

  const update = {
    age, intent, interests, vibes,
    profileCompleted: true,
    profileCompletedAt: new Date().toISOString(),
  };
  if (phone) update.phone = phone;
  await ref.update(update);
  console.log('✅ chemistry profile completed for users/' + uid);
  return res.status(200).json({ success: true });
}

// ── Eventbrite buyer enrollment (folded in here to stay under Vercel's
// 12-function cap) ──────────────────────────────────────────────────────────
// Admin-only. The /admin "Enroll" tab POSTs action:'enroll_eventbrite' with a
// batch of buyers. For each: create (or reuse) a Firebase Auth user, write
// users/tickets/event_registrations atomically, and email a magic profile link.
function ebEsc(s) {
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner and drops this file from deploys.
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

function ebWelcomeHTML({ firstName, eventName, profileUrl, resetLink }) {
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
    <h1>See you at ${ebEsc(eventName)} 🎉</h1>
    <p>Hey ${ebEsc(firstName)} — your ticket is confirmed. We created a SparkDate account for you so we can match you with other attendees after the event.</p>
    <p><strong>One quick thing:</strong> fill out your profile (takes 60 seconds) so the matching actually works:</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>
    <p class="fine">You can also set a password to manage your account at <a href="https://sparkdate.date/account">sparkdate.date/account</a>:<br><a href="${ebEsc(resetLink)}" style="color:#ff6b6b;">${ebEsc(resetLink)}</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Existing SparkDate users: NO "we created an account" copy and NO password
// reset link (that reads like a phishing/takeover email to someone who already
// has an account). Just confirm the ticket; include the profile link only if
// they haven't completed it yet.
function ebExistingHTML({ firstName, eventName, profileUrl }) {
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
    <h1>See you at ${ebEsc(eventName)} 🎉</h1>
    <p>Hey ${ebEsc(firstName)} — your ticket is confirmed. You already have a SparkDate account, so you're all set.</p>
    ${profileUrl
      ? `<p><strong>One quick thing:</strong> finish your profile so we can match you with other attendees after the event:</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>`
      : ''}
    <p class="fine">Manage your tickets and account anytime at <a href="https://sparkdate.date/account">sparkdate.date/account</a>.</p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Check-in (walk-in / door) profile nudge. Sent right after check-in to people
// whose profile isn't complete, so the same-night 9pm "who did you click with"
// matching has real data. NO password-reset link — matching is a no-login magic
// link, and a reset link reads like phishing to a walk-in who never signed up.
function checkinProfileHTML({ firstName, eventName, profileUrl }) {
  const hi = firstName ? `Hey ${ebEsc(firstName)}` : 'Hey';
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
    <h1>Great meeting you at ${ebEsc(eventName)} 🎉</h1>
    <p>${hi} — thanks for coming out tonight. Here's the one thing left to do: tell us a little about yourself so we can match you with the people you clicked with.</p>
    <p><strong>Takes 60 seconds.</strong> We'll email you your matches afterward — no app, no login needed.</p>
    <p style="text-align:center;"><a class="cta" href="${ebEsc(profileUrl)}">Complete my profile →</a></p>
    <p class="fine">This link is just for you — no password required.</p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

async function enrollEventbriteOne({ email, name, gender, eventId, eventName, priceCents }) {
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return { email, status: 'skipped', reason: 'empty email' };

  const nameParts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const amount    = parseInt(priceCents, 10) || 0;
  const monthKey  = new Date().toISOString().slice(0, 7); // "2026-06"

  // 1. Reuse existing Firebase Auth user or create one.
  let userRecord = null;
  let isExisting = false;
  try {
    userRecord = await admin.auth().getUserByEmail(norm);
    isExisting = true;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  if (!isExisting) {
    userRecord = await admin.auth().createUser({
      email: norm,
      password: crypto.randomBytes(32).toString('hex'),
      emailVerified: false,
    });
  }
  const uid = userRecord.uid;
  const FieldValue = admin.firestore.FieldValue;

  // 2. Atomic Firestore writes (idempotent — keyed by uid+event).
  // wasNewUserDoc / alreadyCompleted drive which welcome email goes out below.
  // Set inside the txn (reset on each retry) so they reflect the final state.
  const ticketId = `eb_${uid}_${eventId}`;
  const regId    = `reg_${uid}_${eventId}`;
  let wasNewUserDoc = false;
  let alreadyCompleted = false;
  await db.runTransaction(async (txn) => {
    const userRef   = db.collection('users').doc(uid);
    const ticketRef = db.collection('tickets').doc(ticketId);
    const regRef    = db.collection('event_registrations').doc(regId);
    const userSnap  = await txn.get(userRef);
    wasNewUserDoc = !userSnap.exists;
    alreadyCompleted = userSnap.exists && userSnap.data().profileCompleted === true;

    if (!userSnap.exists) {
      txn.set(userRef, {
        email: norm, firstName, lastName, phone: '', gender: gender || null,
        tier: 'free', stripeCustomerId: null, subscriptionId: null, subscriptionStatus: null,
        source: 'eventbrite_import', profileCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    txn.set(ticketRef, {
      firebaseUid: uid, email: norm, name: String(name || '').trim(), phone: '',
      gender: gender || null, eventId: eventId || null, eventName: eventName || '',
      amount, paymentIntentId: null, paidWithCardOnFile: false, status: 'confirmed',
      source: 'eventbrite_import', createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    txn.set(regRef, {
      userId: uid, email: norm, name: String(name || '').trim(), phone: '',
      gender: gender || null, eventId: eventId || null, eventTitle: eventName || '',
      ticketId, paymentIntentId: null, status: 'confirmed', month: monthKey,
      source: 'eventbrite_import', registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  // 3. Best-effort: create a `leads` doc so this person enters the
  // engagement pipeline. day2/5/14/25 nurture, the newsletter, the
  // post-nurture campaign, and the returning-attendee "Round two?" invite
  // all read from `leads` and nothing else — without this, an
  // Eventbrite-enrolled buyer is invisible to all of it, for this event
  // and every future one. Wrapped in its own try/catch so a Firestore
  // hiccup here can never break ticket enrollment.
  try {
    const leadDupe = await db.collection('leads').where('email', '==', norm).limit(1).get();
    if (leadDupe.empty) {
      let eventIsPast = false;
      if (eventId) {
        const evSnap = await db.collection('events').doc(String(eventId)).get();
        if (evSnap.exists) {
          const d = evSnap.data().date;
          const dt = d && d.toDate ? d.toDate() : (d ? new Date(d) : null);
          eventIsPast = !!dt && !isNaN(dt.getTime()) && dt.getTime() < Date.now();
        }
      }
      await db.collection('leads').add({
        name: String(name || '').trim(),
        email: norm,
        phone: '',
        source: 'eventbrite_import',
        referredBy: null,
        createdAt: FieldValue.serverTimestamp(),
        subscribed: true,
        // Already welcomed via the ticket-confirmation email below — don't
        // also send the generic "Your app matched you" welcome pitch.
        welcome_sent: true,
        // Already has a ticket, so skip the pre-purchase persuasion
        // pitches (day2 "70% exchange contact info", day5 "spots are
        // limited") — irrelevant to someone who already converted. day14
        // ("what to expect") and day25 ("don't miss the next one") still
        // apply while the event is upcoming. If the event already
        // happened (common for backfilled past registrations), none of
        // the day2-25 bucket applies — future re-engagement is
        // sendReturningAttendeeInvites's job, which has its own
        // independent per-event dedup.
        day2_sent: true,
        day5_sent: true,
        day14_sent: eventIsPast,
        day25_sent: eventIsPast,
      });
    }
  } catch (e) {
    console.error(`[enroll-eventbrite] leads doc creation failed for ${norm}:`, e.message);
  }

  // 4. Magic profile link + welcome email (best-effort). New SparkDate users
  // get account-creation copy + a set-password link; users who already had a
  // doc get a ticket-confirmation only (no "we made you an account", no reset
  // link), with the profile CTA only if they haven't completed it.
  let profileUrl = null, emailSent = false;
  try {
    profileUrl = makeProfileUrl(uid);
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      let subject, html;
      if (wasNewUserDoc) {
        const resetLink = await admin.auth().generatePasswordResetLink(norm);
        subject = `Your SparkDate ticket — ${eventName}`;
        html = ebWelcomeHTML({ firstName: firstName || name, eventName, profileUrl, resetLink });
      } else {
        subject = `Your ticket for ${eventName} is confirmed`;
        html = ebExistingHTML({ firstName: firstName || name, eventName, profileUrl: alreadyCompleted ? null : profileUrl });
      }
      await resend.emails.send({ from: 'SparkDate <hello@mail.sparkdate.date>', to: norm, subject, html });
      emailSent = true;
    }
  } catch (e) {
    console.error(`[enroll-eventbrite] email failed for ${norm}:`, e.message);
  }

  return {
    email: norm, name: String(name || '').trim(), uid,
    // "enrolled" = we created the SparkDate user doc; "existing_user" = it
    // already existed (keyed off the user doc, not just the Auth record).
    status: wasNewUserDoc ? 'enrolled' : 'existing_user', emailSent, profileUrl,
  };
}

async function handleEventbriteEnroll(req, res) {
  await requireAdmin(req); // throws 401/403 if not an admin

  const { buyers } = req.body || {};
  if (!Array.isArray(buyers) || buyers.length === 0) {
    return res.status(400).json({ error: 'buyers must be a non-empty array' });
  }
  // Each buyer is ~1-2s (Auth + Firestore txn + Resend), processed sequentially.
  // Cap the batch so it finishes inside the function's maxDuration (60s on
  // Hobby — see vercel.json) rather than timing out and half-enrolling.
  if (buyers.length > 25) {
    return res.status(400).json({ error: 'Max 25 buyers per batch — split larger lists and run them one batch at a time (re-running is safe; it skips anyone already enrolled).' });
  }

  const results = [];
  for (const buyer of buyers) {
    try {
      results.push(await enrollEventbriteOne(buyer));
    } catch (e) {
      console.error(`[enroll-eventbrite] failed for ${buyer.email}:`, e.message);
      results.push({ email: buyer.email, status: 'error', reason: e.message });
    }
  }
  const enrolled = results.filter(r => r.status === 'enrolled').length;
  const existing = results.filter(r => r.status === 'existing_user').length;
  const errors   = results.filter(r => r.status === 'error').length;
  return res.status(200).json({ results, summary: { enrolled, existing, errors, total: results.length } });
}

// ── Door check-in (folded in here to stay under Vercel's 12-function cap) ────
// Public — attendees self-check-in via QR code, no auth required. Find or
// create the Auth user (passwordless — no door email; matching reaches them via
// a magic link), merge firstTimeAttendee/photoConsent/checkedInAt onto the user
// doc, and upsert an idempotent CONFIRMED event_registration for (uid, eventId)
// so post-event matching includes native buyers, Eventbrite buyers, and
// walk-ins alike. Native buyers already have a registration → just mark checked
// in, never duplicate.
async function handleCheckin(req, res) {

  const b = req.body || {};
  const email = clean(b.email, MAX_EMAIL).toLowerCase();
  const eventId = clean(b.eventId, 128);
  const eventTitle = clean(b.eventTitle, 200) || 'SparkDate event';
  const firstName = clean(b.firstName, 80);
  const gender = b.gender === 'woman' || b.gender === 'man' ? b.gender : null;
  const phone = clean(b.phone, MAX_PHONE);
  const firstTime = b.firstTime === true || b.firstTime === 'true';
  const photoConsent = b.photoConsent === true || b.photoConsent === 'true';

  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!eventId) return res.status(400).json({ error: 'Missing eventId.' });

  const FieldValue = admin.firestore.FieldValue;

  // 1. Find or create the Firebase Auth user.
  //
  // A single exact getUserByEmail() here was creating a SECOND account for
  // people who already had one, which is how one attendee ended up as two
  // roster rows with a split match list. Two real failure modes, both
  // observed in production:
  //
  //   (a) Apple aliases — lukedebonis@mac.com (Eventbrite ticket) and
  //       lukedebonis@me.com (typed at the door) are one inbox to Apple and
  //       three unrelated addresses to Firebase Auth.
  //   (b) An account exists for this event under a spelling Auth won't match
  //       on, but THIS event's own registration/ticket rows already record
  //       the right uid.
  //
  // So: try every alias spelling against Auth first (one lookup in the common
  // case), then fall back to trusting this event's existing rows. Creating a
  // new account is the last resort, not the default.
  let userRecord = null;
  let createdUser = false;
  for (const variant of emailLookupVariants(email)) {
    try {
      userRecord = await admin.auth().getUserByEmail(variant);
      break;
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
  }

  // Fallback (b): scan only THIS event's confirmed rows — a few dozen docs,
  // not the whole collection — for one whose email is the same identity and
  // already carries a uid. Verified against Auth before it's trusted, so a
  // stale row can't point check-in at an account that no longer exists.
  if (!userRecord) {
    try {
      const [regSnap, tkSnap] = await Promise.all([
        db.collection('event_registrations').where('eventId', '==', eventId).get(),
        db.collection('tickets').where('eventId', '==', eventId).get(),
      ]);
      const candidates = [
        ...regSnap.docs.map((d) => ({ email: d.data().email, uid: d.data().userId })),
        ...tkSnap.docs.map((d) => ({ email: d.data().email, uid: d.data().firebaseUid })),
      ];
      const hit = candidates.find((c) => c.uid && sameEmailIdentity(c.email, email));
      if (hit) {
        userRecord = await admin.auth().getUser(hit.uid);
        console.log(`[checkin] reused uid ${hit.uid} for ${email} via existing row for ${eventId} (Auth lookup missed it)`);
      }
    } catch (e) {
      // Best-effort only — if this lookup fails we fall through to creating a
      // new account, which is the pre-existing behavior, not a regression.
      console.error('[checkin] existing-row uid lookup skipped:', e.message);
    }
  }

  if (!userRecord) {
    userRecord = await admin.auth().createUser({
      email,
      password: crypto.randomBytes(32).toString('hex'), // throwaway — matching uses a magic link
      emailVerified: false,
    });
    createdUser = true;
  }
  const uid = userRecord.uid;

  // 2. Upsert the user doc (full baseline for new; merge check-in fields + fill
  //    blanks for existing — never clobber a completed profile).
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  // Pre-write profile state decides whether we nudge them to complete it.
  const alreadyCompleted = userSnap.exists && userSnap.data().profileCompleted === true;
  const checkInFields = {
    firstTimeAttendee: firstTime,
    photoConsent,
    checkedInAt: FieldValue.serverTimestamp(),
    lastCheckedInEventId: eventId,
  };
  if (!userSnap.exists) {
    await userRef.set({
      email, firstName, lastName: '', phone, gender,
      tier: 'free', stripeCustomerId: null, subscriptionId: null, subscriptionStatus: null,
      source: 'checkin', profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      ...checkInFields,
    });
  } else {
    const ex = userSnap.data();
    const fill = {};
    if (firstName && !ex.firstName) fill.firstName = firstName;
    if (phone && !ex.phone) fill.phone = phone;
    if (gender && !ex.gender) fill.gender = gender;
    await userRef.set({ ...fill, ...checkInFields }, { merge: true });
  }

  // 3. Idempotent CONFIRMED event_registration for (uid, eventId).
  // Canonical reg_{uid}_{eventId} ID matches purchase + enroll paths so all
  // three paths merge into one doc instead of creating duplicates (TOCTOU fix).
  const regId = `reg_${uid}_${eventId}`;
  const regRef = db.collection('event_registrations').doc(regId);
  const regSnap = await regRef.get();
  const alreadyRegistered = regSnap.exists;
  const monthKey = new Date().toISOString().slice(0, 7);
  await regRef.set({
    userId: uid, email, name: firstName, phone, gender,
    eventId, eventTitle, ticketId: null, paymentIntentId: null,
    status: 'confirmed', source: 'checkin',
    firstTimeAttendee: firstTime, photoConsent, month: monthKey,
    checkedInAt: FieldValue.serverTimestamp(),
    ...(!alreadyRegistered ? {
      registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    } : {}),
  }, { merge: true });

  // 3.2. Adopt any uid-less guest row for this event that belongs to this
  // person. A native ticket purchase writes reg_guest_{paymentIntentId}_{eventId}
  // (and a _plusone sibling) with userId: null when the buyer names a guest who
  // has no account. purchase-ticket.js backfills those, but only via an exact
  // `where email ==` query — so a guest row saved with different capitalization
  // than what they type at the door is never claimed, and they show up on the
  // roster twice: once as the unclaimed guest row, once as this check-in. That
  // is exactly what happened to Rose marie Cotto and Casey Wright on Round 2.
  //
  // Fold the guest row's fields into the canonical doc (without clobbering
  // anything check-in just wrote — the guest data is the fallback, not the
  // winner) and delete it. Best-effort: the check-in itself already succeeded,
  // so a failure here is a roster-tidiness issue, never a door problem.
  try {
    const guestSnap = await db.collection('event_registrations')
      .where('eventId', '==', eventId).where('userId', '==', null).get();
    const mine = guestSnap.docs.filter((d) => sameEmailIdentity(d.data().email, email));
    for (const g of mine) {
      if (g.id === regId) continue;
      const gd = g.data();
      const salvage = {};
      // The purchase linkage proves they paid and must survive the row being
      // deleted — check-in always writes these as null, so the guest row is
      // strictly better here.
      if (gd.ticketId != null) salvage.ticketId = gd.ticketId;
      if (gd.paymentIntentId != null) salvage.paymentIntentId = gd.paymentIntentId;
      // For everything else, what the person just told us at the door wins.
      // Only fill a gap the check-in form left empty.
      if (!phone && gd.phone) salvage.phone = gd.phone;
      if (!gender && gd.gender) salvage.gender = gd.gender;
      await regRef.set(salvage, { merge: true });
      await g.ref.delete();
      console.log(`[checkin] adopted guest row ${g.id} into ${regId} (${Object.keys(salvage).join(', ') || 'no fields'})`);
    }
  } catch (e) {
    console.error('[checkin] guest-row adoption skipped:', e.message);
  }

  // 3.5. Real "attended" activity-feed entry — check-in is the person
  // physically at the door right now, so this is a genuine attendance
  // signal (unlike the old purchase-time write). Best-effort, awaited per
  // the same rationale as every other activity write in this codebase.
  await logEventAttended(db, FieldValue, {
    uid, email, name: firstName, eventId, eventName: eventTitle, method: 'checkin',
  }).catch((e) => console.error('[checkin] attendance log failed:', e.message));

  // 4. Profile-completion nudge (best-effort — NEVER abort check-in on failure;
  //    the registration above is what the door needs). Skip if the profile is
  //    already complete (e.g. a native buyer who finished it at purchase).
  let emailSent = false;
  if (!alreadyCompleted) {
    try {
      const profileUrl = makeProfileUrl(uid);
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'SparkDate <hello@mail.sparkdate.date>',
          to: email,
          subject: `Complete your profile — get matched after ${eventTitle}`,
          html: checkinProfileHTML({ firstName, eventName: eventTitle, profileUrl }),
        });
        emailSent = true;
      }
    } catch (e) {
      console.error(`[checkin] profile email failed for ${hashEmail(email)}:`, e.message);
    }
  }

  let profileToken = null;
  try { profileToken = signProfileToken(uid); } catch (_) {}
  return res.status(200).json({
    success: true, uid, createdUser, alreadyRegistered, emailSent,
    profileCompleted: alreadyCompleted, profileToken,
  });
}

// Build + send the "Your app matched you" welcome email to a lead, then stamp
// welcome_sent on the lead doc. Shared by the fresh-signup path and the dedupe
// path — the latter covers a lead that exists but never got a welcome (e.g. a
// getaway notify-me lead, created with welcome_sent:false, that later signs up
// through a real lead form). Returns the Resend result so the caller can report
// email_sent. `firstName` is the raw first name; it's HTML-escaped in here.
async function sendWelcomeEmail(email, firstName, leadRef) {
  const unsubUrl = makeUnsubscribeUrl(leadRef.id, email);
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Escape user-supplied firstName before inlining into HTML to defend
  // against a name like `<script>...</script>` arriving as raw markup.
  const safeFirstName = String(firstName)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(new RegExp('"', 'g'), '&quot;');
  // Show the next upcoming event (dynamic) with a "Get Tickets" CTA.
  // Fails soft to an evergreen card when nothing is scheduled.
  const nextEvent = await getNextEvent(db);
  const ctaUrl = nextEvent
    ? buildUtmUrl('/event?id=' + nextEvent.id, 'email', 'nurture', 'welcome')
    : buildUtmUrl('/events', 'email', 'nurture', 'welcome');
  const welcomeHtml = shell(
    h1('Your app matched you.<br>We host the date.') +
    p(`Hey ${safeFirstName},`) +
    p('You know that feeling when you match on an app and then... three weeks of texting and still no actual date?') +
    p('Yeah. We built SparkDate to skip that part.') +
    p('We host real, in-person mixers in Lancaster and Philadelphia. You show up, meet a dozen-plus people in short, low-pressure rounds, and swap numbers with anyone you click with. No swiping. No pen-pal phase. Just actual meetings.') +
    eventCardHtml(nextEvent) +
    ctaButtonHtml(ctaUrl, 'Get Tickets') +
    `<div style="background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:15px;line-height:1.8;color:#1a1f3a;">
      <strong>How it works:</strong> arrive &amp; check in → 4 rounds, ~7 min each → meet 12+ people → swap info if you vibe. That's it.
    </div>` +
    p('Questions? Just reply to this email.') +
    p('See you there,<br>The SparkDate Team')
  ).replace(/__UNSUB__/g, unsubUrl);
  const emailResult = await resend.emails.send({
    from: 'SparkDate <hello@mail.sparkdate.date>',
    to: email,
    subject: 'Your app matched you. We host the date. 🎯',
    headers: {
      // RFC 8058 one-click unsubscribe. Required by Gmail and a strong
      // deliverability signal for everyone else.
      'List-Unsubscribe':      `<${unsubUrl}>, <mailto:hello@sparkdate.date?subject=Unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: welcomeHtml,
  });
  const emailSent = !emailResult.error;
  await leadRef.update({
    welcome_sent: emailSent,
    welcome_sent_at: emailSent ? new Date().toISOString() : null,
    resend_id: emailResult.data?.id || null,
    resend_error: emailResult.error?.message || null,
  });
  console.log(emailSent ? '✅ Welcome email sent' : '❌ Welcome email failed: ' + emailResult.error?.message);
  return emailResult;
}

module.exports = async function handler(req, res) {
  console.log('🔔 lead-capture hit:', new Date().toISOString(), 'method=', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Magic-link chemistry-profile completion — a distinct flow from lead
  // capture, sharing this function only to respect the 12-function cap.
  if (req.body && req.body.action === 'complete_profile') {
    try {
      return await handleProfileCompletion(req, res);
    } catch (err) {
      console.error('❌ complete_profile error:', err.message);
      return res.status(500).json({ error: 'Could not save. Please try again.' });
    }
  }

  // Admin-only Eventbrite batch enrollment — also folded here for the cap.
  if (req.body && req.body.action === 'enroll_eventbrite') {
    try {
      return await handleEventbriteEnroll(req, res);
    } catch (err) {
      const status = err.statusCode || err.status || 500;
      console.error('❌ enroll_eventbrite error:', err.message);
      return res.status(status).json({ error: status === 500 ? 'Enrollment failed. Please try again.' : err.message });
    }
  }

  // Admin-only door check-in — also folded here for the cap.
  if (req.body && req.body.action === 'checkin') {
    try {
      return await handleCheckin(req, res);
    } catch (err) {
      const status = err.statusCode || err.status || 500;
      console.error('❌ checkin error:', err.message);
      return res.status(status).json({ error: status === 500 ? 'Check-in failed. Try again.' : err.message });
    }
  }

  // "I'm interested" click on a coming-soon Getaway package — also folded
  // here for the cap (see handleGetawayInterest above).
  if (req.body && req.body.action === 'getaway_interest') {
    try {
      return await handleGetawayInterest(req, res);
    } catch (err) {
      console.error('❌ getaway_interest error:', err.message);
      return res.status(500).json({ error: 'Could not save. Please try again.' });
    }
  }

  try {
    const name  = clean(req.body?.name,  MAX_NAME);
    const email = clean(req.body?.email, MAX_EMAIL).toLowerCase();
    const phone = clean(req.body?.phone, MAX_PHONE);
    const ref   = clean(req.body?.ref,   MAX_REF) || null; // referrer uid/code
    const reqSource = clean(req.body?.source, 40);
    const source = (ALLOWED_SOURCES.has(reqSource) || CITY_SOURCE_RE.test(reqSource))
      ? reqSource : 'founding_form';

    // Honeypot: a hidden form field humans never see. Bots that auto-fill
    // every input populate it; real submissions leave it empty. Return 200
    // so a bot can't tell it was filtered, but write nothing and email no one.
    if (clean(req.body?.website, 200)) {
      console.log('🕳️ honeypot tripped — dropping submission', hashEmail(email));
      return res.status(200).json({ success: true });
    }

    // Per-IP rate limit (after the honeypot so bot floods are capped too).
    if (!(await withinRateLimit(clientIp(req)))) {
      console.log('🚦 rate-limited submission', hashEmail(email));
      return res.status(429).json({ error: 'Too many requests. Please try again in a bit.' });
    }

    // Log only non-PII: presence flags and a one-way email hash for correlation.
    console.log('📥 Parsed:', {
      hasName: !!name,
      emailHash: hashEmail(email),
      hasPhone: !!phone,
    });

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Dedupe by email: if this address is already a lead, don't create a
    // duplicate row or re-send the welcome. Stops accidental double-submits
    // and prevents a single address from being email-bombed through this
    // public endpoint. (Distinct-address floods are additionally capped by
    // the per-IP rate limit above.)
    const dupe = await db.collection('leads').where('email', '==', email).limit(1).get();
    if (!dupe.empty) {
      const doc = dupe.docs[0];
      const prev = doc.data();
      const patch = {};
      if (name  && !prev.name)       patch.name       = name;
      if (phone && !prev.phone)      patch.phone      = phone;
      if (ref   && !prev.referredBy) patch.referredBy = ref;
      if (Object.keys(patch).length) await doc.ref.update(patch);
      // If this address is already a lead but never actually received a welcome
      // (welcome_sent falsy — e.g. a getaway notify-me lead) and is still
      // subscribed, send it now on this real form signup. Previously the
      // welcome was skipped for EVERY existing lead unconditionally, so a
      // getaway-first lead who later signed up here never got one.
      if (!prev.welcome_sent && prev.subscribed !== false) {
        const dedupeName = (patch.name || prev.name) ? String(patch.name || prev.name).split(' ')[0] : 'there';
        const emailResult = await sendWelcomeEmail(email, dedupeName, doc.ref);
        // First real welcome for this lead (e.g. came in via getaway
        // notify-me earlier, now signing up for real) — genuine new signal,
        // unlike the plain-resubmit branch below, which fires no CAPI event
        // (nothing new happened, so there's nothing to pair a server event
        // against).
        await sendMetaEvent({
          eventName: 'Lead',
          eventId: doc.id,
          userData: { email, phone: patch.phone || prev.phone, ip: clientIp(req), userAgent: req.headers['user-agent'] },
        });
        return res.status(200).json({ success: true, lead_id: doc.id, duplicate: true, email_sent: !emailResult.error });
      }
      console.log('↩️ duplicate lead — welcome already handled for', hashEmail(email));
      return res.status(200).json({ success: true, lead_id: doc.id, duplicate: true, email_sent: false });
    }

    const firstName = name ? name.split(' ')[0] : 'there';

    // 1. Save to Firestore (AWAIT)
    // The four dayN_sent flags MUST be written explicitly. The nurture
    // cron treats a missing flag as "not sent", so it would still work
    // without them — but initializing them keeps the data model honest
    // and makes the admin Leads tab's progress pills accurate from day 1.
    const docRef = await db.collection('leads').add({
      name,
      email,
      phone,
      source,
      referredBy: ref,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      welcome_sent: false,
      subscribed: true,
      day2_sent: false,
      day5_sent: false,
      day14_sent: false,
      day25_sent: false,
    });
    console.log('✅ Firestore lead saved:', docRef.id);

    // event_id = docRef.id, the same id returned as `lead_id` below for the
    // client's paired fbq('track','Lead',...,{eventID: lead_id}) call — lets
    // Meta collapse the browser + server copies of this one signup instead
    // of double-counting it.
    await sendMetaEvent({
      eventName: 'Lead',
      eventId: docRef.id,
      userData: { email, phone, ip: clientIp(req), userAgent: req.headers['user-agent'] },
    });

    // 2. Build + send the welcome email and stamp welcome_sent (shared helper,
    //    also used by the dedupe branch above to back-fill a missing welcome).
    const emailResult = await sendWelcomeEmail(email, firstName, docRef);
    const emailSent = !emailResult.error;

    return res.status(200).json({
      success: true,
      lead_id: docRef.id,
      email_sent: emailSent,
      message_id: emailResult.data?.id || null,
      // Don't leak Resend internals to the client. Lead has been captured
      // either way, so a 200 is fine and the welcome email retry can be
      // handled out-of-band.
      error: emailSent ? null : 'email_send_failed',
    });

  } catch (err) {
    // Log full detail; return generic message — no err.message back to client.
    console.error('❌ lead-capture FATAL:', err.message, err.stack);
    return res.status(500).json({ error: 'Could not save your signup. Please try again.' });
  }
};
