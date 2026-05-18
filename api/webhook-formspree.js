// api/webhook-formspree.js
// SYNCHRONOUS — awaits all operations before responding
// Previous version used fire-and-forget which Vercel kills after res.send()

const admin = require('firebase-admin');
const { Resend } = require('resend');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   'sparkdate-philly',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

// Hash email for logging — lets us correlate a lead in logs without storing PII.
const crypto = require('crypto');
const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').toLowerCase()).digest('hex').slice(0, 12);

module.exports = async function handler(req, res) {
  console.log('🔔 WEBHOOK HIT:', new Date().toISOString(), 'method=', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { name, email, phone } = req.body || {};
    // Log only non-PII: presence flags and a one-way email hash for correlation.
    console.log('📥 Parsed:', {
      hasName: !!name,
      emailHash: hashEmail(email),
      hasPhone: !!phone,
    });

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const firstName = name ? name.split(' ')[0] : 'there';

    // 1. Save to Firestore (AWAIT)
    const docRef = await db.collection('leads').add({
      name: name || '',
      email,
      phone: phone || '',
      source: 'founding_form',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      welcome_sent: false,
      subscribed: true
    });
    console.log('✅ Firestore lead saved:', docRef.id);

    // 2. Send email via Resend (AWAIT — this is the key fix)
    console.log('📨 Calling Resend API...');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailResult = await resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>',
      to: email,
      subject: "You're in. Welcome to SparkDate.",
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
    <h1>Welcome to SparkDate, ${firstName}.</h1>
    <p>You just did something most people won't — you stopped swiping and started showing up.</p>
    <p>Here's what happens next:</p>
    <p><strong>1. We curate.</strong> Our team reviews every member to keep events high-quality.<br>
       <strong>2. We invite.</strong> You'll get your first event invitation within 7 days.<br>
       <strong>3. You show up.</strong> No swiping. No pen pals. Real people, real conversations.</p>
    <p>See you soon,<br><span class="highlight">The SparkDate Team</span></p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
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
      error: emailResult.error?.message || null
    });

  } catch (err) {
    console.error('❌ FATAL:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
