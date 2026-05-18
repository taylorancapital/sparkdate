# SparkDate Security Runbook

This document covers the manual steps that must be performed once before
the security model is fully enforced. The code is deployed; these are
the **one-time admin actions** that turn it on.

---

## Status overview

| Layer | Code | Manual step required |
|---|---|---|
| API auth (Bearer tokens) | ✅ Live | none — already enforced |
| Server-side ticket pricing | ✅ Live | none |
| Server-side ticket registration | ✅ Live | none |
| Stripe idempotency keys | ✅ Live | none |
| 3-D Secure ticket flow | ✅ Live | confirm Stripe webhook is delivering `payment_intent.*` events |
| XSS escaping | ✅ Live | none |
| Tightened CORS | ✅ Live | set `ALLOWED_ORIGINS` env var in Vercel (optional) |
| Firestore Security Rules | ⏳ Drafted | **steps 1–3 below** |
| Admin custom claim | ⏳ Drafted | **step 1 below** |

---

## 1. Set the admin custom claim

Firestore rules check `request.auth.token.admin == true` to grant
dashboard access. Without this claim no one can read `users`, `payments`,
`activity`, or `leads` collections — admin pages will go blank.

```bash
# From the repo root, with your local env vars set
# (same as Vercel — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)

node scripts/set-admin-claim.js taylor@sparkdate.date
node scripts/set-admin-claim.js pennsylvaniacabinetmaker@comcast.net

# Verify
node scripts/set-admin-claim.js --list
```

**After running, the admin user(s) MUST sign out and sign back in** for
the new claim to be embedded in their ID token. Existing tokens hold
old claims for up to ~1 hour.

If you screw this up: `node scripts/set-admin-claim.js email --revoke`.

---

## 2. Test rules locally with the Firebase Emulator

Before deploying, run the full app against the emulator to catch any
client query that the rules accidentally block:

```bash
# One-time install
npm install -g firebase-tools
firebase login

# Initialize (creates .firebaserc, choose existing project: sparkdate-philly)
firebase init firestore   # accept defaults — picks up the existing firestore.rules

# Start the emulator
firebase emulators:start --only firestore

# In a separate terminal, point a local server at the emulator (optional;
# easiest is just to skim the rules-coverage UI at http://localhost:4000)
```

Look at the emulator's Firestore tab while clicking around the app:
- Signup → `users/{uid}` create should succeed
- /account → reading own `users/{uid}` should succeed
- /events → reading `events` should succeed unauthenticated
- /admin → admin user with custom claim can read everything; non-admin gets denied

If the emulator denies something it shouldn't, edit `firestore.rules`
and re-run.

---

## 3. Deploy the rules

```bash
firebase deploy --only firestore:rules
```

This is the moment the lockdown takes effect. After deploy:
- Verify /events still loads (unauthenticated read is allowed)
- Verify /account still loads for a logged-in member
- Verify /admin works for users with the admin custom claim
- Verify /admin returns Firestore errors in the console for a regular user

If anything breaks, roll back rules with:
```bash
firebase firestore:rules:rollback
```

---

## 4. (Optional) Tighten CORS for previews

The CORS allowlist auto-permits production + any `sparkdate-*.vercel.app`
preview. If you have other origins to allow (e.g. a staging frontend on
a different domain, or local dev), set the `ALLOWED_ORIGINS` env var in
Vercel:

```
ALLOWED_ORIGINS=https://staging.sparkdate.date,http://localhost:3000
```

Comma-separated. No spaces.

---

## 5. Run the partial-signup cleanup

For users left in a broken state from before token verification was
enforced:

```bash
node scripts/cleanup-partial-signups.js          # dry-run, lists only
node scripts/cleanup-partial-signups.js --delete # actually removes them
```

---

## 6. Routine maintenance

- **New admin user**: `node scripts/set-admin-claim.js newadmin@sparkdate.date`
  Then have them sign out and back in.
- **Revoke admin**: `node scripts/set-admin-claim.js oldadmin@sparkdate.date --revoke`
- **Rules change**: edit `firestore.rules`, test with emulator, deploy with
  `firebase deploy --only firestore:rules`.

---

## Threat model summary

After these steps:

- Server endpoints (`/api/*`) all require Firebase ID tokens. The
  authenticated `uid` is the only trusted identity — body-supplied UIDs
  are ignored.
- Client cannot write to `tickets`, `event_registrations`,
  `connection_intents`, `payments`, `activity`, or `leads`. All paths
  flow through API endpoints that re-validate and re-compute prices.
- `users/{uid}` is owner-write only, with a field whitelist.
- `events` are admin-write only, public-read.
- Admin dashboards gate on a custom claim, NOT a client-side email list.
- CORS allows only production + your own Vercel previews.
- Stripe charges are idempotent (no double-charging on retry) and price
  is always computed server-side.

What still needs human attention:

- **Refunds on event deletion**: cascade delete removes Firestore rows
  but does NOT refund Stripe. Issue refunds manually in the Stripe
  dashboard when canceling a paid event.
- **Pending 3-D Secure tickets**: if a guest abandons the 3DS popup, the
  ticket sits as `pending_3ds` until Stripe webhook fires. A weekly
  sweep should expire these.
- **Stale Stripe products/prices**: if you change tier amounts in
  `api/_tiers.js`, old prices keep their lookup_key — you'll need to
  archive old prices in the Stripe dashboard manually.
