#!/usr/bin/env node
/**
 * scripts/cleanup-partial-signups.js
 *
 * One-time admin tool. Lists Firebase users whose signup never completed
 * (Firebase Auth user exists but Firestore `users/{uid}` doc is missing,
 * OR doc exists with subscriptionStatus='pending' / subscriptionId=null).
 *
 * Usage:
 *   node scripts/cleanup-partial-signups.js           # dry-run, list only
 *   node scripts/cleanup-partial-signups.js --delete  # actually delete
 *
 * Requires env vars (same as Vercel — copy from your .env.local or
 * Vercel dashboard):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * NEVER commit the values. Set them in a local .env file or export them
 * inline:  FIREBASE_PROJECT_ID=... node scripts/cleanup-partial-signups.js
 */

'use strict';

const admin = require('firebase-admin');

// ── Init ─────────────────────────────────────────────────────────
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

const db   = admin.firestore();
const auth = admin.auth();
const DRY  = !process.argv.includes('--delete');

// ── Helpers ──────────────────────────────────────────────────────
async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function fmt(u, reason) {
  const created = u.metadata?.creationTime || '?';
  return `  • ${u.email || '(no email)'}  uid=${u.uid}  created=${created}  reason=${reason}`;
}

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log(DRY ? '── DRY RUN (pass --delete to actually delete) ──' : '── DELETING PARTIAL SIGNUPS ──');
  console.log();

  const [authUsers, usersSnap] = await Promise.all([
    listAllAuthUsers(),
    db.collection('users').get(),
  ]);

  const usersById = {};
  usersSnap.docs.forEach(d => { usersById[d.id] = d.data(); });

  const orphans = [];   // Auth user, no Firestore doc
  const pending = [];   // Both exist but subscription never completed

  for (const u of authUsers) {
    const doc = usersById[u.uid];
    if (!doc) {
      orphans.push({ user: u, reason: 'no users/{uid} doc' });
      continue;
    }
    const incomplete =
      doc.subscriptionStatus === 'pending' ||
      doc.subscriptionStatus == null ||
      !doc.subscriptionId ||
      !doc.stripeCustomerId;
    if (incomplete) {
      pending.push({ user: u, doc, reason: `subscriptionStatus=${doc.subscriptionStatus} subId=${doc.subscriptionId || 'null'}` });
    }
  }

  console.log(`Total Auth users:       ${authUsers.length}`);
  console.log(`Total users docs:       ${usersSnap.size}`);
  console.log(`Orphan Auth users:      ${orphans.length}`);
  console.log(`Partial/pending signups: ${pending.length}`);
  console.log();

  if (orphans.length) {
    console.log('── Orphan Auth users (no Firestore doc) ──');
    orphans.forEach(o => console.log(fmt(o.user, o.reason)));
    console.log();
  }
  if (pending.length) {
    console.log('── Partial signups (Auth + doc, but no Stripe sub) ──');
    pending.forEach(p => console.log(fmt(p.user, p.reason)));
    console.log();
  }

  if (DRY) {
    console.log('No changes made. Re-run with --delete to remove these accounts.');
    process.exit(0);
  }

  // Safety: refuse to delete more than 25 in one pass without an extra flag.
  const toDelete = [...orphans, ...pending];
  if (toDelete.length > 25 && !process.argv.includes('--yes-i-am-sure')) {
    console.error(`✗ Refusing to delete ${toDelete.length} accounts without --yes-i-am-sure`);
    process.exit(3);
  }

  for (const { user } of toDelete) {
    try {
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete().catch(() => {});
      console.log(`  ✓ deleted ${user.email || user.uid}`);
    } catch (e) {
      console.log(`  ✗ failed   ${user.email || user.uid}: ${e.message}`);
    }
  }
  console.log();
  console.log('Done.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
