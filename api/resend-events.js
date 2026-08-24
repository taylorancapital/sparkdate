// api/resend-events.js
//
// Resend webhook receiver: delivery, opens, clicks, bounces and spam
// complaints, written back onto the lead docs that sent the email.
//
// WHY THIS EXISTS
//
// The email tracker could only say "sent". Every send stores its Resend id on
// the lead (`resend_id` for the welcome, `day2_resend_id` … `day25_resend_id`
// for the nurture drip), but nothing ever came back — so a nurture sequence
// whose every email landed in spam looked identical to one being read daily,
// and copy was being tuned blind. This is the first API route added after the
// Vercel Pro upgrade; on Hobby the 12-function cap made it impossible without
// deleting something else (the same cap that pushed sync-ad-spend to GitHub
// Actions).
//
// CONFIG (both must exist before this does anything):
//   1. Resend dashboard → Webhooks → add endpoint
//      https://sparkdate.date/api/resend-events with the email.delivered,
//      email.opened, email.clicked, email.bounced, email.complained events.
//   2. RESEND_WEBHOOK_SECRET in Vercel env = that endpoint's signing secret
//      (starts "whsec_"). Missing secret fails CLOSED with a 500 — an
//      unverified engagement write is worse than none, because opens gate
//      real decisions about copy.
//
// WHAT IS DELIBERATELY NOT MATCHED: newsletter and returning-invite sends
// don't store per-send Resend ids, so their events land here, match no lead
// field, and are logged as unmatched. Storing those ids is the cron's job the
// day per-newsletter engagement matters.

'use strict';

const admin = require('firebase-admin');
const { verifySvix, ID_FIELDS } = require('../lib/resend-webhook');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}



async function findLeadByEmailId(emailId) {
  for (const [field, emailKey] of ID_FIELDS) {
    const snap = await db.collection('leads').where(field, '==', emailId).limit(1).get();
    if (!snap.empty) return { ref: snap.docs[0].ref, lead: snap.docs[0].data(), emailKey };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is unset — refusing unverified events.');
    return res.status(500).json({ error: 'webhook secret not configured' });
  }

  const rawBody = await getRawBody(req);
  const verdict = verifySvix(rawBody, req.headers, secret);
  if (!verdict.ok) {
    console.error(`[resend-webhook] signature rejected: ${verdict.reason}`);
    return res.status(400).json({ error: 'invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }

  // Idempotency via create-lock, the exact shape stripe-webhook.js uses: the
  // svix-id is stable across redeliveries, so the first delivery wins the
  // create and every retry 200s out fast. Opens especially redeliver — a
  // repeated open must not look like new engagement.
  try {
    await db.collection('resend_events').doc(verdict.id).create({
      type: event.type || 'unknown',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message || '')) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error('[resend-webhook] idempotency lock failed:', e.message);
    return res.status(500).json({ error: 'lock failed' });
  }

  const emailId = event.data?.email_id;
  const type = event.type;

  const HANDLED = new Set(['email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained']);
  if (!HANDLED.has(type)) {
    // email.sent is already recorded at send time by the cron; delays are
    // transport noise. Acknowledge so Resend stops retrying.
    return res.status(200).json({ received: true, ignored: type });
  }
  if (!emailId) return res.status(200).json({ received: true, ignored: 'no email_id' });

  const hit = await findLeadByEmailId(emailId);
  if (!hit) {
    // Newsletter / returning-invite / anything that doesn't store its id.
    console.log(`[resend-webhook] ${type} for ${emailId} matches no lead field — unmatched`);
    return res.status(200).json({ received: true, unmatched: true });
  }

  const { ref, lead, emailKey } = hit;
  const now = new Date().toISOString();
  const updates = {};

  if (type === 'email.delivered' && !lead[`${emailKey}_delivered_at`]) {
    updates[`${emailKey}_delivered_at`] = now;
  }
  // First touch only: opens redeliver and refire on every re-read, and the
  // question the tracker answers is "did they engage", not "how many times".
  if (type === 'email.opened' && !lead[`${emailKey}_opened_at`]) {
    updates[`${emailKey}_opened_at`] = now;
  }
  if (type === 'email.clicked' && !lead[`${emailKey}_clicked_at`]) {
    updates[`${emailKey}_clicked_at`] = now;
    // A click IS an open even if the open pixel was blocked (Apple MPP,
    // image-blocking clients) — don't leave clicked-but-never-opened rows.
    if (!lead[`${emailKey}_opened_at`]) updates[`${emailKey}_opened_at`] = now;
  }

  // Bounce and complaint stop future sends, same field shape as
  // api/unsubscribe.js writes (subscribed:false + unsubscribed_at) so the
  // cron's existing subscribed check needs no change. `unsubscribe_reason`
  // distinguishes "asked to stop" from "delivery says stop" in the tracker.
  if (type === 'email.bounced') {
    updates[`${emailKey}_bounced_at`] = now;
    updates.subscribed = false;
    updates.unsubscribed_at = now;
    updates.unsubscribe_reason = 'bounce';
  }
  if (type === 'email.complained') {
    updates[`${emailKey}_complained_at`] = now;
    updates.subscribed = false;
    updates.unsubscribed_at = now;
    updates.unsubscribe_reason = 'complaint';
  }

  if (Object.keys(updates).length) await ref.update(updates);
  console.log(`[resend-webhook] ${type} → lead/${ref.id} (${emailKey})`);
  return res.status(200).json({ received: true });
};

// Signature verification needs the exact bytes Resend signed.
module.exports.config = { api: { bodyParser: false } };
