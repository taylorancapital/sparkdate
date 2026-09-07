// tests/content-queue.test.js
//
// Covers lib/content-queue.js and the rules in scripts/lint-content-queue.js.
//
// These are not hypothetical rules. Every one of them corresponds to a defect
// that actually reached the queue: Philly hashtags on a Lancaster event (MC-02,
// MC-03, LX-26), Lancaster hashtags on a Philadelphia event (GG-06), Loxley's
// early bird quoted at $18.99 instead of $24.99 (LX-11, GG-07), and a single
// shared utm_content across all 45 rows that made per-post attribution
// impossible. The linter found all six on its first run against real data.
//
// The CSV codec gets its own coverage because captions contain literal
// newlines, commas and apostrophes -- a naive split corrupts the queue
// silently, which is the exact failure mode this whole module exists to stop.

import { describe, it, expect } from 'vitest';
import {
  parseCsv, toCsv, rowEvents, rowHashtags, rowAssets,
  allowedHashtags, allowedPrices, currentPrice, pricesInText, isSchedulable, isFeedPost,
} from '../lib/content-queue.js';
import { lint } from '../scripts/lint-content-queue.js';

const BRAND = {
  universal: {
    banned_facts: [{
      id: 'unsourced-28',
      pattern: '\\b28\\b(?=[^\\n]{0,40}\\b(?:people|attendees?|attended|came|confirmed|showed up|in the room)\\b)',
      description: 'The 28 figure is unsourced and banned. 22 is the only sanctioned number.',
    }],
    pulled_images: ['IMG_9203', 'IMG_9204', 'IMG_9207'],
    utm: { source_by_platform: { fb: 'Facebook', ig: 'Instagram', tiktok: 'TikTok', x: 'Twitter' } },
  },
  markets: {
    lancaster: { hashtags: ['#LancasterDating', '#LancasterEvents', '#SingleInLancaster'] },
    philadelphia: { hashtags: ['#PhillyDating', '#RittenhouseSquare', '#PhillySingles'] },
    _neutral: { hashtags: ['#SparkDate', '#IRLDating', '#SpeedDating'] },
  },
  events: {
    MC: { market: 'lancaster', hashtag_pool: ['#LancasterDating', '#EarlyBird'], pricing: { early_bird: 18.99, regular: 24.99 } },
    LX: { market: 'lancaster', hashtag_pool: ['#LancasterDating'], pricing: { early_bird: 24.99, regular: 29.99 } },
    GG: { market: 'philadelphia', hashtag_pool: ['#PhillyDating'], pricing: { regular: 29.99 } },
  },
};

const row = (over = {}) => ({
  row_id: 'MC-01', date: '2026-09-08', time: '12:30', events: 'MC',
  platforms: 'ig,fb', format: 'Single image', state: 'pending',
  caption: 'A night out.', hashtags: '#LancasterDating', caption_x: '',
  link_fb: 'https://x.test/?utm_source=Facebook', link_ig: 'https://x.test/?utm_source=Instagram',
  utm_campaign: 'MC_202609', utm_content: 'MC-01', asset_files: 'MC-01.jpg',
  manual_reason: '', notes: '', ...over,
});

const errorsFor = (rows, checkName) =>
  lint(rows, BRAND).filter((f) => f.severity === 'error' && f.check === checkName);

describe('parseCsv / toCsv', () => {
  it('round-trips a caption containing newlines, commas and quotes', () => {
    const columns = ['row_id', 'caption'];
    const rows = [{ row_id: 'MC-01', caption: 'Line one.\n\n"Quoted", and a comma.' }];
    const back = parseCsv(toCsv(rows, columns)).rows;
    expect(back).toHaveLength(1);
    expect(back[0].caption).toBe('Line one.\n\n"Quoted", and a comma.');
  });

  it('does not split a quoted field on its embedded newline', () => {
    const csv = 'row_id,caption\nMC-01,"a\nb"\nMC-02,plain\n';
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].caption).toBe('a\nb');
    expect(rows[1].row_id).toBe('MC-02');
  });

  it('strips a UTF-8 BOM so the first column name is not corrupted', () => {
    const { rows } = parseCsv('﻿row_id,caption\nMC-01,hi\n');
    expect(rows[0].row_id).toBe('MC-01');
  });

  it('ignores blank trailing lines', () => {
    expect(parseCsv('row_id\nMC-01\n\n').rows).toHaveLength(1);
  });
});

describe('row helpers', () => {
  it('splits list columns and tolerates spacing', () => {
    expect(rowEvents({ events: 'GG, LX' })).toEqual(['GG', 'LX']);
    expect(rowAssets({ asset_files: 'a.jpg,b.jpg' })).toEqual(['a.jpg', 'b.jpg']);
    expect(rowEvents({ events: '' })).toEqual([]);
  });

  it('extracts hashtags regardless of separator', () => {
    expect(rowHashtags({ hashtags: '#One #Two_3' })).toEqual(['#One', '#Two_3']);
  });

  it('treats posted, skipped and NO POST rows as not schedulable', () => {
    expect(isSchedulable(row({ state: 'posted' }))).toBe(false);
    expect(isSchedulable(row({ state: 'skipped' }))).toBe(false);
    expect(isSchedulable(row({ format: 'NO POST' }))).toBe(false);
    expect(isSchedulable(row())).toBe(true);
  });

  it('does not count a story-only row as competing for the feed slot', () => {
    expect(isFeedPost(row({ platforms: 'ig_story' }))).toBe(false);
    expect(isFeedPost(row({ platforms: 'ig,fb' }))).toBe(true);
  });
});

describe('hashtag market rules', () => {
  it('allows an event pool tag plus neutral tags', () => {
    const allowed = allowedHashtags(BRAND, ['MC']);
    expect(allowed.has('#lancasterdating')).toBe(true);
    expect(allowed.has('#sparkdate')).toBe(true);
  });

  it('excludes the other market (the MC-02 / MC-03 / LX-26 bug)', () => {
    expect(allowedHashtags(BRAND, ['LX']).has('#rittenhousesquare')).toBe(false);
  });

  it('unions pools for a row naming two events (the GG-07 exception)', () => {
    // GG-07 recaps a Philly event and forward-promotes two Lancaster ones, so
    // Lancaster tags are genuinely correct on it -- and fall out of the data
    // rather than needing a hand-written exception.
    const allowed = allowedHashtags(BRAND, ['GG', 'LX']);
    expect(allowed.has('#lancasterdating')).toBe(true);
    expect(allowed.has('#phillydating')).toBe(true);
  });

  it('flags Philly tags on a Lancaster event', () => {
    const found = errorsFor([row({ events: 'LX', hashtags: '#RittenhouseSquare' })], 'hashtag-market');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('#RittenhouseSquare');
  });

  it('flags Lancaster tags on a Philadelphia event (the GG-06 direction)', () => {
    expect(errorsFor([row({ events: 'GG', hashtags: '#LancasterDating' })], 'hashtag-market')).toHaveLength(1);
  });

  it('passes a correctly-tagged row', () => {
    expect(errorsFor([row({ events: 'GG', hashtags: '#PhillyDating #SparkDate' })], 'hashtag-market')).toHaveLength(0);
  });
});

describe('banned facts', () => {
  it('flags the unsourced 28-attendee claim', () => {
    expect(errorsFor([row({ caption: '28 people came to our first one.' })], 'banned-fact')).toHaveLength(1);
  });

  it('does NOT flag 28 as a calendar date', () => {
    // The whole point of the lookahead: "August 28" must not trip an
    // attendance rule, or the linter becomes noise people learn to ignore.
    expect(errorsFor([row({ caption: 'Monday, August 28. Doors at 6:30.' })], 'banned-fact')).toHaveLength(0);
  });

  it('does NOT flag 28 as a price', () => {
    expect(errorsFor([row({ caption: 'Tickets are $28 at the door.' })], 'banned-fact')).toHaveLength(0);
  });

  it('allows the sanctioned figure of 22', () => {
    expect(errorsFor([row({ caption: '22 people came to our first one.' })], 'banned-fact')).toHaveLength(0);
  });

  it('checks caption_x too, not just caption', () => {
    expect(errorsFor([row({ caption: 'ok', caption_x: '28 attendees showed.' })], 'banned-fact')).toHaveLength(1);
  });
});

describe('pricing', () => {
  it('accepts either of an event’s own prices', () => {
    const allowed = allowedPrices(BRAND, ['LX']);
    expect([...allowed].sort()).toEqual(['24.99', '29.99']);
  });

  it('flags Loxley’s early bird quoted at $18.99 (the LX-11 bug)', () => {
    const found = errorsFor([row({ events: 'LX', caption: '$18.99 today. $29.99 tomorrow.' })], 'price');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('18.99');
  });

  it('accepts $24.99 for a merged MC+LX row even though it means different things per event', () => {
    // $24.99 is Marion Court's REGULAR price and Loxley's EARLY-BIRD price.
    expect(errorsFor([row({ events: 'MC,LX', caption: 'Early bird $24.99.' })], 'price')).toHaveLength(0);
  });

  it('parses prices with or without a space after the dollar sign', () => {
    expect(pricesInText('$18.99 and $ 24.99 and $29')).toEqual(['18.99', '24.99', '29.00']);
  });
});

describe('currentPrice', () => {
  // Real shape from content/brand.json: MC's early bird ended 2026-08-24 and
  // regular ($24.99) has applied since. Naively preferring `early_bird`
  // whenever present kept quoting the stale $18.99 on any brief or export
  // sheet regenerated afterward -- this is that exact bug, pinned.
  const MC_PRICING = { early_bird: 18.99, early_bird_through: '2026-08-24', regular: 24.99 };
  // LX's early bird runs through 2026-09-07 -- the day this bug was found,
  // its window was still open. Both shapes are covered so the fix can't
  // just move the bug from one event to the other.
  const LX_PRICING = { early_bird: 24.99, early_bird_through: '2026-09-07', regular: 29.99 };

  it('returns the early-bird price while today is before the through-date', () => {
    expect(currentPrice(MC_PRICING, '2026-08-23')).toBe(18.99);
    expect(currentPrice(LX_PRICING, '2026-09-06')).toBe(24.99);
  });

  it('still returns the early-bird price ON the through-date itself (inclusive)', () => {
    // meta-create-lx-sales-campaign.js's priceFor() already treats this field
    // as inclusive (`startDate > EARLY_BIRD_THROUGH ? regular : early_bird`),
    // and MC-04 -- the actual "Early bird's done. $24.99 from here." post --
    // shipped 2026-08-25, the day AFTER MC's 2026-08-24 through-date, not on
    // it. The through-date is the last early-bird day, not the first regular one.
    expect(currentPrice(MC_PRICING, '2026-08-24')).toBe(18.99);
    expect(currentPrice(LX_PRICING, '2026-09-07')).toBe(24.99);
  });

  it('returns the regular price starting the day after the through-date', () => {
    expect(currentPrice(MC_PRICING, '2026-08-25')).toBe(24.99);
    expect(currentPrice(LX_PRICING, '2026-09-08')).toBe(29.99);
  });

  it('returns the regular price well after the through-date (the live MC bug)', () => {
    expect(currentPrice(MC_PRICING, '2026-09-06')).toBe(24.99);
  });

  it('returns the only price present when an event has no early bird at all', () => {
    expect(currentPrice({ regular: 29.99 }, '2026-08-01')).toBe(29.99);
  });

  it('defaults to the real current date when none is passed', () => {
    // MC's window closed 2026-08-24 and will not reopen -- a stable
    // assertion against the real clock, not a ticking one.
    expect(currentPrice(MC_PRICING)).toBe(24.99);
  });
});

describe('link attribution', () => {
  it('flags a Facebook link carrying utm_source=Instagram', () => {
    // Both links resolve to the same landing page, so the wrong one does not
    // 404 -- it silently misattributes. Nothing but this check surfaces it.
    const found = errorsFor([row({ link_fb: 'https://x.test/?utm_source=Instagram' })], 'utm-source');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('expected Facebook');
  });

  it('flags a link with no utm_source at all', () => {
    expect(errorsFor([row({ link_ig: 'https://x.test/' })], 'utm-source')).toHaveLength(1);
  });

  it('passes correctly-sourced links', () => {
    expect(errorsFor([row()], 'utm-source')).toHaveLength(0);
  });
});

describe('per-post attribution', () => {
  it('flags two rows sharing a utm_content (the proof_rsa1 problem)', () => {
    const found = errorsFor([
      row({ row_id: 'MC-01', utm_content: 'proof_rsa1' }),
      row({ row_id: 'MC-02', utm_content: 'proof_rsa1' }),
    ], 'utm-content');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('MC-01');
  });

  it('passes when every row has its own', () => {
    expect(errorsFor([
      row({ row_id: 'MC-01', utm_content: 'MC-01' }),
      row({ row_id: 'MC-02', utm_content: 'MC-02' }),
    ], 'utm-content')).toHaveLength(0);
  });
});

describe('consent', () => {
  it('flags a pulled image anywhere in asset_files', () => {
    const found = errorsFor([row({ asset_files: 'MC-01.jpg,IMG_9203_crop.jpg' })], 'pulled-image');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('IMG_9203');
  });

  it('allows consented images', () => {
    expect(errorsFor([row({ asset_files: 'IMG_8859.jpg' })], 'pulled-image')).toHaveLength(0);
  });
});

describe('day collisions', () => {
  const collisions = (rows) => lint(rows, BRAND).filter((f) => f.check === 'day-collision');

  it('errors when two feed posts share an exact slot', () => {
    const found = collisions([
      row({ row_id: 'MC-04', date: '2026-08-25', time: '12:30' }),
      row({ row_id: 'TL-05', date: '2026-08-25', time: '12:30' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
  });

  it('only warns when they are separated in time', () => {
    // Two cities, two audiences, same day is a judgment call -- not
    // automatically wrong, so it must not fail the build.
    const found = collisions([
      row({ row_id: 'MC-04', date: '2026-08-25', time: '12:30' }),
      row({ row_id: 'TL-05', date: '2026-08-25', time: '17:00' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
  });

  it('does not count a story against the feed slot', () => {
    expect(collisions([
      row({ row_id: 'MC-04', date: '2026-08-25', time: '12:30' }),
      row({ row_id: 'MC-14', date: '2026-08-25', time: '12:30', platforms: 'ig_story' }),
    ])).toHaveLength(0);
  });

  it('ignores an already-posted row', () => {
    expect(collisions([
      row({ row_id: 'MC-04', date: '2026-08-25', time: '12:30' }),
      row({ row_id: 'TL-05', date: '2026-08-25', time: '12:30', state: 'posted' }),
    ])).toHaveLength(0);
  });
});

describe('structural', () => {
  it('flags an unknown event key', () => {
    expect(errorsFor([row({ events: 'ZZ' })], 'events')).toHaveLength(1);
  });

  it('flags a row with no event key', () => {
    expect(errorsFor([row({ events: '' })], 'events')).toHaveLength(1);
  });

  it('flags a malformed date on a schedulable row', () => {
    expect(errorsFor([row({ date: 'Sept 8' })], 'date')).toHaveLength(1);
  });

  it('leaves posted rows alone', () => {
    // A posted row is history. Re-flagging it every run is noise.
    expect(lint([row({ state: 'posted', date: 'whenever', asset_files: '' })], BRAND)
      .filter((f) => f.severity === 'error')).toHaveLength(0);
  });
});
