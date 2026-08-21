#!/usr/bin/env node
/**
 * scripts/backfill-event-counters.js
 *
 * Recomputes each event's seat counter from the tickets that actually
 * exist, and writes whichever counter that event's model uses:
 *
 *   single-pool events (numeric `spots`, everything the current admin
 *     creates)          → events/{id}.confirmed
 *   legacy gender-split → events/{id}.confirmedMen / confirmedWomen
 *
 * It originally wrote ONLY the legacy per-gender fields, which meant it
 * silently did nothing for single-pool events — the exact events whose
 * counters drift, since api/lead-signup.js's admin enrollment did not
 * bump any counter until it was fixed to. `spotsRemaining()` in
 * lib/seat-model.js reads `confirmed` for those events, so the drift was
 * customer-visible: the site advertised seats that did not exist.
 *
 * Comps are excluded, matching both writers of the counter
 * (api/purchase-ticket.js only counts real purchases; enrollEventbriteOne
 * skips `comp`) — a free seat must not consume paid inventory.
 *
 * Idempotent: re-running re-computes the count, so it's safe to run
 * after fixing data issues. Run --dry-run first; it prints the seats-left
 * change per event so a surprise is visible before it ships.
 *
 * Usage:
 *   node scripts/backfill-event-counters.js
 *   node scripts/backfill-event-counters.js --dry-run
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

const db = admin.firestore();
const DRY = process.argv.includes('--dry-run');

(async () => {
  const [eventsSnap, ticketsSnap] = await Promise.all([
    db.collection('events').get(),
    db.collection('tickets').get(),
  ]);

  // Tally confirmed tickets by (eventId, gender) for legacy gender-split
  // events, and by eventId alone for single-pool events. pending_3ds counts
  // too, because the user has a reserved seat pending Stripe confirmation.
  //
  // Comps are EXCLUDED, matching both writers of this counter:
  // api/purchase-ticket.js only ever counts real purchases, and
  // enrollEventbriteOne() skips `comp`. A comp is a free seat that earns
  // nothing and must not consume paid inventory.
  const tally = {};
  const poolTally = {};
  for (const d of ticketsSnap.docs) {
    const t = d.data();
    if (!t.eventId) continue;
    if (!['confirmed', 'pending_3ds'].includes(t.status || 'confirmed')) continue;
    if (t.isComp) continue;
    const key = `${t.eventId}|${t.gender}`;
    tally[key] = (tally[key] || 0) + 1;
    poolTally[t.eventId] = (poolTally[t.eventId] || 0) + 1;
  }

  console.log(DRY ? '── DRY RUN ──' : '── BACKFILLING COUNTERS ──');
  console.log(`Events:  ${eventsSnap.size}`);
  console.log(`Tickets: ${ticketsSnap.size}`);
  console.log();

  let updated = 0;
  for (const doc of eventsSnap.docs) {
    const id = doc.id;
    const current = doc.data();

    // Single-pool events (new admin: a numeric `spots`) keep ONE counter,
    // `confirmed`. Writing only the legacy per-gender fields — which is all
    // this script used to do — left those events untouched, so the drift
    // this script exists to repair was silently unrepairable on every event
    // created by the current admin. Branch on the same isSinglePool test
    // lib/seat-model.js uses, so the script and the runtime never disagree
    // about which field is authoritative.
    if (Number.isFinite(Number(current.spots))) {
      const confirmed = poolTally[id] || 0;
      if ((current.confirmed ?? 0) === confirmed) {
        console.log(`  · ${current.title || id} — already correct (confirmed=${confirmed})`);
        continue;
      }
      const cap = Number(current.spots);
      const was = current.confirmed ?? 0;
      console.log(`  ✎ ${current.title || id} — confirmed: ${was} → ${confirmed}` +
                  `   (seats left ${Math.max(0, cap - was)} → ${Math.max(0, cap - confirmed)} of ${cap})`);
      if (!DRY) {
        await doc.ref.update({ confirmed });
        updated++;
      }
      continue;
    }

    const confirmedWomen = tally[`${id}|woman`] || 0;
    const confirmedMen   = tally[`${id}|man`]   || 0;
    const sameW = (current.confirmedWomen ?? 0) === confirmedWomen;
    const sameM = (current.confirmedMen ?? 0)   === confirmedMen;
    if (sameW && sameM) {
      console.log(`  · ${current.title || id} — already correct (w=${confirmedWomen}, m=${confirmedMen})`);
      continue;
    }
    console.log(`  ✎ ${current.title || id} — w: ${current.confirmedWomen ?? 0} → ${confirmedWomen}, m: ${current.confirmedMen ?? 0} → ${confirmedMen}`);
    if (!DRY) {
      await doc.ref.update({ confirmedWomen, confirmedMen });
      updated++;
    }
  }

  console.log();
  console.log(DRY ? `Would update ${eventsSnap.size - updated} events.` : `Updated ${updated} events.`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
