# Why paid traffic doesn't convert — corrected after checking Stripe

**2026-08-22.** Traced `/lp` live, then checked the Stripe Dashboard. **The
Stripe data disproved my first diagnosis.** Both versions are below, because
the wrong one had been circulating for weeks in a different form.

---

## What I claimed first, and why it was wrong

I said: checkout uses embedded Stripe Elements and `confirmCardPayment()`, so
3D-Secure renders in an iframe that the Facebook/Instagram in-app browser
blocks — and iOS has no escape hatch. The codebase says so in its own comments,
and it was consistent with 422 paid users producing zero purchases.

**The Stripe Dashboard says no.**

| | |
|---|---|
| Incomplete payments, last 30 days | **0** |
| Incomplete payments, **all time** | **0** |
| `requires_action` records | **none, ever** |
| 3DS steps in succeeded timelines | **none** — only "Payment started → Payment authorized" |

3DS is not failing in the webview. **It is never being triggered at all.** The
architecture is genuinely iframe-based, and the authors' concern was
reasonable, but it is not what is costing the sales.

---

## What the data actually shows

**Checkout works.** 14 payments succeeded in the last 30 days, **$370.86**. Two
failed on ordinary card declines ("Incorrect number", "Generic decline"). One
was refunded a minute after charging.

**Nobody from paid traffic submits a card.** Submitting a card creates a
PaymentIntent. A card that failed 3DS would leave one at `requires_action`; a
card that was abandoned mid-form would leave one at `requires_payment_method`.
There are none of either — in the entire account history. So paid visitors are
dropping **before the card is submitted**, not during payment.

And `/lp` itself is fine. Verified live at 375×812: the CTA resolves to the real
event (`/events?event=8E9WZTat32JyoUjWuIE7`), shows `$24.99`, carries all three
UTMs, shows scarcity copy, and the dialog opens with Stripe loaded.

---

## The finding that actually matters

**Nothing records which channel a purchase came from, so "the ads produced zero
sales" is not a measurement — it is an absence of measurement.**

- Stripe metadata is `{ eventId, gender, type: 'ticket' }` — no source.
- The ticket doc's `source` field is `'ticket_purchase'`, a record TYPE, not a
  traffic source.
- UTMs travel in the URL from `/lp` to `/events` and are then dropped. Nothing
  stores them; the purchase POST does not send them.

So 14 real sales happened in 30 days and **none of them can be attributed to a
channel from our own records.** Meta reports zero conversions, but Meta can only
see what its pixel catches — which excludes every iOS user who declined
tracking. Some of those 14 could be ad-driven and invisible.

We do not know. That is the honest state, and it is a different problem from the
one I described.

### The fix is small, and the pattern already exists

`ref` is already captured and persisted:

```js
if (refParam) localStorage.setItem('sparkdate_ref', refParam.slice(0, 80));
```

Do the same for `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` on
first touch, send them with the purchase POST, and write them onto the ticket
doc and into the Stripe metadata. Then within two weeks the question answers
itself, and the admin dashboard's CAC becomes real rather than assumed.

**This is the thing to build.** Not hosted checkout — that solves a problem the
data says isn't happening.

---

## What I still cannot rule out

Paid visitors abandon somewhere between landing and the card field. Candidates,
none of which the data distinguishes yet:

1. **Price.** $24.99 appears on the CTA, so it is not a surprise at the dialog —
   but the offer may simply not be compelling to this audience.
2. **Targeting.** 42 clicks at $0.24–$3.54 CPC across nine campaigns. Cheap
   clicks from low-intent audiences look identical to good clicks in Meta.
3. **The dialog.** Two steps before a card field; each one loses people.
4. **Volume.** $25/day across nine campaigns is ~$2.80 each. Nothing has enough
   data to conclude anything, including this analysis.

Instrumenting attribution tells you which. Guessing does not, and I have already
guessed wrong once here.

## Still worth five minutes

Open `/lp` from inside the Instagram app on your own phone and buy a ticket with
a real card. That reproduces the whole path directly. If it completes cleanly,
the webview theory is dead in every form and the answer is upstream — targeting,
offer, or volume.
