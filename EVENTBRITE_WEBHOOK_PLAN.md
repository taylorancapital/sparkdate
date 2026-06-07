# Eventbrite Webhook Integration Plan

**Status:** Research & Design (build when sales scale to 10+/week)

**Goal:** Auto-enroll Eventbrite buyers in real-time via webhook, eliminating the manual script workflow.

---

## Table of Contents

1. [Overview](#overview)
2. [Eventbrite API Fundamentals](#eventbrite-api-fundamentals)
3. [Webhook Flow](#webhook-flow)
4. [Implementation Design](#implementation-design)
5. [Cost & Rate Limits](#cost--rate-limits)
6. [Buildout Checklist](#buildout-checklist)
7. [Questions & Risks](#questions--risks)

---

## Overview

**Current state (manual script):** Batch process with 2–4 hour setup per round of Eventbrite exports.

**Future state (webhook):** Real-time enrollment as soon as a ticket is purchased on Eventbrite.

**Trigger:** When you're getting 10+ Eventbrite sales per week, the manual process becomes inefficient. At that point, set up the webhook (1–2 hours) and automate the entire pipeline.

---

## Eventbrite API Fundamentals

### Authentication

Eventbrite uses OAuth 2.0 for API access:

1. **Create an Eventbrite app** (organizer dashboard → Apps)
2. **Get credentials:**
   - `EVENTBRITE_PERSONAL_OAUTH_TOKEN` — personal access token (simpler, good for testing)
   - `EVENTBRITE_CLIENT_ID` + `EVENTBRITE_CLIENT_SECRET` (full OAuth, for production webhooks)

For the webhook to **validate signatures**, you need:
- `EVENTBRITE_WEBHOOK_SIGNING_SECRET` — provided when you register the webhook endpoint

### Webhook Events

Eventbrite sends webhook events for ticket purchases, refunds, attendee changes, etc.

**Relevant event:** `order.placed`

```json
{
  "config": {
    "action": "order.placed",
    "webhook_id": 123456
  },
  "data": {
    "object": {
      "resource": {
        "id": "order_123456789",
        "email": "buyer@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "name": "John Doe",
        "status": "placed"
      }
    },
    "attendees": [
      {
        "id": "att_123",
        "email": "buyer@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "answers": [
          {
            "question": "Gender",
            "answer": "Man"
          }
        ]
      }
    ]
  }
}
```

**Query:** How does Eventbrite send attendee gender/pronoun data? Answer: Via the `answers[]` array — custom questions at checkout.

### Rate Limits

- **API calls:** 5,000 requests/hour per token
- **Webhooks:** No explicit limit; re-send on failure (exponential backoff)

Our use case is one webhook per order, so rate limits are not a concern.

---

## Webhook Flow

```
┌─────────────┐
│  Eventbrite │
│   (order    │
│  purchased) │
└──────┬──────┘
       │ POST to https://sparkdate.date/api/enroll-eventbrite
       │ with signature header
       ▼
┌──────────────────────┐
│  /api/enroll-eventbrite
│  (new endpoint)      │
│                      │
│  1. Verify signature │
│  2. Extract order    │
│  3. Get attendee     │
│     data via API     │
│  4. Enroll in        │
│     SparkDate        │
│  5. Send email       │
│                      │
│  Return 200 OK       │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Firebase Auth       │
│  (createUser)        │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Firestore           │
│  (atomic txn)        │
│  - users/{uid}       │
│  - tickets/{id}      │
│  - event_regs/{id}   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  Resend              │
│  (send email)        │
└──────────────────────┘
```

**Key differences vs. the script:**
1. **Single order** (not batch)
2. **Real-time** (not batched)
3. **Verify signature** (Eventbrite guarantees authenticity)
4. **Fetch event data from Eventbrite API** (don't rely on CSV column)

---

## Implementation Design

### Endpoint: `POST /api/enroll-eventbrite`

**Input:** Raw webhook body + signature header

**Processing:**
1. Verify Eventbrite signature
2. Extract order ID from payload
3. Call Eventbrite API to fetch full order + attendee data
4. Extract email, name, gender, event ID
5. Run the same enrollment logic as the script
6. Return success (200 OK)

**Response:**

```json
{
  "success": true,
  "uid": "user_abc123",
  "email": "buyer@example.com",
  "message": "Enrollment complete"
}
```

### Signature Verification

Eventbrite sends an `X-Eventbrite-Signature` header with each webhook:

```
X-Eventbrite-Signature: sha256=<hex>
```

Where `<hex>` is:
```
HMAC-SHA256(
  body=<raw request body>,
  key=EVENTBRITE_WEBHOOK_SIGNING_SECRET
)
```

**Implementation:**

```javascript
const crypto = require('crypto');

function verifyEventbriteSignature(rawBody, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**In Vercel:** You must preserve the raw body, so disable automatic JSON parsing:

```javascript
module.exports.config = { api: { bodyParser: false } };
```

(We already do this in the Stripe webhook; same pattern.)

### Eventbrite API Lookup

Once the webhook signature is verified, fetch full order details:

```javascript
const eventbrite = new (require('eventbrite')).default({
  token: process.env.EVENTBRITE_PERSONAL_OAUTH_TOKEN,
});

const order = await eventbrite.request('/orders/{id}');
// Returns: order object with attendee details
```

**Note:** The webhook payload is minimal; you must call the API to get full attendee details (gender from custom question answers).

### Reuse Existing Logic

The heavy lifting is already done:
- `enrollGuestAsMember()` — create Firebase Auth user + Stripe subscription + email
- `recordLead()` — add to nurture sequence
- `sign()` / `makeProfileUrl()` — magic-link token

Webhook just:
1. Verifies signature
2. Fetches full order from Eventbrite API
3. Calls the same enrollment functions

### Error Handling

Webhook errors should fail gracefully:
- **Bad signature** → 401 (don't process)
- **Malformed payload** → 400 (log and return 200 so Eventbrite stops retrying)
- **Firestore error** → Log & retry on Eventbrite's next attempt
- **Resend error** → Log but return 200 (email is non-critical)

**Best-effort principle:** Never fail a webhook 5xx if the data is valid — Eventbrite's retry logic will create duplicate attempts.

---

## Cost & Rate Limits

### Eventbrite API Calls

- 1 API call per order (to fetch full details)
- At 10 orders/week: ~40/month — **negligible**
- At 100 orders/week: ~400/month — **still negligible**
- Rate limit: 5,000/hour — never approached

**Cost:** Free (included in Eventbrite's service)

### Firebase / Firestore

Same costs as the script:
- User creation: ~0.01¢ each
- Firestore writes: bundled in free tier

**Cost:** Free (within free tier limits)

### Resend Emails

- 1 email per order
- At 10 orders/week: ~40/month
- Resend free tier: 100/day

**Cost:** Free (within free tier) or $20/month for higher volume

---

## Buildout Checklist

When you're ready to build (10+ orders/week):

- [ ] **Research Phase:**
  - [ ] Review latest Eventbrite API docs (link: https://www.eventbrite.com/platform/api/documentation/v3/)
  - [ ] Confirm webhook event payload format (order.placed)
  - [ ] Confirm gender/pronoun custom question mapping
  - [ ] Test Eventbrite OAuth + personal token setup

- [ ] **Setup Phase:**
  - [ ] Create Eventbrite personal access token
  - [ ] Register webhook at Eventbrite organizer dashboard → Apps
  - [ ] Get signing secret from webhook registration
  - [ ] Set env vars: `EVENTBRITE_PERSONAL_OAUTH_TOKEN`, `EVENTBRITE_WEBHOOK_SIGNING_SECRET`

- [ ] **Implementation Phase:**
  - [ ] Create `/api/enroll-eventbrite.js` endpoint
  - [ ] Implement signature verification
  - [ ] Implement Eventbrite API order lookup
  - [ ] Reuse `enrollGuestAsMember()` / `recordLead()` from purchase-ticket.js
  - [ ] Add error handling + logging
  - [ ] Test with Eventbrite test webhook delivery

- [ ] **Testing Phase:**
  - [ ] Mock webhook payload + test signature verification
  - [ ] Test with live Eventbrite sandbox (if available)
  - [ ] Test with live order (use test email + dummy card)
  - [ ] Verify: Firebase user created, Firestore docs written, email sent
  - [ ] Verify: Customer can click magic link + complete profile

- [ ] **Launch Phase:**
  - [ ] Register webhook in Eventbrite production
  - [ ] Monitor logs for webhook errors
  - [ ] Monitor Firestore for orphaned orders (manual fallback if webhook fails)
  - [ ] Document recovery procedure (re-run script if webhook missed an order)

---

## Questions & Risks

### Q1: How is gender/pronoun data sent in the webhook?

**Assumption:** Custom question at checkout (e.g., "What's your gender?") with answers in the `answers[]` array.

**Action:** Check your Eventbrite event settings to confirm the custom question exists and the answer structure.

**Risk:** If gender is not collected at checkout, the webhook will fail with "missing gender". Mitigation: Either:
- Add the custom question to your Eventbrite event, OR
- Map Eventbrite gender data from a different field (if available)

### Q2: How do we map Eventbrite event IDs to SparkDate event IDs?

**Assumption:** Eventbrite event ID is passed in webhook metadata or the order object.

**Action:** Inspect an actual Eventbrite webhook payload to confirm the event ID is present.

**Fallback:** Manually maintain a mapping (e.g., Firebase collection `eventbrite_events` with Eventbrite ID → SparkDate event ID).

### Q3: What if the webhook fails and Eventbrite retries?

**Risk:** The script logic deduplicates by email, but the webhook needs idempotency too.

**Mitigation:** Use Firestore transactions (atomic writes) and check for existing users before creating new ones, just like the script does.

### Q4: Scaling beyond 10/week?

If volume scales to 100+ orders/week:
- Monitor API rate limits (5,000/hour is safe)
- Consider batching webhook processing if Eventbrite infrastructure can't keep up
- Add monitoring/alerting for failed webhooks

---

## Backlog: Webhook

Once you're getting consistent Eventbrite sales, create a backlog item to:

1. Clone this document to a GitHub issue
2. Add the checklist as tasks
3. Assign and prioritize
4. Build & test (1–2 hours)

For now, the **manual script is production-ready** and handles the current volume efficiently.

---

## Files to Build (When Ready)

- `/api/enroll-eventbrite.js` — new endpoint (mirrors the script logic)
  - Signature verification
  - Eventbrite API call
  - Enrollment + email (reuse purchase-ticket.js exports)
  - Error handling

- Env var setup in Vercel:
  - `EVENTBRITE_PERSONAL_OAUTH_TOKEN`
  - `EVENTBRITE_WEBHOOK_SIGNING_SECRET`

- Tests (optional, but recommended):
  - Unit test for signature verification
  - Integration test with mock Eventbrite webhook

---

## Next Steps

1. **Now:** Use the manual script (`scripts/enroll-eventbrite-buyers.js`) for batch enrollment
2. **When volume hits 10+/week:** Start the webhook buildout using this plan as a guide
3. **Post-webhook:** Deprecate the manual script (but keep it as a fallback for edge cases)

Questions? Refer back to this plan or the Eventbrite API docs linked above.
