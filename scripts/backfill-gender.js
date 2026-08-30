#!/usr/bin/env node
/**
 * scripts/backfill-gender.js
 *
 * Fills in the gender that was dropped on every Eventbrite attendee enrolled
 * before #352.
 *
 * WHY THIS EXISTS: attendeeGender() used to look in exactly two places —
 * profile.gender (which these listings do not collect) and a custom question
 * matching /gender/i (which they do not ask). The gender was in the TICKET
 * CLASS the whole time — "General Admission - Male" / "General Admission -
 * Female" — and nothing read it. #352 fixed that going forward, but the sync
 * never revisits an attendee it has already enrolled, so everyone imported
 * before it stays blank forever without this.
 *
 * That matters more than a missing column: the dashboard's gender mix is
 * computed from event_registrations, so until this runs the male/female ratio
 * it shows is not a ratio at all, and any ad-budget decision made on it is
 * made on nothing.
 *
 * WHY IT RE-FETCHES FROM EVENTBRITE: the ticket class is not stored anywhere.
 * enrollEventbriteOne writes email, name, gender, eventId, amount and source —
 * never ticket_class_name. So the gender genuinely cannot be recovered from
 * Firestore alone; Eventbrite is the only place it still exists, and attendees
 * are matched back to our records by normalized email.
 *
 * IT ONLY EVER FILLS BLANKS. A record that already has a gender is left
 * untouched, always. Hand-corrected records exist (2026-08-30), and silently
 * overwriting somebody's correction with a guess derived from a ticket class
 * would be a worse bug than the one this fixes. There is deliberately no
 * --overwrite flag.
 *
 * USAGE
 *   node scripts/backfill-gender.js                  # DRY RUN, all mapped events
 *   node scripts/backfill-gender.js --execute        # write
 *   node scripts/backfill-gender.js --event=<id>     # one of our event ids
 *   node scripts/backfill-gender.js --days=365       # how far back to look
 *
 * Dry run by default, like every other script here. Read the counts, then
 * re-run with --execute.
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');
const DAYS = parseInt((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1], 10) || 365;
const ONLY_EVENT = (process.argv.find((a) => a.startsWith('--event=')) || '').split('=')[1] || null;

const need = (k) => {
  if (!process.env[k]) {
    console.error(`x Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

const EB_TOKEN = need('EVENTBRITE_TOKEN');
need('FIREBASE_PROJECT_ID'); need('FIREBASE_CLIENT_EMAIL'); need('FIREBASE_PRIVATE_KEY');

const { normalizeEmail, attendeeGender, hasGender, genderByEmail, ebGetAll } = require('../lib/eventbrite');
const { admin } = require('../lib/auth');
const db = admin.firestore();

// The three places enrollEventbriteOne writes a gender. All three are filled,
// not just the one the dashboard reads: leaving tickets and users behind would
// make the collections disagree, and the next person to read `users.gender`
// would get a different answer from the same question.
//
// `users` is keyed by email alone (one doc per person); the other two are per
// event, so they also match on eventId.
const TARGETS = [
  { collection: 'event_registrations', perEvent: true,  note: 'feeds the dashboard gender mix' },
  { collection: 'tickets',             perEvent: true,  note: 'per-ticket record' },
  { collection: 'users',               perEvent: false, note: 'member profile' },
];

/** Commit in chunks — Firestore caps a batch at 500 operations. */
async function commitAll(updates) {
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.update(u.ref, { gender: u.gender });
    await batch.commit();
  }
}

async function main() {
  console.log(EXECUTE ? 'EXECUTING — blank genders will be filled\n' : 'DRY RUN — nothing written\n');

  const evSnap = await db.collection('events').get();
  const sinceMs = Date.now() - DAYS * 86400000;
  const events = evSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((ev) => ev.eventbriteEventId)
    .filter((ev) => !ONLY_EVENT || ev.id === ONLY_EVENT)
    .filter((ev) => {
      // Undated events are kept rather than guessed away.
      const d = ev.date && ev.date.toDate ? ev.date.toDate() : (ev.date ? new Date(ev.date) : null);
      return !d || d.getTime() >= sinceMs;
    });

  if (!events.length) {
    console.log('No events with an eventbriteEventId in range. Nothing to do.');
    console.log('(An event only syncs once its doc carries eventbriteEventId.)');
    return;
  }
  console.log(`${events.length} event(s) with an Eventbrite mapping\n`);

  const updates = [];
  let totalKnown = 0, totalFilled = 0, totalAlready = 0, totalNoGender = 0, totalUnmatched = 0;

  for (const ev of events) {
    const title = ev.title || ev.id;
    let attendees;
    try {
      attendees = await ebGetAll(`/events/${ev.eventbriteEventId}/attendees/`, 'attendees', EB_TOKEN,
        { timeoutMs: 0, retries: 3 });
    } catch (e) {
      // Per-event isolation, same as the sync: one unreachable event must not
      // abandon the rest of the backfill.
      console.error(`  EVENT ERROR ${title}: ${e.message}`);
      continue;
    }

    const { byEmail, conflicts } = genderByEmail(attendees);
    for (const email of conflicts) {
      console.warn(`  ? ${title}: ${email} appears under both genders on Eventbrite — skipped`);
    }

    const withGender = attendees.filter((a) => attendeeGender(a)).length;
    totalKnown += byEmail.size;
    totalNoGender += attendees.length - withGender;

    let filled = 0, already = 0, unmatched = 0;
    for (const t of TARGETS) {
      let q = db.collection(t.collection);
      if (t.perEvent) q = q.where('eventId', '==', ev.id);
      const snap = await q.get();

      for (const doc of snap.docs) {
        const d = doc.data();
        const email = normalizeEmail(d.email);
        if (!email) continue;
        // `users` is not event-scoped, so restrict it to people this event
        // actually knows about — otherwise every member is scanned per event.
        if (!byEmail.has(email)) {
          if (t.perEvent) unmatched++;
          continue;
        }
        if (hasGender(d.gender)) { already++; continue; }
        updates.push({ ref: doc.ref, gender: byEmail.get(email), collection: t.collection, email });
        filled++;
      }
    }

    totalFilled += filled;
    totalAlready += already;
    totalUnmatched += unmatched;
    console.log(
      `  ${filled ? '+' : ' '} ${title}` +
      `  ${attendees.length} EB attendee(s), ${byEmail.size} with a usable gender` +
      `  ->  ${filled} to fill, ${already} already set` +
      (unmatched ? `, ${unmatched} of ours not on EB` : ''),
    );
  }

  console.log('');
  const byCollection = {};
  for (const u of updates) byCollection[u.collection] = (byCollection[u.collection] || 0) + 1;
  for (const [c, n] of Object.entries(byCollection)) console.log(`  ${c}: ${n} document(s)`);
  if (!updates.length) console.log('  nothing to fill');

  console.log('');
  console.log(
    `${updates.length} document(s) ${EXECUTE ? 'updated' : 'would be updated'}` +
    ` · ${totalAlready} already had a gender (left alone)` +
    ` · ${totalNoGender} EB attendee(s) carry no gender at all`,
  );

  if (totalNoGender) {
    console.log('');
    console.log('Attendees with no gender on Eventbrite are on a non-gendered ticket class');
    console.log('("General Admission" with no suffix). There is nothing to recover for those.');
  }

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to write.');
    return;
  }
  await commitAll(updates);
  console.log('\nDone. The dashboard reads event_registrations, so its gender mix updates on next refresh.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
