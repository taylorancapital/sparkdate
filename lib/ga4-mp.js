// lib/ga4-mp.js
//
// Server-side GA4 `purchase` via the Measurement Protocol.
//
// GA4's purchase event was fired ONLY from the buyer's browser (lp.html,
// event.html, events.html). Meta has had a second, server-side copy from the
// Stripe webhook (lib/meta-capi.js) since the in-app-browser work; GA4 had
// none. On 2026-09-08 two real Stripe sales completed and neither buyer's
// browser delivered a GA4 hit, so GA4 recorded zero transactions for the day,
// the nightly read that as "the checkout is broken", and it took Firestore,
// Vercel logs and Meta's own receipts to prove otherwise
// (reports/GA4_ANALYSIS_2026-09-11.md, CORRECTION). This sends the same
// purchase from the moment we KNOW it is true -- Stripe's
// payment_intent.succeeded -- immune to whatever the browser did.
//
// Dedupe with the browser copy: both carry the Stripe PaymentIntent id as
// `transaction_id`, and when the buyer's `_ga` cookie was captured at
// checkout this copy also carries the same `client_id`, so GA4 collapses the
// two into one transaction. When no cookie was captured (the browser never
// ran the tag, which is exactly the case this exists for) there is no browser
// copy to collide with; the client_id is then derived from the transaction id
// so a retry maps to the same pseudo-user rather than minting a new one.
//
// Every call is fail-soft: an error or timeout is logged and swallowed, never
// thrown. A GA4 hiccup must never 500 the Stripe webhook.
//
// Needs GA4_MP_API_SECRET (GA4 Admin -> Data streams -> the web stream ->
// Measurement Protocol API secrets). Until it is set every call logs a skip
// and nothing changes.

const crypto = require('crypto');

const DEFAULT_MEASUREMENT_ID = 'G-21YLCC35F1';
const TIMEOUT_MS = 5000;

// `_ga` is "GA1.1.<random>.<first-visit-ts>"; the client id GA4 uses is the
// last two dotted segments. Anything else (a UA-era "GA1.2." cookie has the
// same tail; garbage does not) returns null and the caller falls back.
function parseGaClientId(ga) {
  const m = String(ga || '').match(/(\d+\.\d+)$/);
  return m ? m[1] : null;
}

// `_ga_<CONTAINER>` carries the session id as its third field. Two formats
// are live: "GS1.1.<session>.<n>.<engaged>.<ts>.0.0.0" and, since 2025,
// "GS2.1.s<session>$o<n>$g<engaged>$t<ts>$j0$l0$h0". Both put the session id
// first after the "GSx.y." prefix; GS2 prefixes it with a literal "s".
function parseGaSessionId(gas) {
  const m = String(gas || '').match(/^GS\d+\.\d+\.s?(\d+)/);
  return m ? m[1] : null;
}

function parseGaCookies({ ga, gas } = {}) {
  return { clientId: parseGaClientId(ga), sessionId: parseGaSessionId(gas) };
}

// A stable numeric-dotted client id for a purchase whose browser never gave
// us one. Deterministic per transaction so a webhook redelivery (already
// deduped upstream, but belt and braces) or a manual replay lands on the
// same pseudo-user instead of inflating user counts.
function derivedClientId(transactionId) {
  const h = crypto.createHash('sha256').update(String(transactionId)).digest();
  return `${h.readUInt32BE(0)}.${h.readUInt32BE(4)}`;
}

/**
 * Send one `purchase` event to GA4. Never throws.
 *
 * `transactionId` MUST be the same value the browser copy passes as
 * `transaction_id` (the Stripe PaymentIntent id) -- that shared id is what
 * lets GA4 count one transaction when both copies arrive.
 *
 * `validate: true` posts to the debug endpoint, which records nothing and
 * answers with `validationMessages`; scripts/ga4-mp-validate.js uses it.
 */
async function sendGa4Purchase({
  transactionId, value, currency, items,
  clientId, sessionId, userId, timestampMicros, validate,
} = {}) {
  const apiSecret = process.env.GA4_MP_API_SECRET;
  const measurementId = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
  if (!apiSecret) {
    console.log(`[ga4-mp] no GA4_MP_API_SECRET set — skipping purchase ${transactionId || '(no id)'}`);
    return { ok: false, skipped: true };
  }
  if (!transactionId) {
    console.error('[ga4-mp] sendGa4Purchase called without transactionId — skipping');
    return { ok: false, error: 'missing transactionId' };
  }
  const numValue = Number(value);
  if (!isFinite(numValue) || numValue < 0) {
    console.error(`[ga4-mp] purchase ${transactionId} has no usable value (${value}) — skipping`);
    return { ok: false, error: 'invalid value' };
  }

  // Accepts either the parsed "<random>.<ts>" id or a raw _ga cookie value.
  const cid = parseGaClientId(clientId);
  const params = {
    transaction_id: String(transactionId),
    value: numValue,
    currency: String(currency || 'USD').toUpperCase(),
    ...(Array.isArray(items) && items.length ? { items } : {}),
    // GA4 only attributes an event to a session -- and so to a source /
    // medium -- when session_id matches the one the browser's tag opened.
    ...(sessionId ? { session_id: String(sessionId) } : {}),
    // Without an engagement time the event is not counted toward active
    // users and stays out of the realtime report. Any positive value works.
    engagement_time_msec: 100,
    // Registered as an event-scoped custom dimension, this splits the
    // server copy from the browser copy in reports. Unregistered it is
    // still visible in the raw export.
    send_path: 'server',
    client_id_source: cid ? 'cookie' : 'derived',
  };

  const body = {
    client_id: cid || derivedClientId(transactionId),
    ...(userId ? { user_id: String(userId) } : {}),
    // Backdate to the charge, not the webhook. GA4 accepts up to 72h.
    ...(timestampMicros ? { timestamp_micros: Math.round(Number(timestampMicros)) } : {}),
    non_personalized_ads: false,
    events: [{ name: 'purchase', params }],
  };

  const host = 'https://www.google-analytics.com';
  const url = `${host}/${validate ? 'debug/' : ''}mp/collect`
    + `?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // The live endpoint answers 2xx with an empty body whether or not the
    // payload made sense -- it never validates. Only the debug endpoint
    // returns anything to read, which is why the validate path exists.
    const text = await res.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
    if (!res.ok) {
      console.error(`[ga4-mp] purchase ${transactionId} failed (${res.status}):`, text.slice(0, 300));
      return { ok: false, error: parsed || text || res.status };
    }
    const messages = parsed && Array.isArray(parsed.validationMessages) ? parsed.validationMessages : [];
    if (validate && messages.length) {
      console.error(`[ga4-mp] purchase ${transactionId} would be REJECTED:`, JSON.stringify(messages));
      return { ok: false, validationMessages: messages, body };
    }
    console.log(`[ga4-mp] purchase ${transactionId} sent (client_id ${params.client_id_source}${sessionId ? ', with session' : ', no session'})`);
    return { ok: true, validationMessages: messages, body };
  } catch (e) {
    console.error(`[ga4-mp] purchase ${transactionId} error:`, e.message);
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendGa4Purchase,
  parseGaCookies,
  parseGaClientId,
  parseGaSessionId,
  derivedClientId,
  DEFAULT_MEASUREMENT_ID,
};
