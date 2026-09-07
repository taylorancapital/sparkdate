// lib/content-queue.js
//
// Pure helpers over content/queue.csv and content/brand.json. Pulled out into
// a dependency-free module for the same reason lib/attendance-index.js was:
// the rules below are the ones that have actually shipped wrong twice, so they
// need to be unit-testable directly (tests/content-queue.test.js) rather than
// only checkable by reading a spreadsheet.
//
// The rule that matters most here is the hashtag/market check. Philly tags
// have landed on a Lancaster event twice -- MC-2 (corrected 8/19) and LX-26
// (still wrong at time of writing). It is a copy-paste error no amount of
// care prevents, and it is trivially mechanical to catch.
//
// No dependencies on purpose: this repo carries four and no build step, and a
// correct-enough CSV codec is forty lines.

'use strict';

// ---------------------------------------------------------------- CSV codec

// RFC4180-ish. Captions contain literal newlines and commas inside quoted
// fields, so a naive split on "," or "\n" corrupts the queue silently -- which
// is exactly the class of bug this whole module exists to prevent.
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // A trailing field with no newline still belongs to the last row.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return { columns: [], rows: [] };
  const columns = rows[0];
  const out = rows.slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] === undefined ? '' : r[i]])));
  return { columns, rows: out };
}

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [columns.join(',')]
    .concat(rows.map((r) => columns.map((c) => esc(r[c])).join(',')))
    .join('\n') + '\n';
}

// ------------------------------------------------------------- row helpers

const splitList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const rowEvents = (row) => splitList(row.events);
const rowPlatforms = (row) => splitList(row.platforms);
const rowAssets = (row) => splitList(row.asset_files);

function rowHashtags(row) {
  return String(row.hashtags || '').match(/#[A-Za-z0-9_]+/g) || [];
}

// Hashtags a row may legitimately use: the union of every event it names,
// plus the market-agnostic pool. The union is what lets GG-07 -- a Philly
// recap that forward-promotes two Lancaster events -- carry Lancaster tags
// without being special-cased. Its `events` column names GG,LX, so the
// Lancaster pool is genuinely in scope for it. A row naming only LX gets only
// Lancaster, which is what catches LX-26.
function allowedHashtags(brand, eventKeys) {
  const allowed = new Set((brand.markets._neutral.hashtags || []).map((h) => h.toLowerCase()));
  for (const key of eventKeys) {
    const ev = brand.events[key];
    if (!ev) continue;
    for (const h of ev.hashtag_pool || []) allowed.add(h.toLowerCase());
    const market = brand.markets[ev.market];
    for (const h of (market && market.hashtags) || []) allowed.add(h.toLowerCase());
  }
  return allowed;
}

// Every price a row may name: its own events' early-bird and regular. GG-07
// legitimately quotes Loxley's $24.99 alongside its own $29.99 because it
// promotes both, and $24.99 is Marion Court's REGULAR price but Loxley's
// EARLY-BIRD price -- the same number meaning different things per event is
// precisely why this is checked against data rather than eyeballed.
function allowedPrices(brand, eventKeys) {
  const out = new Set();
  for (const key of eventKeys) {
    const p = (brand.events[key] || {}).pricing || {};
    for (const v of [p.early_bird, p.regular]) {
      if (typeof v === 'number') out.add(v.toFixed(2));
    }
  }
  return out;
}

// The price actually charged today, honoring `pricing.early_bird_through`.
// Naively preferring `early_bird` whenever it's present shipped a stale
// $18.99 for Marion Court for weeks after its early bird ended -- regular
// ($24.99) has applied since 2026-08-25, the day AFTER early_bird_through
// (2026-08-24): MC-04, the actual "Early bird's done. $24.99 from here."
// post, went live 08-25, not on the through-date itself. So the through-date
// is the LAST early-bird day, inclusive -- matching how
// meta-create-lx-sales-campaign.js's priceFor() already treats the same
// field (`startDate > EARLY_BIRD_THROUGH ? regular : early_bird`).
//
// Dates are plain YYYY-MM-DD strings throughout brand.json, so a string
// comparison is exact and sidesteps a Date object's local-timezone parsing.
// "today" defaults to the business's own timezone (America/New_York, where
// every event in brand.json is held) rather than UTC -- UTC can already
// read tomorrow's date while it is still today in Lancaster/Philadelphia,
// which would step the price a few hours early every single night.
function currentPrice(pricing, todayIso) {
  const p = pricing || {};
  const today = todayIso || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const earlyBirdActive = typeof p.early_bird === 'number'
    && (!p.early_bird_through || today <= p.early_bird_through);
  if (earlyBirdActive) return p.early_bird;
  return typeof p.regular === 'number' ? p.regular : null;
}

function pricesInText(text) {
  return (String(text || '').match(/\$\s?(\d+(?:\.\d{2})?)/g) || [])
    .map((s) => parseFloat(s.replace(/[$\s]/g, '')).toFixed(2));
}

// A row is "schedulable" if something will publish it automatically. Posted,
// skipped, and explicitly-manual rows are not the linter's business.
function isSchedulable(row) {
  if (row.state === 'posted' || row.state === 'skipped') return false;
  if (String(row.format || '').toUpperCase().includes('NO POST')) return false;
  return true;
}

function isFeedPost(row) {
  const f = String(row.format || '').toLowerCase();
  if (f.includes('no post')) return false;
  // Story-only rows don't compete for the feed slot.
  return !(rowPlatforms(row).every((p) => p === 'ig_story'));
}

module.exports = {
  parseCsv, toCsv,
  rowEvents, rowPlatforms, rowAssets, rowHashtags,
  allowedHashtags, allowedPrices, currentPrice, pricesInText,
  isSchedulable, isFeedPost,
};
