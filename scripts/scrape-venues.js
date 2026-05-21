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
 * Needs a Google Places API key (the "Places API (New)" must be enabled
 * on the project, and billing turned on — there's a $200/mo free credit;
 * 250 venues costs roughly $8, well inside it).
 *
 *   1. https://console.cloud.google.com/  →  create/pick a project
 *   2. APIs & Services ▸ Library ▸ enable "Places API (New)"
 *   3. APIs & Services ▸ Credentials ▸ Create API key
 *   4. Put it in your shell:
 *        Windows PowerShell:  $env:GOOGLE_PLACES_API_KEY = "AIza..."
 *        macOS/Linux:         export GOOGLE_PLACES_API_KEY="AIza..."
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
 *                       (2) find the venue website — Google Places when
 *                           online, a DuckDuckGo search when offline —
 *                       (3) scrape its homepage + contact pages.
 *
 *                       REALITY CHECK: there is no free way to bulk-find
 *                       emails. Step 1 is free + reliable but only helps
 *                       the few rows that mention an email. Step 2's free
 *                       path (DuckDuckGo) gets IP-blocked after ~10-15
 *                       lookups — fine for a small --limit run, useless
 *                       for all 247. For real coverage, run online with
 *                       GOOGLE_PLACES_API_KEY set: Places hands back the
 *                       website with no blocking, then step 3 scrapes it.
 *                       Even then, many small bars publish no email at
 *                       all — expect a modest hit rate either way.
 *     --dry-run         Look everything up and print a report, but don't
 *                       write the output file.
 *
 *   Examples:
 *     node scripts/scrape-venues.js sepa_bars.csv --offline           (free desc)
 *     node scripts/scrape-venues.js sepa_bars.csv --offline --emails  (free desc+email)
 *     node scripts/scrape-venues.js sepa_bars.csv                     (Places)
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

// DuckDuckGo blocks scraped traffic aggressively — after ~10-15 requests
// from one IP it serves an HTTP 202 "anomaly" anti-bot page instead of
// results. Once we see that, this flag stops us pointlessly hammering a
// blocked endpoint for the rest of the run.
let ddgBlocked = false;

// Step 2 (free, no key): find a venue's website via DuckDuckGo's HTML
// endpoint. Best-effort — DDG rate-limits HARD (see above), and not
// every bar has a site. Returns '' on any failure.
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
      console.log('    are disabled for the rest of this run. Emails already in the');
      console.log('    CSV notes still get picked up. See --help for the bulk path.');
      return '';
    }
  } catch (_) { return ''; }

  // DDG result anchors: <a class="result__a" href="...">. The href is
  // usually a redirect wrapper: /l/?uddg=<url-encoded-target>.
  const keywords = venueKeywords(name);
  const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  for (let href of links) {
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch (_) {} }
    if (!/^https?:\/\//i.test(href)) continue;
    let host = '';
    try { host = new URL(href).host.toLowerCase(); } catch (_) { continue; }
    if (AGGREGATORS.test(host)) continue;
    // Only trust a result whose domain actually contains a distinctive
    // word from the venue name — that's almost certainly the venue's OWN
    // site. Search results are dominated by directory sites we'll never
    // fully blocklist, and scraping the wrong site yields the wrong
    // email, so precision beats coverage here: no name match → skip.
    const domainFlat = host.replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
    if (keywords.some(k => domainFlat.includes(k))) return href;
  }
  return '';
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

// Orchestrates the three steps. `place` may be null (offline mode) — in
// that case the website comes from DuckDuckGo instead of Google Places.
async function findEmail(row, place) {
  // 1. Already mentioned in the notes.
  const fromNotes = emailFromNotes(row.notes);
  if (fromNotes) return { email: fromNotes, source: 'notes' };

  // 2. Locate the venue website — Places gives it for free online;
  //    offline we ask DuckDuckGo.
  let site = (place && place.websiteUri) || '';
  let source = 'places';
  if (!site) {
    site = await findWebsiteDDG(row.name, row.city);
    source = 'ddg';
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

    // Pace network calls. --emails hits DuckDuckGo + venue sites, so it
    // needs a generous gap — but once DDG has blocked us there are no
    // more web calls (notes lookup is instant), so don't waste the wait.
    if (doEmails && !ddgBlocked) await sleep(2000);
    else if (!offline)          await sleep(THROTTLE_MS);

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
