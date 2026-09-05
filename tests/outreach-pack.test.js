// tests/outreach-pack.test.js
//
// Guards the women-facing outreach pack. Three classes of failure, all of
// which ship silently and are only caught by someone reading a live post:
//
//   1. the wrong city, because both on-sale events are in Lancaster and a
//      hardcoded default would look correct for months;
//   2. an offer written on Taylor's behalf into a business ask;
//   3. a duration, which no source in this repo agrees on.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(__dirname, '..');
const pack = require('../scripts/build-outreach-pack.js');
const registry = JSON.parse(readFileSync(resolve(ROOT, 'content/women-surfaces.json'), 'utf8'));

const evAt = (locality) => ({
  start: new Date('2026-09-22T18:30:00-04:00'),
  venue: "Loxley's Restaurant & Patio Bar",
  price: 24.99,
  address: locality ? { addressLocality: locality } : null,
});

describe('cityOf — never guesses a city', () => {
  it('prefers the address on the event page', () => {
    expect(pack.cityOf(evAt('Philadelphia'), { market: 'lancaster' })).toBe('Philadelphia');
  });

  it('falls back to the brand market, capitalised', () => {
    expect(pack.cityOf(evAt(null), { market: 'philadelphia' })).toBe('Philadelphia');
  });

  it('returns null rather than defaulting to Lancaster', () => {
    // The bug this test exists for: a hardcoded 'Lancaster' fallback would
    // have written the wrong city into every Philadelphia post and looked
    // correct in review, because both current events are in Lancaster.
    expect(pack.cityOf(evAt(null), null)).toBeNull();
    expect(pack.cityOf(evAt(null), {})).toBeNull();
  });

  it('drops the phrase entirely when the city is unknown', () => {
    expect(pack.inCity(null)).toBe('');
    expect(pack.inCity('Lancaster')).toBe(' in Lancaster');
  });

  it('never writes "in undefined" or "in null" into copy', () => {
    for (const build of [pack.partnerAsk, pack.communityPost]) {
      const copy = build(evAt(null), null, 'https://example.test/e');
      expect(copy).not.toMatch(/in (undefined|null)/i);
      expect(copy).not.toMatch(/\bLancaster\b/); // no hardcoded default anywhere
    }
  });

  it('a Philadelphia event never says Lancaster', () => {
    const copy = pack.communityPost(evAt('Philadelphia'), { market: 'philadelphia' }, 'https://example.test/e');
    expect(copy).toContain('Philadelphia');
    expect(copy).not.toContain('Lancaster');
  });
});

describe('venueOf — vague, never invented', () => {
  it('uses the real venue when the page has one', () => {
    expect(pack.venueOf(evAt('Lancaster'))).toBe("Loxley's Restaurant & Patio Bar");
  });

  it('falls back to an honest vaguery, not a plausible room name', () => {
    expect(pack.venueOf({ venue: null })).toBe('a spot in town');
  });
});

describe('the partner ask leaves the offer to Taylor', () => {
  const copy = () => pack.partnerAsk(evAt('Lancaster'), { market: 'lancaster' }, 'https://example.test/e');

  it('ships with an explicit blank', () => {
    expect(copy()).toContain('[OFFER GOES HERE');
  });

  it('states no terms of its own', () => {
    // memory `never-ask-a-venue-for-its-minimum`: a number written down first
    // becomes the ceiling, and it pre-refuses deals he might have taken.
    const c = copy().toLowerCase();
    for (const term of ['free ticket', 'comped', 'complimentary', 'discount code',
                        'revenue share', '% of', 'exclusive', 'commission']) {
      expect(c).not.toContain(term);
    }
  });
});

describe('no copy states a duration', () => {
  // brand.json universal.run_of_show: round count, minutes per round and
  // minutes per 1-on-1 are all host-settable, and two of our own sources
  // contradict each other. Saying any of them is inventing a fact.
  it('neither motion mentions minutes or round counts', () => {
    for (const build of [pack.partnerAsk, pack.communityPost]) {
      const c = build(evAt('Lancaster'), { market: 'lancaster' }, 'https://example.test/e').toLowerCase();
      expect(c).not.toMatch(/\d+\s*(minute|min\b|second)/);
      expect(c).not.toMatch(/\d+\s*rounds?\b/);
      expect(c).not.toMatch(/\b(seven|five|ten|three)\s+minutes?\b/);
    }
  });
});

describe('the registry', () => {
  it('separates the two motions and labels every surface with one', () => {
    for (const s of registry.surfaces) {
      expect(['partner', 'community']).toContain(s.motion);
    }
  });

  it('gives every surface a distinct utm_source', () => {
    const sources = registry.surfaces.map((s) => s.utm_source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('uses mediums that do not collide with the calendar registry', () => {
    // listing-sites.json owns 'listing'. Mixing these makes both unreadable.
    const listing = JSON.parse(readFileSync(resolve(ROOT, 'content/listing-sites.json'), 'utf8'));
    expect(listing._utm.medium).toBe('listing');
    expect(registry._utm.medium_partner).not.toBe(listing._utm.medium);
    expect(registry._utm.medium_community).not.toBe(listing._utm.medium);
    expect(registry._utm.medium_partner).not.toBe(registry._utm.medium_community);
  });

  it('keeps DM-scraping permanently rejected', () => {
    // Unsolicited contact with private individuals. It is the behaviour the
    // events are positioned against, and it should never be re-proposed in a
    // different wrapper.
    const keys = registry.rejected.map((r) => r.key);
    expect(keys).toContain('dm_scraping');
  });

  it('does not claim any women-specific surface has been verified', () => {
    // The seed rows are general-audience groups from the June playbook. A
    // fabricated "Lancaster Women's Collective" row would be worse than an
    // empty list, because the next session would treat it as researched.
    for (const s of registry.surfaces) {
      expect(s.audience).not.toBe('women');
      expect(s).toHaveProperty('_audience_note');
    }
  });

  it('is allowed past the content/ deny-by-default gitignore', () => {
    // content/* is denied by default; a new file there needs a matching ! line
    // or it silently never gets committed.
    const gi = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^!content\/women-surfaces\.json$/m);
  });
});
