// tests/campaign-export-story-frames.test.js
//
// A "Single image + Story" row is ONE card in two shapes: a 1080x1080 image for
// the feed and the same card at 1080x1920 for the Story. The planner used to
// decide shape once per row, and /story/ matches this format, so both frames
// rendered 1080x1920. prep-social-assets then filed both as _story, the row had
// no feed image, and lib/social-publish.js refused the Facebook leg with
// "every asset is story-shaped -- needs a 1080x1080 for the feed".
//
// It shipped twice: MC-12's Facebook post exists only because a square was
// exported by hand, and LX-24's is skipped on every run. TL2-11 was next.
//
// The event is synthetic on purpose, like campaign-export-price.test.js.

import { describe, it, expect } from 'vitest';
import { framesForRow } from '../scripts/build-campaign-export.js';
import { slidesFor, slideFileName } from '../scripts/design-handoff.js';

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
const ev = brand.events.ZZ;

const row = (format, extra = {}) => ({
  row_id: 'ZZ-11',
  date: '2026-10-05',
  time: '18:30',
  events: 'ZZ',
  platforms: 'fb,ig_story',
  format,
  caption: 'Tomorrow. 6:30. Test Venue, Lancaster.\n\nLast call - link in bio.',
  ...extra,
});

// The template's sizing rule: 1920 tall for a story frame or a TikTok frame.
const height = (f) => (f.s.story || f.s.tiktok ? 1920 : 1080);

describe('a "Single image + Story" row', () => {
  const frames = framesForRow(row('Single image + Story'), ev, brand);

  it('renders a 1080x1080 feed frame, then a 1080x1920 story frame', () => {
    expect(frames).toHaveLength(2);
    expect(frames.map(height)).toEqual([1080, 1920]);
    expect(frames[0].s.story).toBeFalsy();
    expect(frames[1].s.story).toBe(true);
  });

  it('keeps distinct export numbers, so one file cannot replace the other', () => {
    expect(frames.map((f) => `${f.id}-${f.n}of${f.of}`)).toEqual(['zz-11-1of2', 'zz-11-2of2']);
  });

  it('puts the card a plain "Single image" row gets on both frames', () => {
    const [single] = framesForRow(row('Single image'), ev, brand);
    const card = ({ story, standalone, ...rest }) => rest;
    expect(card(frames[0].s)).toEqual(single.s);
    expect(card(frames[1].s)).toEqual(single.s);
  });

  it('does not turn the Story into a closing card', () => {
    // Story viewers see only the story frame, so it has to carry the day, time
    // and venue -- not "Last call" and a ticket button.
    expect(frames[1].s.line1).toBe('Tomorrow. 6:30. Test Venue, Lancaster.');
    expect(frames.some((f) => f.s.mode === 'endcard' || f.s.cta)).toBe(false);
  });

  it('marks both frames standalone, so neither prints a 1/2 or 2/2 counter', () => {
    expect(frames.map((f) => f.s.standalone)).toEqual([true, true]);
  });
});

describe('every other format keeps one shape for the whole row', () => {
  it('a Reel and a sticker Story stay 1080x1920', () => {
    for (const format of ['Reel', 'Story + link sticker + countdown']) {
      const frames = framesForRow(row(format), ev, brand);
      expect(frames.map(height)).toEqual([1920]);
    }
  });

  it('a carousel stays 1080x1080 and keeps its counter', () => {
    const frames = framesForRow(row('Carousel, 3 slides', { platforms: 'ig,fb' }), ev, brand);
    expect(frames.map(height)).toEqual([1080, 1080, 1080]);
    expect(frames.some((f) => f.s.standalone)).toBe(false);
  });
});

describe('the Claude Design brief sizes and names each slide by its own shape', () => {
  it('asks for a square feed PNG and a _story PNG, not two stories', () => {
    const r = row('Single image + Story');
    const slides = slidesFor(r, ev, brand);
    expect(slides.map((s) => s.story)).toEqual([false, true]);
    expect(slides.map((_, k) => slideFileName(r.row_id, slides, k)))
      .toEqual(['ZZ-11_1of2.png', 'ZZ-11_2of2_story.png']);
    expect(slides[1].note).toMatch(/same card/i);
  });

  it('names single-shape rows as before', () => {
    const reel = row('Reel', { platforms: 'ig,fb' });
    expect(slideFileName(reel.row_id, slidesFor(reel, ev, brand), 0)).toBe('ZZ-11_story.png');

    const carousel = row('Carousel, 3 slides', { platforms: 'ig,fb' });
    const slides = slidesFor(carousel, ev, brand);
    expect(slides.map((_, k) => slideFileName(carousel.row_id, slides, k)))
      .toEqual(['ZZ-11_1of3.png', 'ZZ-11_2of3.png', 'ZZ-11_3of3.png']);
  });
});
