// tests/getaway-packages.test.js
//
// Coverage for the getaway_interest allowlist in lib/getaway-packages.js.
// This is the server-side gate in api/lead-signup.js's getaway_interest
// action — a caller that could submit an arbitrary packageId would be
// able to write arbitrary Firestore documents, so the validator matters.

import { describe, it, expect } from 'vitest';
import { GETAWAY_PACKAGES, GETAWAY_PACKAGE_IDS, isValidGetawayPackageId } from '../lib/getaway-packages.js';

describe('GETAWAY_PACKAGES', () => {
  it('has 7 packages, each with a unique id and name', () => {
    expect(GETAWAY_PACKAGES).toHaveLength(7);
    const ids = GETAWAY_PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    GETAWAY_PACKAGES.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    });
  });

  it('GETAWAY_PACKAGE_IDS contains exactly the ids from GETAWAY_PACKAGES', () => {
    expect(GETAWAY_PACKAGE_IDS.size).toBe(GETAWAY_PACKAGES.length);
    GETAWAY_PACKAGES.forEach((p) => expect(GETAWAY_PACKAGE_IDS.has(p.id)).toBe(true));
  });
});

describe('isValidGetawayPackageId', () => {
  it('accepts every real package id', () => {
    GETAWAY_PACKAGES.forEach((p) => expect(isValidGetawayPackageId(p.id)).toBe(true));
  });

  it('rejects unknown ids', () => {
    expect(isValidGetawayPackageId('not-a-real-package')).toBe(false);
    expect(isValidGetawayPackageId('')).toBe(false);
  });

  it('rejects non-string input without throwing', () => {
    expect(isValidGetawayPackageId(undefined)).toBe(false);
    expect(isValidGetawayPackageId(null)).toBe(false);
    expect(isValidGetawayPackageId(123)).toBe(false);
    expect(isValidGetawayPackageId({})).toBe(false);
    expect(isValidGetawayPackageId(['island-paradise'])).toBe(false);
  });

  it('rejects an id that is merely a prefix or superstring of a real one', () => {
    expect(isValidGetawayPackageId('island-paradis')).toBe(false);
    expect(isValidGetawayPackageId('island-paradise-extra')).toBe(false);
  });
});
