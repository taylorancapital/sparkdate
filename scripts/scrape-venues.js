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
 *     --limit N         Only process the first N data rows (for testing).
 *     --overwrite-desc  Replace descriptions that already have text.
 *                       Default: only fill empty description cells.
 *     --emails          Also scrape a contact email from each venue's
 *                       website (slower — one extra fetch per venue).
 *     --dry-run         Look everything up and print a report, but don't
 *                       write the output file.
 *
 *   Examples:
 *     node scripts/scrape-venues.js sepa_bars.csv
 *     node scripts/scrape-venues.js sepa_bars.csv out.csv --limit 10
 *     node scripts/scrape-venues.js sepa_bars.csv --emails
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
const NOTE_NOISE = /(contact form only|no public contact|corp officers|^est\.|^\d+\s*yrs|hours?|AM-|PM-|\d(AM|PM)|FOR SALE|CLOSED|permanently|treasurer|president|owner d\.)/i;

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

// ── Best-effort email scrape from a venue website ────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_JUNK = /(sentry|wixpress|\.png|\.jpg|\.gif|example\.com|godaddy|cloudflare|@2x|yourdomain)/i;

async function scrapeEmail(websiteUri) {
  if (!websiteUri) return '';
  const tryPaths = ['', '/contact', '/contact-us', '/about'];
  let host = '';
  try { host = new URL(websiteUri).host.replace(/^www\./, ''); } catch (_) { return ''; }

  for (const p of tryPaths) {
    let url;
    try { url = new URL(p, websiteUri).href; } catch (_) { continue; }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      const found = (html.match(EMAIL_RE) || [])
        .map(e => e.toLowerCase())
        .filter(e => !EMAIL_JUNK.test(e));
      if (found.length === 0) continue;
      // Prefer an address on the venue's own domain.
      const onDomain = found.find(e => host && e.endsWith('@' + host));
      return onDomain || found[0];
    } catch (_) { /* timeout / network — try next path */ }
  }
  return '';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/scrape-venues.js <input.csv> [output.csv] [--limit N] [--overwrite-desc] [--emails] [--dry-run]');
    console.log('See the comment block at the top of this file for full setup + docs.');
    process.exit(args.length === 0 ? 1 : 0);
  }

  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));
  const inputPath = positional[0];
  const limitIdx = flags.findIndex(f => f === '--limit');
  const limit = limitIdx >= 0 ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
  const overwriteDesc = flags.includes('--overwrite-desc');
  const doEmails = flags.includes('--emails');
  const dryRun = flags.includes('--dry-run');

  if (!API_KEY) {
    console.error('✗ GOOGLE_PLACES_API_KEY is not set.');
    console.error('  PowerShell:  $env:GOOGLE_PLACES_API_KEY = "AIza..."');
    console.error('  bash/zsh:    export GOOGLE_PLACES_API_KEY="AIza..."');
    console.error('  See the top of this file for how to get a key.');
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
  console.log(`Input:  ${inputPath}  (${records.length} venues)`);
  console.log(`Output: ${dryRun ? '(dry run — nothing written)' : outputPath}`);
  console.log(`Flags:  overwrite-desc=${overwriteDesc}  emails=${doEmails}  limit=${limit === Infinity ? 'none' : limit}`);
  console.log('');

  const stats = { found: 0, notFound: 0, descFilled: 0, starsUpdated: 0,
                  phonesFilled: 0, emailsFound: 0, closed: 0, errors: 0 };

  const toProcess = Math.min(records.length, limit);
  for (let i = 0; i < toProcess; i++) {
    const row = records[i];
    const name = row.name || '(unnamed)';
    const query = [row.name, row.address, row.city, 'PA'].filter(Boolean).join(', ');
    const tag = `[${i + 1}/${toProcess}] ${name}`;

    let place = null;
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

    const bits = [];

    // stars — refresh from Google's current rating when it has one.
    if (typeof place.rating === 'number') {
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
        bits.push(place.editorialSummary ? 'desc:google' : 'desc:built');
      }
    }

    // contact_phone — fill only if missing (don't clobber a direct line).
    if (!row.contact_phone && place.nationalPhoneNumber) {
      row.contact_phone = place.nationalPhoneNumber;
      stats.phonesFilled++;
      bits.push('phone');
    }

    // businessStatus — flag closed venues in notes so they're obvious.
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
      stats.closed++;
      const flag = `[${place.businessStatus}]`;
      if (!String(row.notes || '').includes(flag)) {
        row.notes = `${flag} ${row.notes || ''}`.trim();
      }
      bits.push(place.businessStatus);
    }

    // email — best-effort website scrape, opt-in.
    if (doEmails && !row.contact_email && place.websiteUri) {
      const email = await scrapeEmail(place.websiteUri);
      if (email) { row.contact_email = email; stats.emailsFound++; bits.push('email'); }
    }

    console.log(`${tag} — ${bits.length ? bits.join(', ') : 'no new data'}`);
    await sleep(THROTTLE_MS);
  }

  console.log('');
  console.log('── Summary ──');
  console.log(`  Found on Google:     ${stats.found}`);
  console.log(`  Not found:           ${stats.notFound}`);
  console.log(`  Descriptions filled: ${stats.descFilled}`);
  console.log(`  Stars updated:       ${stats.starsUpdated}`);
  console.log(`  Phones filled:       ${stats.phonesFilled}`);
  if (doEmails) console.log(`  Emails found:        ${stats.emailsFound}`);
  console.log(`  Closed venues flagged: ${stats.closed}`);
  console.log(`  Errors:              ${stats.errors}`);
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
