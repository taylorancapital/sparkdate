// api/next-event.js
//
// Public, read-only endpoint that powers the "event-first Get Tickets"
// block on the marketing landing pages (/founding and /). It returns the
// single soonest upcoming event so the block can render a real
// date/venue/price + a link into the in-app checkout (/event?id=...).
//
// Why an endpoint instead of client-side Firestore: the landing pages
// don't load the Firebase SDK, and adding ~100 KB+ to a conversion-
// critical page hurts. A tiny cached JSON fetch is faster and is reused
// by both pages.
//
// Fail-soft by design: any error returns 200 { event: null } so the
// landing page just shows its "announced soon" fallback — a marketing
// page must never render a broken/500 state.

const { admin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Events change rarely — let Vercel's edge cache absorb the traffic so
  // the landing pages stay fast. A freshly-created event shows within ~2m.
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');

  try {
    // The events collection is small — fetch ordered by date and pick the
    // first one that's still upcoming and not sold out. Filtering in code
    // keeps this a single-field query (no composite index needed).
    const snap = await db.collection('events').orderBy('date', 'asc').get();
    const now = Date.now();

    let picked = null;
    for (const doc of snap.docs) {
      const e = doc.data();
      const dt = e.date?.toDate ? e.date.toDate()
               : (e.date ? new Date(e.date) : null);
      if (!dt || isNaN(dt.getTime())) continue; // no/!valid date
      if (dt.getTime() < now) continue;          // already happened
      if (e.status === 'full') continue;         // sold out
      picked = { id: doc.id, e, dt };
      break;                                     // date-asc → first match is soonest
    }

    if (!picked) return res.status(200).json({ event: null });

    const { id, e, dt } = picked;
    return res.status(200).json({
      event: {
        id,
        title: e.title || 'SparkDate Event',
        date: dt.toISOString(),
        time: e.time || '',
        venue: e.venue || '',
        neighborhood: e.neighborhood || '',
        priceWomen: Number(e.priceWomen) || 0,
        priceMen: Number(e.priceMen) || 0,
        blurb: e.blurb || '',
        status: e.status || 'open',
      },
    });
  } catch (err) {
    console.error('[next-event] error:', err.message);
    // Fail soft — the block falls back to "announced soon".
    return res.status(200).json({ event: null });
  }
};
