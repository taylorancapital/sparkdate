#!/usr/bin/env node
/**
 * scripts/design-handoff.js
 *
 * Produces the Claude Design handoff: every outstanding post for a project,
 * with the text of every slide already written.
 *
 * WHY THE EARLIER HANDOFFS STALLED
 *
 * They specified ONE post, so Design built one post. And they front-loaded
 * seven sections of brand reference before any work, so the model spent its
 * first turn confirming rather than producing.
 *
 * This inverts that. The brand block is ~20 lines. Everything after it is the
 * work: post after post, slide after slide, with the exact headline and
 * subhead for each. Design is typesetting, not composing -- which is also why
 * the output stays consistent across 26 posts instead of drifting.
 *
 * Usage:
 *   node scripts/design-handoff.js --events=LX,MC --out=handoff.md
 *   node scripts/design-handoff.js --events=GG
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');
// ONE slide planner, shared with the HTML campaign sheets. Previously this
// file had its own slidesFor(), so the markdown brief and the rendered sheet
// described different slides for the same post -- the markdown was still
// cutting Luke's quote in half and had no testimonial wall. Two generators
// for one thing is how they drift.
const { framesForRow } = require('./build-campaign-export.js');

const REPO = path.join(__dirname, '..');
const QUEUE = path.join(REPO, 'content', 'queue.csv');
const BRAND = path.join(REPO, 'content', 'brand.json');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const stripCR = (s) => String(s == null ? '' : s).split(String.fromCharCode(13)).join('').trim();

const isPhotoRow = (r) => /live capture|story frames/i.test(r.format);

function slideCount(format) {
  const f = String(format || '');
  const n = f.match(/(\d+)\s*slides?/i);
  if (n) return Number(n[1]);
  if (/single image \+ story/i.test(f)) return 2;
  if (/reel/i.test(f)) return 1;
  return 1;
}

/** Caption -> slide-sized chunks: paragraphs, splitting long ones by sentence. */
function units(caption) {
  const paras = String(caption || '').split(/\r?\n\s*\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    if (p.length <= 105) { out.push(p); continue; }
    let buf = '';
    for (const s of (p.match(/[^.!?]+[.!?]*/g) || [p])) {
      const t = s.trim(); if (!t) continue;
      if (buf && (buf + ' ' + t).length > 105) { out.push(buf); buf = t; }
      else buf = buf ? buf + ' ' + t : t;
    }
    if (buf) out.push(buf);
  }
  return out.length ? out : [''];
}

const prettyDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')
  ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US',
      { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  : iso);

function priceStr(ev) {
  const p = (ev && ev.pricing) || {};
  if (p.early_bird) return `$${p.early_bird.toFixed(2)}`;
  if (p.regular) return `$${p.regular.toFixed(2)}`;
  return '';
}

/**
 * Describe the frames for one row, in words, for a design brief.
 *
 * The frames themselves come from framesForRow() -- the same function that
 * builds the HTML sheets -- so the brief and the render can never disagree.
 * This only translates a frame spec into a human instruction.
 */
function slidesFor(row, ev, brand) {
  // Live coverage is shot on the night. Listing frames for it asks Design to
  // build something a camera produces -- and inflated the slide count from 84
  // to 112 the moment this file started using the shared planner.
  if (isPhotoRow(row)) return [];
  return framesForRow(row, ev, brand).map((f) => {
    const s = f.s;
    const style = {
      page: 'Statement',
      elevated: 'Statement (raised navy)',
      coral: 'Coral panel',
      quote: 'Pull quote',
      stat: 'Big number (gold)',
      crossed: 'Struck-through list',
      price: 'Price change (old struck out)',
      endcard: 'Closing (coral gradient)',
      photo: 'Photo background',
    }[s.mode] || s.mode;

    if (s.crossed) {
      return { style, head: s.crossed.join('  /  '), sub: '',
               note: 'Each line struck through in coral, uppercase.' };
    }
    if (s.mode === 'quote') {
      return { style, head: s.line1, sub: s.sub ? `— ${s.sub}` : '',
               note: 'Quote set smaller than a headline; attribution beneath.' };
    }
    const head = [s.line1, s.line2].filter(Boolean).join(' ');
    const notes = [];
    if (s.cta) notes.push(`CTA button: "${s.cta}"`);
    if (s.mode === 'stat') notes.push('Number in gold #d4af37, very large.');
    if (s.mode === 'endcard') notes.push('Coral gradient background, white type.');
    return { style, head, sub: s.sub || '', note: notes.join(' ') };
  });
}

function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));

  const keys = String(arg('events', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!keys.length) { console.error('Specify --events=LX,MC'); process.exit(2); }
  for (const k of keys) if (!brand.events[k]) { console.error(`Unknown event: ${k}`); process.exit(2); }

  const evs = keys.map((k) => ({ key: k, ...brand.events[k] }));
  const mine = rows
    .filter((r) => Q.isSchedulable(r) && !r.asset_files && Q.rowEvents(r).some((k) => keys.includes(k)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const build = mine;
  const held = mine.filter(isPhotoRow);

  const D = brand.asset_rules.dimensions;
  const O = [];
  const P = (s = '') => O.push(s);

  let totalSlides = 0;
  for (const r of build) totalSlides += slidesFor(r, brand.events[Q.rowEvents(r)[0]] || {}, brand).length;

  // ---- the ask, first, before any reference ----
  P(`# ${evs.map((e) => e.name).join(' + ')} — 30-day content calendar`);
  P('');
  P(`**${build.length} posts · ${totalSlides} slides to build**`);
  P('');
  P(`Every slide below has its finished text. Set the type, export the PNG. Do not`);
  P(`rewrite the copy, do not ask which to start with, do not stop after the first`);
  P(`post. Work straight down the list and produce all ${totalSlides}.`);
  P('');
  P(`If you can only manage part of it in one go, finish whole posts and tell me the`);
  P(`last row id you completed. I will paste "continue from <id>" and you carry on.`);
  P('');

  // ---- minimal brand block ----
  P('## The look — 20 lines, then we start');
  P('');
  P(`- Canvas **#0a0e27** navy. Text **#ffffff** headings, **#f5f3f0** body. One action colour: **#ff6b6b** coral. **#d4af37** gold for a single emphasised number only.`);
  P(`- Headlines **Playfair Display 900**, tight (-1px). Body/labels **Inter** 400–600. Never headline in Inter.`);
  P(`- **Statement slide:** navy, short coral rule, big Playfair headline left-aligned, optional one-line Inter subhead. Wordmark \`SPARKDATE\` bottom-left, coral, Inter 600, 12px, uppercase, 2px tracking.`);
  P(`- **Fact card:** same navy, content in a card — fill \`rgba(255,107,107,.05)\`, 1px border \`rgba(255,107,107,.20)\`, 4px radius. Uppercase Inter eyebrow, facts in Playfair white.`);
  P(`- **Closing:** coral gradient \`linear-gradient(135deg,#ff6b6b,#ff5252)\`, white Playfair headline, white Inter subline, white wordmark.`);
  P(`- Feed **${D.feed.width}×${D.feed.height}**. Story/Reel **${D.story.width}×${D.story.height}** — keep top 250px and bottom 320px clear, Instagram UI covers them.`);
  P(`- Export **PNG**, sRGB, named exactly as each slide states.`);
  P('');
  P('---');
  P('');

  // ---- the work ----
  let i = 0;
  for (const row of build) {
    i++;
    const ev = brand.events[Q.rowEvents(row)[0]] || {};
    const slides = slidesFor(row, ev, brand);
    const tall = /story|reel/i.test(row.format);
    const dim = tall ? `${D.story.width}×${D.story.height}` : `${D.feed.width}×${D.feed.height}`;
    const suffix = tall ? '_story' : '';

    P(`## ${i}. \`${row.row_id}\` — ${ev.name} — ${prettyDate(row.date)}`);
    P('');
    if (isPhotoRow(row)) {
      P(`${row.format} · ${dim}`);
      P('');
      P('> 📷 **Shot at the event — nothing to design.** Listed so the calendar is complete.');
      P('');
    } else {
      P(`${slides.length} slide${slides.length > 1 ? 's' : ''} · ${dim}${/reel/i.test(row.format) ? ' · Reel cover frame (video shot separately)' : ''}`);
      P('');
      P('### Slides to build');
      P('');
    }
    slides.forEach((s, k) => {
      const name = slides.length === 1
        ? `${row.row_id}${suffix}.png`
        : `${row.row_id}_${k + 1}of${slides.length}${suffix}.png`;
      P(`**${name}** — ${s.style}`);
      P(`- Headline: **${s.head}**`);
      if (s.sub) P(`- Subline: ${s.sub}`);
      if (s.note) P(`- ${s.note}`);
      P('');
    });

    // Everything needed to POST it, in the same block as the slides -- so this
    // one file is both the design spec and the posting calendar. Splitting
    // them is how a slide ends up promoting the wrong event.
    P('### To post it');
    P('');
    P(`- **Event:** ${ev.name} · ${ev.venue} · ${ev.city}`);
    P(`- **Event ID:** \`${ev.event_id || '—'}\``);
    P(`- **When:** ${prettyDate(row.date)} at ${row.time} · ${row.platforms.replace(/ig_story/g, 'IG Story').replace(/ig/g, 'Instagram').replace(/fb/g, 'Facebook').replace(/,/g, ' + ')}`);
    const closer = slides.length ? slides[slides.length - 1] : null;
    P(`- **CTA:** ${closer && closer.style.startsWith('Closing') ? closer.head + ' — Link in bio' : 'Link in bio'}`);
    P('');
    P('**Caption**');
    P('');
    P('```');
    P(stripCR(row.caption));
    P('```');
    P('');
    P('**Hashtags**');
    P('');
    P('```');
    P(row.hashtags);
    P('```');
    P('');
    if (row.link_fb) P(`- **Facebook post link:** \`${row.link_fb}\``);
    if (row.link_ig) P(`- **Instagram bio link:** \`${row.link_ig}\``);
    P('');
    P('---');
    P('');
  }

  if (held.length) {
    P('## Not for you — photography');
    P('');
    P('These are shot at the event, not designed:');
    P('');
    for (const r of held) P(`- \`${r.row_id}\` · ${prettyDate(r.date)} · ${r.format}`);
    P('');
  }

  const text = O.join('\n');
  const dest = arg('out');
  if (dest) { fs.writeFileSync(dest, text, 'utf8'); console.log(`wrote ${dest} — ${build.length} posts, ${totalSlides} slides, ${held.length} held`); }
  else console.log(text);
}

if (require.main === module) main();
module.exports = { slidesFor };
