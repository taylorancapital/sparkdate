// lib/listing-links.js
//
// The ONE place a listing URL is constructed.
//
// Both the copy pack (scripts/build-listing-pack.js) and the vercel.json
// short links (scripts/build-listing-redirects.js) need the same tagged URL
// for the same (event, site) pair. Two builders producing that string
// independently is precisely the defect this repo keeps paying for -- the
// duration default was a named constant plus four hand-typed copies, and the
// end time was wrong on every surface that re-derived it.
//
// So: one function, two callers, and tests/listing-redirects.test.js asserts
// that what the pack prints is byte-identical to where the redirect points.
//
// No credentials. Events come from the public sitemap and each event page's
// schema.org JSON-LD, so this runs from a worktree with no .env.local.

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SITE_ORIGIN = 'https://sparkdate.date';

const brand = () => JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'brand.json'), 'utf8'));
const sites = () => JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'listing-sites.json'), 'utf8'));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'sparkdate-listing-links' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchUpcomingEvents() {
  const xml = await fetchText(`${SITE_ORIGIN}/sitemap.xml`);
  const urls = [...xml.matchAll(/<loc>([^<]*\/event\?id=[^<]*)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  );
  if (!urls.length) throw new Error('sitemap listed no event pages -- is /sitemap.xml healthy?');

  const events = [];
  for (const url of urls) {
    const html = await fetchText(url);
    const m = html.match(/<script type="application\/ld\+json" id="event-jsonld">([\s\S]*?)<\/script>/);
    if (!m) continue;
    const ld = JSON.parse(m[1].replace(/\\u003c/g, '<'));
    const start = new Date(ld.startDate);
    if (start < new Date()) continue;
    events.push({
      id: new URL(url).searchParams.get('id'),
      url,
      name: ld.name,
      description: ld.description,
      start,
      end: ld.endDate ? new Date(ld.endDate) : null,
      venue: ld.location && ld.location.name,
      address: ld.location && ld.location.address,
      price: ld.offers && Number(ld.offers.price),
      currency: (ld.offers && ld.offers.priceCurrency) || 'USD',
      priceValidUntil: ld.offers && ld.offers.priceValidUntil ? new Date(ld.offers.priceValidUntil) : null,
      image: Array.isArray(ld.image) ? ld.image[0] : ld.image,
    });
  }
  events.sort((a, b) => a.start - b.start);
  return events;
}

// Match on event_id, never on name -- names get edited on the live page and
// the brand key has to survive that.
function matchBrandEvent(b, eventId) {
  for (const [key, ev] of Object.entries((b || brand()).events || {})) {
    if (ev.event_id === eventId) return { key, ...ev };
  }
  return null;
}

function campaignFor(eventKey, start) {
  const ym = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  }).format(start).split('/');
  return `${eventKey.toLowerCase()}_${ym[1]}${ym[0]}`;
}

/** The fully tagged destination. The only place UTMs are attached. */
function taggedUrl(event, brandEv, site, utmCfg) {
  const key = (brandEv ? brandEv.key : 'evt').toLowerCase();
  const u = new URL(event.url);
  u.searchParams.set('utm_source', site.utm_source);
  u.searchParams.set('utm_medium', utmCfg.medium);
  u.searchParams.set('utm_campaign', campaignFor(key, event.start));
  u.searchParams.set('utm_content', `${key}_${site.key}`);
  return u.toString();
}

/**
 * The short link.
 *
 * Kept deliberately short and lowercase-alphanumeric-plus-dash: Discover
 * Lancaster caps its URL field at 100 characters, and AllEvents HTML-escapes
 * what you save. `/l/lx-allevents` survives both because there is nothing to
 * escape and nothing to truncate.
 */
function shortPath(brandEv, site) {
  const key = (brandEv ? brandEv.key : 'evt').toLowerCase();
  return `/l/${key}-${site.key.replace(/_/g, '-')}`;
}

/** Every (event, site) pair worth a link, in a stable order. */
async function buildPairs(events) {
  const b = brand();
  const s = sites();
  const evs = events || (await fetchUpcomingEvents());
  const linkable = s.sites.filter(
    (x) => x.submit_url && ['active', 'not_pursued', 'dormant'].includes(x.status),
  );

  const pairs = [];
  for (const event of evs) {
    const brandEv = matchBrandEvent(b, event.id);
    for (const site of linkable) {
      if (site.market && site.market !== 'any' && brandEv && site.market !== brandEv.market) continue;
      pairs.push({
        event_key: brandEv ? brandEv.key : null,
        site_key: site.key,
        site_name: site.name,
        short: shortPath(brandEv, site),
        shortUrl: `${SITE_ORIGIN}${shortPath(brandEv, site)}`,
        tagged: taggedUrl(event, brandEv, site, s._utm),
      });
    }
  }
  return pairs;
}

module.exports = {
  SITE_ORIGIN, brand, sites, fetchUpcomingEvents, matchBrandEvent,
  taggedUrl, shortPath, buildPairs, campaignFor,
};
