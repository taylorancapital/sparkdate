#!/usr/bin/env node
/**
 * scripts/sync-eventbrite.js
 *
 * Pulls attendees from the Eventbrite API and enrolls the new ones through
 * lib/enroll.js — the same code path the admin Enroll tab uses, so a synced
 * buyer is indistinguishable from a hand-imported one: same ticket doc shape,
 * same seat-counter transaction, same lead creation, same welcome email.
 *
 * WHY: Eventbrite is this business's largest sales channel and, until this
 * script, the only one fed by a manual CSV ritual. Sales made on Eventbrite
 * were invisible to the dashboard until somebody remembered to import — the
 * single biggest gap in the single-source-of-truth review (P1 item 3). The
 * dashboard's freshness strip reads the newest eventbrite_import ticket, so
 * this script running on schedule is exactly what turns that dot green.
 *
 * EVENT MATCHING — deliberate, and the part to understand before --execute:
 *
 *   1. An `eventbriteEventId` field on our event doc wins outright. Set it
 *      once per event (Firestore, or a future admin field) and matching is
 *      exact forever.
 *   2. Otherwise the script auto-matches by CALENDAR DAY: an EB event whose
 *      start date lands on the same day as exactly ONE of our events maps to
 *      it. Same-day is safe here because this business runs at most one
 *      event per night.
 *   3. Ambiguity (two of ours on one day, or zero) is REFUSED, not guessed:
 *      the EB event is reported and skipped. Enrolling attendees into the
 *      wrong event would corrupt tickets, counters, leads and email sends in
 *      one motion — no heuristic is worth that.
 *
 * GENDER comes from the attendee profile when Eventbrite has it, else from a
 * custom-question answer whose question text contains "gender". Unrecognized
 * values become null inside lib/enroll (never silently the men's pool).
 *
 * PRICE: base_price when present (face value, matching what the CSV imports
 * recorded), else gross. Cancelled/refunded attendees are counted in the
 * report but never enrolled.
 *
 * Usage:
 *   node scripts/sync-eventbrite.js                # dry run (default)
 *   node scripts/sync-eventbrite.js --execute      # enroll new attendees
 *   node scripts/sync-eventbrite.js --days=30      # how far back to look (default 45)
 *
 * Env:
 *   EVENTBRITE_TOKEN        private token, eventbrite.com/platform/api-keys
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *   RESEND_API_KEY          optional — without it, new enrollees are created
 *                           but welcome emails are skipped (lib/enroll guards)
 */

'use strict';

const EXECUTE = process.argv.includes('--execute');
const DAYS = parseInt((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1], 10) || 45;

const need = (k) => {
  if (!process.env[k]) {
    console.error(`x Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

const EB_TOKEN = need('EVENTBRITE_TOKEN');
need('FIREBASE_PROJECT_ID'); need('FIREBASE_CLIENT_EMAIL'); need('FIREBASE_PRIVATE_KEY');

// Requiring lib/enroll initializes the Admin SDK via lib/auth, which reads
// the FIREBASE_* env vars checked above.
const { enrollEventbriteOne } = require('../lib/enroll');
const { admin } = require('../lib/auth');
// Pagination and email normalization are shared with api/eventbrite-live.js
// through lib/eventbrite — the dashboard's unsynced badge only stays honest
// while it matches attendees exactly the way this sync does.
const { EB, normalizeEmail, ebFetch, ebGetAll } = require('../lib/eventbrite');
const db = admin.firestore();

// Every single-shot EB call in this script. Retries matter MORE here than on
// the paged calls below: /users/me/organizations/ and the event listing run in
// the setup phase, upstream of the per-event try/catch, so one transient blip
// there kills the whole sync before a single event is touched -- which is
// exactly what happened on 2026-08-30. No timeout and a fuller retry budget,
// because an Actions runner has six hours and nothing is waiting on it.
async function eb(path) {
  const r = await ebFetch(`${EB}${path}${path.includes('?') ? '&' : '?'}token=${EB_TOKEN}`,
    { label: path, timeoutMs: 0, retries: 3 });
  return r.json();
}

function attendeeGender(a) {
  const p = (a.profile && a.profile.gender) || '';
  if (p) return p;
  for (const ans of a.answers || []) {
    if (/gender/i.test(ans.question || '')) return ans.answer || null;
  }
  return null;
}

function attendeePriceCents(a) {
  const c = a.costs || {};
  const v = (c.base_price && c.base_price.value) ?? (c.gross && c.gross.value);
  return Number.isFinite(v) ? v : 0;
}

// The attendee's ACTUAL Eventbrite cut: platform fee + payment processing.
// This is the number the P&L estimates today; capturing it at sync replaces
// the estimate with truth, one ticket at a time. null when EB omits costs.
function attendeeFeeCents(a) {
  const c = a.costs || {};
  const eb = c.eventbrite_fee && c.eventbrite_fee.value;
  const pay = c.payment_fee && c.payment_fee.value;
  if (!Number.isFinite(eb) && !Number.isFinite(pay)) return null;
  return (Number.isFinite(eb) ? eb : 0) + (Number.isFinite(pay) ? pay : 0);
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

async function main() {
  console.log(EXECUTE ? 'EXECUTING — new attendees will be enrolled\n' : 'DRY RUN — nothing written\n');

  // 1. Our events, indexed by explicit EB id and by calendar day.
  const ourEvents = (await db.collection('events').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEbId = new Map();
  const byDay = new Map();
  for (const ev of ourEvents) {
    if (ev.eventbriteEventId) byEbId.set(String(ev.eventbriteEventId), ev);
    const dt = ev.date && ev.date.toDate ? ev.date.toDate() : (ev.date ? new Date(ev.date) : null);
    if (dt && !isNaN(dt)) {
      const k = dayKey(dt);
      byDay.set(k, byDay.has(k) ? 'AMBIGUOUS' : ev);
    }
  }

  // 2. Eventbrite org + recent events.
  const orgs = await eb('/users/me/organizations/');
  const org = (orgs.organizations || [])[0];
  if (!org) throw new Error('No Eventbrite organization on this token');
  console.log(`Eventbrite org: ${org.name} (${org.id})`);

  // /organizations/{id}/events/ does NOT accept start_date.range_start --
  // that is a search-endpoint parameter, and passing it here 400s (found the
  // hard way on the first live dispatch). So: order newest-first and stop
  // paginating as soon as a page's oldest event falls before the cutoff.
  // Client-side filtering costs one extra page at worst.
  const sinceMs = Date.now() - DAYS * 86400000;
  const ebEvents = [];
  let continuation = null;
  do {
    const page = await eb(`/organizations/${org.id}/events/?order_by=start_desc&time_filter=all`
      + (continuation ? `&continuation=${continuation}` : ''));
    const batch = page.events || [];
    for (const e of batch) {
      const t = e.start && e.start.utc ? new Date(e.start.utc).getTime() : null;
      if (t !== null && t >= sinceMs) ebEvents.push(e);
    }
    const last = batch.length ? batch[batch.length - 1] : null;
    const oldest = last && last.start && last.start.utc ? new Date(last.start.utc).getTime() : 0;
    continuation = (page.pagination && page.pagination.has_more_items && oldest >= sinceMs)
      ? page.pagination.continuation : null;
  } while (continuation);
  console.log(`${ebEvents.length} Eventbrite event(s) in the last ${DAYS} days\n`);

  let totalNew = 0, totalExisting = 0, totalSkippedEvents = 0, totalCancelled = 0;

  for (const ebe of ebEvents) {
    const title = (ebe.name && ebe.name.text) || ebe.id;
    const startDay = ebe.start && ebe.start.utc ? dayKey(ebe.start.utc) : null;

    // Match: explicit id first, else unique same-day.
    let ours = byEbId.get(String(ebe.id)) || null;
    let how = ours ? 'eventbriteEventId' : null;
    if (!ours && startDay) {
      const m = byDay.get(startDay);
      if (m && m !== 'AMBIGUOUS') { ours = m; how = 'same-day'; }
      else if (m === 'AMBIGUOUS') how = 'REFUSED: two events that day';
      else how = 'REFUSED: no event that day';
    }
    if (!ours) {
      console.log(`— ${title} (${startDay || '?'})  ${how} — skipped`);
      totalSkippedEvents++;
      continue;
    }
    try {

    // Attendees hang off /events/{id}/, NOT under /organizations/ -- the
    // nested spelling 404s (second lesson from live dispatches; the first
    // was start_date.range_start).
    const attendees = await ebGetAll(`/events/${ebe.id}/attendees/`, 'attendees', EB_TOKEN, { timeoutMs: 0, retries: 3 });
    const live = attendees.filter((a) => !a.cancelled && !a.refunded);
    totalCancelled += attendees.length - live.length;

    // Who is already enrolled: emails on existing tickets for this event.
    // (The real idempotency inside enrollEventbriteOne is uid+eventId; this
    // pre-check just keeps the dry run honest and the execute run quiet.)
    const tixSnap = await db.collection('tickets').where('eventId', '==', ours.id).get();
    const existing = new Set(
      tixSnap.docs.map((d) => normalizeEmail(d.data().email)).filter(Boolean)
    );
    // Ticket docs by email, kept for the fee backfill below.
    const ticketByEmail = new Map();
    tixSnap.docs.forEach((d) => {
      const em = normalizeEmail(d.data().email);
      if (em && !ticketByEmail.has(em)) ticketByEmail.set(em, d);
    });

    const fresh = live.filter((a) => {
      const em = normalizeEmail(a.profile && a.profile.email);
      return em && !existing.has(em);
    });
    totalExisting += live.length - fresh.length;

    console.log(`✓ ${title} → "${ours.title}" [${how}]  ${live.length} attending, ${fresh.length} new`);

    // A same-day match that survives to execution becomes an EXPLICIT
    // mapping: write eventbriteEventId back to the event doc. Matching is
    // then exact forever (dates can move; the id cannot), and it is what
    // lights up api/eventbrite-live's live-count column on the dashboard.
    if (EXECUTE && how === 'same-day' && !ours.eventbriteEventId) {
      await db.collection('events').doc(ours.id).update({ eventbriteEventId: String(ebe.id) });
      ours.eventbriteEventId = String(ebe.id);
      console.log(`    mapped: events/${ours.id}.eventbriteEventId = ${ebe.id}`);
    }

    for (const a of fresh) {
      const buyer = {
        email: a.profile.email,
        name: (a.profile && a.profile.name) || `${a.profile.first_name || ''} ${a.profile.last_name || ''}`.trim(),
        gender: attendeeGender(a),
        eventId: ours.id,
        eventName: ours.title || '',
        priceCents: attendeePriceCents(a),
        ebFeeCents: attendeeFeeCents(a),
        channel: 'eventbrite',
      };
      if (!EXECUTE) {
        console.log(`    would enroll: ${buyer.email}  ${buyer.gender || '?'}  $${(buyer.priceCents / 100).toFixed(2)}`);
        totalNew++;
        continue;
      }
      try {
        const r = await enrollEventbriteOne(buyer);
        console.log(`    ${r.status}: ${buyer.email}${r.reason ? ' — ' + r.reason : ''}`);
        // 'enrolled' = brand-new person; 'existing_user' = known account,
        // NEW ticket for this event. Both are new enrollments for this run —
        // the pre-check already removed anyone holding a ticket here, so
        // only 'skipped' means nothing was written.
        if (r.status === 'enrolled' || r.status === 'existing_user') totalNew++;
      } catch (e) {
        console.error(`    ERROR ${buyer.email}: ${e.message}`);
      }
    }
    // Fee backfill: attendees enrolled BEFORE fees were captured have
    // tickets with no ebFeeCents. Write the actual fee onto them once --
    // idempotent, because a ticket that already carries the field is left
    // alone. This is what converts the historical P&L from estimate to
    // actual without a separate migration.
    //
    // This block must live INSIDE the per-event try: `live`, `existing` and
    // `ticketByEmail` are scoped to it. It originally landed after the catch,
    // where the first executed event died on `live is not defined` -- thrown
    // outside the isolation that exists to contain exactly that kind of
    // failure, so one ReferenceError killed the whole run.
    let feesBackfilled = 0;
    for (const a of live) {
      const em = normalizeEmail(a.profile && a.profile.email);
      if (!em || !existing.has(em)) continue;
      const doc = ticketByEmail.get(em);
      if (!doc) continue;
      const fee = attendeeFeeCents(a);
      if (fee === null || doc.data().ebFeeCents != null) continue;
      if (EXECUTE) await doc.ref.update({ ebFeeCents: fee });
      feesBackfilled++;
    }
    if (feesBackfilled) {
      console.log(`    ${EXECUTE ? 'backfilled' : 'would backfill'} actual EB fees onto ${feesBackfilled} existing ticket(s)`);
    }
    } catch (e) {
      // Per-event isolation: one broken event (deleted on EB, permissions,
      // API hiccup) is reported and the sync moves on. Killing the whole run
      // over it would silently stop EVERY event's sync until someone read
      // the Actions logs.
      console.error(`  EVENT ERROR ${title}: ${e.message}`);
      totalSkippedEvents++;
    }
  }

  console.log(`\nnew ${totalNew} · already enrolled ${totalExisting} · cancelled/refunded ${totalCancelled} · EB events skipped ${totalSkippedEvents}`);
  if (!EXECUTE) console.log('\nDry run. Re-run with --execute to enroll.');
  if (totalSkippedEvents) console.log('Skipped events need an eventbriteEventId on the matching event doc, or exactly one of our events on that calendar day.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
