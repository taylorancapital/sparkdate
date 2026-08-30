// api/eventbrite-live.js
//
// Live ticket counts straight from the Eventbrite API, for the admin
// dashboard's Events tab. Function #14 — the first one added because a
// credential "earned its Vercel copy": EVENTBRITE_TOKEN was deliberately
// Actions-only while only the 6-hour sync used it, and this endpoint is the
// case that justifies a second home (an api/ route reading EB at request
// time). If this env var is unset the endpoint says so and the dashboard
// simply hides the column — merging before provisioning is safe.
//
// WHY LIVE COUNTS WHEN THE SYNC EXISTS: the sync enrolls attendees every 6
// hours, so between runs the dashboard's numbers trail Eventbrite by up to
// 6h. For a host deciding TODAY whether to push an event, "EB says 9 sold,
// we have 7 enrolled" is exactly the gap worth seeing — it is both a live
// inventory read and a health check on the sync itself.
//
// Admin-only: sold counts per event are commercial data on a public domain.
// Same Bearer-ID-token + requireAdmin pattern as the Enroll tab.

'use strict';

const { admin, requireAdmin } = require('../lib/auth');
const { EB, normalizeEmail, ebGetAll } = require('../lib/eventbrite');
const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    // Not an error: the dashboard treats this as "feature not provisioned"
    // and renders nothing, so this endpoint can deploy before the env var.
    return res.status(200).json({ configured: false, events: [] });
  }

  try {
    // Only events that carry an explicit Eventbrite mapping — written by the
    // sync's same-day match-back, or set by hand. No mapping, no guessing.
    const snap = await db.collection('events').get();
    const mapped = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((ev) => ev.eventbriteEventId);

    const out = await Promise.all(mapped.map(async (ev) => {
      try {
        // Three independent reads per event, issued together: EB event
        // details (capacity/status/url), the full EB attendee list, and our
        // tickets. Only the details fetch is fatal to the row — the other
        // two degrade to the raw quantity_sold badge. Parallelism matters
        // here: sequentially their 8s timeouts stack toward the function's
        // duration cap (vercel.json pins maxDuration for this route).
        const [detailR, attendeesR, tixR] = await Promise.allSettled([
          fetch(
            `${EB}/events/${ev.eventbriteEventId}/?expand=ticket_classes&token=${token}`,
            { signal: AbortSignal.timeout(8000) }
          ),
          ebGetAll(`/events/${ev.eventbriteEventId}/attendees/`, 'attendees', token, { timeoutMs: 8000 }),
          db.collection('tickets').where('eventId', '==', ev.id).get(),
        ]);
        if (detailR.status === 'rejected') throw detailR.reason;
        const r = detailR.value;
        if (!r.ok) return { eventId: ev.id, error: `EB ${r.status}` };
        const e = await r.json();
        // Sum across ticket classes: sold and total. quantity_total can be
        // null on donation/unlimited classes; treat null as "uncapped" and
        // report capacity only when every class is capped.
        let sold = 0, cap = 0, uncapped = false;
        for (const tc of e.ticket_classes || []) {
          sold += Number(tc.quantity_sold) || 0;
          if (tc.quantity_total == null) uncapped = true;
          else cap += Number(tc.quantity_total) || 0;
        }

        // "Unsynced" answers exactly one question: WOULD THE NEXT SYNC RUN
        // ENROLL ANYONE? That is the sync's fresh-filter, replayed: a live
        // (non-cancelled, non-refunded) attendee WITH an email that matches
        // no ticket for this event, from ANY source. Two deliberate
        // exclusions, both learned from production data, not theory:
        //
        //  - Attendees with NO profile email do not count. The live lists
        //    carry attendee records with no email at all (organizer-added
        //    comps, hidden-email registrations — 6 of them across 3 events
        //    the day this shipped). The sync's fresh filter skips them
        //    (`em && ...`), so no run can ever clear them; counting them
        //    made three events read permanently gold. Notably EB's own
        //    quantity_sold doesn't count them as sales either.
        //
        //  - The match is count-aware, not set membership: each ticket can
        //    stand for ONE attendee, so a second EB sale under a buyer email
        //    that already holds a ticket stays flagged instead of vanishing
        //    into a Set.
        //
        // sold stays EB's quantity_sold — the number the organizer sees on
        // Eventbrite itself. Deriving it from attendee records instead was
        // tried and inflated it with those same email-less comps.
        let unsynced = null;
        if (attendeesR.status === 'fulfilled' && tixR.status === 'fulfilled') {
          const live = attendeesR.value.filter((a) => !a.cancelled && !a.refunded);
          const ticketCount = new Map();
          tixR.value.docs.forEach((d) => {
            const em = normalizeEmail(d.data().email);
            if (em) ticketCount.set(em, (ticketCount.get(em) || 0) + 1);
          });
          unsynced = 0;
          for (const a of live) {
            const em = normalizeEmail(a.profile && a.profile.email);
            if (!em) continue; // sync can never enroll them; see above
            const n = ticketCount.get(em) || 0;
            if (n > 0) ticketCount.set(em, n - 1);
            else unsynced++;
          }
        } else {
          // Not fatal, but not silent either: a broken Firestore rule or an
          // EB hiccup should be findable in the logs, not just a badge that
          // quietly reverted to the source-filtered count.
          const why = attendeesR.status === 'rejected' ? attendeesR.reason : tixR.reason;
          console.error(`[eventbrite-live] unsynced fallback for ${ev.id}:`, why && why.message);
        }

        return {
          eventId: ev.id,
          ebEventId: String(ev.eventbriteEventId),
          sold,
          unsynced,
          capacity: uncapped ? null : cap,
          status: e.status || null,
          url: e.url || null,
        };
      } catch (err) {
        return { eventId: ev.id, error: err.name === 'TimeoutError' ? 'timeout' : err.message };
      }
    }));

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ configured: true, events: out });
  } catch (e) {
    console.error('[eventbrite-live]', e.message);
    return res.status(500).json({ error: 'lookup failed' });
  }
};
