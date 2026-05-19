// api/send-venue-outreach.js
// Sends a personal cold outreach email to a venue.
// Admin-only — caller must present a Firebase ID token with the
// `admin: true` custom claim. Refuses to re-send if the venue is
// already in any post-`not_contacted` state (so a double-click in the
// admin UI can't accidentally spam the venue twice).

const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { Resend } = require('resend');

const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// Outreach copy. Phone number is read from env so we never ship a
// placeholder to real venues. Set OUTREACH_PHONE in Vercel.
const OUTREACH_PHONE = process.env.OUTREACH_PHONE || '';
// IMPORTANT: must be a sender on a Resend-verified domain. The verified
// domain for this project is mail.sparkdate.date (same one used by the
// welcome email + 4-touch nurture sequence), so default to a sender on
// that domain. If you want it to read "Taylor" in the inbox, set
// OUTREACH_FROM in Vercel env to e.g. "Taylor Chambers <taylor@mail.sparkdate.date>".
// Sending from an unverified domain (e.g. taylor@sparkdate.date — note
// no `mail.` subdomain) makes Resend reject the message which used to
// surface as a generic 502 to the admin UI.
const OUTREACH_FROM  = process.env.OUTREACH_FROM  || 'SparkDate Outreach <hello@mail.sparkdate.date>';

// HTML-escape strings before they hit the email body. Without this an
// admin who uploads a CSV row with `<script>` in the name field would
// send an email with broken/malicious HTML — and the email also rolls
// `${venue.name}` into the Subject line, where stray < / > / & break
// downstream rendering across mail clients.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Physical mailing address — required by CAN-SPAM in every commercial
// email, including B2B cold outreach. Defaults to the corporate address
// from the privacy policy; override OUTREACH_POSTAL_ADDRESS in env if
// you need to swap to a P.O. box later.
const OUTREACH_POSTAL_ADDRESS = process.env.OUTREACH_POSTAL_ADDRESS
  || 'Ancapital Group LLC · SparkDate · Philadelphia, PA';

const venueOutreachHTML = (venueName, contactName) => `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;background:#fff}
.content{padding:40px 30px;color:#0a0e27;font-size:15px;line-height:1.6}
p{margin:0 0 16px}
.sign-off{margin-top:30px}
.footer{padding:20px 30px;background:#f5f3f0;color:#666;font-size:12px;border-top:1px solid #e8e4df;line-height:1.6}
.footer .addr{display:block;margin-top:6px;color:#888}
a{color:#ff6b6b;text-decoration:none}
</style></head><body>
<div class="container">
  <div class="content">
    <p>Hi ${esc(contactName)},</p>
    <p>I'm launching a dating thing in Philly (called SparkDate — stop swiping, start living type vibe) and I looked at like 50 bars in Center City. ${esc(venueName)} keeps coming up as the place where people actually *want* to be.</p>
    <p>I'm thinking about hosting a singles mixer here in early June. 25-30 people, pre-screened, actual vibes. You'd make $500-1000 off a few hours, we'd move bodies through, everyone wins.</p>
    <p>Two questions:<br>1. Do you have private space or a section we could use one evening?<br>2. Who's the right person to talk to about this?</p>
    <p>No pressure — just curious if it's something you'd consider. If you'd rather not hear from us again, just reply with "NO" and I'll take you off the list.</p>
    <div class="sign-off">
      <p>Taylor${OUTREACH_PHONE ? '<br>' + esc(OUTREACH_PHONE) : ''}<br><a href="https://sparkdate.date">sparkdate.date</a></p>
    </div>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Stop swiping. Start living.</p>
    <p style="margin:6px 0 0;font-size:11px;color:#999;">
      This is a one-time business outreach email. Reply "NO" to opt out and you won't hear from us again.
      <span class="addr">${esc(OUTREACH_POSTAL_ADDRESS)}</span>
    </p>
  </div>
</div>
</body></html>`;

// Hash email for non-PII logging.
const crypto = require('crypto');
const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').toLowerCase()).digest('hex').slice(0, 12);

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin-only.
  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const { venue_id, force } = req.body || {};
  if (!venue_id) return res.status(400).json({ error: 'venue_id required' });

  try {
    const venueRef = db.collection('venues').doc(venue_id);
    const venueSnap = await venueRef.get();
    if (!venueSnap.exists) return res.status(404).json({ error: 'Venue not found' });

    const venue = venueSnap.data();

    // Guard: refuse to re-send unless caller explicitly passes force=true.
    // Prevents accidental spam from double-clicks or stale UI state.
    if (venue.status && venue.status !== 'not_contacted' && !force) {
      return res.status(409).json({
        error: 'Already contacted',
        message: `Venue is in status "${venue.status}". Pass force=true to send anyway.`,
      });
    }

    if (!venue.contact_email) {
      return res.status(400).json({ error: 'No contact email on file' });
    }

    const contactName = venue.contact_name || 'there';
    console.log(`📧 Outreach to venue/${venue_id} (emailHash=${hashEmail(venue.contact_email)})`);

    // Hard precondition: RESEND_API_KEY must be set. The Resend SDK
    // accepts an undefined key at construction but throws on send, which
    // used to bubble up as a generic 502.
    if (!process.env.RESEND_API_KEY) {
      console.error('[send-venue-outreach] RESEND_API_KEY missing in env');
      return res.status(500).json({
        error: 'Email provider not configured',
        message: 'Set RESEND_API_KEY in Vercel env vars.',
      });
    }

    // Strip CR/LF from subject — basic SMTP header-injection defense in
    // case venue.name was uploaded with control chars. Cap length too.
    const safeSubjectName = String(venue.name || '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 120);

    // Wrap the Resend call so an SDK throw doesn't bubble up as a
    // generic 502 with an HTML body. We want every failure path to
    // return JSON the admin UI can render.
    let emailResult;
    try {
      emailResult = await resend.emails.send({
        from: OUTREACH_FROM,
        to: venue.contact_email,
        subject: `Quick question about ${safeSubjectName}`,
        html: venueOutreachHTML(venue.name, contactName),
      });
    } catch (sendErr) {
      console.error('[send-venue-outreach] resend SDK threw:', sendErr.message, sendErr.stack);
      return res.status(502).json({
        error: 'Email provider error',
        message: `Resend threw: ${sendErr.message}. Common cause: OUTREACH_FROM uses a domain that isn't verified at Resend. Verify your sending domain in the Resend dashboard.`,
      });
    }

    if (emailResult.error) {
      const detail = emailResult.error.message || JSON.stringify(emailResult.error);
      console.error('[send-venue-outreach] resend error:', detail);
      // Surface the actual Resend message so admin sees WHY it failed
      // (common ones: "from address is not verified", "Domain not found",
      // "rate limit"). This is admin-only output so it's safe to expose.
      return res.status(502).json({
        error: 'Email provider rejected the message',
        message: detail,
      });
    }

    await venueRef.update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
      resend_message_id: emailResult.data?.id || null,
    });

    console.log(`✅ Outreach sent: venue/${venue_id}`);

    return res.status(200).json({
      success: true,
      venue_id,
      venue_name: venue.name,
      email_sent: true,
      message_id: emailResult.data?.id,
    });

  } catch (err) {
    console.error('[send-venue-outreach] error:', err.message);
    return res.status(500).json({ error: 'Could not send outreach. See server logs.' });
  }
};
