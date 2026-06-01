// lib/seat-model.js
//
// Single source of truth for how an event's seat capacity and ticket price
// are stored, used by the purchase path (api/purchase-ticket.js) and the
// seat-release path (api/stripe-webhook.js). Supports two doc shapes:
//
//   NEW single-pool events (admin writes one `spots` + one `price`):
//     capacity = `spots`, sold count = `confirmed`, flat `price`.
//
//   LEGACY gender-split events (older docs, before gender pricing/caps
//   were removed): `spotsWomen`/`spotsMen`, `confirmedWomen`/`confirmedMen`,
//   `priceWomen`/`priceMen`.
//
// Gender-based pricing and capacity were removed, so new events share one
// pool regardless of gender. Centralizing the resolution here keeps the
// capacity check, counter increment, rollback, and price computation
// consistent across both files and lets BOTH old and new events sell
// tickets. Without this, a new single-pool event has no `spotsMen`/
// `spotsWomen`, so the old gendered capacity check reads `undefined -> 0`
// and rejects every purchase as "Event full" (and price resolves to $0).
//
// Tested in tests/seat-model.test.js.

// An event uses the single shared pool when it carries a numeric `spots`.
// New events always do; legacy events never do. If a legacy event was
// later edited with the new admin (gaining `spots`), the new model wins.
function isSinglePool(event) {
  return event != null && Number.isFinite(Number(event.spots));
}

// The event-doc fields that hold capacity and the sold counter for this
// purchase. For single-pool events gender is irrelevant (one shared pool);
// for legacy events it selects the per-gender fields.
function seatFields(event, gender) {
  if (isSinglePool(event)) {
    return { capField: 'spots', counterField: 'confirmed' };
  }
  return gender === 'woman'
    ? { capField: 'spotsWomen', counterField: 'confirmedWomen' }
    : { capField: 'spotsMen', counterField: 'confirmedMen' };
}

// Ticket price in dollars (before the service fee). Single-pool events use
// the flat `price`; legacy events use the per-gender price. Missing/invalid
// values resolve to 0 (caller treats that as a pricing error).
function ticketPriceDollars(event, gender) {
  if (event && Number.isFinite(Number(event.price))) return Number(event.price);
  const legacy = gender === 'woman'
    ? (event && event.priceWomen)
    : (event && event.priceMen);
  return Number(legacy || 0);
}

module.exports = { isSinglePool, seatFields, ticketPriceDollars };
