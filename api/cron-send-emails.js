// api/cron-send-emails.js
// Runs daily to send scheduled emails to leads

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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

// Email templates
const emailTemplates = {
  day2: (firstName) => ({
    subject: "How SparkDate actually works (read this)",
    html: `<h1>Hey ${firstName},</h1><p>Here's how SparkDate is different from dating apps...</p><p>See you at the event,<br>SparkDate Team</p>`
  }),
  day5: (firstName) => ({
    subject: "Your first SparkDate event is here",
    html: `<h1>${firstName}, your event is next week</h1><p>Here are the details...</p><p>RSVP now,<br>SparkDate Team</p>`
  }),
  day14: (firstName) => ({
    subject: "Why we built SparkDate",
    html: `<h1>The story behind SparkDate</h1><p>Dating apps have a problem...</p><p>We built SparkDate to fix it,<br>SparkDate Team</p>`
  }),
  day25: (firstName) => ({
    subject: "Your trial ends in 5 days — what happens next",
    html: `<h1>${firstName}, your founding membership is ending</h1><p>Here's what you need to know...</p><p>Questions? Reply to this email,<br>SparkDate Team</p>`
  })
};

async function sendEmailsForDayX(dayNumber, emailType) {
  const leadsRef = collection(db, 'leads');
  
  // Calculate cutoff date (e.g., for day 2, look for leads created 2 days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - dayNumber);
  cutoffDate.setHours(0, 0, 0, 0);

  const nextDayDate = new Date(cutoffDate);
  nextDayDate.setDate(nextDayDate.getDate() + 1);

  const q = query(
    leadsRef,
    where('createdAt', '>=', cutoffDate),
    where('createdAt', '<', nextDayDate),
    where(`${emailType}_sent`, '==', false),
    where('subscribed', '==', true)
  );

  const querySnapshot = await getDocs(q);
  let sentCount = 0;
  let errors = [];

  for (const leadDoc of querySnapshot.docs) {
    const lead = leadDoc.data();
    const { name, email } = lead;
    const firstName = name.split(' ')[0];

    try {
      const template = emailTemplates[emailType];
      const { subject, html } = template(firstName);

      const result = await resend.emails.send({
        from: `SparkDate <hello@mail.sparkdate.date>`,
        to: email,
        subject: subject,
        html: html
      });

      if (result.data?.id) {
        // Update Firestore
        await updateDoc(doc(db, 'leads', leadDoc.id), {
          [`${emailType}_sent`]: true,
          [`${emailType}_sent_at`]: new Date().toISOString(),
          [`${emailType}_resend_id`]: result.data.id
        });

        console.log(`✅ ${emailType} sent to ${email}`);
        sentCount++;
      } else {
        errors.push(`${email}: Resend returned no ID`);
      }
    } catch (error) {
      errors.push(`${email}: ${error.message}`);
    }
  }

  return { sentCount, errors, emailType };
}

export default async function handler(req, res) {
  // Verify it's a Vercel Cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = [];

    // Send Day 2 emails
    const day2Result = await sendEmailsForDayX(2, 'day2');
    results.push(day2Result);

    // Send Day 5 emails
    const day5Result = await sendEmailsForDayX(5, 'day5');
    results.push(day5Result);

    // Send Day 14 emails
    const day14Result = await sendEmailsForDayX(14, 'day14');
    results.push(day14Result);

    // Send Day 25 emails
    const day25Result = await sendEmailsForDayX(25, 'day25');
    results.push(day25Result);

    console.log('✅ Cron job completed', results);

    return res.status(200).json({
      success: true,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Cron error:', error);
    return res.status(500).json({
      error: 'Cron job failed',
      details: error.message
    });
  }
}
