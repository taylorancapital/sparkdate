// tests/tiers.test.js
//
// lib/tiers.js is the single source of truth for tier → Stripe price
// mapping. Drift between this file and the UI (signup.html, account.html,
// admin.html, event.html legal copy, server price calc) has historically
// caused the page to display $X while the server charged $Y. These
// shape/value tests freeze the mapping so a typo in TIERS breaks CI
// before it breaks a customer's invoice.
//
// getOrCreatePrice is not unit-tested here — it round-trips Stripe and
// needs network mocking. Worth adding when the test suite graduates to
// integration tests against the Stripe CLI mock server.

import { describe, it, expect } from 'vitest';
import { TIERS, getOrCreatePrice } from '../lib/tiers.js';

describe('TIERS shape', () => {
  it('exposes exactly free/mid/premium', () => {
    expect(Object.keys(TIERS).sort()).toEqual(['free', 'mid', 'premium']);
  });

  it('every tier has the required fields', () => {
    for (const [key, t] of Object.entries(TIERS)) {
      expect(t.name, `${key}.name`).toBeTypeOf('string');
      expect(t.displayName, `${key}.displayName`).toBeTypeOf('string');
      expect(t.amount, `${key}.amount`).toBeTypeOf('number');
      expect(t.lookupKey, `${key}.lookupKey`).toBeTypeOf('string');
      expect(t.trialDays, `${key}.trialDays`).toBeTypeOf('number');
    }
  });

  it('amounts are in cents (integer) and match the published pricing', () => {
    // These match the legal copy in signup.html. If you change pricing,
    // update BOTH the test and the disclosure copy.
    expect(TIERS.free.amount).toBe(999);     // $9.99
    expect(TIERS.mid.amount).toBe(1999);     // $19.99
    expect(TIERS.premium.amount).toBe(3999); // $39.99
  });

  it('only Spark has a free trial', () => {
    expect(TIERS.free.trialDays).toBe(30);
    expect(TIERS.mid.trialDays).toBe(0);
    expect(TIERS.premium.trialDays).toBe(0);
  });

  it('lookup keys are unique and stable strings', () => {
    const keys = Object.values(TIERS).map(t => t.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Stable prefixed names — used to find prices in Stripe across deploys.
    expect(TIERS.free.lookupKey).toBe('sparkdate_spark');
    expect(TIERS.mid.lookupKey).toBe('sparkdate_kindling');
    expect(TIERS.premium.lookupKey).toBe('sparkdate_fire');
  });

  it('display names line up with the in-app tier labels', () => {
    expect(TIERS.free.displayName).toBe('Spark');
    expect(TIERS.mid.displayName).toBe('Kindling');
    expect(TIERS.premium.displayName).toBe('Fire');
  });
});

describe('getOrCreatePrice error path', () => {
  it('throws on an unknown tier key', async () => {
    // Synchronous throw happens before any Stripe call.
    await expect(getOrCreatePrice('not-a-tier')).rejects.toThrow(/Unknown tier/);
  });
});
