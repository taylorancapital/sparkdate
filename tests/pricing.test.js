// tests/pricing.test.js
//
// Guards the SERVICE_FEE_CENTS source-of-truth in lib/pricing.js against
// silent drift from the mirror constants in public/event.html AND
// public/events.html (the latter's event-dialog checkout duplicates the
// same literal — see events.html's own SERVICE_FEE comment).
//
// Background: the server (api/purchase-ticket.js) charges
//   amount = (event.priceMen|priceWomen × 100) + SERVICE_FEE_CENTS
// Both browser checkouts show
//   total  = ticket + SERVICE_FEE
// in real time as the user picks gender. If any of these numbers ever
// disagree, the page lies about the total a beat before checkout
// rejects it (or worse, charges a different amount than displayed).
//
// We can't share the constant directly — Vercel Hobby caps us at 12
// functions so a /api/public-config endpoint isn't an option. So we
// parse both pages out of the source tree on every CI run and assert
// all three values agree.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_FEE_CENTS } from '../lib/pricing.js';

function serviceFeeDollarsIn(relativePath) {
  const html = readFileSync(join(__dirname, '..', relativePath), 'utf8');
  // Match: const SERVICE_FEE = 2.50;
  // Tolerates whatever whitespace the file currently uses; pins the
  // const declaration shape so this test breaks loudly if someone
  // renames the constant or removes it entirely (which would also
  // need fixing).
  const m = html.match(/const\s+SERVICE_FEE\s*=\s*([\d.]+)\s*;/);
  expect(m, `${relativePath}: could not find `+'`const SERVICE_FEE = <n>;`').toBeTruthy();
  return parseFloat(m[1]);
}

describe('SERVICE_FEE_CENTS source-of-truth', () => {
  it('is a positive integer in cents', () => {
    expect(Number.isInteger(SERVICE_FEE_CENTS)).toBe(true);
    expect(SERVICE_FEE_CENTS).toBeGreaterThanOrEqual(0);
  });

  it('matches the hardcoded SERVICE_FEE in public/event.html', () => {
    const expectedDollars = SERVICE_FEE_CENTS / 100;
    // Use toBeCloseTo to handle floating-point representation, but with
    // enough precision (2 decimal places) that drift at the cent level
    // is still caught.
    expect(serviceFeeDollarsIn('public/event.html')).toBeCloseTo(expectedDollars, 2);
  });

  it('matches the hardcoded SERVICE_FEE in public/events.html (event dialog)', () => {
    const expectedDollars = SERVICE_FEE_CENTS / 100;
    expect(serviceFeeDollarsIn('public/events.html')).toBeCloseTo(expectedDollars, 2);
  });

  it('matches the hardcoded SERVICE_FEE in public/lp.html (inline checkout)', () => {
    // The third copy, added 2026-09-03 when /lp started selling inline.
    const expectedDollars = SERVICE_FEE_CENTS / 100;
    expect(serviceFeeDollarsIn('public/lp.html')).toBeCloseTo(expectedDollars, 2);
  });

  // public/city.html is the odd one out: it has no checkout and so no
  // `const SERVICE_FEE`. It states the fee in PROSE, inside FAQ answers that
  // are emitted verbatim into FAQPage JSON-LD -- so the number is a
  // machine-readable claim Google can surface, and drift there is a false
  // price in structured data rather than a wrong total on a button.
  //
  // Added 2026-09-04, when those answers said "$24.99 ... no hidden fees"
  // while checkout charged $27.49. Prose, so it is matched as prose.
  it('states a service fee in public/city.html that agrees with lib/pricing.js', () => {
    const html = readFileSync(join(__dirname, '..', 'public/city.html'), 'utf8');
    const matches = [...html.matchAll(/\$([\d.]+)\s+service fee/g)].map((m) => parseFloat(m[1]));

    expect(matches.length, 'public/city.html: expected at least one "$<n> service fee"').toBeGreaterThan(0);

    const expectedDollars = SERVICE_FEE_CENTS / 100;
    matches.forEach((dollars) => expect(dollars).toBeCloseTo(expectedDollars, 2));
  });

  // The claim the fee disclosure replaced. "No hidden fees" beside a mandatory
  // service fee is false however the price is worded, and it shipped into
  // structured data for months. Cheap to retype, so it is pinned.
  it('does not claim "no hidden fees" anywhere a fee is actually charged', () => {
    // Comments are stripped first: this rule is about what SHIPS, and the
    // comment in city.html that explains the rule quotes the banned phrase.
    // Only whole-line // comments and <!-- --> blocks go, so a `https://`
    // inside real markup survives.
    const stripComments = (s) => s
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    ['public/city.html', 'public/lp.html', 'public/event.html', 'public/events.html'].forEach((p) => {
      const shipped = stripComments(readFileSync(join(__dirname, '..', p), 'utf8'));
      expect(/no hidden fees/i.test(shipped), `${p}: says "no hidden fees" while ` + 'lib/pricing.js charges one').toBe(false);
    });
  });
});
