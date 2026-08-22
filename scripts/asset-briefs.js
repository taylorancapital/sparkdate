#!/usr/bin/env node
/**
 * scripts/asset-briefs.js
 *
 * Turns "31 rows have no artwork" into a commissionable brief pack.
 *
 * The queue knows everything a designer needs -- which event, how many slides,
 * what the post is trying to do, the price, the venue, the approved stat, the
 * hashtags -- but it is spread across a CSV row and an event block in
 * brand.json. Assembling that by hand for each of 31 rows is exactly the kind
 * of tedium that stops the calendar getting drawn.
 *
 * Output is markdown, meant to be pasted straight to whoever (or whatever)
 * makes the slides.
 *
 * Every brief carries the facts that have ALREADY been got wrong at least
 * once, inline, so they cannot be missed: the market's hashtag pool (Philly
 * tags on a Lancaster event has shipped twice), the event's real prices
 * ($24.99 means different things for different events), and the banned
 * attendance figure.
 *
 * Usage:
 *   node scripts/asset-briefs.js                     # every row missing art
 *   node scripts/asset-briefs.js --through=2026-08-31
 *   node scripts/asset-briefs.js --event=LX
 *   node scripts/asset-briefs.js --row=MC-06
 *   node scripts/asset-briefs.js --out=briefs.md
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const REPO = path.join(__dirname, '..');
const QUEUE = path.join(REPO, 'content', 'queue.csv');
const BRAND = path.join(REPO, 'content', 'brand.json');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

// "Carousel, 4 slides" -> 4. "Story frames x6-8" -> 8 (brief for the most).
function slideCount(format) {
  const f = String(format || '');
  const x = f.match(/x\s*(\d+)\s*-\s*(\d+)/i);
  if (x) return Number(x[2]);
  const n = f.match(/(\d+)\s*slides?/i);
  if (n) return Number(n[1]);
  if (/single image \+ story/i.test(f)) return 2;
  return 1;
}

function shapeFor(row, brand) {
  const f = String(row.format || '').toLowerCase();
  const d = brand.asset_rules.dimensions;
  if (/story|reel/.test(f)) return { name: 'story/reel', ...d.story };
  if (/single image \+ story/i.test(f)) return { name: 'feed + story', ...d.feed };
  return { name: 'feed', ...d.feed };
}

// The template beat this row came from, matched on theme text. Best-effort:
// a miss costs a line of context, not correctness.
function beatFor(row, brand) {
  const beats = (brand.calendar_template && brand.calendar_template.beats) || [];
  const fmt = String(row.format || '').toLowerCase();
  return beats.find((b) => String(b.format || '').toLowerCase() === fmt) || null;
}

function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));

  const through = arg('through');
  const onlyEvent = arg('event');
  const onlyRow = arg('row');

  const wanted = rows.filter((r) => {
    if (onlyRow) return r.row_id === onlyRow;
    if (!Q.isSchedulable(r)) return false;
    if (r.asset_files) return false;                       // already has art
    if (through && r.date > through) return false;
    if (onlyEvent && !Q.rowEvents(r).includes(onlyEvent)) return false;
    return true;
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const out = [];
  const P = (s = '') => out.push(s);

  P('# Asset briefs — SparkDate social calendar');
  P('');
  P(`${wanted.length} post(s) need artwork. Generated ${new Date().toISOString().slice(0, 10)}.`);
  P('');
  P('## Rules that apply to every slide');
  P('');
  P(`- **Export PNG.** Feed **${brand.asset_rules.dimensions.feed.width}×${brand.asset_rules.dimensions.feed.height}**, story/reel **${brand.asset_rules.dimensions.story.width}×${brand.asset_rules.dimensions.story.height}**. The repo converts to JPEG on ingest (Instagram's API takes JPEG only) — send PNG so the master stays lossless.`);
  P(`- **Never use these images:** ${brand.universal.pulled_images.join(', ')} — pulled from every use, consent withdrawn.`);
  P(`- **Only these are cleared:** ${brand.universal.consented_images.join(', ')}.`);
  P(`- **The only sanctioned attendance figure is ${brand.universal.approved_stat.value}** (${brand.universal.approved_stat.context}). Never "${brand.universal.approved_stat.proposed_revision}" — proposed but not approved — and never 28, which is unsourced and banned.`);
  P('- **Filename:** include the row id, e.g. `MC-06_1of4.png`. That is how the converter maps files to rows.');
  P('- Drop finished exports in `OneDrive\\SparkDate\\SourceArt\\`.');
  P('');
  P('---');
  P('');

  let totalSlides = 0;

  for (const row of wanted) {
    const keys = Q.rowEvents(row);
    const ev = brand.events[keys[0]] || {};
    const shape = shapeFor(row, brand);
    const n = slideCount(row.format);
    const beat = beatFor(row, brand);
    totalSlides += n;

    const prices = [];
    if (ev.pricing) {
      if (ev.pricing.early_bird) prices.push(`$${ev.pricing.early_bird.toFixed(2)} early bird${ev.pricing.early_bird_through ? ` (through ${ev.pricing.early_bird_through})` : ''}`);
      if (ev.pricing.regular) prices.push(`$${ev.pricing.regular.toFixed(2)} regular`);
    }

    P(`## ${row.row_id} — ${row.date} ${row.time}`);
    P('');
    P(`**${ev.name || keys.join(' + ')}** · ${ev.venue || '?'} · ${ev.city || '?'}`);
    P('');
    P(`| | |`);
    P(`|---|---|`);
    P(`| Format | ${row.format} |`);
    P(`| Slides needed | **${n}** |`);
    P(`| Dimensions | ${shape.width}×${shape.height} (${shape.name}) |`);
    P(`| Event date | ${ev.date || '?'}, doors ${ev.doors || '?'} |`);
    if (prices.length) P(`| Pricing | ${prices.join(' → ')} |`);
    if (beat && beat.theme) P(`| Beat | ${beat.theme} |`);
    P('');
    if (beat && beat.brief) { P(`**What this post is doing:** ${beat.brief}`); P(''); }
    if (row.manual_reason) { P(`> ⚠️ Posted by hand: ${row.manual_reason}`); P(''); }

    P('**Caption it must support** (do not put this text in the image unless the beat calls for it):');
    P('');
    P('```');
    P(String(row.caption || '(none written yet)').trim());
    P('```');
    P('');
    P(`**Hashtags:** \`${row.hashtags || '(none)'}\``);
    P('');
    if (ev.hashtag_pool) {
      const market = (ev.market || '').toUpperCase();
      P(`> This is a **${market}** event. Its only valid tags are: ${ev.hashtag_pool.join(', ')}.`);
      P(`> Philadelphia tags on a Lancaster event (or the reverse) has already shipped twice.`);
      P('');
    }
    P('---');
    P('');
  }

  P(`_${wanted.length} posts, roughly **${totalSlides} individual slides**._`);
  P('');

  const text = out.join('\n');
  const dest = arg('out');
  if (dest) {
    fs.writeFileSync(dest, text, 'utf8');
    console.log(`wrote ${dest} — ${wanted.length} briefs, ~${totalSlides} slides`);
  } else {
    console.log(text);
  }
}

if (require.main === module) main();
module.exports = { slideCount };
