#!/usr/bin/env node
/**
 * scripts/build-listing-redirects.js
 *
 * Generates the `/l/<event>-<site>` short links in vercel.json — one per
 * (event, listing site) pair — each 302ing to the fully UTM-tagged event page.
 *
 * WHY THIS EXISTS
 *
 * Because listing sites mangle long query-strings, and they do it silently.
 * Two independent failures on 2026-09-01, on the first four sites tried:
 *
 *   * AllEvents HTML-escaped the ampersands in a saved link, turning
 *     `&utm_source=` into `&amp;utm_source=`. The page still loads. GA4 sees
 *     a parameter called `amp;utm_source` and attributes the session to
 *     nothing.
 *   * Discover Lancaster's URL field caps at 100 characters and truncated
 *     `utm_campaign` and `utm_content` off the end of both submissions.
 *
 * Neither surfaced as an error. Both produce a working link that reports no
 * attribution — the worst failure shape available, because the listing looks
 * fine and the channel reads as dead traffic forever.
 *
 * A short link on our own domain is immune to both: nothing to escape, and
 * `/l/lx-allevents` is 15 characters. The UTMs live in the redirect target,
 * where only we can edit them.
 *
 * STATIC REDIRECTS, NOT A FUNCTION. This writes vercel.json rather than
 * adding api/l.js on purpose: api/ is already at 15 files against a 12-
 * function plan cap (see api/next-event.js, which does double duty for
 * exactly this reason). A redirect costs no function and no cold start.
 *
 * IDEMPOTENT. Hand-written redirects (the apex canonicalisation, /flyer,
 * /card, /founding) are preserved untouched; every `/l/` entry is regenerated
 * from scratch each run. Never hand-edit a `/l/` entry — edit
 * content/listing-sites.json and re-run.
 *
 * Usage:
 *   node scripts/build-listing-redirects.js --check   # CI: fail if stale
 *   node scripts/build-listing-redirects.js --write   # rewrite vercel.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { buildPairs } = require('../lib/listing-links');

const REPO = path.join(__dirname, '..');
const VERCEL = path.join(REPO, 'vercel.json');

const arg = (n) => process.argv.includes(`--${n}`);

(async () => {
  const pairs = await buildPairs();
  const generated = pairs.map((p) => ({
    source: p.short,
    destination: p.tagged,
    permanent: false, // 307 — an event's destination is not forever
  }));

  const cfg = JSON.parse(fs.readFileSync(VERCEL, 'utf8'));
  const handwritten = (cfg.redirects || []).filter((r) => !r.source.startsWith('/l/'));
  const next = { ...cfg, redirects: [...handwritten, ...generated] };

  const before = JSON.stringify(cfg.redirects);
  const after = JSON.stringify(next.redirects);

  if (arg('check')) {
    if (before === after) {
      console.log(`vercel.json is current — ${generated.length} /l/ redirect(s).`);
      process.exit(0);
    }
    console.error('vercel.json is STALE. Run: node scripts/build-listing-redirects.js --write');
    const have = new Set((cfg.redirects || []).filter((r) => r.source.startsWith('/l/')).map((r) => r.source));
    const want = new Set(generated.map((r) => r.source));
    for (const s of want) if (!have.has(s)) console.error(`  missing: ${s}`);
    for (const s of have) if (!want.has(s)) console.error(`  stale:   ${s}`);
    process.exit(1);
  }

  if (arg('write')) {
    fs.writeFileSync(VERCEL, JSON.stringify(next, null, 2) + '\n');
    console.log(`Wrote ${generated.length} /l/ redirect(s) to vercel.json.`);
    generated.forEach((r) => console.log(`  ${r.source}  ->  ${r.destination}`));
    return;
  }

  generated.forEach((r) => console.log(`${r.source}\t${r.destination}`));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
