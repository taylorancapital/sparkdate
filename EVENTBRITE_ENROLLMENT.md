# Eventbrite Enrollment Script

Automate onboarding Eventbrite ticket buyers into SparkDate's chemistry questionnaire flow.

## What It Does

The script converts Eventbrite customer data (CSV) into a full SparkDate enrollment:

1. **Firebase Auth**: Creates user accounts (or reuses existing ones)
2. **Firestore**: Atomically writes users, tickets, and event_registrations docs
3. **Leads**: Adds records to the nurture email sequence
4. **Email**: Sends welcome email with magic-link profile questionnaire (optional)

Result: Eventbrite buyers can complete their chemistry profile, get matched post-event, and enter the Spark subscription trial.

## Usage

### Input CSV Format

Create a CSV file with these columns:
```
email,name,gender,eventId,eventName,priceCents
customer@example.com,John Doe,man,evt_123,Happy Hour,1500
alice@example.com,Alice Smith,woman,evt_123,Happy Hour,1500
```

**Column details:**
- `email`: Customer email (lowercase, deduplicated)
- `name`: Full name (split into firstName/lastName)
- `gender`: `man` or `woman`
- `eventId`: Firestore event document ID
- `eventName`: Human-readable event title (e.g., "Happy Hour — June 7")
- `priceCents`: Ticket price in cents (e.g., 1500 = $15.00)

### Commands

**Dry-run (validate without writing):**
```bash
node scripts/enroll-eventbrite-buyers.js input.csv
```

This validates the CSV format and Firestore event existence without creating any records.

**Write + send emails:**
```bash
node scripts/enroll-eventbrite-buyers.js input.csv --send-emails
```

This creates all records AND sends welcome emails with the magic-link profile questionnaire.

### Environment Variables

Required for all runs:
- `FIREBASE_PROJECT_ID` — from Firebase console
- `FIREBASE_CLIENT_EMAIL` — service account email
- `FIREBASE_PRIVATE_KEY` — service account private key
- `UNSUBSCRIBE_SECRET` — long random string (used for magic-link token signing)

Only required if `--send-emails` is used:
- `RESEND_API_KEY` — email API key

**Note:** These are already set in your Vercel environment. For local testing, set them in your shell or `.env.local`.

## Output Files

The script creates three audit/tracking files in the same directory as the input CSV:

### 1. `eventbrite-enrollment-uids.csv`
Email-to-uid mapping for audit trail:
```
email,uid
customer@example.com,abc123def456
alice@example.com,xyz789uv0123
```
Use this to verify users were created and to track which uid corresponds to which customer.

### 2. `eventbrite-enrollment-urls.json`
Profile URLs for manual email delivery (if not using `--send-emails`):
```json
[
  {
    "email": "customer@example.com",
    "uid": "abc123def456",
    "profileUrl": "https://sparkdate.date/profile?uid=abc123def456&t=..."
  }
]
```
Use these URLs if you want to send emails manually via Resend UI or another service.

### 3. `eventbrite-enrollment-summary.txt`
Human-readable log with timestamps:
```
[2024-06-07T12:30:45.123Z] Eventbrite Enrollment Script
[2024-06-07T12:30:45.123Z] Mode: WRITE + EMAIL
[2024-06-07T12:30:45.456Z] Loaded 10 customers from CSV
...
[2024-06-07T12:30:52.789Z] Complete! Succeeded: 10/10
```

## Workflow

### Step 1: Export from Eventbrite

Log into your Eventbrite organizer dashboard, go to your event, and export the attendee list as CSV. Ensure it has columns for:
- Email
- Name
- Gender / Pronouns (map to `man` or `woman`)
- Event name
- Ticket price (convert to cents)

You may need to rename/reorder columns to match the format above.

### Step 2: Verify Events in Firestore

Before running, verify that each `eventId` in your CSV exists in Firestore:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Firestore Database**
3. Find the **events** collection
4. Note the document IDs (these are your `eventId` values)

If an event doesn't exist, add it via the admin panel at `/admin`.

### Step 3: Dry-Run

Run the dry-run to validate the CSV and Firestore setup:
```bash
node scripts/enroll-eventbrite-buyers.js eventbrite-export.csv
```

Review the output for:
- CSV parsing errors
- Missing or invalid eventIds
- Any other validation failures

### Step 4: Send with Emails

Once dry-run passes, send emails and create all records:
```bash
RESEND_API_KEY=<your-key> node scripts/enroll-eventbrite-buyers.js eventbrite-export.csv --send-emails
```

This:
- Creates Firebase Auth users
- Writes Firestore docs atomically
- Adds leads for nurture sequence
- **Sends welcome email with magic-link profile questionnaire**

### Step 5: Verify

Check that customers:
1. **Received email** — Subject: "Your ticket is in — one quick step to get matched"
2. **Clicked the link** — They should see the profile questionnaire at `/profile?uid=...&t=...`
3. **Completed profile** — Age, intent, interests, vibes should be saved to `users/{uid}`
4. **Got matched** — If you've built the matching algorithm, confirmed attendees appear in `/matches`

To manually verify a customer in Firestore:
1. Go to **Firestore Database** in Firebase Console
2. Click **users** collection
3. Find the customer by email
4. Check: `profileCompleted` should be `true` after they submit

## Troubleshooting

### "Event X not found"
**Cause:** The eventId in your CSV doesn't exist in Firestore.
**Fix:** Add the event via `/admin` or verify the eventId spelling. Run dry-run again.

### "Email send failed for X"
**Cause:** Resend API error (bad key, quota exceeded, etc.).
**Fix:** Check your `RESEND_API_KEY` in Vercel env. Email can be retried manually via Resend UI using the URLs from `eventbrite-enrollment-urls.json`.

### "User already exists"
**Cause:** The email was already a SparkDate user.
**Fix:** The script skips creating a duplicate; it reuses the existing uid and sends an email to prompt profile completion (if needed).

### Duplicate records created
**Cause:** Script ran twice on the same CSV.
**Fix:** The idempotency logic deduplicates by email, so re-runs are safe. Existing records are preserved; only new rows are added.

## Advanced: Webhook Integration (Future)

When Eventbrite sales scale to 10+ per week, we can build a webhook integration (`/api/enroll-eventbrite`) to auto-sync new buyers in real-time. This script is the manual approach; webhook is a future enhancement for hands-free automation.

See the plan file (`rustling-plotting-spark.md`, section "Webhook Integration") for details on the planned webhook approach.

## Need Help?

If something breaks:
1. Check the `eventbrite-enrollment-summary.txt` log for error details
2. Review the environment variables are set correctly
3. Verify the CSV format matches the expected columns
4. Ensure event IDs exist in Firestore (`/events` collection)
5. Check Resend API key is valid (if using `--send-emails`)

For technical issues, refer to the inline comments in `scripts/enroll-eventbrite-buyers.js`.
