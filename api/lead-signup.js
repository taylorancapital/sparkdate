// api/lead-signup.js
// (Formerly api/webhook-formspree.js — renamed in audit L6 because it
// no longer talks to Formspree. This endpoint receives the founding-
// cohort signup form and writes the new lead + sends the welcome email.)
//
// SYNCHRONOUS — awaits all operations before responding.
// Previous version used fire-and-forget which Vercel kills after res.send().

const { Resend } = require('resend');
const { admin } = require('../lib/auth');
const { makeUnsubscribeUrl } = require('../lib/unsubscribe');
const { buildUtmUrl } = require('../lib/utm');
const { getNextEvent, eventCardHtml, ctaButtonHtml, shell, h1, p } = require('../lib/next-event');
const { verifyProfileToken } = require('../lib/profile-link');

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
const ALLOWED_SOURCES = new Set(['founding_form', 'newsletter', 'referral', 'ad_landing']);

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
      .replace(/"/g, '&quot;');

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
