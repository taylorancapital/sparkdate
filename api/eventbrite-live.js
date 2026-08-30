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
        return {
          eventId: ev.id,
          ebEventId: String(ev.eventbriteEventId),
          sold,
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
