#!/usr/bin/env node
/**
 * scripts/list-auth-users.js
 *
 * Dump every Firebase Auth user so you can identify which email you
 * actually sign into /admin with. Useful when scripts/set-admin-claim.js
 * can't find the email you typed.
 *
 * Usage:
 *   node scripts/list-auth-users.js
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

(async () => {
  let pageToken;
  let n = 0;
  console.log('email | uid | created | admin?');
  console.log('-'.repeat(80));
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const isAdmin = u.customClaims?.admin ? 'YES' : '';
      console.log(`${u.email || '(no email)'}  |  ${u.uid}  |  ${u.metadata?.creationTime || '?'}  |  ${isAdmin}`);
      n++;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log('-'.repeat(80));
  console.log(`Total: ${n} users`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
