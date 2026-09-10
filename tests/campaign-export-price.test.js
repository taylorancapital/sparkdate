// tests/campaign-export-price.test.js
//
// A slide's price has to be the price on the day the post goes out. The fact
// frame used to price itself by the day the sheet was RENDERED, and sheets are
// rendered weeks ahead of the posts they carry. Nothing errored: the art
// looked finished and passed every check, because a stale price is still a
// real price.
//
// What it shipped: Loxleys' approved art says $24.99 on the fact frames of
// five carousels (LX-17, 18, 19, 22, 23) that all post after its early bird
// ended on 2026-09-07, while Eventbrite charges $29.99. TL2's sheet, rendered
// 09-10, priced posts running to Oct 7 at an early bird that ends Sep 22.
//
// The event here is synthetic on purpose, so brand.json can change without
// breaking the rule being tested.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { framesForRow } from '../scripts/build-campaign-export.js';

const brand = {
  events: {
    ZZ: {
      name: 'Test Night',
      date: '2026-10-06',
      venue: 'Test Venue',
      city: 'Lancaster, PA',
      doors: '6:30 PM',
      pricing: { early_bird: 24.99, early_bird_through: '2026-09-22', regular: 29.99 },
    },
  },
};

const row = (date) => ({
  row_id: 'ZZ-01',
  date,
  time: '12:30',
  events: 'ZZ',
  platforms: 'ig,fb',
  format: 'Carousel, 3 slides',
  caption: 'A hook line.\n\nA middle line.\n\nLink in bio.',
});

// The one frame that carries a computed price: the fact frame.
const factPrice = (date) => {
  const frames = framesForRow(row(date), brand.events.ZZ, brand);
  const priced = frames.filter((f) => /\$\d/.test(String(f.s.sub || '')));
  expect(priced).toHaveLength(1);
  return priced[0].s.sub.match(/\$\d+\.\d{2}/)[0];
};

describe('the fact frame prices a post by its own date', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the early-bird price through the last early-bird day, inclusive', () => {
    expect(factPrice('2026-09-21')).toBe('$24.99');
    expect(factPrice('2026-09-22')).toBe('$24.99');
  });

  it('shows the regular price from the day after', () => {
    expect(factPrice('2026-09-23')).toBe('$29.99');
    expect(factPrice('2026-10-04')).toBe('$29.99');
  });

  it('does not depend on the day the sheet is rendered', () => {
    vi.useFakeTimers();
    // Rendered while the early bird is still on: a post after it ends is regular.
    vi.setSystemTime(new Date('2026-09-10T16:00:00Z'));
    expect(factPrice('2026-09-24')).toBe('$29.99');
    // Rendered long after it ended: a post inside it is still early bird.
    vi.setSystemTime(new Date('2026-10-01T16:00:00Z'));
    expect(factPrice('2026-09-21')).toBe('$24.99');
  });
});
