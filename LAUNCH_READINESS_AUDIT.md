# SparkDate — Launch-Readiness Audit (money + data paths)

**Date:** 2026-06-06 · **Scope:** read-only review of the revenue + data-integrity paths
(`api/purchase-ticket.js`, `api/stripe-webhook.js`, `lib/seat-model.js`, `lib/profile-link.js`,
`api/lead-signup.js`, `api/cron-send-emails.js`). No code was changed on `main`.

**Verdict:** The critical paths are well-built — atomic seat reservation, server-side pricing,
webhook idempotency, fail-open enrollment with cleanup. The findings below are mostly
**edge cases and one funnel gap**, not show-stoppers. Nothing here blocks taking money today.

---

## P1 — 3-D Secure guests fall out of the entire post-purchase funnel

**Where:** `api/purchase-ticket.js` (handler returns early on `requires_action`, line ~687)
→ `api/stripe-webhook.js` (`payment_intent.succeeded`, line ~163).

**What happens:** When a guest pays with a card that triggers 3-D Secure, the handler writes the
ticket as `pending_3ds` and returns the `clientSecret` *before* reaching `enrollGuestAsMember()`
(line ~708) and `recordLead()` (line ~720). The browser completes 3DS, and the webhook's
`payment_intent.succeeded` case only flips the ticket/registration to `confirmed`. It does **not**:

- send the "Your ticket is locked in" welcome email,
- create the Firebase user + 30-day Spark trial subscription,
- generate the profile magic link, or
- record the buyer as a lead (so they never enter the nurture cron).

**Net effect:** a 3DS guest gets a valid confirmed ticket but receives **zero** post-purchase
communication and is invisible to the funnel. Non-3DS guests (the common US case for low-value
charges) are unaffected — this only bites cards/regions that force 3DS.

**Fix (for review):** In the webhook's `payment_intent.succeeded` ticket branch, when the ticket has
no `firebaseUid` (guest), read the ticket doc (it already stores `email`, `name`, `gender`, `phone`)
and run the same `enrollGuestAsMember` + `recordLead` logic, passing `pi.payment_method` as the
payment method id. Guard it with the existing `stripe_events` idempotency lock so a redelivery can't
double-enroll. Needs Stripe-mode testing with a 3DS test card (`4000 0027 6000 3184`).

---

## P2 — Re-submitting a purchase reserves a phantom seat (members can get a free extra ticket)

**Where:** `api/purchase-ticket.js` — seat counter is incremented per request inside the txn
(line ~548), but the Stripe idempotency key is stable per buyer+event:
`ticket:${eventId}:${firebaseUid || paymentMethodId}` (line ~575).

**What happens:** Two requests for the same event with the same key each run the seat transaction
(counter +1 each = **2 seats reserved**), but `paymentIntents.create` returns the *same* PaymentIntent
for both (idempotent = **1 charge**). Two ticket rows are written pointing at one PaymentIntent.

- **Members** (`firebaseUid` in the key): re-submitting yields a **second ticket with no second
  charge** + a phantom seat. A small revenue/abuse gap if multi-ticket purchase is ever reachable
  in the UI (or via double-click before the button disables).
- **Guests** (`paymentMethodId` in the key): a *double-click on the same tokenized card* reserves a
  phantom seat (no double charge). Re-entering the card creates a new `pm_…` → new key → a genuine
  second charge (correct).

**Likelihood:** Low — requires a deliberate re-call or a double-submit that beats button-disable.
**Fix (for review):** include a client-generated idempotency nonce per checkout attempt, OR move the
seat increment to only happen once the PaymentIntent id is known (reserve keyed by PI id), OR cap
tickets-per-(member,event) explicitly. Lowest-effort partial mitigation: ensure the buy button is
disabled on first click on every checkout surface.

---

## P3 — CSP is still `Content-Security-Policy-Report-Only` (housekeeping)

**Where:** `vercel.json` headers (line ~25).

The policy is in **report-only** mode, so it logs violations but enforces nothing. The allowlist
already covers Stripe, GA/gtag, Firebase (gstatic), and Google Fonts. Before/at launch: open the real
checkout (Stripe 3DS) and login flows, confirm there are **no CSP violation reports** in the browser
console, then flip the header key from `Content-Security-Policy-Report-Only` to
`Content-Security-Policy` to actually enforce it.

---

## Nits (low priority)

- **Unsubscribe mailto domain mismatch:** emails are sent `from: hello@mail.sparkdate.date` but the
  `List-Unsubscribe` mailto points at `hello@sparkdate.date` (no `mail.`). Confirm that inbox exists /
  forwards, or align the domains. (`api/lead-signup.js`, `api/cron-send-emails.js`)
- **`status:'full'` vs counter:** capacity is enforced purely by the `confirmed >= spots` counter
  check. If an admin manually sets `status:'full'` while the counter is below capacity, purchases
  still succeed (only the *listing* / `getNextEvent` honor `status:'full'`). Decide whether manual
  `full` should also block checkout.
- **`gender` is required at checkout** for all events (line ~482) even though single-pool events
  don't use it for price/capacity. Fine for matching/seating — just make sure every checkout form
  always collects it (a missing value is a hard 400).
- **Stale comment in `firestore.rules`:** the `leads` block says "from Formspree webhook" — that
  endpoint is now `api/lead-signup.js` (Formspree was removed). Comment-only; rules are correct.

---

## Security rules — reviewed, properly locked down ✅

`firestore.rules` is in good shape and is the single biggest data-exposure surface, so it's worth
calling out explicitly:

- **Default-deny catch-all** (`match /{document=**} { allow read, write: if false }`) — anything not
  explicitly allowed is denied.
- **PII is admin-or-owner only:** `users` read = owner/admin; `leads` and `payments` read = admin only.
  Unauthenticated traffic can read **only** public `events` (verified against the live REST API per
  the file header: events 200, users/leads/payments 403).
- **All sensitive collections are server-write-only** (`tickets`, `event_registrations`, `payments`,
  `leads`, `activity`, `stripe_events`, `connection_intents` → `allow write: if false`), written only
  via the Admin SDK which bypasses rules.
- **No privilege escalation:** the `users` self-update whitelist deliberately excludes `tier`,
  `subscriptionStatus`, `stripeCustomerId`, `subscriptionId` — a user can't upgrade their own tier;
  only the Stripe webhook (Admin SDK) can.

No action needed. (Tiny nit: the `users` update whitelist allows self-setting `profileCompleted` —
harmless, since the magic-link path uses Admin SDK anyway and billing fields are excluded.)

## What's solid (no action needed)

- **Atomic seat reservation** via Firestore transaction with per-event counter (no oversell race).
- **Webhook idempotency** via `stripe_events/{id}` create-lock (no double-decrement on redelivery).
- **Server-side pricing** through the shared `effectivePrice()` resolver — client `amount` ignored,
  early-bird charged exactly as advertised, $0/invalid price fails loudly with a seat rollback.
- **Abandoned-3DS sweep** reclaims phantom seats opportunistically on the next purchase.
- **Fail-open enrollment** with reverse-order cleanup of partial Firebase/Stripe/Firestore state.
- **Constant-time token compare** in `lib/profile-link.js`; magic-link write is token-gated and
  verified live (valid → 200, tampered → 401).
- **Email flows** all verified live this session (welcome, nurture cron, magic-link completion).

---

## Things only you can verify (need dashboard access)

- **Stripe webhook events:** confirm the live endpoint subscribes to all events the code handles:
  `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `customer.subscription.created/updated/deleted`, `customer.subscription.trial_will_end`,
  `invoice.paid`, `invoice.payment_failed`, `customer.deleted`,
  `setup_intent.succeeded`, `setup_intent.setup_failed`. (You mentioned seeing "5 events" earlier —
  if any of the above are missing, that flow silently won't sync.)
- **Pre-launch data wipe:** `node scripts/wipe-test-data.js --execute` to clear test rows
  (including the `test@sparkdate.date` user I set `profileCompleted:true` on during verification).
