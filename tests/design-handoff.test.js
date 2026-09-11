// tests/design-handoff.test.js
//
// The Claude Design brief described a layout nobody renders. Until 2026-09-10
// its look block specified Inter labels, a coral-tint fact card and a
// coral-gradient closing slide. The export template draws none of those: every
// published Loxleys slide is a navy gradient with serif labels, and closes on a
// NAVY frame with a coral GET TICKETS button. A Design project handed the old
// block would have produced art that matched nothing already posted.
//
// It also never asked for the TikTok twin, so a post going to TikTok could not
// get its vertical file from Design at all, and it named a "Single image +
// Story" post as two story frames -- the exact shape that stops Facebook from
// publishing it (MC-12, LX-24).
//
// Two guards: the template still contains every value the look block quotes,
// and the brief asks for the files the publisher actually needs.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildBrief, TEMPLATE_FACTS } from '../scripts/design-handoff.js';

const REPO = process.cwd();
const template = fs.readFileSync(path.join(REPO, 'templates', 'campaign-export.template.html'), 'utf8');

// Synthetic, so brand.json can change without breaking what is being tested.
const brand = {
  universal: { approved_testimonials: [] },
  asset_rules: {
    dimensions: {
      feed: { width: 1080, height: 1080 },
      story: { width: 1080, height: 1920 },
      reel: { width: 1080, height: 1920 },
    },
  },
  events: {
    ZZ: {
      name: 'Test Night',
      venue: 'Test Venue',
      city: 'Lancaster, PA',
      date: '2026-10-06',
      doors: '6:30 PM',
      event_id: 'abc123',
      pricing: { early_bird: 24.99, early_bird_through: '2026-09-22', regular: 29.99 },
    },
  },
};

const row = (over = {}) => ({
  row_id: 'ZZ-01',
  date: '2026-09-24',
  time: '12:30',
  events: 'ZZ',
  state: 'pending',
  platforms: 'ig,fb,tiktok',
  format: 'Carousel, 3 slides',
  asset_files: '',
  caption: 'A hook line.\n\nThe details.\n\nThe close. Link in bio.',
  hashtags: '#SparkDate',
  link_fb: '',
  link_ig: '',
  ...over,
});

describe('the Claude Design brief', () => {
  it('quotes only layout values the export template still draws', () => {
    for (const fact of TEMPLATE_FACTS) {
      expect(template.includes(fact), `template no longer contains: ${fact}`).toBe(true);
    }
  });

  it('asks for a TikTok twin of every slide when the post goes to TikTok', () => {
    const { text } = buildBrief(brand, [row()], ['ZZ']);
    for (const k of [1, 2, 3]) {
      expect(text).toContain(`ZZ-01_${k}of3.png`);
      expect(text).toContain(`ZZ-01_${k}of3_tt.png`);
    }
  });

  it('asks for no TikTok twin when the post skips TikTok', () => {
    const { text } = buildBrief(brand, [row({ platforms: 'ig,fb' })], ['ZZ']);
    expect(text).toContain('ZZ-01_1of3.png');
    expect(text).not.toContain('ZZ-01_1of3_tt.png');
  });

  it('gives a Single image + Story post one feed frame and one story frame', () => {
    const { text } = buildBrief(brand, [row({ row_id: 'ZZ-02', platforms: 'fb,ig_story', format: 'Single image + Story' })], ['ZZ']);
    expect(text).toContain('ZZ-02_1of2.png');
    expect(text).toContain('ZZ-02_2of2_story.png');
    expect(text).not.toContain('ZZ-02_1of2_story.png');
  });

  it('describes the closing slide as navy with a coral button, not a coral background', () => {
    const { text } = buildBrief(brand, [row()], ['ZZ']);
    expect(text).not.toMatch(/coral gradient background/i);
    expect(text).toContain('GET TICKETS');
  });

  it('skips a row that already has artwork', () => {
    const { posts } = buildBrief(brand, [row({ asset_files: 'ZZ-01_1of3.jpg' })], ['ZZ']);
    expect(posts).toBe(0);
  });
});
