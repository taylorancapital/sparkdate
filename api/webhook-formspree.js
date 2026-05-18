// api/webhook-formspree.js
// Receives Formspree submissions, stores in Firestore, sends Welcome email via Resend

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Resend } from 'resend';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "sparkdate-philly.firebaseapp.com",
  projectId: "sparkdate-philly",
  storageBucket: "sparkdate-philly.firebasestorage.app",
  messagingSenderId: "330206052938",
  appId: "1:330206052938:web:18762191153f4037b75cb3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const resend = new Resend(process.env.RESEND_API_KEY);

// Email template (simplified version of 01_welcome.html)
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

      <p>Your first event is coming up soon. Keep an eye on your inbox — and follow us on Instagram for behind-the-scenes:</p>

      <p style="text-align: center;">
        <a href="https://instagram.com/sparkdate" class="button">Follow @sparkdate</a>
      </p>

      <p>One last thing: dating apps have trained us to wait for likes, swipes, and validation. SparkDate is different. You don't need permission to show up. You're already in.</p>

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

export default async function handler(req, res) {
  // Only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    // Extract first name
    const firstName = name.split(' ')[0];

    // 1. Store in Firestore
    const leadsCollection = collection(db, 'leads');
    const docRef = await addDoc(leadsCollection, {
      name: name,
      email: email,
      phone: phone || null,
      createdAt: serverTimestamp(),
      // Email tracking fields
      welcome_sent: false,
      welcome_sent_at: null,
      day2_sent: false,
      day2_sent_at: null,
      day5_sent: false,
      day5_sent_at: null,
      day14_sent: false,
      day14_sent_at: null,
      day25_sent: false,
      day25_sent_at: null,
      // Engagement
      email_opened: false,
      email_clicked: false,
      subscribed: true
    });

    console.log(`✅ Lead created in Firestore: ${docRef.id}`);

    // 2. Send Welcome email via Resend
    const emailResult = await resend.emails.send({
      from: `SparkDate <hello@mail.sparkdate.date>`,
      to: email,
      subject: "You're in. Welcome to SparkDate.",
      html: welcomeEmailHtml(firstName)
    });

    if (!emailResult.data?.id) {
      throw new Error(`Resend failed: ${JSON.stringify(emailResult.error)}`);
    }

    console.log(`✅ Welcome email sent to ${email} via Resend`);

    // 3. Update Firestore with email sent status
    const leadsRef = collection(db, 'leads');
    const docRefUpdate = await addDoc(leadsRef, {
      ...{name, email, phone},
      welcome_sent: true,
      welcome_sent_at: new Date().toISOString(),
      resend_message_id: emailResult.data.id,
      createdAt: serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      lead_id: docRef.id,
      message_id: emailResult.data.id,
      message: `Welcome email sent to ${email}`
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({
      error: 'Failed to process submission',
      details: error.message
    });
  }
}
