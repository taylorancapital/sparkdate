import { describe, it, expect } from 'vitest';
import { isSinglePool, seatFields, ticketPriceDollars } from '../lib/seat-model.js';

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
