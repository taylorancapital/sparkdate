# SparkDate — Code Audit

**Auditor:** Claude (Haiku 4.5)
**Date:** 2026-05-24
**Scope:** Full codebase at `main` HEAD (`735b1ec`).
**Method:** Read all 12 API endpoints, 4 shared lib modules, 7 public HTML pages, Firestore rules, Vercel config, package manifest, recent commit history, and grep'd for common issue patterns (secrets, TODOs, unescaped innerHTML, missing status filters, etc.). Static review only — no dynamic testing.

The codebase has clearly been through several security passes already (auth tokenization, 3DS handling, idempotency, Firestore transactions, XSS escaping in user-facing pages). The findings below are what's left.

---

## Severity Legend

- **🔴 Critical** — actively losing money, exposing data, or violating compliance NOW.
- **🟠 High** — production bug or known-exploitable weakness; should fix this week.
- **🟡 Medium** — real risk under realistic conditions; should fix this month.
- **🟢 Low** — defense-in-depth, code health, or minor polish.
- **ℹ️ Info** — observation, not a defect.

---

## 🔴 CRITICAL

### C1. Stripe **test** publishable key shipped to production
**Files:** [public/signup.html:733](public/signup.html), [public/event.html:474](public/event.html)

```js
const stripe = Stripe('pk_test_51TVE2YRsTCYDr2LL…');
```

Both checkout pages use a `pk_test_*` key. If the corresponding `STRIPE_SECRET_KEY` env var in Vercel is also a test key, **no real payments are being processed** — every successful "purchase" is a Stripe test mode transaction. Customers see a success screen, your Firestore reflects a sale, but no money moves and no real Stripe customer is created.

If the secret key is `sk_live_*` but the publishable key is `pk_test_*`, the keys won't match and the PaymentIntent confirmation step will fail outright — checkout would be broken for everyone.

Either way it's broken in some direction; the right state on production is **both** keys `_live_`.

**Fix:** Move the publishable key into an environment variable read at build time, or have the page hit a tiny `/api/stripe-config` endpoint that returns the right key per environment. Verify the matching secret key in Vercel.

---

## 🟠 HIGH

### H1. Capacity, attendee lists, and connections include failed/expired registrations
**Files:** [public/account.html:932-936, 988-993](public/account.html), [api/declare-connection.js:52-66](api/declare-connection.js), [public/event.html:579-590](public/event.html)

Most `event_registrations` and `tickets` reads do **not** filter by `status: 'confirmed'`:

- `account.html` upcoming-events list shows registrations regardless of payment state — a user whose card was declined still sees the event in "your upcoming events."
- `declare-connection.js` validates "you attended this event" by checking only for the existence of a registration row, not its status. A user with a `failed` or `pending_3ds` registration can still declare connections.
- `event.html` client-side capacity check (lines 579–590) is a belt-and-suspenders for the server's atomic counter, but it filters by `status === 'confirmed'` in code after the read — fine here, but inconsistent with how registrations are read elsewhere.

The recent commit `9857a9a` ("Chemistry scoring: only count `confirmed` registrations") shows the team is aware of this for one specific feature, but it hasn't been applied broadly.

**Fix:** Audit every `event_registrations` / `tickets` read for a `status` filter. Either add `where('status', '==', 'confirmed')` to the query or filter in code immediately after.

---

### H2. Tier upgrade fails outright on 3DS-required cards
**File:** [api/upgrade-subscription.js:70](api/upgrade-subscription.js)

```js
const updateParams = {
  items: [{ id: currentItemId, price: newPriceId }],
  payment_behavior: 'error_if_incomplete',  // ← here
};
```

When the user upgrades and their bank requires 3-D Secure on the proration charge, Stripe returns an error rather than a `requires_action` clientSecret. The endpoint catches it (`authentication_required` → 402) but the UI has no path to actually complete authentication — the user just sees "Authentication required" and is stuck.

`create-subscription.js` handles 3DS correctly (lines 81–95). The upgrade endpoint should match.

**Fix:** Switch to `payment_behavior: 'default_incomplete'`, then if the resulting subscription's latest invoice has `requires_action`, return `{ requiresAction: true, clientSecret }` to the browser the same way create-subscription does.

---

### H3. Unsubscribe HMAC falls back to a hardcoded literal
**File:** [lib/unsubscribe.js:18-21](lib/unsubscribe.js)

```js
const SECRET = () =>
  process.env.UNSUBSCRIBE_SECRET
  || process.env.STRIPE_WEBHOOK_SECRET
  || 'sparkdate-unsubscribe-fallback';
```

If neither env var is set, the HMAC secret is a string published in your public git history. Anyone with the source can generate a valid unsubscribe URL for any lead they know the lead ID of (and lead IDs can be enumerated via the admin UI on a stolen session, or guessed via Firestore auto-IDs in a leak).

Blast radius is "unsubscribe people without their consent" — not catastrophic but plausibly used to harass.

**Fix:** Throw at process boot if neither env var is set. Make the fallback fail loud, not silent. Verify `UNSUBSCRIBE_SECRET` is set in Vercel.

---

### H4. `create-subscription` doesn't bind request email to the authenticated user
**File:** [api/create-subscription.js:35-37](api/create-subscription.js)

```js
const { paymentMethodId, email, name, tier } = req.body || {};
if (!paymentMethodId || !email || !name || !tier) { … }
```

`email` from the body is sent to Stripe as the customer email, used as `receipt_email`, and (downstream) becomes the welcome-email recipient. The handler authenticates the caller via Bearer token but never checks that `email === decoded.email`. An authenticated user can submit any email and your system will believe it.

Impact in the current flow is modest (the user just signed up with that email moments before, via `createUserWithEmailAndPassword`), but the trust boundary is wrong: the field should come from the verified token, not the body.

**Fix:**
```js
const email = decoded.email; // ← from verified token, not body
```
…and drop `email` from the body shape.

---

### H5. Zero automated tests
**File:** entire repo

No test framework, no spec files, no CI checks beyond Vercel's build. The payment flow, the 3DS sweep, the per-event capacity counter, the auto-enroll, the cron's day-bucket logic — all hand-verified, all currently passing on vibes.

Most are non-trivial; the seat-reservation transaction in [api/purchase-ticket.js:84-105](api/purchase-ticket.js) and the 3DS sweep in lines 112–158 are genuinely subtle. A single regression in either silently corrupts your seat inventory or leaks paid seats.

**Fix:** Add at least a thin Vitest/Jest suite around (a) `lib/tiers.js` (pure functions, trivial), (b) `lib/unsubscribe.js` sign/parse/verify, (c) `lib/cors.js` allowlist matching. Then graduate to integration tests against the Firestore emulator for the seat reservation transaction. Wire into a GitHub Actions workflow blocking merge.

---

## 🟡 MEDIUM

### M1. Admin dashboard renders user-controlled strings into innerHTML without escaping
**File:** [public/admin.html](public/admin.html) — 27 separate `innerHTML =` assignments

`account.html` has a proper `safe()` helper used throughout, and `send-venue-outreach.js` escapes correctly. `admin.html` mostly does not — fields like `u.firstName`, `u.lastName`, `u.email`, venue names, lead names, etc. flow directly into HTML templates.

Auth-gated to admins, so the attacker would need to either (a) be an admin already, or (b) be a regular user who controls their own name/email which then appears in an admin's view. **(b) is realistic** — any guest ticket buyer can set `name` to `<img src=x onerror=alert(1)>` and trigger script in your admin browser when you next view the Members tab. From there, your session cookie + your admin custom claim are theirs.

**Fix:** Define the same `safe()` helper used in `account.html` (I added one inline as `escapeHtml` during my session — that approach is fine, just apply it consistently). Wrap every user-controlled interpolation, especially: names, emails, venue names, lead phone numbers, event titles.

---

### M2. `account.html` connection list shows attendees from un-paid registrations
**File:** [public/account.html:986-993](public/account.html)

Same root cause as H1, separate impact: a Fire-tier user browsing their past-event attendees will see anyone with a registration row, including failed/expired ones. They can then attempt to declare connection — that *will* be blocked server-side (see H1 above), but the UX shows ghost attendees and gives error messages on click.

**Fix:** Add `where('status', '==', 'confirmed')` to the attendees query. Already noted in H1; mentioning here because the user-visible bug is distinct.

---

### M3. Activity log entries silently dropped on ticket purchase
**File:** [api/purchase-ticket.js:602-610](api/purchase-ticket.js)

```js
db.collection('activity').add({…}).catch(() => {});
```

This is fire-and-forget. Vercel kills outstanding promises after `res.json()` returns. On a cold start or slow Firestore, the activity log write loses the race. The `enrollGuestAsMember` call right before it is correctly `await`ed for exactly this reason — the activity log isn't.

Impact: admin dashboard's activity feed will sometimes miss ticket purchases. Not data corruption, but the feed is one of your main observability surfaces.

**Fix:** `await` the activity write, wrap in try/catch. Adds ~50ms to the response — worth it.

---

### M4. `package.json` has no Node engine, no scripts, no lockfile audit
**File:** [package.json](package.json)

```json
{
  "name": "sparkdate",
  "version": "1.0.0",
  "private": true,
  "dependencies": { … }
}
```

- No `"engines": { "node": "20.x" }` — Vercel picks whatever its default is at deploy time, which drifts.
- No `"scripts"` for `test`, `lint`, `audit`, or `dev`.
- Dependencies use `^` — any teammate's fresh `npm install` after a Stripe minor release could pull breaking changes (Stripe pre-1.0 era was rough; v14→v15 included API version bumps).
- `package-lock.json` exists but I see no `npm audit` step in any documented workflow.

**Fix:** Pin Node, add scripts, pin top-level deps to exact versions or use `~` for patch-only. Add an `npm audit --production --audit-level=high` step to CI (after H5 is in place).

---

### M5. Stripe `current_period_end` access pattern will break on Stripe API upgrade
**Files:** [api/stripe-webhook.js:85-86](api/stripe-webhook.js), [api/cancel-subscription.js:48,54](api/cancel-subscription.js), [api/upgrade-subscription.js:119](api/upgrade-subscription.js)

Stripe moved `current_period_end` from the subscription object to `subscription.items.data[0].current_period_end` for new API versions (effective late 2024 in their changelog). Reading it from the top level still works on API versions ≤2024-09-30; it returns `undefined` on newer versions, which would silently break renewal-date display and cancel-flow date math.

You're on `stripe@^14`, which defaults to API version 2023-08-16, so it works today. But `^14` will eventually pull `14.x` minor releases that bump default API, and any explicit `stripe.api_version` change in the dashboard will break this immediately.

**Fix:** Pin Stripe SDK version + API version explicitly:
```js
const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-08-16' });
```
…and update the field paths when you intentionally upgrade.

---

### M6. No "uncancel before period end" flow
**File:** [api/cancel-subscription.js](api/cancel-subscription.js)

Cancel sets `cancel_at_period_end: true` — good. There's no endpoint or UI to flip it back. Users who cancel and change their mind in the same billing cycle have to email support.

**Fix:** Add a tiny `/api/reactivate-subscription` that runs `stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })`, gated by the same auth model. Surface it in `account.html` when `cancelAtPeriodEnd` is true.

---

### M7. No data export or deletion endpoint despite implied compliance
**File:** [public/terms.html](public/terms.html), [public/privacy.html](public/privacy.html) (not deeply inspected)

If Privacy Policy promises GDPR/CCPA rights (most do by default), there needs to be a mechanism to honor them. Cascade-delete a `users/{uid}` doc + Firebase Auth user + Stripe customer + all `tickets`, `event_registrations`, `connection_intents`, `activity`, `payments`, `leads` rows keyed to that user. Right now there's nothing.

**Fix:** Add `scripts/delete-user.js` (admin-only CLI for now), surfaced eventually as a self-service "delete my account" button in `account.html`. Stripe customer deletion via `stripe.customers.del()`. Audit log the action.

---

### M8. `stripe-webhook.js` doesn't handle `customer.deleted` or `setup_intent.*`
**File:** [api/stripe-webhook.js](api/stripe-webhook.js)

Two gaps:
- If a Stripe customer is deleted (manually in dashboard, or via the deletion endpoint suggested in M7), no event clears the `stripeCustomerId` field on the Firestore user doc. Future API calls keyed off that ID will 404.
- The guest auto-enrollment in `enrollGuestAsMember` (purchase-ticket.js) creates a subscription that may need 3DS. If 3DS is required for the trial setup, `setup_intent.succeeded` would confirm it — currently unhandled.

**Fix:** Add cases for both. Low-effort, prevents weird half-states.

---

## 🟢 LOW

### L1. CORS regex allows `sparkdate--abc.vercel.app` (double-dash)
**File:** [lib/cors.js:35](lib/cors.js)

```js
if (/^https:\/\/sparkdate(-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
```

The `[a-z0-9-]+` inside the optional group permits consecutive dashes. Vercel preview hostnames never produce double-dash patterns, so this isn't currently exploitable, but it's a wider surface than needed.

**Fix:** `/^https:\/\/sparkdate(-[a-z0-9]+(?:-[a-z0-9]+)*)?\.vercel\.app$/i` or just match the literal Vercel preview pattern your project uses.

---

### L2. `seed-venues.js` writes in a loop instead of batched
**File:** [api/seed-venues.js:162-189](api/seed-venues.js)

For 1000 venues that's potentially 1000 round-trips to Firestore. Firestore batches handle 500 ops/batch with a single round-trip.

**Fix:** Collect writes into `db.batch()` chunks of 500 and commit.

---

### L3. Hardcoded 30-venue Philly list lives in API code
**File:** [api/seed-venues.js:22-56](api/seed-venues.js)

The comment acknowledges the data quality is questionable ("AI-assisted, verify addresses"). Code-as-data is awkward to update and deploy. Should live in a JSON file at minimum, ideally only in Firestore (with the seed shipping just a "default Philly list" toggle that pulls from a known seed collection).

---

### L4. Firebase web SDK loaded from `gstatic.com` CDN with no SRI, no version lock beyond URL
**File:** every page using Firebase

```js
import { … } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
```

Pinned to 10.7.0 in the URL, which is good. But:
- No Subresource Integrity hash — if gstatic is compromised, you're compromised.
- Loading from a 3rd-party CDN means there's a third party in your TLS trust path for credential-handling code.

**Fix (defensive):** Bundle Firebase with your own assets. **Fix (pragmatic):** Live with it; gstatic is Google's CDN and compromise of it is a top-10 internet event.

---

### L5. No Content Security Policy headers
**File:** [vercel.json](vercel.json)

No `Content-Security-Policy` header set anywhere. With inline `<script>` blocks in every page and inline `style=` attributes throughout, you can't trivially add a strict CSP without rewrites.

**Fix:** Eventually move inline JS to external files with hashes, add `script-src 'self' 'sha256-…'`, `connect-src 'self' https://*.firebaseio.com https://api.stripe.com https://*.googleapis.com`. Not urgent; you'd want it before you hit a real user volume.

---

### L6. `webhook-formspree.js` is misnamed
**File:** [api/webhook-formspree.js](api/webhook-formspree.js)

It hasn't talked to Formspree in some time — it's the founding-form webhook now (writes to `leads`, sends welcome email). The name lies about what it does.

**Fix:** Rename to `api/lead-signup.js` and update `public/founding.html` form action. Single search/replace.

---

### L7. Stripe publishable key, in addition to being test mode (see C1), is hardcoded in two places
**Files:** [public/signup.html:733](public/signup.html), [public/event.html:474](public/event.html)

Two copies of the same string. Even after fixing C1, source it from one place. A tiny `/api/public-config` returning `{ stripePk: process.env.STRIPE_PUBLISHABLE_KEY }` or a build-time templating step.

---

### L8. `account.html` `event_registrations 'in' eventId` query loads all past attendees
**File:** [public/account.html:986-993](public/account.html)

For a Fire-tier user who's attended many events, this fetches every registration for every event they've ever attended, on every account page load. Reasonable now (few events), unreasonable in a year.

**Fix:** Paginate, or move the "past attendees" view to a dedicated page that lazy-loads.

---

## ℹ️ Info / Observations

- **I1.** Auth model is well-considered: token-verified UID is always trusted over body fields. Specifically called out as "audit #24" in commit messages. Good.
- **I2.** Stripe webhook signature verification + Firestore idempotency lock on `stripe_events/{event.id}` is correctly implemented. Good.
- **I3.** Per-event capacity reservation via Firestore transaction in `purchase-ticket.js` is the right pattern. Good.
- **I4.** 3DS abandoned-seat reclaim ([api/purchase-ticket.js:112-158](api/purchase-ticket.js)) is a thoughtful piece of work — the comments lay out exactly why each guard exists.
- **I5.** Cron's dual-schedule + 9-AM-ET guard for DST-correct daily emails is elegant given Vercel Hobby's daily-only cron limit.
- **I6.** Commit history shows a sustained pattern of security commits ("Security hardening pass", "Audit punch-list", "Lock down venue endpoints + close XSS"). The team is on it.
- **I7.** `lib/_*.js` prefix-underscore naming to avoid Vercel routing — clever convention; document it somewhere visible (e.g., a `lib/README.md`).
- **I8.** Firestore rules deny-by-default at the bottom — good. The per-collection rules are tight and the comments name the threat model explicitly.
- **I9.** Frontend has a pleasant amount of comments explaining WHY (not just WHAT) — this is rare and valuable.
- **I10.** `Business Plan/` directory tracked in git contains real strategy docs. Not a security issue per se but worth confirming you want those public if this repo ever becomes open-source.

---

## Priority Punch-List

If you want the shortest path from this report to "audit closed":

1. **C1** — Verify and fix Stripe key environment. 30 minutes if the live keys exist in Vercel; longer if you need to set up live mode for the first time.
2. **H4** — Two-line fix in `create-subscription.js`.
3. **H3** — Two-line fix in `lib/unsubscribe.js` + set the env var.
4. **H1 + M2** — Audit every `event_registrations` / `tickets` read for status filtering. Maybe 2 hours.
5. **H2** — Switch `upgrade-subscription.js` to the `default_incomplete` 3DS flow. Mirror the pattern from `create-subscription.js`.
6. **M1** — Add `safe()` helper to `admin.html` and apply to all user-controlled interpolations. ~1 hour.
7. **M3** — `await` the activity log write in purchase-ticket.js.
8. **M5** — Pin Stripe API version explicitly.
9. **H5 + M4** — Set up a Vitest project, add 3-5 unit tests around the pure helpers, wire to GitHub Actions. ~2 hours, pays off forever.

Total ~1 working day to clear the Critical + High band and most Mediums. The rest is calendar work for the month.

---

*End of audit. Questions in chat — I'll be here when you're back.*
