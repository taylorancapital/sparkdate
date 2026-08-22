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
 * Write the actual slide text. This is the part that makes the handoff work:
 * Design receives finished words per slide, so 26 posts come back consistent
 * instead of 26 interpretations.
 */
function slidesFor(row, ev) {
  const n = slideCount(row.format);
  const u = units(row.caption);
  const out = [];

  // A headline is a headline. If a chunk runs long, the first sentence is the
  // headline and the rest drops to the subline -- otherwise Design is handed a
  // paragraph set in Playfair 900 at 70px, which does not fit and does not
  // read.
  const split = (text) => {
    const t = String(text || '').trim();
    if (t.length <= 48) return { head: t, sub: '' };
    const m = t.match(/^(.+?[.!?])\s+(.*)$/);
    if (m && m[1].length <= 64) return { head: m[1].trim(), sub: m[2].trim() };
    const words = t.split(' ');
    let a = '';
    for (const w of words) { if ((a + ' ' + w).trim().length > 48) break; a = (a + ' ' + w).trim(); }
    return { head: a || t, sub: t.slice(a.length).trim() };
  };

  if (n === 1) {
    const s0 = split(u[0] || ev.name);
    out.push({ style: 'Statement', head: s0.head, sub: s0.sub || u[1] || '' });
    return out;
  }

  { const s0 = split(u[0] || ev.name); out.push({ style: 'Statement', head: s0.head, sub: s0.sub }); }

  for (let i = 1; i <= n - 2; i++) {
    const isFactSlot = i === n - 2;
    if (isFactSlot) {
      out.push({
        style: 'Fact card',
        head: prettyDate(ev.date),
        sub: [ev.venue, ev.doors ? `Doors ${ev.doors}` : '', priceStr(ev)].filter(Boolean).join(' · '),
        note: 'Price in gold #d4af37. Never shrink the cents.',
      });
    } else {
      const si = split(u[i] || '');
      out.push({ style: 'Statement', head: si.head, sub: si.sub });
    }
  }

  const tail = u[u.length - 1] || '';
  const cta = /link in bio/i.test(tail)
    ? (tail.replace(/\s*link in bio\.?/i, '').trim() || 'See you there.')
    : 'See you there.';
  out.push({ style: 'Closing (coral gradient)', head: cta, sub: 'Link in bio.' });

  return out;
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
  for (const r of build) totalSlides += slidesFor(r, brand.events[Q.rowEvents(r)[0]] || {}).length;

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
    const slides = slidesFor(row, ev);
    const tall = /story|reel/i.test(row.format);
    const dim = tall ? `${D.story.width}×${D.story.height}` : `${D.feed.width}×${D.feed.height}`;
    const suffix = tall ? '_story' : '';

    P(`## ${i}. \`${row.row_id}\` — ${ev.name} — ${prettyDate(row.date)}`);
    P('');
    P(`${slides.length} slide${slides.length > 1 ? 's' : ''} · ${dim}${/reel/i.test(row.format) ? ' · Reel cover frame (video shot separately)' : ''}`);
    if (isPhotoRow(row)) { P(''); P('> 📷 **Shot at the event — do not design these.** Listed so the calendar is complete.'); }
    P('');
    P('### Slides to build');
    P('');
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
    P(`- **CTA:** ${slides[slides.length - 1].style.startsWith('Closing') ? slides[slides.length - 1].head + ' — Link in bio' : 'Link in bio'}`);
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
module.exports = { units, slidesFor, slideCount };
