// tests/attribution.test.js
//
// Covers lib/attribution.js — where a buyer came from.
//
// This exists because 14 tickets sold in 30 days and not one could be traced
// to a channel. "The ads produced zero purchases" was never a measurement:
// Meta only counts what its pixel catches, which misses every iOS user who
// declined tracking, and nothing on our side recorded the answer
// independently.
//
// Every value here arrives from the browser, so the normaliser is a trust
// boundary and is tested as one.

import { describe, it, expect } from 'vitest';
import {
  normalizeAttribution, toStripeMetadata, channelOf, MAX_LEN,
} from '../lib/attribution.js';

describe('normalizeAttribution', () => {
  it('keeps the five UTM fields', () => {
    const a = normalizeAttribution({
      utm_source: 'Facebook', utm_medium: 'paid_social',
      utm_campaign: 'MC_202609', utm_content: 'MC-06', utm_term: 'lancaster',
    });
    expect(a).toEqual({
      utm_source: 'Facebook', utm_medium: 'paid_social',
      utm_campaign: 'MC_202609', utm_content: 'MC-06', utm_term: 'lancaster',
    });
  });

  it('returns null when nothing usable was sent', () => {
    // Null is meaningful: it means the buyer arrived with no UTMs, which
    // channelOf() reports as "direct".
    expect(normalizeAttribution(null)).toBeNull();
    expect(normalizeAttribution({})).toBeNull();
    expect(normalizeAttribution({ utm_source: '   ' })).toBeNull();
    expect(normalizeAttribution('utm_source=facebook')).toBeNull();
  });

  it('drops keys it does not know', () => {
    // The payload is browser-supplied, so an attacker must not be able to
    // write arbitrary fields onto a ticket document.
    const a = normalizeAttribution({
      utm_source: 'facebook', isAdmin: true, amount: 0, __proto__: { x: 1 },
    });
    expect(a).toEqual({ utm_source: 'facebook' });
  });

  it('caps length rather than trusting the client', () => {
    const a = normalizeAttribution({ utm_source: 'x'.repeat(5000) });
    expect(a.utm_source).toHaveLength(MAX_LEN);
  });

  it('coerces non-strings away instead of storing them', () => {
    const a = normalizeAttribution({ utm_source: 'fb', utm_medium: 12345, utm_campaign: { evil: 1 } });
    expect(a).toEqual({ utm_source: 'fb' });
  });

  it('trims whitespace', () => {
    expect(normalizeAttribution({ utm_source: '  facebook  ' }).utm_source).toBe('facebook');
  });

  it('accepts a landing path only when it looks like one', () => {
    expect(normalizeAttribution({ utm_source: 'fb', landing_path: '/lp' }).landing_path).toBe('/lp');
    // Not a path — an absolute URL here would be an open redirect waiting to
    // be rendered somewhere.
    expect(normalizeAttribution({ utm_source: 'fb', landing_path: 'https://evil.test' }).landing_path).toBeUndefined();
  });

  it('accepts first_seen only as a plain date', () => {
    expect(normalizeAttribution({ utm_source: 'fb', first_seen: '2026-08-22' }).first_seen).toBe('2026-08-22');
    expect(normalizeAttribution({ utm_source: 'fb', first_seen: 'yesterday' }).first_seen).toBeUndefined();
  });
});

describe('toStripeMetadata', () => {
  it('produces string values only, as Stripe requires', () => {
    const m = toStripeMetadata(normalizeAttribution({ utm_source: 'facebook', utm_content: 'MC-06' }));
    expect(Object.values(m).every((v) => typeof v === 'string')).toBe(true);
    expect(m.utm_source).toBe('facebook');
  });

  it('returns an empty object for null, so a spread is safe', () => {
    // It is spread into the existing { eventId, gender, type } metadata; a
    // null here must not blow up the charge.
    expect(toStripeMetadata(null)).toEqual({});
    expect({ eventId: 'e', ...toStripeMetadata(null) }).toEqual({ eventId: 'e' });
  });

  it('never exceeds what Stripe accepts per value', () => {
    const m = toStripeMetadata(normalizeAttribution({ utm_campaign: 'y'.repeat(900) }));
    expect(m.utm_campaign.length).toBeLessThanOrEqual(500);
  });
});

describe('channelOf', () => {
  it('joins source and medium into one reporting label', () => {
    expect(channelOf({ utm_source: 'Facebook', utm_medium: 'paid_social' })).toBe('facebook / paid_social');
  });

  it('falls back to the source alone when there is no medium', () => {
    expect(channelOf({ utm_source: 'Instagram' })).toBe('instagram');
  });

  it('reports direct when nothing was captured', () => {
    // Not "unknown" — no UTMs IS the answer, and it needs to group cleanly
    // against the paid rows in a report.
    expect(channelOf(null)).toBe('direct');
    expect(channelOf({})).toBe('direct');
  });
});
