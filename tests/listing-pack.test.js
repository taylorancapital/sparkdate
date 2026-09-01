// tests/listing-pack.test.js
//
// Pins the two things about the listing pack that fail SILENTLY.
//
// A wrong headline is visible the moment someone reads the listing. A wrong
// UTM is not -- the link works, the visitor arrives, and the only symptom is
// that a GA4 row is missing or merged months later, by which point nobody can
// say which calendar earned it. content/brand.json already records this exact
// failure twice: 11 ads sharing `proof_rsa1`, and a `week3_Solution` campaign
// name that went stale by construction. These tests stop the listing pipeline
// re-earning the same lesson.
//
// The second half covers the price clause, because the copy states a price
// AND what it becomes, and the "becomes" half is read out of brand.json
// rather than the public page. An unbacked price rise is a promise to a
// stranger that we cannot keep.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { taggedUrl, buildCopy, matchBrandEvent } = require('../scripts/build-listing-pack.js');
const sites = require('../content/listing-sites.json');
const brand = require('../content/brand.json');

const LX_ID = 'KL4onXm7hJbqiwI9quAZ';

/** An event shaped like the JSON-LD the generator actually reads. */
const eventFixture = (over = {}) => ({
  id: LX_ID,
  url: `https://sparkdate.date/event?id=${LX_ID}`,
  name: "Sparkdate: The Loxley's Social",
  description: 'A whimsical treehouse bar.',
  start: new Date('2026-09-22T22:30:00.000Z'),
  end: new Date('2026-09-23T01:30:00.000Z'),
  venue: "Loxley's Restaurant & Patio Bar",
  address: {
    addressLocality: 'Lancaster',
    addressRegion: 'PA',
    streetAddress: '500 Centerville Rd, Lancaster, PA 17601',
  },
  price: 24.99,
  ...over,
});

const site = (key) => sites.sites.find((s) => s.key === key);
const params = (u) => new URL(u).searchParams;

describe('taggedUrl', () => {
  const ev = eventFixture();
  const bev = matchBrandEvent(brand, LX_ID);

  it('finds the brand event by id, not by name', () => {
    // Names get edited on the live page; the key must survive that.
    expect(bev).toBeTruthy();
    expect(bev.key).toBe('LX');
  });

  it('uses medium=listing so GA4 does not bury it in referral', () => {
    expect(params(taggedUrl(ev, bev, site('allevents'), sites._utm)).get('utm_medium'))
      .toBe('listing');
  });

  it('builds the campaign from the event key and month, per brand.json', () => {
    expect(params(taggedUrl(ev, bev, site('allevents'), sites._utm)).get('utm_campaign'))
      .toBe('lx_202609');
  });

  it('dates the campaign in event-local time, not UTC', () => {
    // 2026-09-22T22:30Z is 6:30 PM on the 22nd in Lancaster. An event late on
    // the last day of a month is the case that would silently roll the
    // campaign into the wrong month if this used the UTC date.
    const eom = eventFixture({ start: new Date('2026-10-01T01:00:00.000Z') }); // Sep 30, 9 PM ET
    expect(params(taggedUrl(eom, bev, site('allevents'), sites._utm)).get('utm_campaign'))
      .toBe('lx_202609');
  });

  it('gives every site a DIFFERENT utm_content', () => {
    // The proof_rsa1 defect: a shared utm_content collapses every source into
    // one unattributable bucket.
    const live = sites.sites.filter((s) => s.utm_source);
    const contents = live.map((s) => params(taggedUrl(ev, bev, s, sites._utm)).get('utm_content'));
    expect(new Set(contents).size).toBe(live.length);
  });

  it('points at the event page, not /lp, and keeps the event id', () => {
    const u = new URL(taggedUrl(ev, bev, site('allevents'), sites._utm));
    expect(u.pathname).toBe('/event');
    expect(u.searchParams.get('id')).toBe(LX_ID);
  });

  it('does not emit two utm_source values when the base url already has one', () => {
    // brand.json's _never_both rule: our code reads the first, so a doubled
    // tag silently misattributes rather than erroring.
    const dirty = eventFixture({ url: `https://sparkdate.date/event?id=${LX_ID}&utm_source=stale` });
    const u = new URL(taggedUrl(dirty, bev, site('patch'), sites._utm));
    expect(u.searchParams.getAll('utm_source')).toEqual(['patch']);
  });

  it('degrades to an obvious placeholder when the event is not in brand.json', () => {
    // Unattributable, but loudly so -- better than silently reusing a key.
    const orphan = eventFixture({ id: 'nope' });
    expect(params(taggedUrl(orphan, null, site('patch'), sites._utm)).get('utm_campaign'))
      .toMatch(/^evt_/);
  });
});

describe('buildCopy price clause', () => {
  const bev = matchBrandEvent(brand, LX_ID);

  it('states what the price becomes when brand.json has a higher regular price', () => {
    const ev = eventFixture({ priceValidUntil: new Date('2099-01-01T00:00:00.000Z') });
    expect(buildCopy(ev, bev).long).toContain('then $29.99');
  });

  it('omits the rise entirely when there is nothing to rise to', () => {
    // Never invent a deadline. No regular price in brand.json means no claim.
    const ev = eventFixture({ priceValidUntil: new Date('2099-01-01T00:00:00.000Z') });
    const noPricing = { ...bev, pricing: { early_bird: 24.99 } };
    expect(buildCopy(ev, noPricing).long).not.toContain('then $');
  });

  it('omits the rise when the early-bird window has already closed', () => {
    const ev = eventFixture({ priceValidUntil: new Date('2020-01-01T00:00:00.000Z') });
    expect(buildCopy(ev, bev).long).not.toContain('then $');
  });
});

describe('buildCopy address', () => {
  const bev = matchBrandEvent(brand, LX_ID);

  it('prints a real street address', () => {
    expect(buildCopy(eventFixture(), bev).long).toContain('500 Centerville Rd');
  });

  it('does not print "Lancaster, PA (Lancaster, PA 17602)"', () => {
    // Several venues have no street address in Firestore -- streetAddress is
    // literally the city and zip, which reads as a typo once repeated.
    const ev = eventFixture({
      address: { addressLocality: 'Lancaster', addressRegion: 'PA', streetAddress: 'Lancaster, PA 17602' },
    });
    expect(buildCopy(ev, bev).long).not.toContain('(Lancaster, PA 17602)');
  });
});

describe('the format of the night', () => {
  // Settled 2026-09-01 against the shipped chemistry tool: icebreaker, then
  // timed seated rounds with the men rotating, then 5-minute 1-on-1s. Before
  // that, brand.json and the blog contradicted each other and the copy was
  // written around the gap. These tests hold the corrected version in place.
  const { long, short } = buildCopy(eventFixture(), matchBrandEvent(brand, LX_ID));

  it('describes the icebreaker, the rotation and the one-on-ones', () => {
    expect(long).toMatch(/icebreaker/i);
    expect(long).toMatch(/move one table along/i);
    expect(long).toMatch(/five-minute one-on-ones/i);
  });

  it('does not revive the "no rotation, no timer" claim', () => {
    // Six places on the live site still say this. If one of them ever gets
    // pasted in here as source material, fail loudly.
    for (const text of [long, short]) {
      expect(text).not.toMatch(/no bell|no (forced |rigid )?rotation|no (seven|three)[- ]minute|no timer|no whistle/i);
    }
  });

  it('never commits the host to a round count or a round length', () => {
    // Both are per-event settings (2-4 seatings at 10/15/20 min). A moderated
    // calendar listing cannot be edited after approval, so a number printed
    // here becomes a promise nobody has made yet.
    for (const text of [long, short]) {
      expect(text).not.toMatch(/\b(two|three|four|2|3|4)\s+(rounds|seatings)\b/i);
      expect(text).not.toMatch(/\b(10|15|20|ten|fifteen|twenty)[- ]minute\b/i);
    }
  });

  it('still states the one duration that is fixed — the 1-on-1s', () => {
    // ONE_ON_ONE_MS is hardcoded at 5 minutes; it is not a host setting, so
    // it is safe to print and it is the most concrete thing in the copy.
    expect(long).toMatch(/five-minute/i);
  });
});

describe('content/listing-sites.json', () => {
  it('gives every listable site a unique utm_source', () => {
    const srcs = sites.sites.filter((s) => s.utm_source).map((s) => s.utm_source);
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it('gives every listable site a submit url', () => {
    const missing = sites.sites
      .filter((s) => ['active', 'not_pursued', 'dormant'].includes(s.status) && !s.submit_url);
    expect(missing.map((s) => s.key)).toEqual([]);
  });

  it('records a reason for every site that is not being pursued', () => {
    const unexplained = sites.sites
      .filter((s) => ['rejected', 'out_of_scope'].includes(s.status) && !s.rejected_reason);
    expect(unexplained.map((s) => s.key)).toEqual([]);
  });
});
