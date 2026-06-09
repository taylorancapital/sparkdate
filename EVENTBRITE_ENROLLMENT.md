# Enrolling Eventbrite Buyers into SparkDate

When someone buys a ticket on Eventbrite, they're not in SparkDate yet — no
account, no chemistry profile, no post-event matching. This doc explains how to
pull them in. **It takes about a minute and happens entirely in the browser.**

> **History:** this used to be a terminal script (`scripts/enroll-eventbrite-buyers.js`)
> that required env-var setup on your machine. That's gone. Everything now runs
> through the admin panel — no terminal, no credentials, no CSV formatting.

---

## The workflow

1. **Export from Eventbrite**
   Organizer dashboard → your event → **Attendees** → **Export** (CSV or just
   read names/emails off the screen). You need three things per buyer: their
   **name**, **email**, and **gender**.

2. **Get the event's Firestore ID**
   Open `/admin` → **Events** tab → find the event. The ID is the Firestore doc
   ID (e.g. `79nTqQ0WEtkVOdBr0vbA`). You can also grab it from the event card.

3. **Open `/admin` → Enroll tab**
   - **Event Name** — the public title (e.g. `Founders Mixer`)
   - **Event ID** — the Firestore doc ID from step 2
   - **Attendees** — one per line, comma-separated:
     ```
     Taylor Chambers, taylor@example.com, man
     Jane Smith, jane@example.com, woman
     Alex Johnson, alex@example.com, man
     ```

4. **Click "Enroll & Send Emails"**
   A results table shows each buyer:
   - ✓ **Enrolled** — new account created
   - ↩ **Existing** — already had a SparkDate account (reused, no duplicate)
   - ✗ **Error** — with the reason
   plus whether the welcome email sent and a link to their magic profile URL.

---

## What each buyer gets

For every attendee, the server (admin-gated) does this in one atomic step:

- **Firebase Auth user** — created, or reused if the email already exists
- **`users/{uid}`** — name, gender, `tier: 'free'`, `source: 'eventbrite_import'`,
  `profileCompleted: false`
- **`tickets/{id}`** — `status: 'confirmed'`, the event, `source: 'eventbrite_import'`
- **`event_registrations/{id}`** — mirrors the ticket for the event dashboard
- **Welcome email** — with a **no-login magic link** to the chemistry
  questionnaire (age / intent / interests / vibes) so they can be matched
  after the event, plus a set-password link for full account access

It's **idempotent**: re-running the same list skips existing users and updates
ticket/registration docs in place rather than duplicating them.

---

## Where it lives in the code

To stay under Vercel's 12-serverless-function cap, the enrollment is **not** its
own endpoint. It's folded into `api/lead-signup.js` behind
`action: 'enroll_eventbrite'` (admin-gated via `requireAdmin`) — the same pattern
the chemistry-profile completion (`action: 'complete_profile'`) uses.

- **UI:** `public/admin.html` → "Enroll" tab → `enrollEventbriteBuyers()`
- **Server:** `api/lead-signup.js` → `handleEventbriteEnroll()` / `enrollEventbriteOne()`
- **Magic link:** `lib/profile-link.js` → `makeProfileUrl(uid)`

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Admin privileges required" (403) | Your account lacks the `admin: true` claim. Run `scripts/set-admin-claim.js` for your email. |
| Buyer shows ✗ Error | Read the reason in the table. Usually a malformed email — fix the line and re-run (idempotent). |
| Email didn't send | `RESEND_API_KEY` missing in Vercel, or the address bounced. The account + ticket are still created; the magic-link URL is in the results table to send manually. |
| Magic link says "invalid" | `UNSUBSCRIBE_SECRET` not set in Vercel Production. |
| Event ID wrong | Buyer enrolls but the ticket points at a non-existent event. Double-check the ID in the Events tab before enrolling. |

---

## When volume grows

At ~10+ Eventbrite sales/week the manual paste gets tedious. At that point,
automate it with a webhook — see **`EVENTBRITE_WEBHOOK_PLAN.md`**. The
enrollment logic is already reusable (`enrollEventbriteOne()` in
`api/lead-signup.js`), so the webhook just verifies the signature, fetches the
order, and calls the same function.
