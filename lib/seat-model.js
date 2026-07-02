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

// Resolve the price a buyer pays RIGHT NOW, honoring an optional early-bird
// window. An event may carry `earlyBirdPrice` (number) + `earlyBirdEnds`
// (ISO string or Firestore Timestamp). While now < earlyBirdEnds and the
// early-bird price is a positive number, that discounted price applies;
// otherwise the regular ticketPriceDollars wins. Returns both prices so the
// marketing block can show "early bird $X · then $Y" AND the checkout can
// charge the exact number the ad advertised (same resolver on both sides).
function effectivePrice(event, gender, now) {
  const regularPrice = ticketPriceDollars(event, gender);
  const eb = event && Number(event.earlyBirdPrice);
  const ends = event && event.earlyBirdEnds;
  const endsMs = ends && ends.toDate ? ends.toDate().getTime()
               : (ends ? new Date(ends).getTime() : NaN);
  const nowMs = (now instanceof Date ? now : (now ? new Date(now) : new Date())).getTime();
  const isEarlyBird = Number.isFinite(eb) && eb > 0
    && Number.isFinite(endsMs) && nowMs < endsMs;
  return {
    price: isEarlyBird ? eb : regularPrice,
    regularPrice,
    isEarlyBird,
    earlyBirdEnds: Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : null,
  };
}

// Total capacity + remaining seats for marketing surfaces (landing pages),
// which show one number regardless of gender. Built on isSinglePool/
// seatFields so the single-pool-vs-legacy branching lives in exactly one
// place. Returns null when the event carries no usable capacity fields —
// callers must treat null as "don't show a spots line," not as "0 spots."
function spotsRemaining(event) {
  if (event == null) return null;

  if (isSinglePool(event)) {
    const { capField, counterField } = seatFields(event);
    const total = Number(event[capField]);
    if (!Number.isFinite(total) || total <= 0) return null;
    const sold = Number(event[counterField]) || 0;
    return { total, remaining: Math.max(0, total - sold) };
  }

  // Legacy gender-split events: sum both pools into one marketing-facing
  // number (the landing pages don't ask "which gender" before showing this).
  const women = seatFields(event, 'woman');
  const men = seatFields(event, 'man');
  const total = (Number(event[women.capField]) || 0) + (Number(event[men.capField]) || 0);
  if (total <= 0) return null;
  const sold = (Number(event[women.counterField]) || 0) + (Number(event[men.counterField]) || 0);
  return { total, remaining: Math.max(0, total - sold) };
}

module.exports = { isSinglePool, seatFields, ticketPriceDollars, effectivePrice, spotsRemaining };
