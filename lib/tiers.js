// api/_tiers.js
// Single source of truth for subscription tier → Stripe price mapping.
// Eliminates the drift between create-subscription (lookup_keys) and
// upgrade-subscription (hardcoded price IDs).
//
// All server endpoints that touch subscriptions read from here.

const { stripe } = require('./stripe');

const TIERS = {
  free:    { name: 'SparkDate Spark',    displayName: 'Spark',    amount:  999, lookupKey: 'sparkdate_spark',    trialDays: 30 },
  mid:     { name: 'SparkDate Kindling', displayName: 'Kindling', amount: 1999, lookupKey: 'sparkdate_kindling', trialDays: 0  },
  premium: { name: 'SparkDate Fire',     displayName: 'Fire',     amount: 3999, lookupKey: 'sparkdate_fire',     trialDays: 0  },
};

// In-memory cache of resolved Stripe price IDs. Serverless functions reuse
// containers, so this saves a Stripe API roundtrip on hot invocations.
const priceCache = {};

/**
 * Resolve a tier key to a Stripe price ID, creating the product+price
 * on first use. Both create-subscription and upgrade-subscription call
 * this — no more two-sources-of-truth.
 */
async function getOrCreatePrice(tierKey) {
  if (!TIERS[tierKey]) throw new Error(`Unknown tier: ${tierKey}`);
  if (priceCache[tierKey]) return priceCache[tierKey];

  const cfg = TIERS[tierKey];

  // Look up by stable lookup_key first.
  const existing = await stripe.prices.list({ lookup_keys: [cfg.lookupKey], limit: 1 });
  if (existing.data.length > 0) {
    priceCache[tierKey] = existing.data[0].id;
    return existing.data[0].id;
  }

  // First-time bootstrap: create product + price with the lookup_key.
  const product = await stripe.products.create({ name: cfg.name });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: cfg.amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: cfg.lookupKey,
  });
  priceCache[tierKey] = price.id;
  return price.id;
}

module.exports = { TIERS, getOrCreatePrice };
