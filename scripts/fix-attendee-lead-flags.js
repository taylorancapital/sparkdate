#!/usr/bin/env node
/**
 * scripts/fix-attendee-lead-flags.js
 *
 * One-time data fix. sendReturningAttendeeInvites() in api/cron-send-emails.js
 * used to lazily create a `leads` doc for a past attendee with
 * welcome_sent/day2_sent/day5_sent/day14_sent/day25_sent all stamped `true` —
 * to keep the first-timer nurture sequence from firing at someone who already
 * attended. No such emails were ever actually sent to these people; the fake
 * flags just made the admin Leads tab show green checkmarks that disagreed
 * with Resend's own send log. The suppression itself was always redundant —
 * sendBucket() already skips anyone in `attendedEmails` (confirmed past
 * registrations, which is exactly who these leads are for).
 *
 * This clears those five fields on every `leads` doc with source:'attendee',
 * so the admin table stops showing phantom sends. It does NOT touch
 * `subscribed`, `name`, or anything else on the doc.
 *
 * Usage:
 *   node scripts/fix-attendee-lead-flags.js            # dry-run (default)
 *   node scripts/fix-attendee-lead-flags.js --apply    # actually write
 *
 * Requires env vars (same as Vercel — copy from .env.local or the dashboard):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * NEVER commit the values. Export them inline:
 *   FIREBASE_PROJECT_ID=... node scripts/fix-attendee-lead-flags.js --apply
 */

'use strict';

const admin = require('firebase-admin');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    console.error('  Copy from your Vercel project settings or .env.local');
    process.exit(2);
  }
  return process.env[k];
};

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey:  need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

const db  = admin.firestore();
const DRY = !process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('leads').where('source', '==', 'attendee').get();

  if (snap.empty) {
    console.log('No source:"attendee" leads found — nothing to fix.');
    return;
  }

  console.log(`Found ${snap.size} attendee-derived lead(s).${DRY ? ' (dry run — pass --apply to write)' : ''}`);

  let fixed = 0;
  const FieldValue = admin.firestore.FieldValue;

  for (const doc of snap.docs) {
    const d = doc.data();
    const hadFakeFlags = d.welcome_sent || d.day2_sent || d.day5_sent || d.day14_sent || d.day25_sent;
    if (!hadFakeFlags) continue;

    console.log(`  ${doc.id} (${d.email || 'no email'}): clearing welcome_sent/day2_sent/day5_sent/day14_sent/day25_sent`);
    fixed++;

    if (!DRY) {
      await doc.ref.update({
        welcome_sent: FieldValue.delete(),
        day2_sent:    FieldValue.delete(),
        day5_sent:    FieldValue.delete(),
        day14_sent:   FieldValue.delete(),
        day25_sent:   FieldValue.delete(),
      });
    }
  }

  console.log(`${DRY ? 'Would fix' : 'Fixed'} ${fixed} of ${snap.size} lead(s).`);
}

main().catch((e) => {
  console.error('✗ Failed:', e.message);
  process.exit(1);
});
