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

const fs = require('fs');
const path = require('path');
const { admin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();

// ── Server-rendered event page ────────────────────────────────────────
// This endpoint does double duty (to stay within the Hobby plan's 12-function
// cap): the default GET returns the "next event" JSON used by the landing
// pages, while GET ?render=page serves public/event.html with schema.org
// Event JSON-LD + meta/OG baked into the <head>. vercel.json rewrites /event
// and /event/:id here so crawlers see structured data in the initial HTML
// instead of relying on client-side JS that runs after an async Firestore read.

let TEMPLATE = null;
function loadEventTemplate() {
  if (TEMPLATE) return TEMPLATE;
  TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'public', 'event.html'), 'utf8');
  return TEMPLATE;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Fetch the event, build the head injection, and return the full HTML.
// Fail-soft: on any error serve the unmodified template so checkout works.
async function renderEventPage(req, res) {
  const id = (req.query && (req.query.id || req.query.eventId)) || '';
  let html = loadEventTemplate();
  let headInject = '';
  let pageTitle = null;

  try {
    if (id) {
      const snap = await db.collection('events').doc(String(id)).get();
      if (snap.exists) {
        const ev = snap.data();
        const d = ev.date && ev.date.toDate ? ev.date.toDate()
                : (ev.date ? new Date(ev.date) : null);
        const dateLabel = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
        const venueLabel = ev.venue ? `${ev.venue}${ev.neighborhood ? ', ' + ev.neighborhood : ''}` : 'Philadelphia';
        const title = ev.title ? `${ev.title} — SparkDate` : 'Event Tickets — SparkDate';
        const desc = (ev.blurb && ev.blurb.trim())
          || `${ev.title || 'A SparkDate event'} on ${dateLabel} at ${venueLabel}. Reserve your spot — real dates, real venues, real people in Philadelphia.`;
        const pageUrl = `https://sparkdate.date/event?id=${encodeURIComponent(id)}`;
        const img = 'https://sparkdate.date/og-image.svg';
        const price = Number(ev.price || ev.priceMen || ev.priceWomen || 0);

        const ld = {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: ev.title || 'SparkDate Event',
          description: desc,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          url: pageUrl,
          image: [img],
          organizer: { '@type': 'Organization', name: 'SparkDate', url: 'https://sparkdate.date/' },
          // SparkDate hosts/runs each mixer, so it is also the performer.
          performer: { '@type': 'Organization', name: 'SparkDate', url: 'https://sparkdate.date/' },
          location: {
            '@type': 'Place',
            name: ev.venue || 'Philadelphia venue',
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Philadelphia',
              addressRegion: 'PA',
              addressCountry: 'US',
            },
          },
        };
        if (d) {
          ld.startDate = d.toISOString();
          // Mixers run ~3 hours; provide an endDate (recommended by Google).
          // Use the event's own durationHours if set, else default to 3.
          const hrs = Number(ev.durationHours) > 0 ? Number(ev.durationHours) : 3;
          ld.endDate = new Date(d.getTime() + hrs * 60 * 60 * 1000).toISOString();
        }
        if (price > 0) {
          ld.offers = {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: 'USD',
            url: pageUrl,
            availability: 'https://schema.org/InStock',
            // Tickets are on sale from when the event was created (else now).
            validFrom: (ev.createdAt && ev.createdAt.toDate
              ? ev.createdAt.toDate()
              : new Date()).toISOString(),
          };
        }

        pageTitle = title;
        headInject =
          `\n    <meta name="description" content="${escAttr(desc)}">` +
          `\n    <link rel="canonical" href="${escAttr(pageUrl)}">` +
          `\n    <meta property="og:type" content="event">` +
          `\n    <meta property="og:title" content="${escAttr(title)}">` +
          `\n    <meta property="og:description" content="${escAttr(desc)}">` +
          `\n    <meta property="og:url" content="${escAttr(pageUrl)}">` +
          `\n    <meta property="og:image" content="${escAttr(img)}">` +
          `\n    <meta name="twitter:card" content="summary_large_image">` +
          `\n    <meta name="twitter:title" content="${escAttr(title)}">` +
          `\n    <meta name="twitter:description" content="${escAttr(desc)}">` +
          `\n    <meta name="twitter:image" content="${escAttr(img)}">` +
          `\n    <script type="application/ld+json" id="event-jsonld">${JSON.stringify(ld)}</script>\n`;
      }
    }
  } catch (err) {
    console.error('[next-event] page render error:', err && err.message);
  }

  if (headInject) {
    html = html.replace(/<\/head>/i, `${headInject}</head>`);
    if (pageTitle) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escAttr(pageTitle)}</title>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
  return res.status(200).send(html);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // /event and /event/:id are rewritten here with ?render=page.
  if (req.query && req.query.render === 'page') {
    return renderEventPage(req, res);
  }

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
        // Single-price model (gender pricing removed); fall back to legacy fields.
        price: Number(e.price || e.priceMen || e.priceWomen || 0),
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
