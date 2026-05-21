#!/usr/bin/env node
/**
 * scripts/scrape-venues.js
 *
 * Local CSV enrichment tool for the venue pipeline. Reads a venues CSV,
 * looks each venue up on Google Places, and writes an enriched copy with
 * fresh `stars`, a `description`, and `contact_phone` filled in.
 *
 * It does NOT touch Firestore. The flow is deliberately two-step:
 *
 *     scrape-venues.js  →  enriched CSV  →  Admin ▸ Venues ▸ Upload CSV
 *
 * so you get to eyeball the data before it goes live. The admin upload
 * with "Overwrite existing" ON merges it in (blank cells never clobber).
 *
 * ── Setup ────────────────────────────────────────────────────────────
 * Nothing is required for --offline (descriptions only). For live data,
 * set one or both keys:
 *
 * GOOGLE_PLACES_API_KEY — refreshes stars/phone, and gives venue website
 *   URLs for --emails. "Places API (New)" must be enabled + billing on
 *   ($200/mo free credit; ~250 venues ≈ $8).
 *     1. https://console.cloud.google.com/  → create/pick a project
 *     2. APIs & Services ▸ Library ▸ enable "Places API (New)"
 *     3. APIs & Services ▸ Credentials ▸ Create API key
 *     4. PowerShell:  $env:GOOGLE_PLACES_API_KEY = "AIza..."
 *        bash/zsh:    export GOOGLE_PLACES_API_KEY="AIza..."
 *
 * BRAVE_API_KEY — search backend for --emails when running --offline (no
 *   Google key). Free tier: 2,000 queries/month, 1 query/sec, and it does
 *   NOT IP-block the way DuckDuckGo does. This is the recommended way to
 *   run --emails for free.
 *     1. https://brave.com/search/api/  → sign up
 *     2. Subscribe to the "Free" plan (Brave may ask for a card to
 *        verify; the Free plan itself bills $0)
 *     3. Copy the key from the dashboard
 *     4. PowerShell:  $env:BRAVE_API_KEY = "BSA..."
 *        bash/zsh:    export BRAVE_API_KEY="BSA..."
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *   node scripts/scrape-venues.js <input.csv> [output.csv] [flags]
 *
 *   Flags:
 *     --offline         FREE, no API key, no internet. Builds the
 *                       `description` column from the venue type, city,
 *                       and the existing `notes` already in the CSV.
 *                       Skips stars/phone/email (those need the API).
 *                       Use this if you don't want a Google key.
 *     --limit N         Only process the first N data rows (for testing).
 *     --overwrite-desc  Replace descriptions that already have text.
 *                       Default: only fill empty description cells.
 *     --emails          Also try to find a contact email per venue:
 *                       (1) reuse an email already in the `notes`, else
 *                       (2) find the venue's own website, else
 *                       (3) scrape its homepage + contact pages.
 *
 *                       The step-2 website finder picks a backend:
 *                         • online (Google key)  → Places website field
 *                         • BRAVE_API_KEY set    → Brave Search API
 *                                                  (free, won't block)
 *                         • neither              → DuckDuckGo scrape
 *                                                  (free, IP-blocks after
 *                                                  ~12 — small runs only)
 *
 *                       So for a free bulk run, set BRAVE_API_KEY and use
 *                       --offline --emails. Note: many small bars publish
 *                       no email anywhere — expect a modest hit rate
 *                       regardless of backend.
 *     --dry-run         Look everything up and print a report, but don't
 *                       write the output file.
 *
 *   Examples:
 *     node scripts/scrape-venues.js sepa_bars.csv --offline               (free desc)
 *     node scripts/scrape-venues.js sepa_bars.csv --offline --emails      (BRAVE_API_KEY → free email)
 *     node scripts/scrape-venues.js sepa_bars.csv                         (Places)
 *     node scripts/scrape-venues.js sepa_bars.csv out.csv --limit 10
 *
 * Output defaults to "<input>.enriched.csv" next to the input file.
 *
 * Requires Node 18+ (uses the built-in global fetch). No npm install.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────
const API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
// Brave Search API — used by --emails to find venue websites. Free tier
// is 2,000 queries/month at 1 query/sec and, unlike DuckDuckGo scraping,
// it does not IP-block. Get a key at https://brave.com/search/api/ →
// subscribe to the "Free" plan. Set it as BRAVE_API_KEY.
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
// Field mask — controls which fields come back AND the billing SKU.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.editorialSummary',
  'places.businessStatus',
  'places.primaryTypeDisplayName',
].join(',');

// Polite pacing between API calls (ms). ~5 req/s.
const THROTTLE_MS = 200;

// ── CSV parsing (RFC-4180-ish) ───────────────────────────────────────
// Handles quoted fields with embedded commas, quotes ("" escape), and
// newlines. Good enough for Excel / Google Sheets exports.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* swallow */ }
      else { cur += c; }
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

// Quote a single CSV field if it contains a comma, quote, or newline.
function csvField(v) {
  const s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCSV(headers, objects) {
  const lines = [headers.map(csvField).join(',')];
  for (const obj of objects) {
    lines.push(headers.map(h => csvField(obj[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// ── Description helpers ──────────────────────────────────────────────
// When Google has no editorial summary, build a plain factual blurb from
// the venue type, city, and the most descriptive clauses of `notes`.
// Deliberately NOT in SparkDate brand voice — keep it factual here and
// polish the voice afterward (e.g. hand the enriched CSV to Claude).
// Clauses that are operational/contact noise, not customer-facing copy:
// "contact form only", corp-officer lines, hours, an email address (@),
// closure flags, etc. Anything matching gets dropped from the blurb.
const NOTE_NOISE = /(contact form only|no public contact|corp officers|^est\.|^\d+\s*yrs|hours?|AM-|PM-|\d(AM|PM)|FOR SALE|CLOSED|permanently|treasurer|president|owner d\.|@|http)/i;

function notesToBlurb(notes) {
  if (!notes) return '';
  return String(notes)
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !NOTE_NOISE.test(s))
    .slice(0, 3)
    .join('; ');
}

function buildDescription(place, row) {
  // 1. Google's own editorial summary, when it exists, is already clean.
  const editorial = place && place.editorialSummary && place.editorialSummary.text;
  if (editorial && editorial.trim()) return editorial.trim();

  // 2. Otherwise compose from facts.
  const typeLabel =
    (place && place.primaryTypeDisplayName && place.primaryTypeDisplayName.text) ||
    row.type || 'Bar';
  const cap = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const city = row.city || 'Philadelphia';
  const fromNotes = notesToBlurb(row.notes);
  return fromNotes ? `${cap} in ${city} — ${fromNotes}.` : `${cap} in ${city}.`;
}

// ── Google Places lookup ─────────────────────────────────────────────
async function placesSearch(query) {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (res.status === 403) {
    throw new Error('FATAL: 403 from Places API — key invalid, or "Places API (New)" not enabled / billing off.');
  }
  if (res.status === 429) {
    const e = new Error('rate limited (429)');
    e.retryable = true;
    throw e;
  }
  if (!res.ok) {
    throw new Error(`Places API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.places && json.places[0]) || null;
}

// ── Email discovery (all free — no API key) ──────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_JUNK = /(sentry|wixpress|\.png|\.jpg|\.gif|\.svg|example\.com|godaddy|cloudflare|@2x|yourdomain|@sentry|placeholder)/i;

// A normal browser UA — many sites + DuckDuckGo reject UA-less requests.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Aggregator / directory / review domains — never the venue's OWN site.
// This list can't be exhaustive (there are hundreds), so it's a coarse
// pre-filter; the real signal is the name-match check in findWebsiteDDG.
const AGGREGATORS = /(yelp|tripadvisor|facebook|instagram|foursquare|opentable|mapquest|yellowpages|zomato|doordash|ubereats|grubhub|untappd|google\.|bing\.|duckduckgo|wikipedia|allmenus|restaurantji|nextdoor|linkedin|twitter|x\.com|tiktok|booking\.com|wanderlog|beeradvocate|findglocal|menupix|cityseeker|tripexpert|10best|thrillist|eater\.|phillymag|visitphilly|uphilly|chamberofcommerce|loc8nearme|bizapedia|opencorporates|manta\.|buzzfile|dnb\.com|nicelocal|cylex|hotfrog|brownpapertickets|eventbrite|ezcater|toasttab|clover\.com|squareup|getbento|popmenu)/i;

// Generic words that don't identify a specific venue — ignored when
// matching a search-result domain back to the venue name.
const GENERIC_WORDS = new Set(['the', 'bar', 'pub', 'tavern', 'grill', 'grille',
  'lounge', 'restaurant', 'inc', 'llc', 'company', 'brewing', 'brewery', 'house',
  'club', 'cafe', 'kitchen', 'public', 'craft', 'beer', 'wine', 'sports', 'social',
  'room', 'hotel', 'inn', 'and', 'philadelphia', 'philly']);

// Distinctive (4+ char, non-generic) words from a venue name.
function venueKeywords(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !GENERIC_WORDS.has(w));
}

// Step 1 (free, instant, no network): an email may already be sitting in
// the row's own `notes` — several CSV rows say "also events@venue.com".
function emailFromNotes(notes) {
  if (!notes) return '';
  const found = (String(notes).match(EMAIL_RE) || [])
    .map(e => e.toLowerCase())
    .filter(e => !EMAIL_JUNK.test(e));
  return found[0] || '';
}

// Given a list of candidate result URLs, pick the one most likely to be
// the venue's OWN website: skip aggregator/directory domains, and require
// the domain to contain a distinctive word from the venue name. Search
// results are dominated by directory sites we can't fully blocklist, and
// scraping the wrong site yields the wrong email — so precision beats
// coverage: no name match → return nothing.
function pickVenueWebsite(urls, name) {
  const keywords = venueKeywords(name);
  for (const href of urls) {
    if (!href || !/^https?:\/\//i.test(href)) continue;
    let host = '';
    try { host = new URL(href).host.toLowerCase(); } catch (_) { continue; }
    if (AGGREGATORS.test(host)) continue;
    const domainFlat = host.replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
    if (keywords.some(k => domainFlat.includes(k))) return href;
  }
  return '';
}

// ── Brave Search API (the recommended search backend for --emails) ────
// Free tier: 2,000 queries/month, 1 query/sec, and — unlike scraping
// DuckDuckGo — it does NOT IP-block. Used automatically when
// BRAVE_API_KEY is set. One-time flag so a bad key only warns once.
let braveKeyBad = false;

async function findWebsiteBrave(name, city) {
  if (!name || !BRAVE_API_KEY || braveKeyBad) return '';
  const q = encodeURIComponent(`${name} ${city || ''} PA`);
  const url = `${BRAVE_URL}?q=${q}&count=10&country=us`;
  // Up to 2 attempts — one retry if we hit a transient 429.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
      });
      clearTimeout(t);
      if (res.status === 429) { await sleep(1500); continue; } // rate limit
      if (!res.ok) {
        // A bad/expired key is an auth failure. Brave uses HTTP 422
        // (SUBSCRIPTION_TOKEN_INVALID) for an invalid key; some setups
        // return 401/403. Confirm via the error body so a one-off 4xx
        // on a single venue isn't mistaken for a dead key.
        if ([401, 403, 422].includes(res.status)) {
          const body = await res.text().catch(() => '');
          if (/token|subscription|authentic|unauthor/i.test(body)) {
            braveKeyBad = true;
            console.log(`  ⚠ Brave Search API rejected the key (HTTP ${res.status}).`);
            console.log('    Email website-lookups disabled — check BRAVE_API_KEY.');
          }
        }
        return '';
      }
      const json = await res.json();
      const urls = ((json.web && json.web.results) || []).map(r => r.url);
      return pickVenueWebsite(urls, name);
    } catch (_) { return ''; }
  }
  return '';
}

// ── DuckDuckGo (free fallback when there's no Brave key) ──────────────
// DDG blocks scraped traffic aggressively — after ~10-15 requests from
// one IP it serves an HTTP 202 "anomaly" page instead of results. This
// flag stops us pointlessly hammering a blocked endpoint after that.
let ddgBlocked = false;

async function findWebsiteDDG(name, city) {
  if (!name || ddgBlocked) return '';
  const q = encodeURIComponent(`${name} ${city || ''} PA`);
  let html = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': BROWSER_UA },
    });
    clearTimeout(t);
    html = await res.text();
    // 200 = real results. 202 (or any non-200) = the anomaly/anti-bot
    // page — DDG has flagged this IP. Stop trying for the rest of the run.
    if (res.status !== 200 || /anomaly|unusual traffic/i.test(html.slice(0, 2000))) {
      ddgBlocked = true;
      console.log('  ⚠ DuckDuckGo is now rate-limiting this IP — website lookups');
      console.log('    are disabled for the rest of this run. Set BRAVE_API_KEY for');
      console.log('    a search backend that does not block (see --help).');
      return '';
    }
  } catch (_) { return ''; }

  // DDG result anchors: <a class="result__a" href="...">. The href is
  // usually a redirect wrapper: /l/?uddg=<url-encoded-target>.
  const urls = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)].map(m => {
    let href = m[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch (_) {} }
    return href;
  });
  return pickVenueWebsite(urls, name);
}

// Step 3: fetch a venue website (homepage + likely contact pages) and
// regex out a contact email. Prefers an address on the venue's own domain.
async function scrapeEmail(websiteUri) {
  if (!websiteUri) return '';
  const tryPaths = ['', '/contact', '/contact-us', '/about', '/connect', '/info'];
  let host = '';
  try { host = new URL(websiteUri).host.replace(/^www\./, ''); } catch (_) { return ''; }

  for (const p of tryPaths) {
    let url;
    try { url = new URL(p, websiteUri).href; } catch (_) { continue; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        signal: ctrl.signal, redirect: 'follow',
        headers: { 'User-Agent': BROWSER_UA },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      // Also catch mailto: links, which decode cleanly.
      const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map(m => m[1]);
      const found = [...mailtos, ...(html.match(EMAIL_RE) || [])]
        .map(e => decodeURIComponent(e).toLowerCase())
        .filter(e => EMAIL_RE.test(e) && !EMAIL_JUNK.test(e));
      if (found.length === 0) continue;
      // Prefer an address on the venue's own domain.
      const onDomain = found.find(e => host && e.endsWith('@' + host));
      return onDomain || found[0];
    } catch (_) { /* timeout / network — try next path */ }
  }
  return '';
}

// Orchestrates the three steps. `place` may be null (offline mode).
// Website-finder cascade: Google Places (if online) → Brave Search
// (if BRAVE_API_KEY set) → DuckDuckGo (free fallback, blocks fast).
async function findEmail(row, place) {
  // 1. Already mentioned in the notes.
  const fromNotes = emailFromNotes(row.notes);
  if (fromNotes) return { email: fromNotes, source: 'notes' };

  // 2. Locate the venue's own website.
  let site = (place && place.websiteUri) || '';
  let source = 'places';
  if (!site) {
    if (BRAVE_API_KEY) {
      site = await findWebsiteBrave(row.name, row.city);
      source = 'brave';
    } else {
      site = await findWebsiteDDG(row.name, row.city);
      source = 'ddg';
    }
  }
  if (!site) return null;

  // 3. Scrape the site for an address.
  const email = await scrapeEmail(site);
  return email ? { email, source } : null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/scrape-venues.js <input.csv> [output.csv] [--offline] [--limit N] [--overwrite-desc] [--emails] [--dry-run]');
    console.log('  --offline  builds descriptions from the CSV itself — free, no API key.');
    console.log('See the comment block at the top of this file for full setup + docs.');
    process.exit(args.length === 0 ? 1 : 0);
  }

  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));
  const inputPath = positional[0];
  const limitIdx = flags.findIndex(f => f === '--limit');
  const limit = limitIdx >= 0 ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
  const offline = flags.includes('--offline');
  const overwriteDesc = flags.includes('--overwrite-desc');
  const doEmails = flags.includes('--emails');
  const dryRun = flags.includes('--dry-run');

  // Online mode needs a Places key. Offline mode needs nothing — it
  // builds descriptions from the CSV's own type/city/notes columns.
  if (!offline && !API_KEY) {
    console.error('✗ GOOGLE_PLACES_API_KEY is not set.');
    console.error('');
    console.error('  Easiest fix — run FREE with no key:');
    console.error('    node scripts/scrape-venues.js <input.csv> --offline');
    console.error('  This builds the description column from the notes already in');
    console.error('  your CSV. No internet, no billing.');
    console.error('');
    console.error('  Or, for live Google data (stars/phone refresh), set a key:');
    console.error('    PowerShell:  $env:GOOGLE_PLACES_API_KEY = "AIza..."');
    console.error('    bash/zsh:    export GOOGLE_PLACES_API_KEY="AIza..."');
    console.error('    See the top of this file for how to get one.');
    process.exit(2);
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error(`✗ Input CSV not found: ${inputPath || '(none given)'}`);
    process.exit(2);
  }

  const outputPath = positional[1] ||
    path.join(path.dirname(inputPath),
      path.basename(inputPath, path.extname(inputPath)) + '.enriched.csv');

  // Parse input.
  const rows = parseCSV(fs.readFileSync(inputPath, 'utf8'));
  if (rows.length < 2) {
    console.error('✗ CSV has no data rows (need a header + at least one row).');
    process.exit(2);
  }
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  // Guarantee the columns we write exist in the output header.
  for (const col of ['stars', 'description', 'contact_phone', 'contact_email']) {
    if (!headers.includes(col)) headers.push(col);
  }
  const records = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });

  console.log(`── Venue scraper ──`);
  console.log(`Mode:   ${offline ? 'OFFLINE (no API — descriptions from CSV notes)' : 'ONLINE (Google Places)'}`);
  console.log(`Input:  ${inputPath}  (${records.length} venues)`);
  console.log(`Output: ${dryRun ? '(dry run — nothing written)' : outputPath}`);
  console.log(`Flags:  overwrite-desc=${overwriteDesc}  emails=${doEmails}  limit=${limit === Infinity ? 'none' : limit}`);
  if (doEmails) {
    const finder = !offline
      ? 'Google Places (website field)'
      : (BRAVE_API_KEY ? 'Brave Search API' : 'DuckDuckGo — free but IP-blocks after ~12 lookups');
    console.log(`Emails: ON  ·  website lookup via ${finder}`);
  }
  console.log('');

  const stats = { found: 0, notFound: 0, descFilled: 0, starsUpdated: 0,
                  phonesFilled: 0, emailsFound: 0, emailsTried: 0, closed: 0, errors: 0 };

  const toProcess = Math.min(records.length, limit);
  for (let i = 0; i < toProcess; i++) {
    const row = records[i];
    const name = row.name || '(unnamed)';
    const query = [row.name, row.address, row.city, 'PA'].filter(Boolean).join(', ');
    const tag = `[${i + 1}/${toProcess}] ${name}`;

    // place stays null in offline mode — buildDescription() and every
    // field block below tolerate a null place and just skip API-only data.
    let place = null;
    if (!offline) {
      try {
        // One retry on rate-limit.
        try {
          place = await placesSearch(query);
        } catch (e) {
          if (e.retryable) { await sleep(2000); place = await placesSearch(query); }
          else throw e;
        }
      } catch (e) {
        if (/^FATAL/.test(e.message)) { console.error('\n' + e.message); process.exit(3); }
        console.log(`${tag} — ✗ ${e.message}`);
        stats.errors++;
        await sleep(THROTTLE_MS);
        continue;
      }

      if (!place) {
        console.log(`${tag} — not found on Google`);
        stats.notFound++;
        await sleep(THROTTLE_MS);
        continue;
      }
      stats.found++;
    }

    const bits = [];

    // stars — refresh from Google's current rating when it has one.
    if (place && typeof place.rating === 'number') {
      const newStars = String(place.rating);
      if (newStars !== row.stars) stats.starsUpdated++;
      row.stars = newStars;
      bits.push(`${place.rating}★`);
    }

    // description — fill empty, or replace with --overwrite-desc.
    if (!row.description || overwriteDesc) {
      const desc = buildDescription(place, row);
      if (desc && desc !== row.description) {
        row.description = desc;
        stats.descFilled++;
        bits.push(place && place.editorialSummary ? 'desc:google' : 'desc:built');
      }
    }

    // contact_phone — fill only if missing (don't clobber a direct line).
    if (place && !row.contact_phone && place.nationalPhoneNumber) {
      row.contact_phone = place.nationalPhoneNumber;
      stats.phonesFilled++;
      bits.push('phone');
    }

    // businessStatus — flag closed venues in notes so they're obvious.
    if (place && place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
      stats.closed++;
      const flag = `[${place.businessStatus}]`;
      if (!String(row.notes || '').includes(flag)) {
        row.notes = `${flag} ${row.notes || ''}`.trim();
      }
      bits.push(place.businessStatus);
    }

    // email — opt-in (--emails). Free, and works in BOTH modes:
    //   notes → venue website (Places online / DuckDuckGo offline) → scrape.
    if (doEmails && !row.contact_email) {
      stats.emailsTried++;
      try {
        const hit = await findEmail(row, place);
        if (hit) {
          row.contact_email = hit.email;
          stats.emailsFound++;
          bits.push(`email:${hit.source}`);
        } else {
          bits.push('email:none');
        }
      } catch (_) {
        bits.push('email:err');
      }
    }

    console.log(`${tag} — ${bits.length ? bits.join(', ') : 'no new data'}`);

    // Pace network calls. --emails hits a search API + venue sites, so
    // it needs a generous gap (also keeps us under Brave's 1 query/sec
    // free-tier limit) — but once the search backend is dead (DDG
    // blocked / Brave key rejected) there are no more web calls, so
    // don't waste the wait.
    if (doEmails && !ddgBlocked && !braveKeyBad) await sleep(2000);
    else if (!offline)                          await sleep(THROTTLE_MS);

    // Incremental save — a --emails run can take 10-15 min; checkpoint
    // every 25 rows so a crash or Ctrl+C doesn't lose progress. Re-running
    // on the output CSV resumes (rows that already have an email/desc
    // are skipped).
    if (!dryRun && (i + 1) % 25 === 0 && i + 1 < toProcess) {
      fs.writeFileSync(outputPath, writeCSV(headers, records), 'utf8');
      console.log(`  … checkpoint saved (${i + 1}/${toProcess})`);
    }
  }

  console.log('');
  console.log('── Summary ──');
  console.log(`  Descriptions filled: ${stats.descFilled}`);
  if (doEmails) {
    console.log(`  Emails found:        ${stats.emailsFound}  (of ${stats.emailsTried} venues missing one)`);
  }
  if (!offline) {
    console.log(`  Found on Google:     ${stats.found}`);
    console.log(`  Not found:           ${stats.notFound}`);
    console.log(`  Stars updated:       ${stats.starsUpdated}`);
    console.log(`  Phones filled:       ${stats.phonesFilled}`);
    console.log(`  Closed venues flagged: ${stats.closed}`);
    console.log(`  Errors:              ${stats.errors}`);
  }
  console.log('');

  if (dryRun) {
    console.log('Dry run — no file written. Re-run without --dry-run to save.');
    return;
  }

  fs.writeFileSync(outputPath, writeCSV(headers, records), 'utf8');
  console.log(`✓ Wrote ${outputPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Open the enriched CSV and spot-check the descriptions.');
  console.log('  2. (Optional) Hand it to Claude to rewrite descriptions in SparkDate voice.');
  console.log('  3. Admin ▸ Venues ▸ Upload CSV with "Overwrite existing" ON.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
