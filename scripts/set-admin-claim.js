#!/usr/bin/env node
/**
 * scripts/set-admin-claim.js
 *
 * Grants the `admin: true` custom claim to a Firebase Auth user.
 * Firestore rules check `request.auth.token.admin == true` to gate
 * admin-only collection access.
 *
 * Usage:
 *   node scripts/set-admin-claim.js taylor@sparkdate.date
 *   node scripts/set-admin-claim.js taylor@sparkdate.date --revoke
 *   node scripts/set-admin-claim.js --list   # show all admins
 *
 * After running, the user must SIGN OUT and SIGN BACK IN for the new
 * claim to appear on their ID token. (Claims are baked into tokens at
 * issuance; existing tokens keep their old claims for up to 1 hour.)
 *
 * Requires the same env vars as the Vercel functions:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

'use strict';

const admin = require('firebase-admin');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
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

const args = process.argv.slice(2);

(async () => {
  if (args.includes('--list')) {
    console.log('── Current admins ──');
    let pageToken;
    let n = 0;
    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      for (const u of page.users) {
        if (u.customClaims?.admin) {
          console.log(`  • ${u.email}  uid=${u.uid}`);
          n++;
        }
      }
      pageToken = page.pageToken;
    } while (pageToken);
    console.log(`Total: ${n}`);
    process.exit(0);
  }

  const email = args.find(a => !a.startsWith('--'));
  if (!email) {
    console.error('Usage: node scripts/set-admin-claim.js <email> [--revoke]');
    console.error('       node scripts/set-admin-claim.js --list');
    process.exit(2);
  }
  const revoke = args.includes('--revoke');

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error(`✗ No Firebase Auth user with email "${email}"`);
    process.exit(3);
  }

  // Merge instead of overwrite — preserves any other claims you may
  // have set out-of-band.
  const next = { ...(user.customClaims || {}) };
  if (revoke) delete next.admin;
  else next.admin = true;

  await admin.auth().setCustomUserClaims(user.uid, next);

  console.log(`✓ ${revoke ? 'Revoked' : 'Granted'} admin claim for ${email}`);
  console.log(`  uid: ${user.uid}`);
  console.log(`  claims: ${JSON.stringify(next)}`);
  console.log();
  console.log('IMPORTANT: User must sign out and sign back in for the new claim to take effect.');
  console.log('(Existing ID tokens keep their old claims until they expire — up to ~1 hour.)');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
