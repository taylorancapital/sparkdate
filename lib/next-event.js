// lib/next-event.js
//
// Shared "next upcoming event" lookup + reusable email building blocks.
// Used by:
//   api/cron-send-emails.js — the day2/5/14/25 nurture emails
//   api/lead-signup.js      — the Day-0 welcome email
// so the "next event" shown in marketing email never drifts from the
// landing-page block (api/next-event.js uses the same selection rule).
//
// All HTML helpers emit fully INLINE styles so they render consistently in
// every email client regardless of the surrounding <style> block.

'use strict';

const { effectivePrice } = require('./seat-model');

// HTML-escape admin-entered values (event title/venue) before inlining.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Normalize a raw Firestore event doc into the shape emails/pages need.
// `date` may be a Firestore Timestamp or an ISO string.
function normalizeEvent(id, e) {
  e = e || {};
  const dt = e.date && e.date.toDate ? e.date.toDate()
           : (e.date ? new Date(e.date) : null);
  const valid = !!(dt && !isNaN(dt.getTime()));

  const dateLabel = valid
    ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';
  const venueLabel = e.venue
    ? `${e.venue}${e.neighborhood ? ', ' + e.neighborhood : ''}`
    : 'Lancaster & Philadelphia';
  // Resolve the price the SAME way the landing page + checkout do, so an
  // email never quotes a different number than the site (effectivePrice
  // honours the early-bird window). Fall back to legacy gender-split fields
  // via ticketPriceDollars inside effectivePrice.
  const ep = effectivePrice(e, 'any');
  const price = Number(ep.price || 0);
  const isEarlyBird = !!ep.isEarlyBird;
  const regularPrice = Number(ep.regularPrice || 0);
  const priceLabel = price <= 0
    ? 'Free'
    : (isEarlyBird && regularPrice > price
        ? `$${price} early bird · then $${regularPrice}`
        : `$${price}`);

  let daysAway = null;
  let daysAwayLabel = '';
  if (valid) {
    daysAway = Math.max(0, Math.ceil((dt.getTime() - Date.now()) / 86400000));
    daysAwayLabel = daysAway === 0 ? 'Today'
      : daysAway === 1 ? 'Tomorrow'
      : `in ${daysAway} days`;
  }

  return {
    id,
    title: e.title || 'SparkDate Mixer',
    dt,
    dateLabel,
    timeLabel: e.time || '',
    venueLabel,
    price,
    priceLabel,
    isEarlyBird,
    regularPrice,
    daysAway,
    daysAwayLabel,
    ticketPath: `/event?id=${encodeURIComponent(id)}`,
  };
}

// The soonest upcoming, not-sold-out event (or null). Mirrors the selection
// in api/next-event.js. Fails soft to null so callers fall back gracefully.
async function getNextEvent(db) {
  try {
    const snap = await db.collection('events').orderBy('date', 'asc').get();
    const now = Date.now();
    for (const doc of snap.docs) {
      const e = doc.data();
      const dt = e.date && e.date.toDate ? e.date.toDate()
               : (e.date ? new Date(e.date) : null);
      if (!dt || isNaN(dt.getTime())) continue; // no/invalid date
      if (dt.getTime() < now) continue;          // already happened
      if (e.status === 'full') continue;         // sold out
      return normalizeEvent(doc.id, e);
    }
    return null;
  } catch (err) {
    console.error('[next-event] getNextEvent failed:', err && err.message);
    return null;
  }
}

// ── Reusable inline-styled email building blocks ──────────────────────

const h1 = (html) => `<h1 style="font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900;line-height:1.25;">${html}</h1>`;
const p  = (html) => `<p style="font-size:16px;line-height:1.7;color:#1a1f3a;margin:0 0 16px;">${html}</p>`;

function urgencyBox(html) {
  return `<div style="background:#fff3cd;color:#856404;padding:12px 16px;border-radius:4px;font-size:14px;margin:20px 0;">${html}</div>`;
}

function ctaButtonHtml(url, label) {
  return `<p style="text-align:center;margin:30px 0;">
    <a href="${url}" style="display:inline-block;background:#ff6b6b;color:#ffffff;padding:15px 36px;text-decoration:none;border-radius:4px;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px;">${esc(label)}</a>
  </p>`;
}

// Dark event card. `event` may be null → evergreen fallback. The "__UNSUB__"
// token in shell() is replaced per-recipient at send time.
function eventCardHtml(event) {
  if (!event) {
    return `<div style="background:#0a0e27;border-radius:8px;padding:26px 28px;margin:24px 0;">
      <div style="font-size:11px;color:#8a8fa3;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px;">SparkDate events</div>
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:900;color:#ff6b6b;margin:0 0 10px;">New mixers drop regularly</div>
      <div style="font-size:15px;line-height:1.6;color:#f5f3f0;margin:0;">We're lining up the next Philadelphia date night — keep an eye on your inbox.</div>
    </div>`;
  }
  const when = esc(event.dateLabel) + (event.timeLabel ? ` · ${esc(event.timeLabel)}` : '');
  const priceLine = esc(event.priceLabel) + (event.daysAwayLabel ? ` · ${esc(event.daysAwayLabel)}` : '');
  return `<div style="background:#0a0e27;border-radius:8px;padding:26px 28px;margin:24px 0;">
      <div style="font-size:11px;color:#8a8fa3;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px;">Next SparkDate event</div>
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:900;color:#ff6b6b;margin:0 0 14px;">${esc(event.title)}</div>
      <div style="font-size:15px;color:#f5f3f0;margin:0 0 6px;">📅 <strong>${when}</strong></div>
      <div style="font-size:15px;color:#f5f3f0;margin:0 0 6px;">📍 <strong>${esc(event.venueLabel)}</strong></div>
      <div style="font-size:15px;color:#f5f3f0;margin:0;">🎟️ <strong>${priceLine}</strong></div>
    </div>`;
}

// Standard header + footer chrome. `bodyHtml` is the inner content; the
// footer's "__UNSUB__" is swapped for a per-recipient signed URL at send.
function shell(bodyHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0a0e27;padding:36px 30px;text-align:center;">
      <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-1px;">Spark<span style="color:#ff6b6b;">Date</span></div>
    </div>
    <div style="padding:38px 30px;">
${bodyHtml}
    </div>
    <div style="background:#0a0e27;padding:28px 30px;text-align:center;color:#888888;font-size:12px;">
      <p style="margin:0 0 6px;">SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
      <p style="margin:0;"><a href="https://sparkdate.date" style="color:#ff6b6b;text-decoration:none;">sparkdate.date</a> · <a href="__UNSUB__" style="color:#ff6b6b;text-decoration:none;">Unsubscribe</a></p>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  esc,
  normalizeEvent,
  getNextEvent,
  eventCardHtml,
  ctaButtonHtml,
  urgencyBox,
  shell,
  h1,
  p,
};
