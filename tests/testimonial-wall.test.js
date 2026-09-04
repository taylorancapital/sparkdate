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

describe('homepage testimonial wall', () => {
  it('is found at all', () => {
    // Guard on the guard: a renamed class would make every assertion below
    // pass against an empty list.
    expect(wallCards()).not.toBeNull();
    expect(wallCards().length).toBeGreaterThan(0);
  });

  it('shows every approved testimonial, none missing', () => {
    const shown = new Set(wallCards().map((c) => c.who));
    const missing = approved.map((t) => t.attribution).filter((a) => !shown.has(a));
    expect(missing).toEqual([]);
  });

  it('shows nothing that is not approved', () => {
    const ok = new Set(approved.map((t) => t.attribution));
    const extra = wallCards().map((c) => c.who).filter((w) => !ok.has(w));
    expect(extra).toEqual([]);
  });

  it('quotes each person exactly as brand.json has them', () => {
    // Catches the subtler half of the same drift: the name is present, the
    // wording is a release old. brand.json keeps superseded text as
    // previous_quote for three people, and that is what would show here.
    const byWho = new Map(approved.map((t) => [t.attribution, t.quote]));
    const wrong = wallCards()
      .filter((c) => byWho.get(c.who) !== c.quote)
      .map((c) => ({ who: c.who, onPage: c.quote, inBrand: byWho.get(c.who) }));
    expect(wrong).toEqual([]);
  });

  it('lists each person once', () => {
    const who = wallCards().map((c) => c.who);
    expect(who.length).toBe(new Set(who).size);
  });

  it('puts the women first, as the rotators do', () => {
    // Same rule and same reason as tests/testimonial-rotator.test.js: women are
    // the constrained side of the room, and social proof is the only thing that
    // has demonstrably converted them. Keep the two lists in step.
    const WOMEN = new Set(['Molly', 'Helesha', 'Anonymous M.']);
    const flags = wallCards().map((c) => WOMEN.has(c.who));
    const firstMan = flags.indexOf(false);
    const lastWoman = flags.lastIndexOf(true);
    expect(firstMan === -1 || lastWoman < firstMan).toBe(true);
  });
});
