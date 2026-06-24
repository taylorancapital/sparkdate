// api/lead-signup.js
// (Formerly api/webhook-formspree.js — renamed in audit L6 because it
// no longer talks to Formspree. This endpoint receives the founding-
// cohort signup form and writes the new lead + sends the welcome email.)
//
// SYNCHRONOUS — awaits all operations before responding.
// Previous version used fire-and-forget which Vercel kills after res.send().

const { Resend } = require('resend');
const { admin, requireAdmin } = require('../lib/auth');
const { makeUnsubscribeUrl } = require('../lib/unsubscribe');
const { buildUtmUrl } = require('../lib/utm');
const { getNextEvent, eventCardHtml, ctaButtonHtml, shell, h1, p } = require('../lib/next-event');
const { verifyProfileToken, makeProfileUrl, sign: signProfileToken } = require('../lib/profile-link');

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

// Length/shape limits — this endpoint is unauthenticated by necessity
// (founding form is public). Tightens the spam surface without breaking
// real submissions.
const MAX_NAME = 120;
const MAX_EMAIL = 254; // RFC 5321 max
const MAX_PHONE = 40;
const MAX_REF = 80;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Allowlist of lead sources the client may declare. Anything else is
// coerced to 'founding_form' so an attacker can't inject arbitrary source
// strings into our analytics. Keep in sync with the public forms.
const ALLOWED_SOURCES = new Set(['founding_form', 'newsletter', 'referral', 'ad_landing', 'blog', 'exit_intent']);

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

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Account not found.' });

  await ref.update({
    age, intent, interests, vibes,
    profileCompleted: true,
    profileCompletedAt: new Date().toISOString(),
  });
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
    <p>SparkDate · Lancaster, PA · Real people. Real venues.</p>
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
    <p>SparkDate · Lancaster, PA · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// Check-in (walk-in / door) profile nudge. Sent right after check-in to people
// whose profile isn't complete, so the Thursday "who did you click with"
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
    <p>SparkDate · Lancaster, PA · Real people. Real venues.</p>
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
  const regId    = `eb_reg_${uid}_${eventId}`;
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

  // 3. Magic profile link + welcome email (best-effort). New SparkDate users
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
  let userRecord = null;
  let createdUser = false;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
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
  const regSnap = await db.collection('event_registrations')
    .where('userId', '==', uid).where('eventId', '==', eventId).limit(1).get();
  let alreadyRegistered = false;
  if (!regSnap.empty) {
    alreadyRegistered = true;
    await regSnap.docs[0].ref.set({
      status: 'confirmed',
      checkedInAt: FieldValue.serverTimestamp(),
      firstTimeAttendee: firstTime,
      photoConsent,
    }, { merge: true });
  } else {
    const monthKey = new Date().toISOString().slice(0, 7);
    await db.collection('event_registrations').add({
      userId: uid, email, name: firstName, phone, gender,
      eventId, eventTitle, ticketId: null, paymentIntentId: null,
      status: 'confirmed', source: 'checkin',
      firstTimeAttendee: firstTime, photoConsent, month: monthKey,
      checkedInAt: FieldValue.serverTimestamp(),
      registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

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

  try {
    const name  = clean(req.body?.name,  MAX_NAME);
    const email = clean(req.body?.email, MAX_EMAIL).toLowerCase();
    const phone = clean(req.body?.phone, MAX_PHONE);
    const ref   = clean(req.body?.ref,   MAX_REF) || null; // referrer uid/code
    const reqSource = clean(req.body?.source, 40);
    const source = ALLOWED_SOURCES.has(reqSource) ? reqSource : 'founding_form';

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
      console.log('↩️ duplicate lead — skipped welcome for', hashEmail(email));
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
    const unsubUrl = makeUnsubscribeUrl(docRef.id, email);

    // 2. Send email via Resend (AWAIT — this is the key fix)
    console.log('📨 Calling Resend API...');
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
      p('We host real, in-person mixers in Philadelphia. You show up, meet a dozen-plus people in short, low-pressure rounds, and swap numbers with anyone you click with. No swiping. No pen-pal phase. Just actual meetings.') +
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

    console.log('📧 Resend response:', JSON.stringify(emailResult));

    // 3. Update lead with email status
    const emailSent = !emailResult.error;
    await docRef.update({
      welcome_sent: emailSent,
      welcome_sent_at: emailSent ? new Date().toISOString() : null,
      resend_id: emailResult.data?.id || null,
      resend_error: emailResult.error?.message || null
    });

    console.log(emailSent ? '✅ Email sent successfully' : '❌ Email failed: ' + emailResult.error?.message);

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
