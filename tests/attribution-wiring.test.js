// tests/attribution-wiring.test.js
//
// Attribution is only as good as its least-wired page.
//
// The capture/send pair was added to lp.html and events.html and missed on
// event.html -- which is the page the ENTIRE email nurture sequence links to.
// Every welcome, day2, day5, day14, day25, post-event, returning and
// newsletter CTA points at /event?id=...&utm_source=email, so email-driven
// sales recorded no channel at all. Nothing failed, nothing logged, and the
// Stripe metadata simply had no utm_source on those rows -- which reads
// identically to "this buyer came from nowhere".
//
// This project has no shared bundle (the 12-function Vercel Hobby cap is why),
// so every page carries its own copy of this logic and a new purchase page can
// silently omit it. That is a structural risk, not a one-off mistake, so it
// gets a structural check.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));

// Pages that POST to the purchase endpoint. Derived from the source rather
// than hard-coded, so a NEW checkout page is covered the day it is added
// instead of the day someone remembers to update this list.
// Match the actual fetch, not the string: admin.html and city.html both
// discuss /api/purchase-ticket in comments without ever calling it, and
// treating those as checkout pages made this suite fail on pages that have
// no purchase to attribute.
const purchasePages = htmlFiles.filter((f) => /fetch\(\s*['"`]\/api\/purchase-ticket/.test(read(f)));

describe('attribution wiring', () => {
  it('finds the purchase pages', () => {
    // A guard on the guard: if this ever returns nothing, the check above
    // silently passes for every page and the suite proves nothing.
    expect(purchasePages.length).toBeGreaterThan(0);
  });

  it.each(purchasePages)('%s sends attribution with every purchase payload', (file) => {
    const src = read(file);

    // Count the payloads that actually go to the purchase endpoint. Each
    // page has two: the saved-card path and the new-card path. Both must
    // carry attribution -- a returning buyer's channel matters as much as a
    // new one's, and missing only the saved-card branch would look like
    // "repeat buyers come from nowhere".
    const payloads = src.match(/payload\s*=\s*\{/g) || [];
    const attributionReads = src.match(/attribution:\s*\(function/g) || [];

    expect(
      attributionReads.length,
      `${file} builds ${payloads.length} purchase payload(s) but reads sparkdate_attr `
      + `${attributionReads.length} time(s). Every payload must carry attribution.`,
    ).toBe(payloads.length);
  });

  it.each(purchasePages)('%s also CAPTURES first-touch attribution on landing', (file) => {
    // Reading the store is useless if nothing ever writes it. A page reached
    // directly from an email or ad must record the UTMs itself -- it cannot
    // assume the visitor passed through lp.html first.
    const src = read(file);
    expect(
      src.includes("localStorage.setItem('sparkdate_attr'"),
      `${file} reads sparkdate_attr but never writes it. A visitor landing here `
      + 'directly from an email or ad would have no attribution to send.',
    ).toBe(true);
  });

  it('keeps first-touch semantics: capture never overwrites', () => {
    // The whole point is that an ad click today still credits the ad when the
    // purchase happens three weeks later. An unguarded setItem would make it
    // LAST-touch and quietly credit whatever page the buyer happened to
    // reload before paying.
    for (const file of purchasePages.concat('lp.html')) {
      const src = read(file);
      if (!src.includes("localStorage.setItem('sparkdate_attr'")) continue;
      expect(
        src.includes("!localStorage.getItem('sparkdate_attr')"),
        `${file} writes sparkdate_attr without checking it is unset -- that is last-touch, not first-touch.`,
      ).toBe(true);
    }
  });
});
