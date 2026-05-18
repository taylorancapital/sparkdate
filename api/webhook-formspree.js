// api/webhook-formspree.js
// CommonJS version — works with Vercel serverless
// Receives Formspree submissions → stores in Firestore → sends Welcome email via Resend

const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp } = require('firebase/firestore');
const { Resend } = require('resend');

// Init Firebase (only once)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "sparkdate-philly.firebaseapp.com",
  projectId: "sparkdate-philly",
  storageBucket: "sparkdate-philly.firebasestorage.app",
  messagingSenderId: "330206052938",
  appId: "1:330206052938:web:18762191153f4037b75cb3"
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp);
const resend = new Resend(process.env.RESEND_API_KEY);

// Welcome email HTML
const welcomeEmailHtml = (firstName) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f3f0; margin: 0; padding: 0; color: #0a0e27; }
  .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background: #0a0e27; padding: 40px 30px; text-align: center; }
  .logo { font-family: Georgia, serif; font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: -1px; }
  .logo span { color: #ff6b6b; }
  .content { padding: 40px 30px; }
  h1 { font-family: Georgia, serif; font-size: 28px; color: #0a0e27; margin: 0 0 20px; font-weight: 900; }
  p { font-size: 16px; line-height: 1.7; color: #1a1f3a; margin: 0 0 18px; }
  .highlight { color: #ff6b6b; font-weight: 600; }
  .button { display: inline-block; background: #ff6b6b; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; margin: 20px 0; }
  .footer { background: #0a0e27; padding: 30px; text-align: center; color: #888; font-size: 12px; }
  .footer a { color: #ff6b6b; text-decoration: none; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Spark<span>Date</span></div>
    </div>
    <div class="content">
      <h1>Welcome to SparkDate, ${firstName}.</h1>
      <p>You just did something most people won't — you stopped swiping and started showing up.</p>
      <p>Here's what happens next:</p>
      <p>
        <strong>1. We curate.</strong> Our team reviews every member to keep events high-quality.<br>
        <strong>2. We invite.</strong> You'll get your first event invitation within 7 days.<br>
        <strong>3. You show up.</strong> No swiping. No pen pals. Real people, real conversations.
      </p>
      <p>Your first event is coming up soon. Keep an eye on your inbox.</p>
      <p>See you soon,<br>
      <span class="highlight">The SparkDate Team</span></p>
    </div>
    <div class="footer">
      <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
      <p><a href="https://sparkdate.date">sparkdate.date</a></p>
    </div>
  </div>
</body>
</html>
`;

module.exports = async function handler(req, res) {
  // Allow POST only
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Formspree sends data in req.body
    // Handle both direct POST and Formspree webhook payload formats
    const body = req.body || {};
    const name  = body.name  || body.data?.name  || '';
    const email = body.email || body.data?.email || '';
    const phone = body.phone || body.data?.phone || '';

    console.log('📥 Webhook received:', { name, email, phone });

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const firstName = name ? name.split(' ')[0] : 'there';

    // 1. Store lead in Firestore
    const docRef = await addDoc(collection(db, 'leads'), {
      name:           name,
      email:          email,
      phone:          phone || null,
      source:         'founding_form',
      createdAt:      serverTimestamp(),
      welcome_sent:   false,
      welcome_sent_at: null,
      day2_sent:      false,
      day2_sent_at:   null,
      day5_sent:      false,
      day5_sent_at:   null,
      day14_sent:     false,
      day14_sent_at:  null,
      day25_sent:     false,
      day25_sent_at:  null,
      subscribed:     true
    });

    console.log('✅ Lead stored in Firestore:', docRef.id);

    // 2. Send Welcome email via Resend
    const emailResult = await resend.emails.send({
      from:    'SparkDate <hello@mail.sparkdate.date>',
      to:      email,
      subject: "You're in. Welcome to SparkDate.",
      html:    welcomeEmailHtml(firstName)
    });

    console.log('📧 Resend result:', JSON.stringify(emailResult));

    if (emailResult.error) {
      console.error('❌ Resend error:', emailResult.error);
      // Still return success — lead is stored even if email fails
      return res.status(200).json({
        success: true,
        lead_id: docRef.id,
        email_sent: false,
        email_error: emailResult.error.message
      });
    }

    // 3. Update Firestore — mark welcome email sent
    await updateDoc(doc(db, 'leads', docRef.id), {
      welcome_sent:    true,
      welcome_sent_at: new Date().toISOString(),
      resend_id:       emailResult.data?.id || null
    });

    console.log('✅ Welcome email sent to:', email);

    return res.status(200).json({
      success:    true,
      lead_id:    docRef.id,
      email_sent: true,
      message_id: emailResult.data?.id
    });

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    return res.status(500).json({
      error:   'Webhook failed',
      details: error.message
    });
  }
};
