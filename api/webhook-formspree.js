// api/webhook-formspree.js
// Simplified webhook — faster, fewer dependencies, better error handling

const admin = require('firebase-admin');
const { Resend } = require('resend');

// Initialize Firebase Admin once
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

module.exports = async function handler(req, res) {
  console.log('🔔 WEBHOOK HIT:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body).substring(0, 200));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { name, email, phone } = req.body || {};

    console.log('📥 Parsed:', { name, email, phone });

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const firstName = name ? name.split(' ')[0] : 'there';

    // Fire-and-forget: start both operations but respond immediately
    // Don't await them — just start them in the background
    
    // 1. Save to Firestore (async, don't wait)
    db.collection('leads').add({
      name: name || '',
      email,
      phone: phone || '',
      source: 'founding_form',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      welcome_sent: false,
      subscribed: true
    }).then(docRef => {
      console.log('✅ Firestore:', docRef.id);
      
      // 2. Send email (only after Firestore succeeds)
      const resend = new Resend(process.env.RESEND_API_KEY);
      return resend.emails.send({
        from: 'SparkDate <hello@mail.sparkdate.date>',
        to: email,
        subject: "You're in. Welcome to SparkDate.",
        html: `<html><body><h1>Welcome, ${firstName}!</h1><p>Stop swiping. Start living.</p></body></html>`
      });
    }).then(result => {
      console.log('📧 Email sent:', result.data?.id || 'unknown');
    }).catch(err => {
      console.error('❌ Background error:', err.message);
    });

    // Respond immediately (don't wait for email)
    return res.status(200).json({
      success: true,
      message: 'Processing...'
    });

  } catch (err) {
    console.error('❌ Sync error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
