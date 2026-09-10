// tests/testimonial-wall.test.js
//
// The homepage carries testimonials in TWO places and they drifted apart:
//
//   - the rotators (six copies, one per page) type one quote at a time and are
//     covered by tests/testimonial-rotator.test.js;
//   - the wall in index.html's #testimonials section lists every approved quote
//     at once, and was covered by nothing.
//
// On 2026-09-04 Helesha and Anonymous M. were added to content/brand.json and
// to all six rotators. The wall kept showing six quotes. Nothing failed, the
// page rendered fine, and the two newest testimonials -- both from women, added
// specifically because the rotation had no women in it -- were simply absent
// from the one section on the site that exists to list them all.
//
// That is the failure this file exists to prevent: not a broken page, a stale
// one. brand.json is the source of truth, so the wall is checked against it.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'brand.json'), 'utf8'));

const approved = brand.universal.approved_testimonials;

/** The wall's cards, in DOM order, read out of the shipped page. */
function wallCards() {
  const wall = html.match(
    /<div class="testimonials-wall">([\s\S]*?)<\/div>\s*<\/section>/,
  );
  if (!wall) return null;
  return [...wall[1].matchAll(
    /<p class="testimonial-quote">([\s\S]*?)<\/p>\s*<div class="testimonial-attribution">([^<]*)<\/div>/g,
  )].map((m) => ({ quote: decode(m[1].trim()), who: decode(m[2].trim()) }));
}

// The page writes these as HTML entities; brand.json holds the characters.
function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// One key per card. A person can have more than one approved quote (Laura M.
// briefly had three, in #513), so the attribution alone does not identify a card.
const key = (who, quote) => `${who}\n${quote}`;

describe('homepage testimonial wall', () => {
  it('is found at all', () => {
    // Guard on the guard: a renamed class would make every assertion below
    // pass against an empty list.
    expect(wallCards()).not.toBeNull();
    expect(wallCards().length).toBeGreaterThan(0);
  });

  it('shows every approved testimonial, none missing', () => {
    const shown = new Set(wallCards().map((c) => key(c.who, c.quote)));
    const missing = approved
      .filter((t) => !shown.has(key(t.attribution, t.quote)))
      .map((t) => ({ who: t.attribution, quote: t.quote }));
    expect(missing).toEqual([]);
  });

  it('shows nothing that is not approved', () => {
    // Also catches a card whose name is right and whose wording is a release
    // old -- that card is not an approved (name, quote) pair.
    const ok = new Set(approved.map((t) => key(t.attribution, t.quote)));
    const extra = wallCards().filter((c) => !ok.has(key(c.who, c.quote)));
    expect(extra).toEqual([]);
  });

  it('never shows superseded wording', () => {
    // The subtler half of the same drift, named outright: brand.json keeps
    // replaced text as previous_quote, and that is what a stale wall shows.
    const stale = new Set(
      approved.filter((t) => t.previous_quote).map((t) => key(t.attribution, t.previous_quote)),
    );
    const wrong = wallCards().filter((c) => stale.has(key(c.who, c.quote)));
    expect(wrong).toEqual([]);
  });

  it('lists each quote once', () => {
    // Each QUOTE, not each person: someone with several approved quotes
    // gets a card for each.
    const keys = wallCards().map((c) => key(c.who, c.quote));
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('puts the women first, as the rotators do', () => {
    // Same rule and same reason as tests/testimonial-rotator.test.js: women are
    // the constrained side of the room, and social proof is the only thing that
    // has demonstrably converted them. Keep the two lists in step.
    const WOMEN = new Set(['Molly', 'Helesha', 'Anonymous M.', 'Laura M.']);
    const flags = wallCards().map((c) => WOMEN.has(c.who));
    const firstMan = flags.indexOf(false);
    const lastWoman = flags.lastIndexOf(true);
    expect(firstMan === -1 || lastWoman < firstMan).toBe(true);
  });
});
