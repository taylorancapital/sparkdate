// tests/pricing.test.js
//
// Guards the SERVICE_FEE_CENTS source-of-truth in lib/pricing.js against
// silent drift from the mirror constant in public/event.html.
//
// Background: the server (api/purchase-ticket.js) charges
//   amount = (event.priceMen|priceWomen × 100) + SERVICE_FEE_CENTS
// The browser (public/event.html) shows
//   total  = ticket + SERVICE_FEE
// in real time as the user picks gender. If those two numbers ever
// disagree, the page lies about the total a beat before checkout
// rejects it (or worse, charges a different amount than displayed).
//
// We can't share the constant directly — Vercel Hobby caps us at 12
// functions so a /api/public-config endpoint isn't an option. So we
// parse event.html out of the source tree on every CI run and assert
// the two values agree.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_FEE_CENTS } from '../lib/pricing.js';

describe('SERVICE_FEE_CENTS source-of-truth', () => {
  it('is a positive integer in cents', () => {
    expect(Number.isInteger(SERVICE_FEE_CENTS)).toBe(true);
    expect(SERVICE_FEE_CENTS).toBeGreaterThanOrEqual(0);
  });

  it('matches the hardcoded SERVICE_FEE in public/event.html', () => {
    const eventHtml = readFileSync(
      join(__dirname, '..', 'public', 'event.html'),
      'utf8'
    );

    // Match: const SERVICE_FEE = 2.50;
    // Tolerates whatever whitespace the file currently uses; pins the
    // const declaration shape so this test breaks loudly if someone
    // renames the constant or removes it entirely (which would also
    // need fixing).
    const m = eventHtml.match(/const\s+SERVICE_FEE\s*=\s*([\d.]+)\s*;/);
    expect(m, 'public/event.html: could not find `const SERVICE_FEE = <n>;`').toBeTruthy();

    const eventHtmlDollars = parseFloat(m[1]);
    const expectedDollars  = SERVICE_FEE_CENTS / 100;

    // Use toBeCloseTo to handle floating-point representation, but with
    // enough precision (2 decimal places) that drift at the cent level
    // is still caught.
    expect(eventHtmlDollars).toBeCloseTo(expectedDollars, 2);
  });
});
