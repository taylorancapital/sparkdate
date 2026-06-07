#!/usr/bin/env node
/**
 * scripts/enroll-eventbrite-buyers.js
 *
 * Batch enroll Eventbrite ticket buyers into SparkDate:
 *   1. Create Firebase Auth users (with deduplication)
 *   2. Write Firestore docs atomically (users, tickets, event_registrations)
 *   3. Create leads records for nurture emails
 *   4. Send welcome emails with magic-link profile questionnaire
 *
 * Input: CSV file with columns: email, name, gender, eventId, eventName, priceCents
 *
 * Output:
 *   - eventbrite-enrollment-uids.csv (email → uid mapping for audit)
 *   - eventbrite-enrollment-urls.json (uid + profile URLs for tracking)
 *   - eventbrite-enrollment-summary.txt (human-readable log)
 *
 * Usage:
 *   node scripts/enroll-eventbrite-buyers.js input.csv              # dry-run
 *   node scripts/enroll-eventbrite-buyers.js input.csv --send-emails  # write + email
 *
 * Requires env vars:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *   UNSUBSCRIBE_SECRET (for magic links)
 *   RESEND_API_KEY (only if --send-emails)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { Resend } = require('resend');

// ── Environment validation ─────────────────────────────────────────
const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: need('FIREBASE_PROJECT_ID'),
    clientEmail: need('FIREBASE_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const resend = new Resend(process.env.RESEND_API_KEY);

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const csvFile = args[0];
const sendEmails = args.includes('--send-emails');
const dryRun = !sendEmails; // Dry-run by default unless --send-emails is set

if (!csvFile) {
  console.error('Usage: node scripts/enroll-eventbrite-buyers.js <csv-file> [--send-emails]');
  process.exit(2);
}

if (!fs.existsSync(csvFile)) {
  console.error(`✗ File not found: ${csvFile}`);
  process.exit(2);
}

// ── Logging setup ──────────────────────────────────────────────────
const logs = [];
const uids = [];
const urls = [];
const errors = [];

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  logs.push(line);
}

function err(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ✗ ${msg}`;
  console.error(line);
  logs.push(line);
  errors.push(msg);
}

// ── Magic-link token signing (mirrors lib/profile-link.js) ─────────
function getSecret() {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    throw new Error('Neither UNSUBSCRIBE_SECRET nor STRIPE_WEBHOOK_SECRET is set');
  }
  return s;
}

function sign(uid) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(`profile.${uid}`)
    .digest('hex')
    .slice(0, 32);
}

function makeProfileUrl(uid) {
  return `https://sparkdate.date/profile?uid=${encodeURIComponent(uid)}&t=${sign(uid)}`;
}

// ── Email template (mirrors api/purchase-ticket.js) ─────────────────
function escEmail(html) {
  return String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function welcomeHTML({ eventName, resetLink, profileUrl }) {
  const safeEvent = escEmail(eventName);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:40px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:32px;font-weight:900;color:#fff;letter-spacing:-1px}
.logo span{color:#ff6b6b}
.content{padding:40px 30px}
h1{font-family:Georgia,serif;font-size:26px;color:#0a0e27;margin:0 0 18px;font-weight:900}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.cta{display:inline-block;background:#ff6b6b;color:#fff !important;font-weight:800;font-size:15px;padding:14px 34px;border-radius:4px;text-decoration:none;margin:8px 0 20px}
.fine{font-size:12px;color:#666;line-height:1.6}
.footer{background:#0a0e27;padding:24px;text-align:center;color:#888;font-size:12px}
.footer a{color:#ff6b6b;text-decoration:none}
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">Spark<span>Date</span></div></div>
  <div class="content">
    <h1>Your ticket is locked in.</h1>
    <p>You're on the list for <strong>${safeEvent}</strong>. See you there.</p>
    ${
      profileUrl
        ? `<p><strong>One quick thing</strong> — tell us a bit about yourself so we can seat you with the right people on the night. 60 seconds, no login needed:</p>
    <p style="text-align:center;"><a class="cta" href="${escEmail(profileUrl)}">Complete my profile</a></p>`
        : ''
    }
    <p>We created a SparkDate account for you — set a password to view your tickets and manage your profile:</p>
    <p style="text-align:center;"><a href="${escEmail(resetLink)}" style="color:#ff6b6b;font-weight:600;text-decoration:none;">Set my password →</a></p>
  </div>
  <div class="footer">
    <p>SparkDate · Philadelphia · Real people. Real venues.</p>
    <p><a href="https://sparkdate.date">sparkdate.date</a></p>
  </div>
</div></body></html>`;
}

// ── Enrollment functions ───────────────────────────────────────────

async function validateEvent(eventId) {
  const snap = await db.collection('events').doc(eventId).get();
  return snap.exists ? snap.data() : null;
}

async function enrollCustomer(customer, dryRun = false) {
  const { email, name, gender, eventId, eventName, priceCents } = customer;
  const norm = String(email || '').toLowerCase().trim();

  if (!norm || !name || !gender || !eventId) {
    err(`Skipped: missing required fields (email=${norm}, name=${name}, gender=${gender}, eventId=${eventId})`);
    return null;
  }

  try {
    // ── Phase 1: Create or reuse Firebase Auth user ─────────────────
    let userRecord = null;
    try {
      userRecord = await admin.auth().getUserByEmail(norm);
      log(`User ${norm}: uid=${userRecord.uid} (already exists)`);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        if (!dryRun) {
          userRecord = await admin.auth().createUser({
            email: norm,
            password: crypto.randomBytes(32).toString('hex'),
            emailVerified: false,
          });
        } else {
          userRecord = { uid: `DRY_RUN_${crypto.randomBytes(8).toString('hex')}`, email: norm };
        }
        log(`User ${norm}: uid=${userRecord.uid} (created)`);
      } else {
        throw e;
      }
    }

    // ── Phase 2: Write Firestore docs atomically ────────────────────
    if (!dryRun) {
      const uid = userRecord.uid;
      const nameParts = String(name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const amount = parseInt(priceCents, 10) || 0;

      const ticketId = db.collection('tickets').doc().id;
      const regId = db.collection('event_registrations').doc().id;

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await db.runTransaction(async (tx) => {
        // Write user doc
        tx.set(db.collection('users').doc(uid), {
          email: norm,
          firstName,
          lastName,
          gender: gender || null,
          tier: 'free',
          source: 'eventbrite_import',
          stripeCustomerId: null,
          subscriptionId: null,
          subscriptionStatus: null,
          profileCompleted: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Write ticket doc
        tx.set(db.collection('tickets').doc(ticketId), {
          firebaseUid: uid,
          email: norm,
          name,
          phone: '',
          gender: gender || null,
          eventId,
          eventName,
          amount,
          paymentIntentId: null,
          paidWithCardOnFile: false,
          status: 'confirmed',
          source: 'eventbrite_import',
          createdAt: FieldValue.serverTimestamp(),
        });

        // Write event_registrations doc
        tx.set(db.collection('event_registrations').doc(regId), {
          userId: uid,
          email: norm,
          name,
          phone: '',
          gender: gender || null,
          eventId,
          eventTitle: eventName,
          ticketId,
          paymentIntentId: null,
          status: 'confirmed',
          month: monthKey,
          source: 'eventbrite_import',
          registeredAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      log(`Firestore: user/${uid}, tickets/${ticketId}, event_registrations/${regId} written`);

      // ── Phase 3: Create leads record ────────────────────────────
      const dupe = await db.collection('leads').where('email', '==', norm).limit(1).get();
      if (dupe.empty) {
        await db.collection('leads').add({
          name,
          email: norm,
          phone: '',
          source: 'eventbrite_import',
          createdAt: FieldValue.serverTimestamp(),
          welcome_sent: true,
          subscribed: true,
          day2_sent: false,
          day5_sent: false,
          day14_sent: false,
          day25_sent: false,
          last_ticket_event_id: eventId || null,
          last_ticket_event_name: eventName || null,
          last_ticket_purchased_at: FieldValue.serverTimestamp(),
          ticket_count: 1,
        });
        log(`Leads: new record created for ${norm}`);
      } else {
        log(`Leads: record already exists for ${norm}`);
      }

      // ── Phase 4: Send welcome email ──────────────────────────────
      if (sendEmails && process.env.RESEND_API_KEY) {
        try {
          const resetLink = await admin.auth().generatePasswordResetLink(norm);
          const profileUrl = makeProfileUrl(uid);

          const html = welcomeHTML({ eventName, resetLink, profileUrl });

          const result = await resend.emails.send({
            from: 'SparkDate <hello@mail.sparkdate.date>',
            to: norm,
            subject: 'Your ticket is in — one quick step to get matched',
            html,
          });

          if (result.error) {
            err(`Email failed for ${norm}: ${result.error.message}`);
          } else {
            log(`Email sent to ${norm} (id=${result.data?.id})`);
          }
        } catch (e) {
          err(`Email error for ${norm}: ${e.message}`);
        }
      }

      // ── Record outputs ───────────────────────────────────────────
      uids.push({ email: norm, uid });
      urls.push({
        email: norm,
        uid,
        profileUrl: makeProfileUrl(uid),
      });

      return uid;
    } else {
      // Dry-run: just return the fake uid
      const uid = userRecord.uid;
      const profileUrl = `https://sparkdate.date/profile?uid=${encodeURIComponent(uid)}&t=DRY_RUN_TOKEN`;
      uids.push({ email: norm, uid });
      urls.push({
        email: norm,
        uid,
        profileUrl,
      });
      return uid;
    }
  } catch (e) {
    err(`${norm}: ${e.message}`);
    return null;
  }
}

// ── Simple CSV parser ─────────────────────────────────────────────
function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0]
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map((v) => v.trim());
    const row = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return rows;
}

// ── Main execution ─────────────────────────────────────────────────
(async () => {
  log(`${'='.repeat(70)}`);
  log(`Eventbrite Enrollment Script`);
  log(`Mode: ${dryRun ? 'DRY-RUN (validate only)' : 'WRITE + EMAIL'}`);
  log(`Input: ${csvFile}`);
  log(`${'='.repeat(70)}`);

  try {
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvFile, 'utf-8');
    const customers = parseCSV(csvContent);

    if (!customers.length) {
      err('CSV is empty or malformed');
      process.exit(1);
    }

    log(`Loaded ${customers.length} customers from CSV`);

    // Validate all events exist before processing
    log('Validating events...');
    const eventIds = new Set(customers.map((c) => c.eventId).filter(Boolean));
    const eventMap = new Map();

    for (const eventId of eventIds) {
      const event = await validateEvent(eventId);
      if (event) {
        eventMap.set(eventId, event);
        log(`Event ${eventId}: ✓ found`);
      } else {
        err(`Event ${eventId}: ✗ not found (will fail on customers with this eventId)`);
      }
    }

    // Process customers
    log(`\n${'='.repeat(70)}`);
    log('Processing customers...');
    log(`${'='.repeat(70)}\n`);

    let succeeded = 0;
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      log(`[${i + 1}/${customers.length}] Processing ${customer.email}`);

      // Validate event exists
      if (!eventMap.has(customer.eventId)) {
        err(`  Skipped: eventId ${customer.eventId} not found in Firestore`);
        continue;
      }

      const uid = await enrollCustomer(customer, dryRun);
      if (uid) {
        succeeded++;
      }
    }

    // Write output files
    log(`\n${'='.repeat(70)}`);
    log('Writing output files...');
    log(`${'='.repeat(70)}\n`);

    const outputDir = path.dirname(csvFile);

    // CSV: email → uid mapping
    const uidsCsv = ['email,uid'].concat(uids.map((row) => `${row.email},${row.uid}`)).join('\n');
    const uidsPath = path.join(outputDir, 'eventbrite-enrollment-uids.csv');
    fs.writeFileSync(uidsPath, uidsCsv);
    log(`✓ UIDs CSV: ${uidsPath}`);

    // JSON: profile URLs for email delivery
    const urlsPath = path.join(outputDir, 'eventbrite-enrollment-urls.json');
    fs.writeFileSync(urlsPath, JSON.stringify(urls, null, 2));
    log(`✓ URLs JSON: ${urlsPath}`);

    // Summary log
    const summaryPath = path.join(outputDir, 'eventbrite-enrollment-summary.txt');
    const summary = [
      `Eventbrite Enrollment Summary`,
      `Mode: ${dryRun ? 'DRY-RUN' : 'WRITE + EMAIL'}`,
      `Input: ${csvFile}`,
      `Processed: ${customers.length}`,
      `Succeeded: ${succeeded}`,
      `Failed: ${customers.length - succeeded}`,
      `Errors: ${errors.length}`,
      ``,
      `Logs:`,
      ...logs,
    ].join('\n');
    fs.writeFileSync(summaryPath, summary);
    log(`✓ Summary: ${summaryPath}`);

    log(`\n${'='.repeat(70)}`);
    log(`Complete! Succeeded: ${succeeded}/${customers.length}`);
    log(`${'='.repeat(70)}`);

    process.exit(errors.length > 0 ? 1 : 0);
  } catch (e) {
    err(`Fatal error: ${e.message}`);
    err(e.stack);
    process.exit(1);
  }
})();
