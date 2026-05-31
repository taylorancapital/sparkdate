// api/event-page.js
//
// Server-rendered event page. Injects schema.org Event JSON-LD plus per-event
// meta/Open-Graph/canonical tags into public/event.html AT REQUEST TIME, so
// crawlers (Google Rich Results, social unfurlers) see the structured data in
// the initial HTML — instead of relying on the client-side injectEventSeo()
// which only runs after an async Firestore read and is therefore invisible to
// the Rich Results Test and unreliable for indexing.
//
// vercel.json rewrites /event and /event/:id to this function. The browser URL
// is unchanged (rewrites are transparent), so the existing client JS that reads
// ?id= and loads the event for checkout keeps working exactly as before. The
// client injection reuses the same #event-jsonld element, so there is no
// duplicate schema — it simply updates the server-rendered tag in place.
//
// Admin SDK reads bypass Firestore security rules, so this is also more robust
// than the client path (no public-read rule dependency). Fail-soft: on any
// error we serve the unmodified template so ticket purchase never breaks.

const fs = require('fs');
const path = require('path');
const { admin } = require('../lib/auth');

const db = admin.firestore();

// Cache the template across warm invocations. Bundled via the `includeFiles`
// entry in vercel.json so it is present on the function's filesystem.
let TEMPLATE = null;
function loadTemplate() {
  if (TEMPLATE) return TEMPLATE;
  TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'public', 'event.html'), 'utf8');
  return TEMPLATE;
}

// Minimal HTML-attribute escaper for values we drop into tags.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  const id = (req.query && (req.query.id || req.query.eventId)) || '';
  let html = loadTemplate();
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
        if (d) ld.startDate = d.toISOString();
        if (price > 0) {
          ld.offers = {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: 'USD',
            url: pageUrl,
            availability: 'https://schema.org/InStock',
          };
        }

        pageTitle = title;
        headInject =
          `\n    <meta name="description" content="${esc(desc)}">` +
          `\n    <link rel="canonical" href="${esc(pageUrl)}">` +
          `\n    <meta property="og:type" content="event">` +
          `\n    <meta property="og:title" content="${esc(title)}">` +
          `\n    <meta property="og:description" content="${esc(desc)}">` +
          `\n    <meta property="og:url" content="${esc(pageUrl)}">` +
          `\n    <meta property="og:image" content="${esc(img)}">` +
          `\n    <meta name="twitter:card" content="summary_large_image">` +
          `\n    <meta name="twitter:title" content="${esc(title)}">` +
          `\n    <meta name="twitter:description" content="${esc(desc)}">` +
          `\n    <meta name="twitter:image" content="${esc(img)}">` +
          `\n    <script type="application/ld+json" id="event-jsonld">${JSON.stringify(ld)}</script>\n`;
      }
    }
  } catch (err) {
    console.error('[event-page] SSR error:', err && err.message);
    // fall through and serve the unmodified template
  }

  if (headInject) {
    html = html.replace(/<\/head>/i, `${headInject}</head>`);
    if (pageTitle) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(pageTitle)}</title>`);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Events change rarely; let the edge cache absorb crawler + user traffic.
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
  return res.status(200).send(html);
};
