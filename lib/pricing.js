// lib/pricing.js
//
// Single source of truth for pricing constants that touch both the server
// (charge computation in api/purchase-ticket.js) and the browser (price
// display in public/event.html).
//
// Why a mirror exists in event.html: Vercel Hobby caps the project at 12
// functions and we're at that ceiling, so we can't add a /api/public-config
// endpoint to serve this to the browser. Instead the page hard-codes the
// constant and we run a vitest check (tests/pricing.test.js) that parses
// event.html and asserts the two values are equal — drift fails CI loudly.
//
// If you ever drop below 12 functions, the cleaner fix is to add
// /api/public-config returning { serviceFeeCents } and have event.html
// fetch it on load.

// Service fee added on top of every ticket purchase, in cents.
// MUST stay in sync with `SERVICE_FEE` in public/event.html (in dollars).
const SERVICE_FEE_CENTS = 250;

module.exports = { SERVICE_FEE_CENTS };
