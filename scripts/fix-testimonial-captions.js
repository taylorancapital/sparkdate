#!/usr/bin/env node
/**
 * scripts/fix-testimonial-captions.js
 *
 * One-off. Rewrites the two testimonial captions so they quote the same
 * people the slides show.
 *
 * Both posts were written when Quang was the only approved testimonial, so
 * both quoted him and the 3-slide carousel split that one quote across three
 * frames. With six testimonials the slides became a wall of different people
 * -- and the captions were left quoting Quang alone, so the caption and the
 * images disagreed.
 *
 * Only the quoted block changes. The closing thought and the event facts are
 * kept verbatim: they are correct, they are in the right voice, and the
 * linter checks the prices and venue in them.
 *
 * Usage:
 *   node scripts/fix-testimonial-captions.js --dry-run
 *   node scripts/fix-testimonial-captions.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const QUEUE = path.join(__dirname, '..', 'content', 'queue.csv');
const NL = '\n';

// Quotes match what pickTestimonials() renders for these rows, and the
// builder now reads quotes out of the caption anyway -- so these two cannot
// drift apart again.
const FIXES = {
  'MC-08': {
    quotes: [
      ['Fantastic people & fantastic vibes. Great fun.', 'Luke'],
      ['Good networking opportunities!', 'Jeff'],
    ],
    tail: [
      "That's the whole goal. Not a viral night. Not a party. Just a room where you can actually talk to someone.",
      'September 8, Marion Court Room, Lancaster.',
    ],
  },
  'LX-20': {
    quotes: [
      ['Everyone was so lively and some of us connected so well we chatted well into the evening.', 'Molly'],
      ['Cool Atmosphere!', 'James'],
    ],
    tail: [
      "That's what the ticket is actually for. Not a gimmick, not a party. A room where you can hear yourself think and someone across from you is there for the same reason.",
      "September 22, Loxley's.",
    ],
  },
};

function build(fix) {
  const blocks = fix.quotes.map(([q, who]) => `"${q}"${NL}- ${who}`);
  return blocks.concat(fix.tail).join(NL + NL);
}

function main() {
  const dry = process.argv.includes('--dry-run');
  const { rows, columns } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));
  let changed = 0;

  for (const [id, fix] of Object.entries(FIXES)) {
    const row = rows.find((r) => r.row_id === id);
    if (!row) { console.log(`  ${id}: not found`); continue; }

    const before = String(row.caption).split('\r').join('');
    const after = build(fix);
    if (before === after) { console.log(`  ${id}: already correct`); continue; }

    console.log(`${id}`);
    console.log('  before:');
    before.split(NL).forEach((l) => console.log('    | ' + l));
    console.log('  after:');
    after.split(NL).forEach((l) => console.log('    | ' + l));
    console.log('');

    if (!dry) {
      row.caption = after;
      // caption_x is the 280-character X version, derived from the caption --
      // leaving it stale would keep Quang in the copy that gets pasted.
      const flat = after.split(NL).join(' ').replace(/\s+/g, ' ').trim();
      row.caption_x = flat.length <= 256 ? flat : flat.slice(0, 253).replace(/\s+\S*$/, '') + '...';
    }
    changed++;
  }

  if (dry) { console.log(`--dry-run: ${changed} caption(s) would change`); return; }
  if (!changed) { console.log('nothing to do'); return; }
  fs.writeFileSync(QUEUE, Q.toCsv(rows, columns), 'utf8');
  console.log(`wrote ${QUEUE} — ${changed} caption(s) updated`);
}

if (require.main === module) main();
