// lib/attribution.js
//
// Normalising and storing where a buyer came from.
//
// WHY THIS EXISTS
//
// 14 tickets sold in 30 days and not one of them could be attributed to a
// channel. Stripe metadata carried { eventId, gender, type }; the ticket doc's
// `source` field says 'ticket_purchase', which is a record TYPE, not a traffic
// source. UTMs travelled from /lp to /events in the URL and were then dropped.
//
// So "the ads produced zero purchases" was never a measurement -- Meta only
// counts what its pixel catches, which excludes every iOS user who declined
// tracking, and nothing on our side recorded the answer independently. The ads
// might have been working. There was no way to tell.
//
// Client-side capture mirrors the existing `sparkdate_ref` pattern, which
// already does exactly this for referrals.

'use strict';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// Stripe caps metadata at 500 characters per value and 50 keys. Ticket docs
// have no such limit, but a UTM longer than this is a bug or an attack, not a
// campaign name.
const MAX_LEN = 100;

const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_LEN) : '');

/**
 * Normalise whatever the client sent into a flat, trusted shape.
 *
 * Everything here arrives from the browser and is therefore untrusted: it is
 * length-capped, string-coerced, and restricted to known keys, so a crafted
 * payload cannot write arbitrary fields onto a ticket document.
 */
function normalizeAttribution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of UTM_KEYS) {
    const v = clean(raw[k]);
    if (v) out[k] = v;
  }
  // Where they first landed, and when. Useful for separating an ad click that
  // bought immediately from one that bought three weeks later.
  const landed = clean(raw.landing_path);
  if (landed && landed.startsWith('/')) out.landing_path = landed;
  const at = clean(raw.first_seen);
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) out.first_seen = at;

  return Object.keys(out).length ? out : null;
}

/**
 * Flatten to Stripe metadata. Stripe takes only string values, so this returns
 * strings and drops anything empty. Prefixed so it cannot collide with the
 * existing eventId/gender/type keys.
 */
function toStripeMetadata(attr) {
  if (!attr) return {};
  const meta = {};
  for (const [k, v] of Object.entries(attr)) {
    if (v) meta[k === 'landing_path' || k === 'first_seen' ? k : k.replace(/^utm_/, 'utm_')] = String(v);
  }
  return meta;
}

/**
 * A single short label for reporting -- "facebook / paid_social" -- so the
 * admin dashboard can group without parsing five fields.
 * Falls back to 'direct' when nothing was captured, which is itself the
 * answer to "where did this sale come from".
 */
function channelOf(attr) {
  if (!attr || !attr.utm_source) return 'direct';
  const src = String(attr.utm_source).toLowerCase();
  const med = attr.utm_medium ? String(attr.utm_medium).toLowerCase() : '';
  return med ? `${src} / ${med}` : src;
}

module.exports = { UTM_KEYS, MAX_LEN, normalizeAttribution, toStripeMetadata, channelOf };
