// api/unsubscribe.js
//
// CAN-SPAM compliant unsubscribe endpoint.
//
// Entry points:
//   GET  /api/unsubscribe?token=<hmac-token>         → human one-click flow
//                                                     returns plain HTML page
//   POST /api/unsubscribe  (List-Unsubscribe=One-Click)
//        body: token=<hmac-token>                    → RFC 8058 mail-client flow
//                                                     returns 200 with no body
//
// Signing + verification live in lib/unsubscribe.js — see that file for
// the token format. The endpoint is intentionally public (no auth header
// because it has to be clickable from inside an email body); tampering
// fails the HMAC check.

const { admin } = require('../lib/auth');
const { parseToken, verifySignature } = require('../lib/unsubscribe');

const db = admin.firestore();

// HTML-escape — the success page interpolates a (masked) email derived
// from the lead's stored address, which one of the public signup forms set.
// The unsubscribe token is HMAC-gated so this isn't practically
// reachable, but escaping it is correct defense-in-depth.
function esc(s) {
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner and drops this file from deploys.
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

async function unsubscribeLead(leadId, sig) {
  const ref = db.collection('leads').doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: 'not_found' };

  const data = snap.data();
  if (!verifySignature(leadId, data.email, sig)) {
    return { ok: false, reason: 'invalid' };
  }

  const patch = {
    subscribed: false,
    unsubscribed_at: new Date().toISOString(),
  };

  // Suppress EVERY lead doc that shares this address, not just the one whose
  // token was clicked. If a duplicate lead row exists for the same email (the
  // signup/purchase paths dedupe by email, but nothing enforces uniqueness),
  // flipping only the clicked doc leaves the other subscribed:true — and the
  // marketing cron queries `subscribed == true`, so that duplicate keeps
  // sending after the person unsubscribed. Query by the exact stored email so
  // the token holder can only ever unsubscribe their own address.
  const email = data.email || '';
  if (email) {
    const dupSnap = await db.collection('leads').where('email', '==', email).get();
    if (!dupSnap.empty) {
      const batch = db.batch();
      dupSnap.docs.forEach((d) => batch.update(d.ref, patch));
      await batch.commit();
      return { ok: true, email, flipped: dupSnap.size };
    }
  }

  // No email to dedupe on — flip just the verified doc.
  await ref.update(patch);
  return { ok: true, email: data.email, flipped: 1 };
}

const SUCCESS_HTML = (emailHint) => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Unsubscribed · SparkDate</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e27;color:#f5f3f0;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:480px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.2);border-radius:6px;padding:40px 36px;text-align:center}
h1{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;color:#ff6b6b}
p{line-height:1.6;margin:0 0 12px;color:rgba(245,243,240,0.85);font-size:15px}
.hint{font-size:13px;color:rgba(245,243,240,0.6);margin-top:18px}
a{color:#ff6b6b;text-decoration:none}
</style></head><body>
<div class="box">
  <h1>You're unsubscribed.</h1>
  <p>We won't send you any more marketing emails.</p>
  ${emailHint ? `<p class="hint">Removed: <strong>${emailHint}</strong></p>` : ''}
  <p class="hint">Changed your mind? Reply to any previous email or sign up again at <a href="https://sparkdate.date">sparkdate.date</a>.</p>
</div>
</body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Unsubscribe link invalid · SparkDate</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e27;color:#f5f3f0;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
.box{max-width:480px;background:rgba(231,76,60,0.06);border:1px solid rgba(231,76,60,0.25);border-radius:6px;padding:40px 36px;text-align:center}
h1{font-family:Georgia,serif;font-size:28px;margin:0 0 12px;color:#e74c3c}
p{line-height:1.6;margin:0 0 12px;color:rgba(245,243,240,0.85);font-size:15px}
a{color:#ff6b6b;text-decoration:none}
</style></head><body>
<div class="box">
  <h1>That link looks invalid.</h1>
  <p>It may have been copied incorrectly, expired, or already been used.</p>
  <p style="font-size:13px;color:rgba(245,243,240,0.6);">To unsubscribe manually, reply to any SparkDate email and we'll remove you within 24 hours.<br>Or email <a href="mailto:hello@sparkdate.date">hello@sparkdate.date</a>.</p>
</div>
</body></html>`;

module.exports = async function handler(req, res) {
  // RFC 8058 List-Unsubscribe=One-Click POST: client sends form-encoded body.
  // Modern mail clients prefer this over the GET link.
  let token;
  if (req.method === 'POST') {
    const body = req.body || {};
    token = body.token
      || (typeof body === 'string' ? new URLSearchParams(body).get('token') : null);
  } else if (req.method === 'GET') {
    token = req.query?.token;
  } else {
    return res.status(405).end();
  }

  const parsed = parseToken(token);
  if (!parsed) {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(ERROR_HTML);
    }
    return res.status(400).json({ error: 'invalid token' });
  }

  try {
    const result = await unsubscribeLead(parsed.leadId, parsed.sig);
    if (!result.ok) {
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).send(ERROR_HTML);
      }
      return res.status(400).json({ error: result.reason });
    }
    // Mask email for the landing page: show first char + domain.
    const e = result.email || '';
    const maskedEmail = e && e.includes('@')
      ? esc(e[0] + '***@' + e.split('@')[1])
      : '';
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(SUCCESS_HTML(maskedEmail));
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[unsubscribe] error:', err.message);
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(ERROR_HTML);
    }
    return res.status(500).json({ error: 'unexpected error' });
  }
};
