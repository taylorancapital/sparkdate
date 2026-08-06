// api/next-event.js
//
// Public, read-only endpoint that powers the "event-first Get Tickets"
// block on the homepage (/) and the ad landing page (/lp). It returns the
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
const { effectivePrice, spotsRemaining } = require('../lib/seat-model');
const { buildSitemapXml } = require('../lib/sitemap-xml');
const { isEventOver, getNextEvent } = require('../lib/next-event');

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
  // new RegExp, not a regex literal: a literal quote inside a regex breaks
  // Vercel's build-time entrypoint scanner, which then drops this file from
  // the deployed functions ("pattern doesn't match any Serverless Functions").
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(new RegExp('"', 'g'), '&quot;');
}

// Serialize a JSON-LD object for safe embedding inside a script element.
// JSON.stringify does not escape the less-than character, so a field value
// containing a closing script tag could otherwise terminate the block
// early. Replacing every less-than character with its unicode escape
// prevents that breakout; the escape is valid inside a JSON string and
// parses back to the original text, so the structured data is unchanged.
function escapeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// Fetch the event, build the head injection, and return the full HTML.
// Fail-soft: on any error serve the unmodified template so checkout works.
async function renderEventPage(req, res) {
  const id = (req.query && (req.query.id || req.query.eventId)) || '';
  let html;
  try {
    html = loadEventTemplate();
  } catch (e) {
    // The checkout template (public/event.html) is bundled via vercel.json
    // `includeFiles`. If it ever fails to resolve at runtime we have no page
    // to render — fail soft to the events listing rather than throw an
    // unhandled 500 on every /event request.
    console.error('[next-event] template load failed:', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/events');
  }
  // Always assert a real canonical URL in the raw HTML, even before (or
  // absent) a successful Firestore lookup below — a bare /event hit with no
  // resolvable id previously shipped no canonical tag at all, which is as
  // bad for indexing as pointing at the wrong URL. The per-event block
  // below overwrites this with the real canonical when an event resolves.
  let headInject = `\n    <link rel="canonical" href="https://sparkdate.date/event">\n`;
  let pageTitle = null;
  let notFound = false;

  try {
    if (id) {
      const snap = await db.collection('events').doc(String(id)).get();
      if (!snap.exists) {
        // A provided id that resolves to no event (deleted or bogus) must
        // be an honest 404, not a 200 with generic content — Google treats
        // that as a soft-404 and keeps the dead URL in its crawl queue.
        // The template is still served below: event.html's own JS redirects
        // human visitors to /events when the id doesn't resolve.
        notFound = true;
      } else {
        const ev = snap.data();
        const d = ev.date && ev.date.toDate ? ev.date.toDate()
                : (ev.date ? new Date(ev.date) : null);
        const dateLabel = d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
        // Mixers run ~3 hours; the event's own durationHours wins when set.
        // Shared by the schema's endDate below and the is-it-over check.
        const hrs = Number(ev.durationHours) > 0 ? Number(ev.durationHours) : 3;
        const isPast = d ? d.getTime() + hrs * 60 * 60 * 1000 < Date.now() : false;
        // Never hardcode a single city — this file serves both Philadelphia
        // and Lancaster events. Fall back to the event's own city, then to
        // a two-city phrase, rather than guessing wrong for half the site's
        // events (matches the fix already applied in event.html/events.html
        // /city.html: omit or use real data rather than assume Philadelphia).
        const venueLabel = ev.venue ? `${ev.venue}${ev.neighborhood ? ', ' + ev.neighborhood : ''}` : (ev.city || 'your area');
        const title = ev.title ? `${ev.title} — SparkDate` : 'Event Tickets — SparkDate';
        const desc = (ev.blurb && ev.blurb.trim())
          || `${ev.title || 'A SparkDate event'} on ${dateLabel} at ${venueLabel}. Reserve your spot — real dates, real venues, real people in ${ev.city || 'Philadelphia & Lancaster'}.`;
        const pageUrl = `https://sparkdate.date/event?id=${encodeURIComponent(id)}`;
        const img = 'https://sparkdate.date/og-image.jpg';
        const price = effectivePrice(ev, 'any').price;

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
          `\n    <meta name="twitter:image" content="${escAttr(img)}">`;

        if (isPast) {
          // The event is over: drop the page from the index (a finished
          // mixer has no search value) and ship NO Event JSON-LD — Google
          // flags sites whose Event markup keeps presenting past events as
          // scheduled. Meta/OG stay so previously shared links still unfurl.
          headInject += `\n    <meta name="robots" content="noindex">\n`;
        } else {
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
              name: ev.venue || (ev.city ? `${ev.city} venue` : 'SparkDate venue'),
              address: {
                '@type': 'PostalAddress',
                // Use the event's own city — never hardcode one. Omit
                // entirely when unknown rather than guess (same fix already
                // applied in event.html/events.html/city.html's schema).
                ...(ev.city ? { addressLocality: ev.city } : {}),
                // Full street address string as stored on the venue record
                // (e.g. "200 S Broad St, Philadelphia, PA 19102") — not yet
                // split into components, but present is far better than
                // absent: missing streetAddress is Google's most-cited
                // reason Event rich results don't qualify. Only events
                // created via the admin venue picker carry this.
                ...(ev.venueAddress ? { streetAddress: ev.venueAddress } : {}),
                // Same reasoning as addressLocality above: derive the state
                // from the event's own city rather than hardcoding one, so a
                // future city outside PA doesn't get mislabeled. Matched by
                // name (not slug) against CITY_SEO below, since ev.city is
                // free text typed in the admin form (e.g. "Philadelphia"),
                // not a URL slug. Omit rather than guess when the city isn't
                // a recognized one yet.
                ...(stateForCity(ev.city) ? { addressRegion: stateForCity(ev.city) } : {}),
                addressCountry: 'US',
              },
            },
          };
          if (d) {
            ld.startDate = d.toISOString();
            // endDate is recommended by Google; hrs is shared with isPast.
            ld.endDate = new Date(d.getTime() + hrs * 60 * 60 * 1000).toISOString();
          }
          if (price > 0) {
            // Advertise real inventory: a full event (admin-set status or an
            // exhausted seat pool) is SoldOut, not InStock. spotsRemaining
            // returns null when the doc has no usable capacity fields —
            // treat that as "unknown", never as sold out.
            const sr = spotsRemaining(ev);
            const soldOut = ev.status === 'full' || (sr != null && sr.remaining <= 0);
            ld.offers = {
              '@type': 'Offer',
              price: price.toFixed(2),
              priceCurrency: 'USD',
              url: pageUrl,
              availability: soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
              // Tickets are on sale from when the event was created (else now).
              validFrom: (ev.createdAt && ev.createdAt.toDate
                ? ev.createdAt.toDate()
                : new Date()).toISOString(),
            };
          }
          headInject += `\n    <script type="application/ld+json" id="event-jsonld">${escapeJsonLd(ld)}</script>\n`;
        }
      }
    }
  } catch (err) {
    console.error('[next-event] page render error:', err && err.message);
  }

  if (headInject) {
    // Function-form replacements so any `$` sequences in the injected meta
    // or JSON-LD (e.g. "$5" in a blurb, or "$&") are inserted literally and
    // not interpreted as String.prototype.replace special patterns.
    html = html.replace(/<\/head>/i, () => `${headInject}</head>`);
    if (pageTitle) html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escAttr(pageTitle)}</title>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
  // 404 only for a lookup that positively found nothing; Firestore errors
  // keep the fail-soft 200 (never break checkout because a read hiccuped).
  return res.status(notFound ? 404 : 200).send(html);
}

// ── Server-rendered city page ─────────────────────────────────────────
// Same problem as event pages, different cause: public/city.html is one
// static file for every city, so its raw <head> ships a single hardcoded
// canonical (pointing at the homepage) regardless of which city query
// param loads. The correct per-city title/description/canonical are only
// patched in client-side by city.html's own injectMeta() — too late for
// Googlebot's first pass, which discounts JS-inserted canonicals. vercel.json
// rewrites /philadelphia and /lancaster here with ?render=city&city=... instead
// of straight to the static file, exactly like /event's ?render=page above.
// No new function file: api/ is already at the Hobby plan's 12-function cap.

let CITY_TEMPLATE = null;
function loadCityTemplate() {
  if (CITY_TEMPLATE) return CITY_TEMPLATE;
  CITY_TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'public', 'city.html'), 'utf8');
  return CITY_TEMPLATE;
}

// SEO-relevant fields only. The full CITIES config (FAQs, venue copy, hero
// text) stays client-side in public/city.html — duplicating that here would
// create a second source of truth for content that has no bearing on what
// Google needs from the raw HTML. Keep in sync with the `name`/`state` in
// public/city.html's own CITIES config.
const CITY_SEO = {
  philadelphia: { name: 'Philadelphia', state: 'PA' },
  lancaster: { name: 'Lancaster', state: 'PA' },
};

// Looks up an event's addressRegion (US state) from its free-text `city`
// field, matched by name rather than slug (admin types "Philadelphia", not
// "philadelphia"). Backed by CITY_SEO so adding a city there — e.g. a future
// { 'colorado-springs': { name: 'Colorado Springs', state: 'CO' } } — fixes
// both the /colorado-springs landing page AND every Colorado Springs event's
// schema in one edit, with nothing left still assuming PA. Returns null for
// an unrecognized city rather than guessing.
const STATE_BY_CITY_NAME = Object.fromEntries(
  Object.values(CITY_SEO).map((c) => [c.name.toLowerCase(), c.state])
);
function stateForCity(city) {
  return STATE_BY_CITY_NAME[String(city || '').toLowerCase().trim()] || null;
}

// City data is static (no Firestore read, unlike events) — just resolve the
// known city, build the head injection, and return the full HTML. Fail-soft:
// unknown/missing city serves the template unchanged, which preserves the
// client-side DEFAULT_CITY fallback for that case.
function renderCityPage(req, res) {
  const citySlug = String((req.query && req.query.city) || '').toLowerCase().trim();
  let html;
  try {
    html = loadCityTemplate();
  } catch (e) {
    console.error('[next-event] city template load failed:', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/events');
  }

  const city = CITY_SEO[citySlug];
  if (city) {
    // Same string templates as public/city.html's injectMeta() (title/
    // description/canonical formulas) so the server-rendered head matches
    // what the client-side JS would otherwise produce — zero visible change
    // for real users.
    const title = `Singles Mixers in ${city.name}, ${city.state} — SparkDate`;
    const desc = `Curated singles mixers in ${city.name} — our take on speed dating, without the scorecard. Meet singles at ${city.name}'s best venues.`;
    const canonicalUrl = `https://sparkdate.date/${citySlug}`;

    // The template already carries a static <title>, <meta name="description">,
    // and <link rel="canonical"> (city.html:7-9) — replace those in place
    // rather than appending, so the response never carries two conflicting
    // canonical tags at once.
    html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escAttr(title)}</title>`);
    html = html.replace(/<meta name="description"[^>]*>/i, () => `<meta name="description" content="${escAttr(desc)}">`);
    html = html.replace(/<link rel="canonical"[^>]*>/i, () => `<link rel="canonical" href="${escAttr(canonicalUrl)}">`);

    const headInject =
      `\n    <meta property="og:title" content="${escAttr(title)}">` +
      `\n    <meta property="og:description" content="${escAttr(desc)}">` +
      `\n    <meta property="og:url" content="${escAttr(canonicalUrl)}">\n`;
    html = html.replace(/<\/head>/i, () => `${headInject}</head>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
  return res.status(200).send(html);
}

// ── Server-rendered homepage ──────────────────────────────────────────
// Same "don't make Googlebot/first-paint wait on client JS" problem as
// /event and /philadelphia above, applied to the homepage's "Get Tickets"
// block: public/index.html ships generic placeholder copy
// (#eventCtaTitle/#eventCtaMeta/#eventCtaBtn) and only becomes a real,
// credible event card after index.html's own client-side fetch to this
// same endpoint's default JSON path resolves. On slow connections or a
// bot that doesn't run JS, that's a blank-looking promise instead of a
// dated event. vercel.json rewrites / here with ?render=home instead of
// straight to the static file. The client-side fetch in index.html is
// left in place unchanged — it just re-fetches and overwrites with the
// same data, which is harmless and keeps the page self-healing if this
// render path ever serves stale/generic copy.

let HOME_TEMPLATE = null;
function loadHomeTemplate() {
  if (HOME_TEMPLATE) return HOME_TEMPLATE;
  HOME_TEMPLATE = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  return HOME_TEMPLATE;
}

function fmtPrice(n) {
  n = Number(n);
  return '$' + (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));
}

async function renderHomePage(req, res) {
  let html;
  try {
    html = loadHomeTemplate();
  } catch (e) {
    // Same reasoning as renderEventPage/renderCityPage above: if the
    // bundled template can't be read there is no HTML to fail soft to.
    console.error('[next-event] home template load failed:', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, '/events');
  }

  try {
    // getNextEvent already fails soft to null on a Firestore error — this
    // try/catch exists so a bug in the string-replace below can never take
    // the homepage down with it; on any failure here `html` is still the
    // untouched template with its static placeholder copy.
    const event = await getNextEvent(db);
    if (event && event.id) {
      const eyebrow = (event.isEarlyBird && event.regularPrice)
        ? 'Early-bird pricing'
        : 'Upcoming Mixer';
      const metaParts = [];
      if (event.venueLabel) metaParts.push(`📍 ${event.venueLabel}`);
      if (event.dateLabel) metaParts.push(`📅 ${event.dateLabel}${event.daysAwayLabel ? ' · ' + event.daysAwayLabel : ''}`);
      const metaSpans = metaParts.map((t) => `<span>${escAttr(t)}</span>`).join('');

      let btnLabel = '🎟️ Get Tickets';
      if (event.price > 0) {
        btnLabel += ` — ${fmtPrice(event.price)}`;
        if (event.isEarlyBird && event.regularPrice > event.price) {
          btnLabel += ` <span class="regular-price">${fmtPrice(event.regularPrice)}</span>`;
        }
      }
      // Deep-links into the events-page dialog, same target the client-side
      // fetch in index.html builds (/events?event=<id>) — not /event?id=.
      const btnHref = `/events?event=${encodeURIComponent(event.id)}`;

      html = html.replace(
        /<div class="event-cta-eyebrow" id="eventCtaEyebrow">[\s\S]*?<\/div>/,
        () => `<div class="event-cta-eyebrow" id="eventCtaEyebrow">${escAttr(eyebrow)}</div>`
      );
      html = html.replace(
        /<h2 class="event-cta-title" id="eventCtaTitle">[\s\S]*?<\/h2>/,
        () => `<h2 class="event-cta-title" id="eventCtaTitle">${escAttr(event.title)}</h2>`
      );
      if (metaSpans) {
        html = html.replace(
          /<div class="event-cta-meta" id="eventCtaMeta">[\s\S]*?<\/div>/,
          () => `<div class="event-cta-meta" id="eventCtaMeta">${metaSpans}</div>`
        );
      }
      html = html.replace(
        /<a class="event-cta-button" id="eventCtaBtn" href="[^"]*">[\s\S]*?<\/a>/,
        () => `<a class="event-cta-button" id="eventCtaBtn" href="${escAttr(btnHref)}">${btnLabel}</a>`
      );
    }
  } catch (err) {
    console.error('[next-event] home render error:', err && err.message);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
  return res.status(200).send(html);
}

// ── Dynamic sitemap ───────────────────────────────────────────────────
// /sitemap.xml is rewritten here (vercel.json) with ?render=sitemap; the
// static public/sitemap.xml was deleted so the rewrite can fire. Reason:
// event pages — the pages that actually sell tickets and carry Event
// rich-result markup — never appeared in the static file, and no server-
// rendered HTML anywhere links to them (every /event?id= link on the site
// is built client-side after a Firestore read). This sitemap is the one
// crawl path to event URLs that doesn't depend on Googlebot executing JS.
// Same no-new-function trick as ?render=page/?render=city above.
async function renderSitemap(req, res) {
  let events = [];
  try {
    // Same single-field query as the landing-page JSON path below.
    const snap = await db.collection('events').orderBy('date', 'asc').get();
    const now = Date.now();
    for (const doc of snap.docs) {
      const e = doc.data();
      const dt = e.date && e.date.toDate ? e.date.toDate()
               : (e.date ? new Date(e.date) : null);
      if (!dt || isNaN(dt.getTime())) continue;
      // Past events are noindexed by renderEventPage — keep them out of
      // the map too (same start-time cutoff as the "next event" picker).
      if (dt.getTime() < now) continue;
      const created = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : null;
      events.push({ id: doc.id, lastmod: created });
    }
  } catch (err) {
    // Fail-soft like everything else in this file: a Firestore hiccup
    // degrades to a static-pages-only sitemap, never a 500.
    console.error('[next-event] sitemap error:', err && err.message);
    events = [];
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
  return res.status(200).send(buildSitemapXml(events));
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // / is rewritten here with ?render=home.
  if (req.query && req.query.render === 'home') {
    return renderHomePage(req, res);
  }

  // /event and /event/:id are rewritten here with ?render=page.
  if (req.query && req.query.render === 'page') {
    return renderEventPage(req, res);
  }

  // /philadelphia and /lancaster are rewritten here with ?render=city.
  if (req.query && req.query.render === 'city') {
    return renderCityPage(req, res);
  }

  // /sitemap.xml is rewritten here with ?render=sitemap.
  if (req.query && req.query.render === 'sitemap') {
    return renderSitemap(req, res);
  }

  // Events change rarely — let Vercel's edge cache absorb the traffic so
  // the landing pages stay fast. A freshly-created event shows within ~2m.
  res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');

  try {
    // Specific-event lookup: check-in page passes ?id= so it stays pinned to
    // the right event even after the event date passes (the "next upcoming"
    // path would switch to the next event once the date crosses midnight UTC).
    if (req.query && req.query.id) {
      const doc = await db.collection('events').doc(String(req.query.id)).get();
      if (!doc.exists) return res.status(200).json({ event: null });
      const e = doc.data();
      const dt = e.date?.toDate ? e.date.toDate() : (e.date ? new Date(e.date) : null);
      const ep = effectivePrice(e, 'any');
      const sr = spotsRemaining(e);
      return res.status(200).json({
        event: {
          id: doc.id,
          title: e.title || 'SparkDate Event',
          date: dt ? dt.toISOString() : null,
          time: e.time || '',
          venue: e.venue || '',
          neighborhood: e.neighborhood || '',
          city: e.city || '',
          price: ep.price,
          regularPrice: ep.regularPrice,
          isEarlyBird: ep.isEarlyBird,
          earlyBirdEnds: ep.earlyBirdEnds,
          spotsRemaining: sr ? sr.remaining : null,
          spotsTotal: sr ? sr.total : null,
          blurb: e.blurb || '',
          status: e.status || 'open',
        },
      });
    }

    // The events collection is small — fetch ordered by date and pick the
    // first one that's still current-or-upcoming and not sold out. Filtering
    // in code keeps this a single-field query (no composite index needed).
    const snap = await db.collection('events').orderBy('date', 'asc').get();

    let picked = null;
    for (const doc of snap.docs) {
      const e = doc.data();
      const dt = e.date?.toDate ? e.date.toDate()
               : (e.date ? new Date(e.date) : null);
      if (!dt || isNaN(dt.getTime())) continue; // no/!valid date
      // isEventOver, not a bare `dt < now`: this same query is checkin.html's
      // fallback whenever a check-in link is opened without ?eventId= pinned.
      // A bare start-time comparison would make tonight's event vanish from
      // "next event" the moment doors open, silently rerouting every later
      // check-in onto whatever event is next on the calendar.
      if (isEventOver(dt, e.durationHours)) continue;
      if (e.status === 'full') continue;         // sold out
      picked = { id: doc.id, e, dt };
      break;                                     // date-asc → first match is soonest
    }

    if (!picked) return res.status(200).json({ event: null });

    const { id, e, dt } = picked;
    const ep = effectivePrice(e, 'any');
    const sr = spotsRemaining(e);
    return res.status(200).json({
      event: {
        id,
        title: e.title || 'SparkDate Event',
        date: dt.toISOString(),
        time: e.time || '',
        venue: e.venue || '',
        neighborhood: e.neighborhood || '',
        city: e.city || '',
        // Early-bird-aware price (lib/seat-model effectivePrice) — the checkout
        // charges this exact number. regularPrice/isEarlyBird/earlyBirdEnds let
        // the landing "Get Tickets" block render "early bird $X · then $Y".
        price: ep.price,
        regularPrice: ep.regularPrice,
        isEarlyBird: ep.isEarlyBird,
        earlyBirdEnds: ep.earlyBirdEnds,
        // Used only to decide whether to show a vague "Filling up" signal —
        // never rendered as an exact count (see public/lp.html).
        spotsRemaining: sr ? sr.remaining : null,
        spotsTotal: sr ? sr.total : null,
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
