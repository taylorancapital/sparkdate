#!/usr/bin/env node
/**
 * scripts/seed-getaway-interest-rest.js
 *
 * Alternative seed path for the getaway_interest counters, for when the
 * Firebase Admin service-account env vars aren't available locally (they're
 * marked "Sensitive" in Vercel and can't be pulled back down).
 *
 * Instead of the Admin SDK, this reuses the OAuth access token that the
 * Firebase CLI (`firebase login`) already cached on this machine — the same
 * authenticated session used by `firebase deploy` — and writes each package's
 * baseline directly through the Firestore REST API.
 *
 * It writes two fields per package, matching seed-getaway-interest.js:
 *   - count      : live tally, incremented by real clicks via /api/lead-signup
 *   - seedCount  : frozen baseline, so events.html can show the seed value
 *                  separately from organic clicks
 * An updateMask limits the PATCH to count/seedCount/seededAt so no other
 * field on the doc is disturbed.
 *
 * Usage:
 *   node scripts/seed-getaway-interest-rest.js            # write
 *   node scripts/seed-getaway-interest-rest.js --dry-run  # preview only
 */

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = 'sparkdate-philly';
const DRY_RUN = process.argv.includes('--dry-run');

// Baseline "interested" counts — most popular first. Purely a launch seed;
// real clicks increment `count` on top of this. `seedCount` stays frozen here.
const SEED_COUNTS = {
  'island-paradise': 158,
  'cruise':          121,
  'fiji-volcano':     94,
  'spa-resort':       88,
  'cabin-retreat':    76,
  'palm-springs':     63,
  'taos-new-mexico':  52,
};

function readCliAccessToken() {
  const cfg = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfg)) {
    console.error('✗ Firebase CLI config not found at', cfg, '\n  Run `firebase login` first.');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const tok = data.tokens && data.tokens.access_token;
  const exp = data.tokens && data.tokens.expires_at;
  if (!tok) {
    console.error('✗ No cached access token. Run `firebase login` (or `firebase deploy`) first.');
    process.exit(2);
  }
  if (exp && Date.now() > exp) {
    console.error('✗ Cached Firebase CLI token is expired. Re-run any `firebase` command (e.g. `firebase projects:list`) to refresh it, then retry.');
    process.exit(2);
  }
  return tok;
}

async function main() {
  const token = readCliAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const now = new Date().toISOString();

  console.log(DRY_RUN ? 'Dry run — no writes will be made.\n' : 'Seeding getaway_interest via Firestore REST…\n');

  let failures = 0;
  for (const [id, n] of Object.entries(SEED_COUNTS)) {
    if (DRY_RUN) {
      console.log(`+ ${id.padEnd(18)} → count=${n}, seedCount=${n} (dry run)`);
      continue;
    }
    const url = base + '/getaway_interest/' + id
      + '?updateMask.fieldPaths=count&updateMask.fieldPaths=seedCount&updateMask.fieldPaths=seededAt';
    const body = {
      fields: {
        count:     { integerValue: String(n) },
        seedCount: { integerValue: String(n) },
        seededAt:  { timestampValue: now },
      },
    };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.log(`+ ${id.padEnd(18)} → count=${n}, seedCount=${n}`);
    } else {
      failures++;
      let msg = '';
      try { const j = await res.json(); msg = j.error ? j.error.message : ''; } catch (_) {}
      console.error(`✗ ${id.padEnd(18)} FAILED: HTTP ${res.status} ${msg.slice(0, 120)}`);
    }
  }

  console.log(failures ? `\nDone with ${failures} failure(s).` : '\nDone.');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
