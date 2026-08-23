// lib/meta-capi.js
//
// Server-side Meta Conversions API. Client-side fbq() pixel events are
// unreliable for our largest paid-traffic cohort — the Facebook/Instagram
// in-app browser routinely blocks or drops them (storage partitioning, ITP;
// the same environment that breaks Stripe 3DS, see public/lp.html ~line 288).
// Meta Ads reports 0 leads and 0 purchases from paid social while GA4 sees
// both — this sends the same two events server-side, from the moment we
// KNOW they're true (a Firestore lead write, a confirmed Stripe payment),
// immune to whatever the in-app browser does to the client-side pixel.
//
// Every call is fail-soft: a Meta API error or timeout is logged and
// swallowed, never thrown. A CAPI hiccup must never break a signup or a
// Stripe webhook.

const crypto = require('crypto');

// Read lazily (inside sendMetaEvent), not at module load — matches
// lib/unsubscribe.js's pattern, and lets tests set/unset the env var per
// case without needing to reset the module cache.
const DEFAULT_PIXEL_ID = '4390442851170732';
const GRAPH_API_VERSION = 'v21.0';
const TIMEOUT_MS = 5000;

// Meta requires PII identifiers (em, ph, fn, ln, external_id, ...) lowercased,
// trimmed, and SHA-256 hashed before they're sent. client_ip_address and
// client_user_agent are the OPPOSITE — Meta's spec sends those as plaintext,
// and hashing them doesn't error, it just silently breaks IP/UA matching
// (Meta can't hash-compare against its own request metadata). Never hash
// ip/userAgent — only true PII fields go through this.
function hashPii(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return crypto.createHash('sha256').update(v).digest('hex');
}

function buildUserData({ email, phone, ip, userAgent, fbp, fbc, externalId } = {}) {
  const userData = {};
  const emHash = hashPii(email);
  if (emHash) userData.em = [emHash];
  const phDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const phHash = hashPii(phDigits);
  if (phHash) userData.ph = [phHash];

  // A stable per-person id. Hashed, because the browser pixel hashes the same
  // Firebase uid with the same SHA-256 before sending it -- if the two sides
  // disagree on hashing, Meta sees two different people and the match is
  // worse than sending nothing.
  const extHash = hashPii(externalId);
  if (extHash) userData.external_id = [extHash];

  // Meta's OWN cookies: _fbp is the browser id it sets, _fbc encodes the ad
  // click that brought the visitor. Plaintext, never hashed -- they are not
  // PII, they are Meta's identifiers for its own records, and hashing them
  // silently breaks the match exactly the way hashing client_ip_address does.
  //
  // fbp is the single strongest signal available here. Meta's account
  // diagnostics flagged this pixel for low event match quality specifically
  // because it was absent, and the Purchase path has no IP or user agent to
  // fall back on (the webhook runs on Stripe's servers, not the buyer's
  // browser), so before this it was matching on hashed email alone.
  if (fbp) userData.fbp = String(fbp);
  if (fbc) userData.fbc = String(fbc);

  // Plaintext — see the note on hashPii above.
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;
  return userData;
}

/**
 * Fire one event to Meta's Conversions API. Never throws — the return value
 * is the only signal of success; callers that just want fire-and-forget can
 * ignore it entirely.
 *
 * `eventId` MUST be the same value passed as the `eventID` option on the
 * paired client-side `fbq('track', ...)` call (e.g. the Firestore lead doc
 * id, or the Stripe PaymentIntent id) — that shared id is what lets Meta
 * collapse the browser and server copies of one real event instead of
 * double-counting it.
 */
async function sendMetaEvent({ eventName, eventId, eventSourceUrl, userData, customData }) {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  if (!accessToken) {
    console.log(`[meta-capi] no META_CAPI_ACCESS_TOKEN set — skipping ${eventName}`);
    return { ok: false, skipped: true };
  }
  if (!eventName || !eventId) {
    console.error('[meta-capi] sendMetaEvent called without eventName/eventId — skipping');
    return { ok: false, error: 'missing eventName or eventId' };
  }

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(eventId),
      action_source: 'website',
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data: buildUserData(userData),
      ...(customData ? { custom_data: customData } : {}),
    }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[meta-capi] ${eventName} (${eventId}) failed (${res.status}):`, JSON.stringify(body));
      return { ok: false, error: body };
    }
    return { ok: true, response: body };
  } catch (e) {
    console.error(`[meta-capi] ${eventName} (${eventId}) error:`, e.message);
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendMetaEvent, hashPii, buildUserData };
