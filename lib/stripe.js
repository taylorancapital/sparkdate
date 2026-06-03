// lib/stripe.js
//
// Single Stripe SDK instance with the API version PINNED (audit M5).
//
// Why this matters: Stripe periodically deprecates / relocates fields.
// `subscription.current_period_end` and `subscription.cancel_at_period_end`
// moved to `subscription.items.data[0].current_period_end` in API version
// 2024-12-18+. Reading from the top level still works on ≤2024-09-30,
// returns undefined on newer versions — meaning the cancel-flow date math
// and renewal-date display would silently render as "—" or "Invalid Date"
// on the day we upgraded the API default.
//
// Pinning here means an upgrade is intentional: bump the constant, audit
// the field paths, ship one PR. Mirror the bump to the Stripe Dashboard's
// API version setting too.
//
// The leading underscore on the file name keeps it OUT of Vercel's
// /api routing (Vercel only auto-routes plain api/*.js files).

const Stripe = require('stripe');

// Pin to the API version this codebase was built against. Last verified
// with the field-path conventions used in api/stripe-webhook.js and
// api/cancel-subscription.js (audit M5).
//
// Bumped from 2023-08-16 to 2026-04-22.dahlia to match the live Stripe
// account's API version (confirmed in Developers → API version). In API
// versions ≥ 2024-12-18.acacia, `subscription.current_period_end` is no
// longer present at the top level — it moved to
// `subscription.items.data[0].current_period_end`. Both stripe-webhook.js
// and cancel-subscription.js have been updated to use the new path.
const STRIPE_API_VERSION = '2026-04-22.dahlia';

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
});

module.exports = { stripe, STRIPE_API_VERSION };
