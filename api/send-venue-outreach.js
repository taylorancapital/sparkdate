// api/send-venue-outreach.js
// Sends outreach emails to venues and tracks status

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
.header{background:#0a0e27;padding:30px;text-align:center;color:#fff}
.logo{font-family:Georgia,serif;font-size:28px;font-weight:900}
.logo span{color:#ff6b6b}
.content{padding:40px 30px;color:#0a0e27}
h1{font-family:Georgia,serif;font-size:24px;margin:0 0 20px}
p{font-size:15px;line-height:1.7;margin:0 0 16px;color:#1a1f3a}
.highlight{color:#ff6b6b;font-weight:600}
.button{display:inline-block;background:#ff6b6b;color:#fff !important;padding:12px 28px;text-decoration:none;border-radius:4px;font-weight:700;font-size:13px}
.proposal{background:#f5f3f0;padding:20px;border-left:3px solid #ff6b6b;margin:20px 0}
.footer{background:#0a0e27;color:#888;padding:30px;text-align:center;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body>
<div class="container">
  <div class="header">
    <div class="logo">Spark<span>Date</span></div>
    <p style="margin:10px 0 0;font-size:14px">Premium IRL Singles Events</p>
  </div>
  <div class="content">
    <h1>Host a SparkDate Event at ${venueName}</h1>
    <p>Hi ${contactName},</p>
    <p>We're Taylor Chambers, founder of SparkDate — a new IRL dating platform launching in Philadelphia. We're looking for premium venues to host curated singles mixers, and ${venueName} is exactly the vibe we're building around.</p>
    <div class="proposal">
      <strong>What we do:</strong><br>
      • Pre-screened singles (25-35 per event)<br>
      • Revenue share: 40% to venue or $500+ minimum guarantee<br>
      • Professional hostess + structured introductions<br>
      • High-engagement members who actually show up<br>
      • Recurring monthly bookings
    </div>
    <p><span class="highlight">Why ${venueName}?</span> Your space is perfect for creating that moment where singles feel welcome, not pressured. It's elegant enough to feel special, comfortable enough to be real.</p>
    <p>We're starting with a founding cohort event in early June, then running monthly after that. This is how we're getting members off the app and into real venues — venues like yours.</p>
    <p style="text-align:center;margin:30px 0">
      <a href="https://sparkdate.date" class="button">Learn More</a>
    </p>
    <p>Are you interested in hosting? I'd love to grab a coffee and talk through details — no pressure, just a conversation about whether this makes sense for you.</p>
    <p>Reply to this email or call (215) 555-0123.</p>
    <p>Thanks,<br><span class="highlight">Taylor Chambers</span><br>Founder, SparkDate</p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
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
    // Get venue details
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

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: 'Taylor Chambers <taylor@sparkdate.date>',
      to: contactEmail,
      subject: `Host a SparkDate Event at ${venue.name}`,
      html: venueOutreachHTML(venue.name, contactName)
    });

    if (emailResult.error) {
      return res.status(500).json({ error: emailResult.error.message });
    }

    // Update venue status in Firestore
    await db.collection('venues').doc(venue_id).update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
      resend_message_id: emailResult.data?.id || null
    });

    console.log(`✅ Outreach sent and tracked for ${venue.name}`);

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
