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

const db = admin.firestore();

// Hash email for logging — lets us correlate a lead in logs without storing PII.
const crypto = require('crypto');
const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').toLowerCase()).digest('hex').slice(0, 12);

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
const ALLOWED_SOURCES = new Set(['founding_form', 'newsletter', 'referral']);

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  console.log('🔔 lead-capture hit:', new Date().toISOString(), 'method=', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
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
    // public endpoint. (Bombing with many DISTINCT addresses still needs
    // rate limiting — tracked separately.)
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

    const emailResult = await resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>',
      to: email,
      subject: "You're in. Welcome to SparkDate.",
      headers: {
        // RFC 8058 one-click unsubscribe. Required by Gmail and a strong
        // deliverability signal for everyone else.
        'List-Unsubscribe':      `<${unsubUrl}>, <mailto:hello@sparkdate.date?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:28px;color:#0a0e27;margin:0 0 20px;font-weight:900}
p{font-size:16px;line-height:1.7;color:#1a1f3a;margin:0 0 18px}
.highlight{color:#ff6b6b;font-weight:600}
.footer{background:#0a0e27;padding:30px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>Welcome to SparkDate, ${safeFirstName}.</h1>
    <p>You just did something most people won't — you stopped swiping and started showing up.</p>
    <p>Here's what happens next:</p>
    <p><strong>1. We curate.</strong> Our team reviews every member to keep events high-quality.<br>
       <strong>2. We invite.</strong> You'll get your first event invitation within 7 days.<br>
       <strong>3. You show up.</strong> No swiping. No pen pals. Real people, real conversations.</p>
    <p>See you soon,<br><span class="highlight">The SparkDate Team</span></p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a> · <a href="${unsubUrl}">Unsubscribe</a></p>
  </div>
</div></body></html>`
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
