// tests/checkout-closed-states.test.js
//
// The SECOND screen of the three hand-copied checkouts: what each one does
// when there is nothing to sell.
//
// tests/lp-checkout.test.js pins the first screen -- the gender control, the
// live priced button, the field set -- across all three surfaces. It says
// nothing about the closed states, and that is where the same drift continued
// after #453 fixed the open one. The parity audit behind #453 confirmed 46
// divergences; #453 closed the first-screen ones and left these, every one of
// which is reachable from a real link:
//
//   * `status: 'full'` -- the flag a host sets by hand to close an event --
//     was honoured by events.html, lp.html, api/next-event.js and
//     lib/next-event.js, and ignored by event.html and by the purchase
//     endpoint. /event?id= is where every /l/* short link lands.
//   * A host-flagged-full card on /events carried no data-event-id, so it was
//     inert -- and the waitlist lives inside the dialog that click opens.
//   * event.html's Firestore catch only logged, leaving the static
//     placeholders standing as fact and a live checkout on screen. Since the
//     event never loaded, eventPricing() returned 0 and the button read
//     "Reserve Spot · $2.50" (the service fee alone) while the server charges
//     the real price it recomputes from the doc.
//   * Nothing on any surface, client or server, refused to sell an event that
//     had already happened.
//
// Same reasoning as the CHECKOUTS list next door: rules that should hold on
// every surface run over every surface, so a fix to one cannot quietly skip
// the others.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const { isEventOver } = createRequire(import.meta.url)('../lib/next-event.js');

// SPD_CHECKOUT_SRC points the whole suite at a different copy of the five
// files, which is how these assertions were checked against the SHIPPED
// versions rather than only against the fixed ones: extract HEAD to a
// directory, run with it set, and every rule below must fail. A rule that
// passes both ways is pinning nothing. Unset in CI and in normal runs.
const ROOT = process.env.SPD_CHECKOUT_SRC || process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LP = read('public/lp.html');
const EVENTS = read('public/events.html');
const EVENT = read('public/event.html');
const PURCHASE = read('api/purchase-ticket.js');
const NEXT_EVENT = read('api/next-event.js');

const CHECKOUTS = [
  ['lp.html', LP],
  ['events.html', EVENTS],
  ['event.html', EVENT],
];

describe("the host's manual `status: 'full'` flag closes every surface", () => {
  it.each(CHECKOUTS)('%s tests ev.status === \'full\'', (_f, src) => {
    // event.html was the lone dissenter: it computed sold-out from seat
    // counters only, so a hand-closed event with seats on paper kept a live
    // checkout on the one page every listing redirect points at.
    expect(src).toMatch(/status === 'full'/);
  });

  it('event.html applies it as the first term of soldOut, next to the seat count', () => {
    expect(EVENT).toMatch(/const soldOut = ev\.status === 'full' \|\| remaining <= 0;/);
  });

  it('the purchase endpoint refuses it too, so three client files are not the only guard', () => {
    // A stale tab, a back-button, or a direct POST reached a real Stripe
    // charge on an event all three pages were already showing as closed.
    expect(PURCHASE).toMatch(/if \(e\.status === 'full'\)/);
    // Inside the reservation transaction, before any seat maths.
    const flag = PURCHASE.search(/if \(e\.status === 'full'\)/);
    const capacity = PURCHASE.search(/const cap\s+= Number\(e\[capField\]/);
    expect(flag).toBeGreaterThan(-1);
    expect(capacity).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(capacity);
  });
});

describe('a sold-out event still reaches its waitlist', () => {
  it('every /events card is clickable, including a flagged-full one', () => {
    // The attribute used to be gated on `ev.status !== 'full'` while the
    // card's own badge tested isSoldOut() (the flag OR no seats), so the two
    // sold-out cases rendered identically and behaved differently -- and the
    // hand-flagged one lost its waitlist, which lives in the dialog.
    expect(EVENTS).toMatch(/<div class="event-card" data-event-id="\$\{safe\(ev\.id\)\}">/);
    expect(EVENTS).not.toMatch(/ev\.status !== 'full' \? `data-event-id/);
  });

  it('the dialog it opens still refuses to sell', () => {
    // Making the card clickable is only safe because the closed state is
    // handled inside: disabled button, and no straight-to-checkout deep link.
    expect(EVENTS).toMatch(/toCheckout\.disabled = dialogSoldOut;/);
    expect(EVENTS).toMatch(/const straightToCheckout = opts\.checkout && !dialogSoldOut;/);
  });
});

describe('event.html fails closed when the event never loads', () => {
  it('the Firestore catch hides the checkout instead of only logging', () => {
    expect(EVENT).toMatch(/showLoadFailure\(\);/);
    expect(EVENT).toMatch(/function showLoadFailure\(\)/);
  });

  it('it hides the form, the waitlist and the "spots remaining" line', () => {
    const fn = EVENT.slice(EVENT.search(/function showLoadFailure\(\)/));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    expect(body).toMatch(/getElementById\('checkoutForm'\)/);
    expect(body).toMatch(/getElementById\('waitlistBlock'\)/);
    expect(body).toMatch(/\.booking-card \.capacity/);
    // Hides rather than replacing the card's innerHTML: renderSpots() toggles
    // those two by display, and must keep working on the normal path.
    expect(body).not.toMatch(/innerHTML\s*=\s*`/);
  });

  it('says the same honest thing events.html says', () => {
    expect(EVENTS).toMatch(/Could not load events/);
    expect(EVENT).toMatch(/Couldn't load this event/);
  });

  it('the submit handler refuses to charge without the event doc', () => {
    // Covers the race where the fetch is still in flight. Without it the
    // buyer is quoted $2.50 (service fee only, from eventPricing(null)) and
    // charged whatever the server recomputes from the doc.
    expect(EVENT).toMatch(/if \(!eventData\) \{/);
  });
});

describe('an event that has already happened is not for sale', () => {
  it('event.html gates on start + duration, not start alone', () => {
    expect(EVENT).toMatch(/function isEventPast\(ev\)/);
    expect(EVENT).toMatch(/showPastEvent\(\);/);
    // Same rule as lib/next-event.js isEventOver(): an event must not go dark
    // while it is still running.
    expect(EVENT).toMatch(/d\.getTime\(\) \+ hrs \* 60 \* 60 \* 1000 < Date\.now\(\)/);
  });

  it('it does not offer the waitlist for a finished event', () => {
    // The waitlist copy reads "This one's full. Get first refusal on a
    // released seat" -- there is no seat to release on a past event.
    const fn = EVENT.slice(EVENT.search(/function showPastEvent\(\)/));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    expect(body).toMatch(/wl\.style\.display = 'none'/);
    expect(body).toMatch(/co\.style\.display = 'none'/);
  });

  it('the renderer hands the client the verdict it already computed', () => {
    // Rather than a third copy of the date maths.
    expect(NEXT_EVENT).toMatch(/meta name="spd-event-past"/);
    expect(EVENT).toMatch(/meta\[name="spd-event-past"\]/);
  });

  it('the purchase endpoint refuses it, using the same shared helper', () => {
    expect(PURCHASE).toMatch(/isEventOver/);
    expect(PURCHASE).toMatch(/require\('\.\.\/lib\/next-event'\)/);
    expect(PURCHASE).toMatch(/status\(410\)/);
  });

  it("event.html's own copy of the rule agrees with lib/next-event.js, date for date", () => {
    // event.html cannot import from /lib (CommonJS, and no public/*.html
    // imports from there), so its fallback is a hand-written second copy of
    // isEventOver(). A second copy that disagrees is worse than none: the page
    // would sell what the renderer calls finished, or vice versa. This lifts
    // the shipped function out of the HTML and runs it against the real
    // helper, rather than eyeballing that they look alike.
    const src = EVENT.match(/function isEventPast\(ev\) \{[\s\S]*?\n        \}/);
    expect(src, 'isEventPast not found in event.html').toBeTruthy();
    // eslint-disable-next-line no-new-func
    const isEventPast = new Function(
      'document',
      `${src[0]}; return isEventPast;`
    )({ querySelector: () => null }); // no meta tag: exercise the fallback

    const HOUR = 60 * 60 * 1000;
    const now = Date.now();
    const cases = [
      ['finished yesterday', new Date(now - 24 * HOUR), undefined],
      ['started 3h ago, 2h default duration', new Date(now - 3 * HOUR), undefined],
      ['started 1h ago, still running', new Date(now - 1 * HOUR), undefined],
      ['started 3h ago but runs 5h', new Date(now - 3 * HOUR), 5],
      ['starts tomorrow', new Date(now + 24 * HOUR), undefined],
    ];
    for (const [label, date, durationHours] of cases) {
      const mine = isEventPast({ date, durationHours });
      const theirs = isEventOver(date, durationHours);
      expect(mine, `${label}: event.html says ${mine}, lib says ${theirs}`).toBe(theirs);
    }

    // Degenerate input must not read as "over" — that would hide the checkout
    // on an event whose date field is missing or malformed.
    expect(isEventPast({})).toBe(false);
    expect(isEventPast({ date: 'not a date' })).toBe(false);
    expect(isEventPast(null)).toBe(false);
  });

  it('the meta tag alone is enough, without an event date', () => {
    const src = EVENT.match(/function isEventPast\(ev\) \{[\s\S]*?\n        \}/);
    // eslint-disable-next-line no-new-func
    const isEventPast = new Function('document', `${src[0]}; return isEventPast;`)({
      querySelector: (sel) => (sel === 'meta[name="spd-event-past"]' ? {} : null),
    });
    expect(isEventPast({ date: new Date(Date.now() + 864e5) })).toBe(true);
  });

  it('the past-event check runs before any seat is reserved', () => {
    const past = PURCHASE.search(/isEventOver\(evDate, event\.durationHours\)/);
    // The reservation transaction specifically -- two earlier
    // runTransaction calls belong to the 3-D Secure seat sweep.
    const reserve = PURCHASE.search(/reservation = await db\.runTransaction/);
    expect(past).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(-1);
    expect(past).toBeLessThan(reserve);
  });
});

describe('a purchase in flight cannot be submitted twice', () => {
  // Both HTML surfaces disabled the submit button and then handed the buyer a
  // way to re-enable it: the pricing function ends in `btn.disabled = false`,
  // and it is reachable mid-request from the gender buttons and the 2-for-1
  // checkbox, neither of which the submit handler disables. A guest's second
  // submit mints a new paymentMethodId, which changes the server's idempotency
  // key (member|card × event), so Stripe takes a second charge. lp.html has
  // guarded this all along with `coPaying`.
  const GUARDED = [
    ['events.html', EVENTS, 'dialogPaying', 'updateModalPricing'],
    ['event.html', EVENT, 'paying', 'updatePricing'],
    ['lp.html', LP, 'coPaying', null],
  ];

  it.each(GUARDED)('%s refuses a re-entrant submit', (_f, src, flag) => {
    expect(src).toMatch(new RegExp(`if \\(${flag}\\) return;`));
  });

  it.each(GUARDED.filter((g) => g[3]))(
    '%s repaints no price while paying, so the button cannot come back live',
    (_f, src, flag, fn) => {
      const body = src.slice(src.search(new RegExp(`function ${fn}\\(\\)`)));
      const guard = body.search(new RegExp(`if \\(${flag}\\) return;`));
      const enable = body.search(/btn\.disabled = false;/);
      expect(guard, `${fn} needs the paying guard`).toBeGreaterThan(-1);
      expect(enable).toBeGreaterThan(-1);
      expect(guard, 'the guard must precede every re-enable').toBeLessThan(enable);
    }
  );

  it('event.html clears the flag in a finally, so no path strands the button', () => {
    // The failure mode of the guard itself: a throw on an unexpected path
    // leaves `paying` true forever and the buyer can never retry.
    const tail = EVENT.slice(EVENT.search(/checkoutForm'\)\.addEventListener\('submit'/));
    expect(tail).toMatch(/\} finally \{[\s\S]*?paying = false;[\s\S]*?updatePricing\(\);/);
  });
});

describe('a signed-in member is never left with a form they cannot use', () => {
  it('both surfaces clear every lock before deciding what to set', () => {
    // The profile pass has to be idempotent, or re-running it after a reset
    // (or after a sign-out) leaves whatever the previous member set behind.
    // event.html used to early-return on `!userProfile` before touching
    // anything, which is what made its lock one-way.
    for (const [f, src, fn] of [
      ['events.html', EVENTS, 'applyUserContextToModal'],
      ['event.html', EVENT, 'applyUserContext'],
    ]) {
      const body = src.slice(src.search(new RegExp(`function ${fn}\\(\\)`)));
      const head = body.slice(0, body.search(/if \(!userProfile\)/));
      expect(head, `${f}: ${fn} should unlock before the profile check`).toMatch(/disabled = false/);
      expect(body, `${f}: ${fn} needs a guest path, not a bare early return`)
        .toMatch(/if \(!userProfile\) \{/);
    }
  });

  it('signing out gives the form back on both surfaces', () => {
    // Without this the lock was one-way on both pages: userProfile survived
    // the sign-out, so the gender control and the name field stayed disabled
    // carrying the previous member's details.
    // Anchored on the re-assignment inside the auth handler's else branch,
    // NOT on `let userProfile = null;` at the top of the module — matching
    // the declaration would pass against the broken files too.
    expect(EVENT).toMatch(/userProfile = null;\s*\n\s*userTier = 'free';\s*\n\s*memberPhone = '';\s*\n\s*applyUserContext\(\);/);
    expect(EVENTS).toMatch(/userProfile = null;\s*\n\s*userTier = 'free';\s*\n\s*if \(document\.getElementById\('eventModalBackdrop'\)/);
  });

  it('event.html restores the whole profile after a purchase, not just gender', () => {
    // form.reset() blanks the inputs but leaves `disabled` alone. #453
    // patched the gender case by hand here and left the name blank-and-locked
    // with it; re-applying the profile pass covers both plus the card-on-file
    // swap, and cannot drift from it.
    const tail = EVENT.slice(EVENT.search(/getElementById\('checkoutForm'\)\.reset\(\)/));
    const block = tail.slice(0, 2000);
    expect(block).toMatch(/applyUserContext\(\);/);
    expect(block).not.toMatch(/genderAfterReset/);
  });

  it('both surfaces forward the member phone, neither hardcodes a blank', () => {
    // #453 flagged this as a deliberate divergence and named event.html the
    // correct side: the modal sent `phone: ''`, and the endpoint writes what
    // it is sent onto the registration doc, so the same member got a
    // registration with their number from /event?id= and a blank one from the
    // dialog. Resolved by raising the modal, never by levelling event.html
    // down — hence the explicit assertion that neither sends a literal blank.
    expect(EVENT).toMatch(/memberPhone = userProfile\.phone;/);
    expect(EVENTS).toMatch(/if \(userProfile\.phone\) memberPhone = userProfile\.phone;/);
    expect(EVENT).toMatch(/const phone = memberPhone;/);
    expect(EVENTS).toMatch(/const phone = memberPhone;/);
    expect(EVENTS).not.toMatch(/const phone = '';/);
  });

  it('the modal resets the carried phone before it decides, not after', () => {
    // applyUserContextToModal() re-runs on every open and on auth change, so a
    // memberPhone left set would post one person's number onto another's
    // registration and into Stripe billing_details.
    const body = EVENTS.slice(EVENTS.search(/function applyUserContextToModal\(\)/));
    const reset = body.search(/memberPhone = '';/);
    const guard = body.search(/if \(!userProfile\)/);
    expect(reset).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(guard);
  });
});
