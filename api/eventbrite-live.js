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
const db = admin.firestore();

const EB = 'https://www.eventbriteapi.com/v3';

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
        const r = await fetch(
          `${EB}/events/${ev.eventbriteEventId}/?expand=ticket_classes&token=${token}`,
          { signal: AbortSignal.timeout(8000) }
        );
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

        // "Enrolled" must mirror the sync's dedupe, which matches attendee
        // emails against the event's tickets from ANY source — a buyer who
        // registered directly on SparkDate and then also bought on Eventbrite
        // is deliberately never given a second (eventbrite_import) ticket.
        // Counting only eventbrite_import tickets therefore leaves a
        // permanent phantom "+1 unsynced" for exactly that person. So compute
        // the gap the way the sync would: live (non-cancelled, non-refunded)
        // attendees whose email is NOT on any ticket here are the truly
        // unsynced ones. Attendee fetch is paginated; on any failure fall
        // back to the raw quantity_sold badge rather than erroring the row.
        let enrolled = null;
        try {
          const attendees = [];
          let continuation = null;
          do {
            const ar = await fetch(
              `${EB}/events/${ev.eventbriteEventId}/attendees/?token=${token}` +
                (continuation ? `&continuation=${continuation}` : ''),
              { signal: AbortSignal.timeout(8000) }
            );
            if (!ar.ok) throw new Error(`EB ${ar.status}`);
            const page = await ar.json();
            attendees.push(...(page.attendees || []));
            continuation = page.pagination && page.pagination.has_more_items
              ? page.pagination.continuation : null;
          } while (continuation);

          const live = attendees.filter((a) => !a.cancelled && !a.refunded);
          const tixSnap = await db.collection('tickets').where('eventId', '==', ev.id).get();
          const ourEmails = new Set(
            tixSnap.docs.map((d) => String(d.data().email || '').toLowerCase().trim()).filter(Boolean)
          );
          // Live attendee count is also the honest "sold": EB keeps the
          // attendee record for cancelled orders, quantity_sold may not.
          sold = live.length;
          enrolled = live.filter((a) => {
            const em = String((a.profile && a.profile.email) || '').toLowerCase().trim();
            return em && ourEmails.has(em);
          }).length;
        } catch (_) { /* keep quantity_sold; dashboard falls back to source-count */ }

        return {
          eventId: ev.id,
          ebEventId: String(ev.eventbriteEventId),
          sold,
          enrolled,
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
