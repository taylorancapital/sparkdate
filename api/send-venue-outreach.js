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
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner and drops this file from deploys.
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(new RegExp('"', 'g'), '&quot;');
}

// Physical mailing address — required by CAN-SPAM in every commercial
// email, including B2B cold outreach. Defaults to the corporate address
// from the privacy policy; override OUTREACH_POSTAL_ADDRESS in env if
// you need to swap to a P.O. box later.
const OUTREACH_POSTAL_ADDRESS = process.env.OUTREACH_POSTAL_ADDRESS
  || 'Ancapital Group LLC · SparkDate · Philadelphia, PA';

// "Hosting a singles mixer here in early June" was a hardcoded literal month
// — accurate the day it was written, quietly wrong forever after (an admin
// sending this cold-open in November was still promising "early June").
// Computes a live "early/mid/late <Month>" roughly 5 weeks out from send
// time instead, so the pitch always names a plausible near-future date
// without anyone having to remember to edit this file every few months.
function upcomingMonthPhrase(fromDate = new Date()) {
  const target = new Date(fromDate.getTime());
  target.setDate(target.getDate() + 35);
  const part = target.getDate() <= 10 ? 'early' : target.getDate() <= 20 ? 'mid' : 'late';
  return `${part} ${target.toLocaleDateString('en-US', { month: 'long' })}`;
}

const EMAIL_STYLE = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;background:#fff}
.content{padding:40px 30px;color:#0a0e27;font-size:15px;line-height:1.6}
p{margin:0 0 16px}
.sign-off{margin-top:30px}
.footer{padding:20px 30px;background:#f5f3f0;color:#666;font-size:12px;border-top:1px solid #e8e4df;line-height:1.6}
.footer .addr{display:block;margin-top:6px;color:#888}
a{color:#ff6b6b;text-decoration:none}`;

// Shared CAN-SPAM footer (postal address + opt-out) and sign-off, pulled out
// so the first-touch and follow-up templates below can never drift apart on
// the parts that are legally required rather than a copy choice.
function emailShell(footerCity, bodyHtml) {
  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${EMAIL_STYLE}</style></head><body>
<div class="container">
  <div class="content">
    ${bodyHtml}
    <div class="sign-off">
      <p>Taylor${OUTREACH_PHONE ? '<br>' + esc(OUTREACH_PHONE) : ''}<br><a href="https://sparkdate.date">sparkdate.date</a></p>
    </div>
  </div>
  <div class="footer">
    <p>SparkDate · ${footerCity} · Stop swiping. Start living.</p>
    <p style="margin:6px 0 0;font-size:11px;color:#999;">
      This is a one-time business outreach email. Reply "NO" to opt out and you won't hear from us again.
      <span class="addr">${esc(OUTREACH_POSTAL_ADDRESS)}</span>
    </p>
  </div>
</div>
</body></html>`;
}

// The outreach copy is localized to the venue's own city so it doesn't
// read as a mass-blast — a West Chester or Lancaster bar owner getting
// an email about scouting "Center City" would bin it instantly. `city`
// comes from the venue doc; when it's blank we fall back to neutral
// phrasing rather than naming the wrong place.
const venueOutreachHTML = (venueName, contactName, city) => {
  const cityClean   = String(city || '').trim();
  // Body: "...looking at bars around West Chester." / generic if no city.
  const scoutPhrase = cityClean ? `around ${esc(cityClean)}` : 'in the area';
  // Footer brand line: the venue's city, or the company HQ as the default.
  const footerCity  = esc(cityClean || 'Philadelphia');
  return emailShell(footerCity, `
    <p>Hi ${esc(contactName)},</p>
    <p>I'm launching a dating thing (called SparkDate — stop swiping, start living type vibe) and I've been looking at bars ${scoutPhrase}. ${esc(venueName)} keeps coming up as the place where people actually *want* to be.</p>
    <p>I'm thinking about hosting a singles mixer here ${upcomingMonthPhrase()}. 25-30 people, pre-screened, actual vibes. You'd make $500-1000 off a few hours, we'd move bodies through, everyone wins.</p>
    <p>Two questions:<br>1. Do you have private space or a section we could use one evening?<br>2. Who's the right person to talk to about this?</p>
    <p>No pressure — just curious if it's something you'd consider. If you'd rather not hear from us again, just reply with "NO" and I'll take you off the list.</p>
  `);
};

// Follow-up template — for a venue that's already been sent the cold-open
// above at least once (see the outreach_send_count check in the handler).
// Deliberately NOT the same pitch repeated: a bar owner who gets the
// identical "I'm launching a dating thing..." cold-open twice reads it as a
// bot/mail-merge blast, which undercuts the whole "this is a personal
// note" premise the first email leans on. This one acknowledges it's a
// second touch, is shorter, and gives an easy, low-pressure out — the
// pattern real follow-up emails use, not a re-blast of the pitch.
const venueFollowUpHTML = (venueName, contactName, city) => {
  const cityClean   = String(city || '').trim();
  const scoutPhrase = cityClean ? `around ${esc(cityClean)}` : 'in the area';
  const footerCity  = esc(cityClean || 'Philadelphia');
  return emailShell(footerCity, `
    <p>Hi ${esc(contactName)},</p>
    <p>Following up on my note about hosting a SparkDate singles mixer at ${esc(venueName)} — inboxes get busy, so no worries if it got buried.</p>
    <p>Still scouting ${scoutPhrase} for ${upcomingMonthPhrase()}, and ${esc(venueName)} is still my first pick. If you've got a minute, I'd love to know if it's worth exploring or just not a fit right now — either answer's totally fine, I just don't want to keep bugging you if it's a no.</p>
    <p>If you'd rather not hear from us again, just reply "NO" and I'll take you off the list.</p>
  `);
};

// Hash email for non-PII logging.
const crypto = require('crypto');
const hashEmail = (e) => crypto.createHash('sha256').update(String(e || '').toLowerCase()).digest('hex').slice(0, 12);

// Which template a venue gets next: the cold-open if they've never been
// emailed, the follow-up otherwise. Driven by outreach_send_count (already
// incremented on every successful send below) rather than `status`, since
// status can advance past "contacted" (interested/booked) while still only
// reflecting a single send — send count is the direct count of past emails,
// which is what actually determines whether repeating the cold pitch would
// look like a bot. Shared by the preview path and the real send path so a
// preview can never show a different email than clicking Send/Resend
// would actually deliver right now.
function templateFor(venue) {
  const isFollowUp = (venue.outreach_send_count || 0) >= 1;
  const contactName = venue.contact_name || 'there';
  const safeSubjectName = String(venue.name || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
  return {
    isFollowUp,
    subject: isFollowUp ? `Following up: ${safeSubjectName}` : `Quick question about ${safeSubjectName}`,
    html: isFollowUp
      ? venueFollowUpHTML(venue.name, contactName, venue.city)
      : venueOutreachHTML(venue.name, contactName, venue.city),
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin-only.
  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const { venue_id, force, preview } = req.body || {};
  if (!venue_id) return res.status(400).json({ error: 'venue_id required' });

  try {
    const venueRef = db.collection('venues').doc(venue_id);
    const venueSnap = await venueRef.get();
    if (!venueSnap.exists) return res.status(404).json({ error: 'Venue not found' });

    const venue = venueSnap.data();

    // Preview short-circuit: render the email body + headers, return JSON,
    // do NOT call Resend and do NOT mutate the venue doc. Same template
    // path (templateFor) as the real send below, so a preview always shows
    // exactly what clicking Send/Resend would deliver right now — including
    // which of the two templates it'll be. Skips the "already contacted"
    // guard so admins can preview a follow-up before deciding to send it.
    if (preview) {
      const tpl = templateFor(venue);
      return res.status(200).json({
        preview: true,
        venue_id,
        venue_name: venue.name,
        to:      venue.contact_email || null,
        from:    OUTREACH_FROM,
        subject: tpl.subject,
        html:    tpl.html,
        is_follow_up: tpl.isFollowUp,
      });
    }

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

    // Same selection the preview above already showed the admin — resolved
    // fresh here rather than trusting anything from the request body, so
    // there's no way for a client to ask for the cold-open on a venue
    // that's already been emailed.
    const tpl = templateFor(venue);
    console.log(`📧 Outreach to venue/${venue_id} (emailHash=${hashEmail(venue.contact_email)}, ${tpl.isFollowUp ? 'follow-up' : 'first-touch'})`);

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

    // Wrap the Resend call so an SDK throw doesn't bubble up as a
    // generic 502 with an HTML body. We want every failure path to
    // return JSON the admin UI can render.
    let emailResult;
    try {
      emailResult = await resend.emails.send({
        from: OUTREACH_FROM,
        to: venue.contact_email,
        subject: tpl.subject,
        html: tpl.html,
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

    // Only advance status to 'contacted' on the FIRST send. A forced resend
    // to a venue that's already progressed further in the pipeline
    // (interested/booked/event_created) must not clobber that progress back
    // down to 'contacted' — it's a follow-up, not a reset.
    const statusUpdate = (!venue.status || venue.status === 'not_contacted')
      ? { status: 'contacted' }
      : {};

    await venueRef.update({
      ...statusUpdate,
      contacted_at: new Date().toISOString(),
      resend_message_id: emailResult.data?.id || null,
      outreach_send_count: admin.firestore.FieldValue.increment(1),
    });

    console.log(`✅ Outreach sent: venue/${venue_id}`);

    return res.status(200).json({
      success: true,
      venue_id,
      venue_name: venue.name,
      email_sent: true,
      message_id: emailResult.data?.id,
      is_follow_up: tpl.isFollowUp,
    });

  } catch (err) {
    console.error('[send-venue-outreach] error:', err.message);
    return res.status(500).json({ error: 'Could not send outreach. See server logs.' });
  }
};
