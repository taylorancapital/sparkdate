// tests/lp-checkout.test.js
//
// The paid path's first screen, pinned. reports/PAID_FUNNEL_AUDIT_2026-09-02.md
// found that of every 1,000 paid visitors, 36 tapped Get Tickets, 33 reached a
// checkout form, 8 touched its first field and 2 bought -- and that the form
// lost nobody after the card. The form's first screen was a dropdown reading
// "Select...", a disabled button reading "Select Gender" below the fold, a
// phone field, a women-only offer shown to men, and (for the in-app majority)
// a warning that checkout may fail. These tests keep each of those from coming
// back, on every surface a buyer can check out from.
//
// No shared bundle exists (standalone static pages), so the checks read the
// shipped files rather than a copy kept here.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const LP = read('lp.html');
const EVENTS = read('events.html');
const EVENT = read('event.html');

// Every first-screen rule below runs over all THREE checkouts, not the two
// paid ones. It used to run over lp.html and events.html only, on the reasoning
// that those are the surfaces paid traffic lands in -- and that scoping is
// exactly how public/event.html kept the old first screen for three days after
// #419 replaced it everywhere else. #419 rewrote lp.html (+422 lines) and
// events.html (+204) and touched event.html for 23, so /event?id= still shipped
// the dropdown, the disabled "Select Gender" button and the $0.00 total the
// audit blamed -- on the page every /l/* listing redirect in vercel.json points
// at (Eventbrite, AllEvents, Meetup, Facebook events, Google Business, the
// tourism boards), plus every email and share link.
//
// Paid or not, a buyer who reaches a checkout should meet the same one. Add new
// surfaces to CHECKOUTS rather than to a pair.
const CHECKOUTS = [['lp.html', LP], ['events.html', EVENTS], ['event.html', EVENT]];

describe('/lp sells the event inline', () => {
  it('carries a checkout form that posts to the purchase API', () => {
    expect(LP).toMatch(/id="lpCheckout"/);
    expect(LP).toMatch(/fetch\('\/api\/purchase-ticket'/);
  });

  it('still deep-links to the /events dialog for the cases the form cannot handle', () => {
    // Sold out, or the event never resolved: the link goes through to the
    // dialog, where the waitlist lives.
    expect(LP).toMatch(/\/events\?event=' \+ encodeURIComponent\(ev\.id\) \+ '&checkout=1'/);
    expect(LP).toMatch(/function coSellable/);
  });

  it('opens on the Get Tickets tap and on the sticky bar, firing the same funnel events as the dialog', () => {
    expect(LP).toMatch(/openInlineCheckout\(e\)/);
    expect(LP).toMatch(/window\.sdOpenCheckout\(e\)/);
    for (const ev of ['view_item', 'begin_checkout', 'checkout_form_started', 'add_to_cart', 'add_payment_info', 'purchase', 'checkout_error']) {
      expect(LP, `lp.html should fire ${ev}`).toMatch(new RegExp(`gtag\\('event', '${ev}'`));
    }
  });

  it('keeps the sticky bar off the Reserve button while the form is open', () => {
    expect(LP).toMatch(/window\.sdCheckoutOpen/);
  });

  it('records whether the page started hidden, and when it became visible', () => {
    // The in-app bounce cannot be trusted as a human number until prerendered
    // sessions can be subtracted (audit §1).
    expect(LP).toMatch(/'page_started_hidden'/);
    expect(LP).toMatch(/gtag\('event', 'lp_visible'/);
  });

  it('renders the first testimonial whole before the typewriter starts', () => {
    // The live screenshot caught "Good ne" -- a one-second visitor saw half a word.
    expect(LP).toMatch(/if \(first\) \{[\s\S]*?textEl\.textContent = item\.q;[\s\S]*?whoEl\.textContent = '— ' \+ item\.who;[\s\S]*?return;/);
  });

  it('puts one line of what the night is inside the card, with no number in it', () => {
    const m = LP.match(/<div class="proof">([^<]+)<\/div>/);
    expect(m, 'no .proof line in the ticket card').toBeTruthy();
    expect(m[1]).not.toMatch(/\d/);
  });
});

describe('the first screen of the checkout, on every surface', () => {
  it.each(CHECKOUTS)('%s asks gender as two tap targets, not a select', (_f, src) => {
    expect(src).toMatch(/class="gender-btn"[^>]*data-gender="woman"/);
    expect(src).toMatch(/class="gender-btn"[^>]*data-gender="man"/);
  });

  it('events.html keeps #modalGender as the value the rest of the dialog reads', () => {
    expect(EVENTS).toMatch(/<input type="hidden" id="modalGender"/);
    expect(EVENTS).not.toMatch(/<select id="modalGender"/);
  });

  it('event.html keeps #ticketGender as the value the rest of the page reads', () => {
    // Same trick as the dialog: the id and every `.value` read survive the
    // swap, so pricing, submit and the member pre-fill did not have to change.
    expect(EVENT).toMatch(/<input type="hidden" id="ticketGender"/);
    expect(EVENT).not.toMatch(/<select id="ticketGender"/);
  });

  it.each(CHECKOUTS)('%s enables the Reserve button from the first frame', (_f, src) => {
    expect(src).not.toMatch(/id="(modalCheckoutBtn|lpPayBtn|checkoutBtn)"[^>]*\bdisabled\b/);
    expect(src).not.toMatch(/'Select Gender'/);
    expect(src).toMatch(/Choose Woman or Man to continue/);
  });

  it.each(CHECKOUTS)('%s shows the real price before a gender is chosen', (_f, src) => {
    // The empty-gender branch seeds the listing price rather than rendering an
    // all-zero order summary next to a dead button. `seeded` is the flag all
    // three use to say the price resolved before a gender was chosen; the
    // middot label is what it produces. (Matched separately from the "$"
    // because lp.html concatenates its amount and the other two interpolate.)
    expect(src).toMatch(/Reserve Spot · /);
    expect(src).toMatch(/\bseeded\b/);
  });

  it.each(CHECKOUTS)('%s does not ask for a phone number', (_f, src) => {
    // Markup, not the stylesheet: events.html still styles input[type="tel"]
    // for the waitlist form's sake.
    expect(src).not.toMatch(/<input[^>]*type="tel"/);
    expect(src).not.toMatch(/id="modalPhone"/);
  });

  it('carries no "checkout may fail" warning at the point of payment', () => {
    // Rendered markup only -- the comments that explain the removal may
    // quote the old copy.
    expect(EVENTS).not.toMatch(/modalIabWarn/);
    expect(EVENTS).not.toMatch(/<strong>Checkout may fail/);
    expect(LP).not.toMatch(/<span>Checkout can fail/);
    // event.html carried the loudest version of it: a dismissible amber banner
    // at the top of the page, shown to every in-app visitor on arrival.
    expect(EVENT).not.toMatch(/class="iab-banner"/);
    expect(EVENT).not.toMatch(/id="iabBanner"/);
    // The quiet copy-link line survives for the rare card that needs a browser.
    expect(EVENTS).toMatch(/id="modalIabHelp"/);
    expect(LP).toMatch(/id="lpIabHelp"/);
    expect(EVENT).toMatch(/id="iabHelp"/);
  });

  it.each(CHECKOUTS)('%s puts the Reserve button above the 2-for-1, not below it', (_f, src) => {
    // The offer and its four +1 fields used to sit between the card and the
    // button on event.html, pushing the CTA off a phone screen for the
    // majority who never take it.
    // Anchored on markup, not on the class name: `.two-for-one-toggle` also
    // appears in each file's <style> block, which sits above everything.
    const btn = src.search(/<button type="submit"[^>]*id="(modalCheckoutBtn|lpPayBtn|checkoutBtn)"/);
    const offer = src.search(/<input type="checkbox" id="(modalTwoForOne|lpTwo|twoForOneCheckbox)"/);
    expect(btn, 'no submit button found').toBeGreaterThan(-1);
    expect(offer, 'no 2-for-1 checkbox found').toBeGreaterThan(-1);
    expect(btn).toBeLessThan(offer);
  });

  it.each(CHECKOUTS)('%s reports first focus per field', (_f, src) => {
    expect(src).toMatch(/gtag\('event', 'checkout_field_started'/);
  });

  it.each(CHECKOUTS)('%s sends every purchase payload with attribution', (_f, src) => {
    // Mirrors tests/attribution-wiring.test.js's rule for the new form.
    const payloads = (src.match(/payload\s*=\s*\{/g) || []).length;
    const reads = (src.match(/attribution:\s*\(function/g) || []).length;
    expect(payloads).toBeGreaterThan(0);
    expect(reads).toBe(payloads);
  });
});
