import { describe, it, expect } from 'vitest';
import { isSinglePool, seatFields, ticketPriceDollars, effectivePrice, spotsRemaining } from '../lib/seat-model.js';

describe('effectivePrice', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  it('returns the early-bird price before the deadline', () => {
    const r = effectivePrice({ price: 25, earlyBirdPrice: 18, earlyBirdEnds: future }, 'any');
    expect(r.price).toBe(18);
    expect(r.isEarlyBird).toBe(true);
    expect(r.regularPrice).toBe(25);
  });
  it('returns the regular price after the deadline', () => {
    const r = effectivePrice({ price: 25, earlyBirdPrice: 18, earlyBirdEnds: past }, 'any');
    expect(r.price).toBe(25);
    expect(r.isEarlyBird).toBe(false);
  });
  it('returns the regular price when no early-bird fields are set', () => {
    const r = effectivePrice({ price: 25 }, 'any');
    expect(r.price).toBe(25);
    expect(r.isEarlyBird).toBe(false);
    expect(r.earlyBirdEnds).toBe(null);
  });
  it('ignores an early-bird price with no deadline', () => {
    expect(effectivePrice({ price: 25, earlyBirdPrice: 18 }, 'any').isEarlyBird).toBe(false);
  });
  it('ignores a deadline with no early-bird price', () => {
    expect(effectivePrice({ price: 25, earlyBirdEnds: future }, 'any').isEarlyBird).toBe(false);
  });
  it('respects an explicit now argument', () => {
    const ends = '2026-06-30T23:59:59.000Z';
    expect(effectivePrice({ price: 25, earlyBirdPrice: 18, earlyBirdEnds: ends }, 'any', new Date('2026-06-01')).isEarlyBird).toBe(true);
    expect(effectivePrice({ price: 25, earlyBirdPrice: 18, earlyBirdEnds: ends }, 'any', new Date('2026-07-01')).isEarlyBird).toBe(false);
  });
});

describe('isSinglePool', () => {
  it('is true for new single-pool events (numeric spots)', () => {
    expect(isSinglePool({ spots: 30, price: 18.99 })).toBe(true);
    expect(isSinglePool({ spots: 0 })).toBe(true);       // sold out is still single-pool
    expect(isSinglePool({ spots: '30' })).toBe(true);    // string coerces
  });
  it('is false for legacy gender-split events', () => {
    expect(isSinglePool({ spotsWomen: 15, spotsMen: 15 })).toBe(false);
  });
  it('is false when spots is missing or non-numeric', () => {
    expect(isSinglePool({})).toBe(false);
    expect(isSinglePool({ spots: undefined })).toBe(false);
    expect(isSinglePool({ spots: 'abc' })).toBe(false);
    expect(isSinglePool(null)).toBe(false);
    expect(isSinglePool(undefined)).toBe(false);
  });
  it('prefers the single pool when a doc has both shapes', () => {
    expect(isSinglePool({ spots: 30, spotsWomen: 15, spotsMen: 15 })).toBe(true);
  });
});

describe('seatFields', () => {
  it('uses the single shared pool for new events (gender ignored)', () => {
    expect(seatFields({ spots: 30 }, 'man')).toEqual({ capField: 'spots', counterField: 'confirmed' });
    expect(seatFields({ spots: 30 }, 'woman')).toEqual({ capField: 'spots', counterField: 'confirmed' });
  });
  it('selects per-gender fields for legacy events', () => {
    expect(seatFields({ spotsWomen: 15, spotsMen: 15 }, 'woman'))
      .toEqual({ capField: 'spotsWomen', counterField: 'confirmedWomen' });
    expect(seatFields({ spotsWomen: 15, spotsMen: 15 }, 'man'))
      .toEqual({ capField: 'spotsMen', counterField: 'confirmedMen' });
  });
});

describe('spotsRemaining', () => {
  it('computes remaining for a single-pool event', () => {
    expect(spotsRemaining({ spots: 50, confirmed: 40 })).toEqual({ total: 50, remaining: 10 });
  });
  it('treats a missing confirmed count as zero sold', () => {
    expect(spotsRemaining({ spots: 50 })).toEqual({ total: 50, remaining: 50 });
  });
  it('sums both pools for a legacy gender-split event', () => {
    expect(spotsRemaining({ spotsWomen: 15, spotsMen: 15, confirmedWomen: 10, confirmedMen: 12 }))
      .toEqual({ total: 30, remaining: 8 });
  });
  it('returns null when the event has no capacity fields', () => {
    expect(spotsRemaining({})).toBe(null);
    expect(spotsRemaining(null)).toBe(null);
  });
  it('returns null for a zero-capacity single-pool event', () => {
    expect(spotsRemaining({ spots: 0, confirmed: 0 })).toBe(null);
  });
  it('clamps an oversold event to zero remaining, never negative', () => {
    expect(spotsRemaining({ spots: 20, confirmed: 25 })).toEqual({ total: 20, remaining: 0 });
  });
});

describe('ticketPriceDollars', () => {
  it('uses the flat price for new events', () => {
    expect(ticketPriceDollars({ price: 18.99 }, 'man')).toBe(18.99);
    expect(ticketPriceDollars({ price: 18.99 }, 'woman')).toBe(18.99);
    expect(ticketPriceDollars({ price: 0 }, 'man')).toBe(0);
  });
  it('uses per-gender price for legacy events', () => {
    expect(ticketPriceDollars({ priceWomen: 20, priceMen: 40 }, 'woman')).toBe(20);
    expect(ticketPriceDollars({ priceWomen: 20, priceMen: 40 }, 'man')).toBe(40);
  });
  it('resolves missing pricing to 0', () => {
    expect(ticketPriceDollars({}, 'man')).toBe(0);
    expect(ticketPriceDollars(null, 'woman')).toBe(0);
  });
});
