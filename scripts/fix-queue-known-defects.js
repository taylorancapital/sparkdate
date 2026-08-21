#!/usr/bin/env node
/**
 * scripts/fix-queue-known-defects.js
 *
 * One-off. Applies the six corrections scripts/lint-content-queue.js found on
 * the first run against the imported queue.
 *
 * Every fix here executes a decision the brand source-of-truth doc ALREADY
 * records as made -- none of them is a new judgment call. They are in the
 * queue because the fix never reached the copy of the worksheet being worked
 * from, which is the six-copies-in-Downloads problem doing real damage:
 *
 *   MC-02  The Lancaster hashtag fix DID happen -- it exists in exactly one
 *          intermediate copy (7a4de2d5-..., Aug 19 18:07) and is absent from
 *          the newest one (Worksheet_2, 19:02). A later save reverted it. The
 *          brand doc, written at 19:07, records it as corrected.
 *   MC-03  Same Philly-on-Lancaster error, present in all six copies, never
 *          caught by anyone.
 *   GG-06  The mirror image: Lancaster tags on a Philadelphia event.
 *   LX-26  Known and documented as still-broken; never fixed.
 *   LX-11  Loxley's early bird is $24.99, not $18.99. The brand doc says this
 *   GG-07  was "corrected 8/19 ... both fixed in the worksheet." Neither was,
 *          in any of the six copies.
 *
 * DELIBERATELY NOT FIXED: the Tellus $18.99-vs-$24.99 contradiction (blocker
 * #14). That one is genuinely unresolved -- the Eventbrite listing is the
 * tiebreaker and nobody has checked it. Guessing would be worse than leaving
 * it flagged.
 *
 * Usage:
 *   node scripts/fix-queue-known-defects.js --dry-run
 *   node scripts/fix-queue-known-defects.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const QUEUE = path.join(__dirname, '..', 'content', 'queue.csv');

// Hashtag sets drawn from each event's hashtag_pool in brand.json, keeping
// roughly the tag count the row already had so post shape doesn't change.
const LANCASTER_DEADLINE = '#LancasterDating #LancasterEvents #SingleInLancaster #EarlyBird #SparkDate #SpeedDating #IRLDating #DatingAppFatigue';
const LANCASTER_STORY = '#LancasterDating #LancasterEvents #SingleInLancaster #LancasterNightlife #SparkDate';
const PHILLY_STORY = '#PhillyDating #PhillyEvents #SparkDate';

const FIXES = [
  {
    row_id: 'MC-02', field: 'hashtags', to: LANCASTER_DEADLINE,
    why: 'Marion Court is Lancaster. Fix existed in one copy and was lost.',
    caution: 'ALREADY POSTED -- this corrects the record. The live post still carries Philly tags; edit or leave it, but know it shipped wrong.',
  },
  { row_id: 'MC-03', field: 'hashtags', to: LANCASTER_DEADLINE, why: 'Marion Court is Lancaster. Never caught before.' },
  { row_id: 'GG-06', field: 'hashtags', to: PHILLY_STORY, why: 'Good Good Things is Philadelphia; row carried Lancaster tags.' },
  { row_id: 'LX-26', field: 'hashtags', to: LANCASTER_STORY, why: "Loxley's is Lancaster; row carried the full Philly/Rittenhouse set." },
  {
    row_id: 'LX-11', field: 'caption', from: '$18.99 today.', to: '$24.99 today.',
    why: "Loxley's early bird is $24.99 (through Sep 7), regular $29.99.",
  },
  {
    row_id: 'GG-07', field: 'caption', from: 'Early bird $18.99 through the 7th.', to: 'Early bird $24.99 through the 7th.',
    why: "The price GG-07 quotes is Loxley's early bird, which is $24.99.",
  },
];

function main() {
  const dry = process.argv.includes('--dry-run');
  const { columns, rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));
  const byId = new Map(rows.map((r) => [r.row_id, r]));

  let applied = 0;
  const problems = [];

  for (const fix of FIXES) {
    const row = byId.get(fix.row_id);
    if (!row) { problems.push(`${fix.row_id}: row not found`); continue; }

    const before = row[fix.field];
    let after;

    if (fix.from !== undefined) {
      if (!before.includes(fix.from)) {
        problems.push(`${fix.row_id}: expected ${JSON.stringify(fix.from)} in ${fix.field}, not present -- already fixed, or the caption changed`);
        continue;
      }
      after = before.split(fix.from).join(fix.to);
    } else {
      after = fix.to;
    }

    if (before === after) { problems.push(`${fix.row_id}: already correct, skipped`); continue; }

    console.log(`${fix.row_id}  ${fix.field}`);
    console.log(`   why:    ${fix.why}`);
    if (fix.caution) console.log(`   ! ${fix.caution}`);
    console.log(`   before: ${JSON.stringify(before.slice(0, 130))}`);
    console.log(`   after:  ${JSON.stringify(after.slice(0, 130))}`);
    console.log();

    row[fix.field] = after;
    applied++;
  }

  if (problems.length) {
    console.log('not applied:');
    for (const p of problems) console.log('   !', p);
    console.log();
  }

  // caption_x is derived from caption, so a caption fix has to propagate or
  // the X copy keeps quoting the old price.
  for (const fix of FIXES) {
    if (fix.field !== 'caption' || fix.from === undefined) continue;
    const row = byId.get(fix.row_id);
    if (row && row.caption_x && row.caption_x.includes(fix.from)) {
      row.caption_x = row.caption_x.split(fix.from).join(fix.to);
      console.log(`${fix.row_id}  caption_x updated to match caption`);
    }
  }

  if (dry) { console.log(`\n--dry-run: ${applied} fix(es) would apply, nothing written`); return; }
  if (!applied) { console.log('nothing to do'); return; }

  fs.writeFileSync(QUEUE, Q.toCsv(rows, columns), 'utf8');
  console.log(`\nwrote ${QUEUE} -- ${applied} fix(es) applied`);
}

if (require.main === module) main();
