// api/cron-send-emails.js
// CommonJS — Vercel Cron (runs daily at 9 AM ET)
// Sends Day 2 / 5 / 14 / 25 emails to leads in Firestore

const { Resend } = require('resend');
const { admin } = require('../lib/auth');
const { makeUnsubscribeUrl } = require('../lib/unsubscribe');

const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Email templates (your actual HTML files) ─────────────────────────────────

const EMAILS = {
  day2: {
    subject: 'How SparkDate actually works (read this)',
    html: (firstName) => `<!DOCTYPE html>
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
  h2 { font-family: Georgia, serif; font-size: 20px; color: #ff6b6b; margin: 30px 0 12px; }
  p { font-size: 16px; line-height: 1.7; color: #1a1f3a; margin: 0 0 18px; }
  .highlight { color: #ff6b6b; font-weight: 600; }
  .step { background: #f5f3f0; padding: 20px; border-left: 3px solid #ff6b6b; margin: 16px 0; }
  .step strong { color: #0a0e27; }
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
      <h1>Here's exactly how it works.</h1>

      <p>${firstName}, we get a lot of "wait, how is this different from Tinder?" questions. So here's the simple version:</p>

      <h2>The 3-step model:</h2>

      <div class="step">
        <strong>1. We host curated events.</strong><br>
        Cocktail nights, dinners, cooking classes, rooftop mixers — all at real Philly venues. Each event has 25-35 people, pre-screened for the right vibe.
      </div>

      <div class="step">
        <strong>2. You attend.</strong><br>
        No swiping, no profiles to optimize. Show up, meet people face-to-face. Our hostess handles the introductions.
      </div>

      <div class="step">
        <strong>3. You connect.</strong><br>
        Vibe with someone? Exchange numbers the old-fashioned way. The app gets you off the app. That's the point.
      </div>

      <h2>What makes SparkDate different:</h2>

      <p>
        ✓ <strong>No swiping.</strong> Algorithms can't measure chemistry.<br>
        ✓ <strong>No ghosting.</strong> You're meeting in person.<br>
        ✓ <strong>No pen-pal phase.</strong> Skip the 3-week message chains.<br>
        ✓ <strong>No bots.</strong> Every member is verified.
      </p>

      <p>Your first event invite is coming. Stay tuned.</p>

      <p>Talk soon,<br>
      <span class="highlight">The SparkDate Team</span></p>
    </div>
    <div class="footer">
      <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
      <p><a href="https://sparkdate.date">sparkdate.date</a> · <a href="__UNSUB__">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
  },
  day5: {
    subject: 'Your first SparkDate event is here',
    html: (firstName) => `<!DOCTYPE html>
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
  .event-card { background: #0a0e27; color: #ffffff; padding: 30px; border-radius: 6px; margin: 24px 0; }
  .event-card h2 { font-family: Georgia, serif; font-size: 24px; color: #ff6b6b; margin: 0 0 12px; }
  .event-card p { color: #f5f3f0; margin: 0 0 10px; font-size: 14px; }
  .event-card .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .button { display: inline-block; background: #ff6b6b; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; }
  .highlight { color: #ff6b6b; font-weight: 600; }
  .urgency { background: #fff3cd; color: #856404; padding: 12px 16px; border-radius: 4px; font-size: 14px; margin: 20px 0; }
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
      <h1>You're invited, ${firstName}.</h1>

      <p>Your first SparkDate event is right around the corner. We've curated the guest list and now we want you in it.</p>

      <div class="event-card">
        <div class="label">Event #1 · Founding Members</div>
        <h2>SparkDate Founders Mixer</h2>
        <p>📅 <strong>Coming Soon — stay tuned</strong></p>
        <p>📍 <strong>Rittenhouse Square, Philadelphia</strong></p>
        <p>👥 <strong>25 people · pre-screened</strong></p>
        <p>💰 <strong>FREE (Founding Members)</strong></p>
      </div>

      <p>Here's what to expect:</p>

      <p>
        ✓ Arrive any time after 7:00 PM<br>
        ✓ Our hostess will greet you, introduce you to people<br>
        ✓ Structured intros and real conversations<br>
        ✓ Leave with a few real connections (or numbers — your call)
      </p>

      <div class="urgency">
        ⏰ <strong>This event has limited capacity.</strong> Founding members get first pick — but spots are filling fast.
      </div>

      <p style="text-align: center;">
        <a href="https://sparkdate.date/events" class="button">Reserve Your Spot</a>
      </p>

      <p>Questions? Just reply to this email — we read every message.</p>

      <p>See you there,<br>
      <span class="highlight">The SparkDate Team</span></p>
    </div>
    <div class="footer">
      <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
      <p><a href="https://sparkdate.date">sparkdate.date</a> · <a href="__UNSUB__">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
  },
  day14: {
    subject: 'Why we built SparkDate',
    html: (firstName) => `<!DOCTYPE html>
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
  .stat { font-family: Georgia, serif; font-size: 42px; color: #ff6b6b; font-weight: 900; line-height: 1; }
  .stat-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .stats-grid { display: table; width: 100%; margin: 30px 0; }
  .stat-cell { display: table-cell; text-align: center; padding: 0 10px; }
  .pullquote { font-family: Georgia, serif; font-size: 22px; line-height: 1.5; color: #0a0e27; border-left: 4px solid #ff6b6b; padding: 12px 24px; margin: 30px 0; font-style: italic; }
  .highlight { color: #ff6b6b; font-weight: 600; }
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
      <h1>Why we built this.</h1>

      <p>${firstName}, I want to tell you something that took me a while to admit:</p>

      <p>Dating apps are designed to fail you.</p>

      <p>Not in a malicious way — but the business model literally depends on it. The longer you stay single and swiping, the more revenue they make. The system is rigged.</p>

      <div class="stats-grid">
        <div class="stat-cell">
          <div class="stat">78%</div>
          <div class="stat-label">Report burnout</div>
        </div>
        <div class="stat-cell">
          <div class="stat">72%</div>
          <div class="stat-label">Want IRL</div>
        </div>
        <div class="stat-cell">
          <div class="stat">38%</div>
          <div class="stat-label">Show depression symptoms</div>
        </div>
      </div>

      <p>Those numbers come from <em>actual</em> studies — Forbes Health, Bumble's own reports, peer-reviewed research. They're not exaggerations.</p>

      <div class="pullquote">
        "I don't want to just be chatting people online. I don't want a pen pal."
        <div style="font-size: 13px; font-style: normal; color: #666; margin-top: 8px;">— Gen Z user, Fortune Magazine, 2025</div>
      </div>

      <p>So we built something different. <span class="highlight">SparkDate is the app that gets you off the app.</span></p>

      <p>You're not a metric. You're not a daily-active-user. You're a person looking for connection. And we believe connection happens in real life — over a glass of wine, on a rooftop at sunset, in a room full of people who chose to show up.</p>

      <p>You're in the founding cohort. You're helping us prove this works. Thank you.</p>

      <p>— <span class="highlight">Taylor Chambers</span><br>
      Founder, SparkDate</p>
    </div>
    <div class="footer">
      <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
      <p><a href="https://sparkdate.date">sparkdate.date</a> · <a href="__UNSUB__">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
  },
  day25: {
    subject: 'Your trial ends in 5 days — what happens next',
    html: (firstName) => `<!DOCTYPE html>
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
  .countdown { background: linear-gradient(135deg, #ff6b6b, #ff5252); color: #ffffff; padding: 30px; text-align: center; border-radius: 6px; margin: 24px 0; }
  .countdown .days { font-family: Georgia, serif; font-size: 56px; font-weight: 900; line-height: 1; }
  .countdown .label { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin-top: 8px; opacity: 0.9; }
  .tier-comparison { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .tier-comparison td { padding: 14px; border-bottom: 1px solid #e8e4df; font-size: 14px; }
  .tier-comparison .name { font-weight: 700; color: #0a0e27; }
  .tier-comparison .price { color: #ff6b6b; font-weight: 700; }
  .button { display: inline-block; background: #ff6b6b; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; margin: 8px; }
  .button-secondary { background: transparent; color: #0a0e27 !important; border: 2px solid #0a0e27; }
  .highlight { color: #ff6b6b; font-weight: 600; }
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
      <h1>5 days left, ${firstName}.</h1>

      <p>Your free Spark trial is ending soon. Here's what you need to know:</p>

      <div class="countdown">
        <div class="days">5</div>
        <div class="label">Days until 30 days from signup</div>
      </div>

      <p>On <strong>30 days from signup</strong>, your card will be charged <span class="highlight">$9.99/month</span> for the Spark tier — unless you change plans or cancel.</p>

      <p>Want more events? Here are your options:</p>

      <table class="tier-comparison">
        <tr>
          <td class="name">Spark<br><span style="font-size: 12px; color: #666; font-weight: normal;">1 event/month · Basic matching</span></td>
          <td class="price">$9.99/mo</td>
          <td style="text-align: right;"><span style="color: #888; font-size: 12px;">Current plan</span></td>
        </tr>
        <tr>
          <td class="name">Kindling<br><span style="font-size: 12px; color: #666; font-weight: normal;">3 events/month · Advanced matching · Priority access</span></td>
          <td class="price">$19.99/mo</td>
          <td style="text-align: right;"><a href="https://sparkdate.date/account?tier=mid" style="color: #ff6b6b; font-size: 12px;">Upgrade →</a></td>
        </tr>
        <tr>
          <td class="name">Fire<br><span style="font-size: 12px; color: #666; font-weight: normal;">Unlimited events · VIP matching · Exclusive gatherings</span></td>
          <td class="price">$39.99/mo</td>
          <td style="text-align: right;"><a href="https://sparkdate.date/account?tier=premium" style="color: #ff6b6b; font-size: 12px;">Upgrade →</a></td>
        </tr>
      </table>

      <p style="text-align: center; margin-top: 30px;">
        <a href="https://sparkdate.date/account" class="button">Manage Subscription</a>
      </p>

      <p>Loving SparkDate so far? Reply and let us know — we read every message. Not loving it? Reply anyway. We want to make this better.</p>

      <p>Thanks for being a founding member,<br>
      <span class="highlight">The SparkDate Team</span></p>
    </div>
    <div class="footer">
      <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
      <p><a href="https://sparkdate.date">sparkdate.date</a> · <a href="__UNSUB__">Unsubscribe</a> · <a href="https://sparkdate.date/account">Manage subscription</a></p>
    </div>
  </div>
</body>
</html>`
  }
};

// ── Send emails for one day bucket ───────────────────────────────────────────
async function sendBucket(dayNum, emailKey) {
  const now     = new Date();
  const cutoff  = new Date(now); cutoff.setDate(cutoff.getDate() - dayNum);
  const cutoff1 = new Date(now); cutoff1.setDate(cutoff1.getDate() - (dayNum + 1));

  const snap = await db.collection('leads')
    .where(`${emailKey}_sent`, '==', false)
    .where('subscribed', '==', true)
    .get();

  let sent = 0;
  const errors = [];

  for (const leadDoc of snap.docs) {
    const lead    = leadDoc.data();
    const created = lead.createdAt?.toDate ? lead.createdAt.toDate() : new Date(lead.createdAt);

    // Only process leads created ~dayNum days ago
    if (created > cutoff || created < cutoff1) continue;

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const tmpl      = EMAILS[emailKey];
    const unsubUrl  = makeUnsubscribeUrl(leadDoc.id, lead.email);

    try {
      const result = await resend.emails.send({
        from:    'SparkDate <hello@mail.sparkdate.date>',
        to:      lead.email,
        subject: tmpl.subject,
        // Per-lead unsubscribe URL is interpolated AFTER template render —
        // each Resend send gets its own signed token so a recipient can
        // unsubscribe themselves but can't unsubscribe anyone else.
        html:    tmpl.html(firstName).replace(/__UNSUB__/g, unsubUrl),
        // RFC 8058: gives Gmail / iOS Mail / Outlook a native one-click
        // unsubscribe button at the top of the message. Required by Gmail
        // for senders over 5k/day, and a strong deliverability signal at
        // any volume.
        headers: {
          'List-Unsubscribe':      `<${unsubUrl}>, <mailto:hello@sparkdate.date?subject=Unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (!result.error) {
        await db.collection('leads').doc(leadDoc.id).update({
          [`${emailKey}_sent`]:      true,
          [`${emailKey}_sent_at`]:   new Date().toISOString(),
          [`${emailKey}_resend_id`]: result.data?.id || null
        });
        sent++;
        // Log doc id only, not email — avoids PII in Vercel logs.
        console.log(`✅ ${emailKey} → lead/${leadDoc.id}`);
      } else {
        errors.push(`lead/${leadDoc.id}: ${result.error.message}`);
      }
    } catch (e) {
      errors.push(`lead/${leadDoc.id}: ${e.message}`);
    }
  }

  return { emailKey, sent, errors };
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = await Promise.all([
      sendBucket(2,  'day2'),
      sendBucket(5,  'day5'),
      sendBucket(14, 'day14'),
      sendBucket(25, 'day25')
    ]);

    console.log('✅ Cron complete:', JSON.stringify(results));
    return res.status(200).json({ success: true, results, ts: new Date().toISOString() });

  } catch (err) {
    console.error('❌ Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
