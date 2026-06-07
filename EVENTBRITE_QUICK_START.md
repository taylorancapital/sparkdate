# Eventbrite Enrollment — Quick Start Guide

You have **2 new files** ready to use:

## What Was Built

### 1. `scripts/enroll-eventbrite-buyers.js` — Batch Enrollment Script
- Automates the manual 2–4 hour per-customer enrollment process
- Reads a CSV file with Eventbrite customer data
- Creates Firebase Auth users → Firestore docs → welcome emails
- Includes dry-run mode for safe validation

**When to use:** You have a batch of Eventbrite customers to onboard (10+ at a time)

### 2. `EVENTBRITE_WEBHOOK_PLAN.md` — Webhook Design Document
- Complete research & design for real-time webhook integration
- Eventbrite API fundamentals, signature verification, cost analysis
- Buildout checklist (for when volume scales to 10+/week)
- Ready to hand off to a developer for implementation

**When to use:** Volume hits 10+ Eventbrite sales/week and you want to eliminate manual batching

---

## Get Started (Right Now)

### To Use the Script Today

1. **Export from Eventbrite:**
   - Organizer dashboard → Your Event → Attendees → Export as CSV
   - Ensure columns: email, name, gender, event name, price

2. **Rename columns to match our format:**
   ```
   email, name, gender, eventId, eventName, priceCents
   ```
   - `eventId` = Your Firestore event document ID (find in Firebase Console → Firestore → events)
   - `priceCents` = ticket price in cents (e.g., 1500 for $15)

3. **Test with dry-run:**
   ```bash
   node scripts/enroll-eventbrite-buyers.js your-export.csv
   ```
   This validates the CSV and checks that events exist in Firestore — **no writes happen**.

4. **If dry-run passes, enroll for real:**
   ```bash
   node scripts/enroll-eventbrite-buyers.js your-export.csv --send-emails
   ```
   This creates all records and sends welcome emails with profile questionnaire links.

5. **Check outputs:**
   - `eventbrite-enrollment-uids.csv` — audit trail (email → uid mapping)
   - `eventbrite-enrollment-urls.json` — profile URLs (if you need them for anything)
   - `eventbrite-enrollment-summary.txt` — detailed log with timestamps

---

## What Happens to Each Customer

✅ **Firebase Auth user created** (or reused if email exists)
✅ **Firestore users doc** written with name, gender, tier='free'
✅ **Firestore tickets doc** written with event, status='confirmed'
✅ **Firestore event_registrations doc** written (mirrors ticket)
✅ **Firestore leads doc** created (for nurture email sequence)
✅ **Welcome email sent** with magic-link profile questionnaire
✅ **Spark 30-day trial activated** (same as native ticket buyers)

→ Customer can click the email link to fill out profile (age, intent, interests, vibes)
→ Profile data saved to Firestore
→ Customer automatically enrolled in post-event matching

---

## FAQ

**Q: Can I run the script multiple times?**
A: Yes, it's safe. The script deduplicates by email — re-runs skip existing users and logs them.

**Q: What if I forget `--send-emails`?**
A: The script still creates all Firestore records. You can send emails manually later using the URLs from `eventbrite-enrollment-urls.json`.

**Q: What if an event doesn't exist in Firestore?**
A: The dry-run will warn you. Create the event first via `/admin`, then re-run.

**Q: How do I verify it worked?**
A: Check Firebase Console:
- **Firebase Auth:** New users appear under Authentication → Users
- **Firestore:** New docs appear in the `users`, `tickets`, `event_registrations`, `leads` collections
- **Emails:** Check your email provider (Resend dashboard) for delivery status

**Q: Future webhook integration — when?**
A: Build it when you're consistently getting 10+ Eventbrite sales per week. Refer to `EVENTBRITE_WEBHOOK_PLAN.md` for the full design and buildout checklist.

---

## Files

- **`scripts/enroll-eventbrite-buyers.js`** — The script (ready to use)
- **`EVENTBRITE_ENROLLMENT.md`** — Full documentation (workflow, troubleshooting, advanced)
- **`EVENTBRITE_WEBHOOK_PLAN.md`** — Webhook design & research (for future scaling)
- **`EVENTBRITE_QUICK_START.md`** — This file

---

## Next Steps

1. **Export your Eventbrite customer list** (CSV format)
2. **Run dry-run** to validate
3. **Run production enrollment** with `--send-emails`
4. **Share profile links** with customers (or let them click the email link)
5. **Monitor completions** in Firestore (watch for `profileCompleted: true`)

Need help? See `EVENTBRITE_ENROLLMENT.md` for detailed troubleshooting and workflow instructions.
