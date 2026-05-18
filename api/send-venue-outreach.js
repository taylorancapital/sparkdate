// api/send-venue-outreach.js
// Sends personal cold email to venues

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
const resend = new Resend(process.env.RESEND_API_KEY);

const venueOutreachHTML = (venueName, contactName) => `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;background:#fff}
.content{padding:40px 30px;color:#0a0e27;font-size:15px;line-height:1.6}
p{margin:0 0 16px}
.sign-off{margin-top:30px}
.footer{padding:20px 30px;background:#f5f3f0;color:#666;font-size:13px;border-top:1px solid #e8e4df}
a{color:#ff6b6b;text-decoration:none}
</style></head><body>
<div class="container">
  <div class="content">
    <p>Hi ${contactName},</p>
    <p>I'm launching a dating thing in Philly (called SparkDate — stop swiping, start living type vibe) and I looked at like 50 bars in Center City. ${venueName} keeps coming up as the place where people actually *want* to be.</p>
    <p>I'm thinking about hosting a singles mixer here in early June. 25-30 people, pre-screened, actual vibes. You'd make $500-1000 off a few hours, we'd move bodies through, everyone wins.</p>
    <p>Two questions:<br>1. Do you have private space or a section we could use one evening?<br>2. Who's the right person to talk to about this?</p>
    <p>No pressure — just curious if it's something you'd consider.</p>
    <div class="sign-off">
      <p>Taylor<br>(215) 555-0123<br><a href="https://sparkdate.date">sparkdate.date</a></p>
    </div>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
  </div>
</div>
</body></html>`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { venue_id } = req.body || {};

  if (!venue_id) {
    return res.status(400).json({ error: 'venue_id required' });
  }

  try {
    const venueSnap = await db.collection('venues').doc(venue_id).get();
    if (!venueSnap.exists) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    const venue = venueSnap.data();
    const contactName = venue.contact_name || 'there';
    const contactEmail = venue.contact_email;

    if (!contactEmail) {
      return res.status(400).json({ error: 'No contact email on file' });
    }

    console.log(`📧 Sending outreach to ${venue.name} (${contactEmail})`);

    const emailResult = await resend.emails.send({
      from: 'Taylor Chambers <taylor@sparkdate.date>',
      to: contactEmail,
      subject: `Quick question about ${venue.name}`,
      html: venueOutreachHTML(venue.name, contactName)
    });

    if (emailResult.error) {
      return res.status(500).json({ error: emailResult.error.message });
    }

    await db.collection('venues').doc(venue_id).update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
      resend_message_id: emailResult.data?.id || null
    });

    console.log(`✅ Outreach sent to ${venue.name}`);

    return res.status(200).json({
      success: true,
      venue_id,
      venue_name: venue.name,
      email_sent: true,
      message_id: emailResult.data?.id
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
