// api/cron-send-emails.js
// CommonJS version — works with Vercel serverless
// Runs daily at 9 AM ET — sends Day 2, 5, 14, 25 emails to leads

const { initializeApp, getApps } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, updateDoc, doc } = require('firebase/firestore');
const { Resend } = require('resend');

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

// Email subjects and bodies for each day
const emailTemplates = {
  day2: (firstName) => ({
    subject: "How SparkDate actually works (read this)",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #0a0e27; padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: 900; color: #fff;">Spark<span style="color:#ff6b6b">Date</span></div>
        </div>
        <div style="padding: 40px 30px;">
          <h1 style="font-size: 24px; color: #0a0e27;">Hey ${firstName}, here's how this works.</h1>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">SparkDate isn't a dating app. There's no swiping, no inbox, no ghosting.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Here's what we actually do:</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;"><strong>1. We host curated events</strong> at real Philadelphia venues — bars, rooftops, private dining rooms.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;"><strong>2. We match attendees by intent</strong> before the event. You know you're walking into a room where everyone is there for the same reason.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;"><strong>3. The morning after</strong>, we exchange contact info with anyone you both clicked with.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">No missed connections. No "I wish I'd said something." Just real conversations that go somewhere.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Your first event invite is coming soon.<br><span style="color:#ff6b6b; font-weight: 600;">The SparkDate Team</span></p>
        </div>
        <div style="background: #0a0e27; padding: 20px; text-align: center; color: #888; font-size: 12px;">
          SparkDate · Philadelphia · <a href="https://sparkdate.date" style="color: #ff6b6b;">sparkdate.date</a>
        </div>
      </div>
    `
  }),

  day5: (firstName) => ({
    subject: "Your first SparkDate event is here",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #0a0e27; padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: 900; color: #fff;">Spark<span style="color:#ff6b6b">Date</span></div>
        </div>
        <div style="padding: 40px 30px;">
          <h1 style="font-size: 24px; color: #0a0e27;">${firstName}, your first event is coming up.</h1>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">We're hosting our first SparkDate event for founding members — and you're on the list.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">As a founding member, your first two events are <strong>completely free</strong>.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Details coming very soon — venue, date, time. Stay tuned.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Reply to this email with any questions.<br><span style="color:#ff6b6b; font-weight: 600;">The SparkDate Team</span></p>
        </div>
        <div style="background: #0a0e27; padding: 20px; text-align: center; color: #888; font-size: 12px;">
          SparkDate · Philadelphia · <a href="https://sparkdate.date" style="color: #ff6b6b;">sparkdate.date</a>
        </div>
      </div>
    `
  }),

  day14: (firstName) => ({
    subject: "Why we built SparkDate",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #0a0e27; padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: 900; color: #fff;">Spark<span style="color:#ff6b6b">Date</span></div>
        </div>
        <div style="padding: 40px 30px;">
          <h1 style="font-size: 24px; color: #0a0e27;">The honest reason we built this.</h1>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Dating apps are broken. Not because the technology is bad — because the incentive is wrong.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Apps make money when you stay on the app. They don't make money when you meet someone and delete it.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">SparkDate is different. We make money when you show up to events. So our entire incentive is to get you in a room with real people, having real conversations.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">That's the whole thing. No algorithm. No infinite scroll. Just people.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Thanks for being part of this from the start.<br><span style="color:#ff6b6b; font-weight: 600;">The SparkDate Team</span></p>
        </div>
        <div style="background: #0a0e27; padding: 20px; text-align: center; color: #888; font-size: 12px;">
          SparkDate · Philadelphia · <a href="https://sparkdate.date" style="color: #ff6b6b;">sparkdate.date</a>
        </div>
      </div>
    `
  }),

  day25: (firstName) => ({
    subject: "A quick update on your founding membership",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #0a0e27; padding: 30px; text-align: center;">
          <div style="font-size: 28px; font-weight: 900; color: #fff;">Spark<span style="color:#ff6b6b">Date</span></div>
        </div>
        <div style="padding: 40px 30px;">
          <h1 style="font-size: 24px; color: #0a0e27;">${firstName}, a quick update.</h1>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">You signed up as a founding member almost a month ago. We wanted to check in.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">Our first event is almost here. As a founding member you still have <strong>free access to the first two events</strong>.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">If you have any questions or want to talk directly, just reply to this email. We read every response.</p>
          <p style="font-size: 16px; line-height: 1.7; color: #1a1f3a;">See you soon,<br><span style="color:#ff6b6b; font-weight: 600;">The SparkDate Team</span></p>
        </div>
        <div style="background: #0a0e27; padding: 20px; text-align: center; color: #888; font-size: 12px;">
          SparkDate · Philadelphia · <a href="https://sparkdate.date" style="color: #ff6b6b;">sparkdate.date</a>
        </div>
      </div>
    `
  })
};

async function sendScheduledEmails(dayNumber, emailType) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dayNumber);
  cutoff.setHours(0, 0, 0, 0);

  const dayAfter = new Date(cutoff);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const q = query(
    collection(db, 'leads'),
    where(`${emailType}_sent`, '==', false),
    where('subscribed', '==', true)
  );

  const snapshot = await getDocs(q);
  let sent = 0;
  const errors = [];

  for (const leadDoc of snapshot.docs) {
    const lead = leadDoc.data();
    const created = lead.createdAt?.toDate?.() || new Date(lead.createdAt);

    // Only send if lead was created ~dayNumber days ago
    if (created < cutoff || created >= dayAfter) continue;

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const template = emailTemplates[emailType](firstName);

    try {
      const result = await resend.emails.send({
        from:    'SparkDate <hello@mail.sparkdate.date>',
        to:      lead.email,
        subject: template.subject,
        html:    template.html
      });

      if (!result.error) {
        await updateDoc(doc(db, 'leads', leadDoc.id), {
          [`${emailType}_sent`]:    true,
          [`${emailType}_sent_at`]: new Date().toISOString(),
          [`${emailType}_resend_id`]: result.data?.id || null
        });
        sent++;
        console.log(`✅ ${emailType} sent to ${lead.email}`);
      } else {
        errors.push(`${lead.email}: ${result.error.message}`);
      }
    } catch (err) {
      errors.push(`${lead.email}: ${err.message}`);
    }
  }

  return { emailType, sent, errors };
}

module.exports = async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = await Promise.all([
      sendScheduledEmails(2,  'day2'),
      sendScheduledEmails(5,  'day5'),
      sendScheduledEmails(14, 'day14'),
      sendScheduledEmails(25, 'day25')
    ]);

    console.log('✅ Cron complete:', JSON.stringify(results));

    return res.status(200).json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Cron error:', error.message);
    return res.status(500).json({
      error:   'Cron failed',
      details: error.message
    });
  }
};
