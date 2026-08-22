#!/usr/bin/env node
/**
 * scripts/build-campaign-export.js
 *
 * Builds a campaign export sheet -- one HTML file per event -- from
 * content/queue.csv, using the SAME renderer as the Tellus Event 3 export.
 *
 * The template in templates/ is that file with its data blocks emptied. Every
 * frame mode, palette, font embed and PNG export path is the existing proven
 * one; the only thing this adds is filling `frames-data` from the queue
 * instead of by hand.
 *
 * That is the point. Slide layout is already solved and on-brand. What was not
 * solved is producing 79 of them without a person retyping every date, price
 * and headline -- which is exactly where the wrong price and the other city's
 * hashtags kept creeping in.
 *
 * PHOTO FRAMES ARE HELD BACK. Rows built on real event photography (live
 * coverage, room shots) cannot be generated. They are listed at the end of the
 * run and left out of the sheet rather than emitted as empty frames.
 *
 * Usage:
 *   node scripts/build-campaign-export.js --event=MC
 *   node scripts/build-campaign-export.js --all --outdir=<dir>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const REPO = path.join(__dirname, '..');
const QUEUE = path.join(REPO, 'content', 'queue.csv');
const BRAND = path.join(REPO, 'content', 'brand.json');
const TEMPLATE = path.join(REPO, 'templates', 'campaign-export.template.html');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

// Rows whose frames are photographs, not layouts.
const isPhotoRow = (row) => /live capture|story frames/i.test(row.format);

function slideCount(format) {
  const f = String(format || '');
  const x = f.match(/x\s*(\d+)\s*-\s*(\d+)/i);
  if (x) return Number(x[2]);
  const n = f.match(/(\d+)\s*slides?/i);
  if (n) return Number(n[1]);
  if (/single image \+ story/i.test(f)) return 2;
  return 1;
}

/**
 * Break a caption into slide-sized units: paragraphs first, then long
 * paragraphs by sentence. Captions are written one idea per paragraph, but a
 * four-frame post routinely comes from two of them.
 */
function units(caption) {
  const paras = String(caption || '')
    .split(/\r?\n\s*\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    if (p.length <= 110) { out.push(p); continue; }
    let buf = '';
    for (const sentence of (p.match(/[^.!?]+[.!?]*/g) || [p])) {
      const t = sentence.trim();
      if (!t) continue;
      if (buf && (buf + ' ' + t).length > 110) { out.push(buf); buf = t; } else buf = buf ? buf + ' ' + t : t;
    }
    if (buf) out.push(buf);
  }
  return out.length ? out : [''];
}

/**
 * Split one unit across the template's two display lines. The layout sets
 * line1 and line2 in Playfair 900 and expects a deliberate break, so break on
 * the last sentence boundary, else near the middle on a word.
 */
function twoLines(text) {
  // Trim trailing separators too -- a split on "Mon, Aug 31 · Philadelphia"
  // otherwise leaves the middot dangling at the end of line 1.
  const clean = (x) => String(x || '').trim().replace(/[\s·,;:-]+$/, '').trim();
  const t = clean(text);
  if (!t) return { line1: '', line2: '' };
  if (t.length <= 26) return { line1: t, line2: '' };

  const sentenceBreak = t.search(/[.!?]\s+\S/);
  if (sentenceBreak > 0 && sentenceBreak < t.length - 8) {
    return { line1: clean(t.slice(0, sentenceBreak + 1)), line2: clean(t.slice(sentenceBreak + 1)) };
  }
  const words = t.split(' ');
  let a = '';
  for (const w of words) {
    if ((a + ' ' + w).trim().length > t.length / 2) break;
    a = (a + ' ' + w).trim();
  }
  return { line1: clean(a), line2: clean(t.slice(a.length)) };
}

const priceOf = (ev) => {
  const p = (ev && ev.pricing) || {};
  if (p.early_bird) return `$${p.early_bird.toFixed(2)}`;
  if (p.regular) return `$${p.regular.toFixed(2)}`;
  return '';
};

const prettyDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  return new Date(iso + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** Turn one queue row into the frame objects the renderer expects. */
function framesForRow(row, ev, brand) {
  const n = slideCount(row.format);
  const u = units(row.caption);
  const story = /story|reel/i.test(row.format);
  const eyebrow = ev.name || row.row_id;
  const label = `${prettyDate(row.date)} — ${row.row_id}`;
  const out = [];

  const push = (mode, s) => out.push({
    group: 'organic',
    id: row.row_id.toLowerCase(),
    label,
    n: out.length + 1,
    of: n,
    s: { mode, eyebrow, story: story || undefined, ...s },
  });

  if (n === 1) {
    push('page', { ...twoLines(u[0]), sub: u[1] || '' });
    return out;
  }

  // 1: the hook.
  push('page', twoLines(u[0]));

  // Middle: remaining copy, alternating navy/elevated so a long carousel does
  // not read as one flat block; the penultimate frame carries the hard facts.
  for (let i = 1; i <= n - 2; i++) {
    const isLast = i === n - 2;
    if (isLast) {
      // NOT 'price' mode. That mode strikes line1 through in coral -- it is
      // built for "was $X" above "now $Y", so a plain price rendered in it
      // reads as cancelled. Verified in the template: isPrice always applies
      // text-decoration:line-through. Use it only for a real price CHANGE,
      // set by hand.
      const price = priceOf(ev);
      push('elevated', {
        line1: prettyDate(ev.date),
        line2: ev.venue || '',
        sub: [ev.doors ? `Doors ${ev.doors}` : '', price].filter(Boolean).join('  ·  '),
      });
    } else {
      push(i % 2 ? 'elevated' : 'page', twoLines(u[i] || ''));
    }
  }

  // Last: the CTA, on coral.
  // The closing frame. Prefer the caption's own last line -- "Tomorrow.",
  // "Last call" -- but ONLY if it has not already been used on an earlier
  // frame. A short caption (two chunks) across a four-frame carousel would
  // otherwise put the same sentence on slide 2 and slide 4, which is what the
  // first render did.
  const usedCount = Math.min(u.length, Math.max(1, n - 1));
  const unused = u.slice(usedCount);
  const tail = unused.length ? unused[unused.length - 1] : '';
  const stripped = String(tail).replace(/\s*link in bio\.?/i, '').trim();
  const closing = stripped || `${prettyDate(ev.date)} · ${ev.city || ''}`.trim();
  push('endcard', { ...twoLines(closing), cta: 'Get tickets' });

  return out;
}

function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));
  const template = fs.readFileSync(TEMPLATE, 'utf8');

  const keys = flag('all') ? Object.keys(brand.events)
    : String(arg('event', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!keys.length) { console.error('Specify --event=MC or --all.'); process.exit(2); }

  const outdir = arg('outdir', path.join(require('os').homedir(), 'Downloads'));
  fs.mkdirSync(outdir, { recursive: true });

  for (const key of keys) {
    const ev = brand.events[key];
    if (!ev) { console.error(`Unknown event: ${key}`); continue; }

    const mine = rows
      .filter((r) => Q.isSchedulable(r) && Q.rowEvents(r).includes(key))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const held = mine.filter(isPhotoRow);
    const build = mine.filter((r) => !isPhotoRow(r));

    const frames = [];
    for (const row of build) frames.push(...framesForRow(row, ev, brand));

    const prefix = (ev.name || key).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Replace with FUNCTIONS, never strings. Frame JSON contains prices like
    // "$29.99", and in a string replacement `$2` is a backreference -- it ate
    // the closing </script> tag and dumped the raw JSON onto the page as text.
    const json = JSON.stringify(frames);
    const header = `${ev.name} @ ${ev.venue} · ${ev.city}`;
    const example = `${prefix}-${(build[0] || { row_id: 'xx-01' }).row_id.toLowerCase()}-1of4.png`;

    let html = template
      .replace(/(<script id="frames-data"[^>]*>)__DATA__(<\/script>)/, (m, a, b) => a + json + b)
      .replace(/(<script id="photo-data"[^>]*>)__DATA__(<\/script>)/, (m, a, b) => a + '{}' + b)
      .replace('<body>', () => `<body data-prefix="${prefix}">`)
      .replace('__EVENT_HEADER__', () => header)
      .replace('__FILE_EXAMPLE__', () => example)
      .replace(/<title>[^<]*<\/title>/, () => `<title>${ev.name} — Campaign Export Sheet</title>`);

    const dest = path.join(outdir, `Campaign-Export-${key}-${prefix}.html`);
    fs.writeFileSync(dest, html, 'utf8');

    console.log(`${key}  ${String(ev.name).padEnd(34)} ${String(frames.length).padStart(3)} frames from ${build.length} posts`);
    if (held.length) {
      console.log(`     held back (need real photos): ${held.map((r) => r.row_id).join(', ')}`);
    }
    console.log(`     -> ${dest}`);
  }
}

if (require.main === module) main();
module.exports = { units, twoLines, slideCount, framesForRow };
