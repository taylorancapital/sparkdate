// tests/view-promotion.test.js
//
// A promotion click without a promotion impression is a numerator with no
// denominator. Until 2026-08-28 this site fired select_promotion everywhere and
// view_promotion nowhere, so GA4 reported "Items clicked in promotion" = 61 and
// "Items viewed in promotion" = 0 on every row. The 2026-08-28 report could say
// the /lp sticky bar took 3 of 61 clicks and could not say whether that was 3
// from 40 impressions or 3 from 1,800 — which is the difference between keeping
// the bar and removing it.
//
// Two things are pinned here:
//   1. The dedupe, behaviourally, by running the SHIPPED helper. A sticky bar
//      that scrolls in and out repeatedly must count once; without that guard
//      the denominator inflates with scrolling and every CTR reads far too low.
//   2. The structural pairing: a page that fires select_promotion must also
//      fire view_promotion, and every literal promotion name on the click side
//      must appear on the impression side. That is the check that stops the
//      original bug being reintroduced by a new CTA.
//
// There is no shared bundle (the 12-function Vercel Hobby cap), so the helper is
// duplicated across four pages and the tests read it out of the pages rather
// than from a copy kept here.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));

// Derived from source, so a new page that adds a CTA is covered the day it is
// added rather than the day someone remembers this list.
const clickPages = htmlFiles.filter((f) => /gtag\('event', 'select_promotion'/.test(read(f)));

const helperSrc = (f) =>
  (read(f).match(/window\.sdViewPromotion = \(function \(\) \{[\s\S]*?\}\)\(\);/) || [])[0];

/** Literal promotion_name strings passed to select_promotion on a page. */
function clickNames(f) {
  const src = read(f);
  const names = new Set();
  for (const m of src.matchAll(/gtag\('event', 'select_promotion',[\s\S]{0,400}?\}\)/g)) {
    for (const n of m[0].matchAll(/promotion_name:\s*(?:[\w.\[\]|' ]*\|\|\s*)?'([^']+)'/g)) {
      names.add(n[1]);
    }
  }
  return [...names];
}

describe('view_promotion — the impression half', () => {
  it('finds the pages that fire select_promotion', () => {
    // Guard on the guard: an empty list would pass every check below vacuously.
    expect(clickPages.length).toBeGreaterThan(0);
  });

  it.each(clickPages)('%s also fires view_promotion', (file) => {
    expect(
      /sdViewPromotion\(/.test(read(file)),
      `${file} fires select_promotion but never view_promotion, so its clicks have no `
      + `impression denominator — this is the exact bug the 2026-08-28 report hit.`,
    ).toBe(true);
  });

  it.each(clickPages)('%s pairs every literal promotion name', (file) => {
    const src = read(file);
    const impressions = [...src.matchAll(/sdViewPromotion\([^)]*\)/g)].join(' ');
    for (const name of clickNames(file)) {
      expect(
        impressions.includes(`'${name}'`),
        `${file} fires select_promotion with promotion_name '${name}' but never reports an `
        + `impression for it. Add a matching sdViewPromotion('${name}', …).`,
      ).toBe(true);
    }
  });

  it('uses an identical helper on every page', () => {
    // Compared across pages rather than against a copy pinned in here — a fifth
    // transcription is one more place to drift, and the copy in the test is the
    // one nobody notices is stale.
    //
    // Whitespace-normalised on purpose: index.html indents its analytics block
    // at 8 spaces where the other three use 6, which is pre-existing and not
    // worth churning. What must not drift is the logic.
    const norm = (h) => (h || '').replace(/\s+/g, ' ').trim();
    const found = clickPages.map((f) => [f, norm(helperSrc(f))]);
    const distinct = new Set(found.map(([, h]) => h));
    expect(
      distinct.size,
      `Expected one helper across ${clickPages.length} pages, found ${distinct.size}:\n`
      + found.map(([f, h]) => `  ${f}: ${h ? h.slice(0, 60) + '…' : 'MISSING'}`).join('\n'),
    ).toBe(1);
    expect([...distinct][0], 'no helper could be extracted').toContain('view_promotion');
  });

  describe('the shipped helper itself', () => {
    /** Run the real helper from lp.html against a recording gtag stub. */
    function load() {
      const events = [];
      const context = { window: {}, gtag: (...a) => events.push(a) };
      vm.createContext(context);
      vm.runInContext(helperSrc('lp.html'), context);
      return { fire: context.window.sdViewPromotion, events };
    }

    it('emits view_promotion with the name and slot', () => {
      const { fire, events } = load();
      fire('lp_sticky_bar', 'lp_sticky');
      expect(events).toHaveLength(1);
      expect(events[0][0]).toBe('event');
      expect(events[0][1]).toBe('view_promotion');
      expect(events[0][2]).toEqual({ promotion_name: 'lp_sticky_bar', creative_slot: 'lp_sticky' });
    });

    it('counts a promotion once however many times it is seen', () => {
      // The load-bearing case: a sticky bar scrolled in, out and back in.
      const { fire, events } = load();
      for (let i = 0; i < 5; i++) fire('lp_sticky_bar', 'lp_sticky');
      expect(events).toHaveLength(1);
    });

    it('counts different promotions separately', () => {
      const { fire, events } = load();
      fire('lp_get_tickets', 'lp');
      fire('lp_sticky_bar', 'lp_sticky');
      fire('lp_get_tickets', 'lp');
      expect(events).toHaveLength(2);
      expect(events.map((e) => e[2].promotion_name)).toEqual(['lp_get_tickets', 'lp_sticky_bar']);
    });

    it('is inert when gtag is absent rather than throwing', () => {
      const context = { window: {} };
      vm.createContext(context);
      vm.runInContext(helperSrc('lp.html'), context);
      expect(() => context.window.sdViewPromotion('x', 'y')).not.toThrow();
    });

    it('does not mark a promotion as seen when gtag was missing', () => {
      // Otherwise a page whose gtag loads late would lose its impression
      // permanently while still counting the click.
      const context = { window: {}, gtag: undefined };
      vm.createContext(context);
      vm.runInContext(helperSrc('lp.html'), context);
      context.window.sdViewPromotion('lp_sticky_bar', 'lp_sticky');
      const events = [];
      context.gtag = (...a) => events.push(a);
      context.window.sdViewPromotion('lp_sticky_bar', 'lp_sticky');
      expect(events).toHaveLength(1);
    });
  });
});
