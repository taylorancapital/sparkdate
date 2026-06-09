// api/enroll-eventbrite.js
//
// Admin-only endpoint to enroll Eventbrite ticket buyers into SparkDate.
// Called from the admin panel "Enroll" tab — no scripts, no terminals.
//
// POST /api/enroll-eventbrite
// Body: { buyers: [{ email, name, gender, eventId, eventName, priceCents }] }
// Auth: Firebase ID token with admin:true custom claim
//
// For each buyer:
//   1. Create (or reuse) Firebase Auth user
//   2. Write users/{uid}, tickets/{id}, event_registrations/{id} atomically
//   3. Send welcome email with magic-link profile questionnaire

'use strict';

const crypto = require('crypto');
const { Resend } = require('resend');
const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { makeProfileUrl } = require('../lib/profile-link');

const resend = new Resend(process.env.RESEND_API_KEY);
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function welcomeHTML({ firstName, eventName, profileUrl, resetLink }) {
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
    <h1>See you at ${esc(eventName)} 🎉</h1>
    <p>Hey ${esc(firstName)} — your ticket is confirmed. We created a SparkDate account for you so we can match you with other attendees after the event.</p>
    <p><strong>One quick thing:</strong> fill out your profile (takes 60 seconds) so the matching actually works:</p>
    <p style="text-align:center;"><a class="cta" href="${esc(profileUrl)}">Complete my profile →</a></p>
    <p class="fine">You can also set a password to manage your account at <a href="https://sparkdate.date/account">sparkdate.date/account</a>:<br><a href="${esc(resetLink)}" style="color:#ff6b6b;">${esc(resetLink)}</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Lancaster, PA · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

async function enrollOne({ email, name, gender, eventId, eventName, priceCents }) {
  const norm = String(email || '').toLowerCase().trim();
  if (!norm) return { email, status: 'skipped', reason: 'empty email' };

  const nameParts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const amount    = parseInt(priceCents, 10) || 0;
  const monthKey  = new Date().toISOString().slice(0, 7); // "2026-06"

  // 1. Check for existing Firebase Auth user
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

  // 2. Write Firestore docs atomically
  const ticketId = `eb_${uid}_${eventId}`;
  const regId    = `eb_reg_${uid}_${eventId}`;

  await db.runTransaction(async (txn) => {
    const userRef   = db.collection('users').doc(uid);
    const ticketRef = db.collection('tickets').doc(ticketId);
    const regRef    = db.collection('event_registrations').doc(regId);

    const userSnap = await txn.get(userRef);

    if (!userSnap.exists) {
      txn.set(userRef, {
        email: norm,
        firstName,
        lastName,
        phone: '',
        gender: gender || null,
        tier: 'free',
        stripeCustomerId: null,
        subscriptionId: null,
        subscriptionStatus: null,
        source: 'eventbrite_import',
        profileCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    txn.set(ticketRef, {
      firebaseUid: uid,
      email: norm,
      name: String(name || '').trim(),
      phone: '',
      gender: gender || null,
      eventId: eventId || null,
      eventName: eventName || '',
      amount,
      paymentIntentId: null,
      paidWithCardOnFile: false,
      status: 'confirmed',
      source: 'eventbrite_import',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    txn.set(regRef, {
      userId: uid,
      email: norm,
      name: String(name || '').trim(),
      phone: '',
      gender: gender || null,
      eventId: eventId || null,
      eventTitle: eventName || '',
      ticketId,
      paymentIntentId: null,
      status: 'confirmed',
      month: monthKey,
      source: 'eventbrite_import',
      registeredAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  // 3. Generate links + send email
  let profileUrl = null;
  let resetLink  = null;
  let emailSent  = false;

  try {
    profileUrl = makeProfileUrl(uid);
    resetLink  = await admin.auth().generatePasswordResetLink(norm);

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'SparkDate <hello@mail.sparkdate.date>',
        to: norm,
        subject: `Your SparkDate ticket — ${eventName}`,
        html: welcomeHTML({ firstName: firstName || name, eventName, profileUrl, resetLink }),
      });
      emailSent = true;
    }
  } catch (e) {
    console.error(`[enroll-eventbrite] email failed for ${norm}:`, e.message);
  }

  return {
    email: norm,
    name: String(name || '').trim(),
    uid,
    status: isExisting ? 'existing_user' : 'enrolled',
    emailSent,
    profileUrl,
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const { buyers } = req.body || {};
  if (!Array.isArray(buyers) || buyers.length === 0) {
    return res.status(400).json({ error: 'buyers must be a non-empty array' });
  }
  if (buyers.length > 200) {
    return res.status(400).json({ error: 'Max 200 buyers per request' });
  }

  const results = [];
  for (const buyer of buyers) {
    try {
      const result = await enrollOne(buyer);
      results.push(result);
    } catch (e) {
      console.error(`[enroll-eventbrite] failed for ${buyer.email}:`, e.message);
      results.push({ email: buyer.email, status: 'error', reason: e.message });
    }
  }

  const enrolled = results.filter(r => r.status === 'enrolled').length;
  const existing = results.filter(r => r.status === 'existing_user').length;
  const errors   = results.filter(r => r.status === 'error').length;

  return res.status(200).json({ results, summary: { enrolled, existing, errors, total: results.length } });
};
