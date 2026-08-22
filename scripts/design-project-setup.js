#!/usr/bin/env node
/**
 * scripts/design-project-setup.js
 *
 * Emits a complete, self-contained Claude Design project brief for one group
 * of events: brand system, that group's facts, slide templates, the hard
 * content rules, the export spec, and -- critically -- a REAL first post to
 * build immediately.
 *
 * That last part is the whole point. An earlier version of this document ended
 * with "build the four templates and show me first", and Claude Design did
 * exactly that: four sample cards and no usable output. A setup document that
 * does not end in real work produces no real work.
 *
 * Design projects are organised per client-brand, not per date, so this takes
 * a group:
 *   --events=LX,MC   Loxley's + Marion Court
 *   --events=TL      Tellus AfterDark
 *   --events=GG      Good Good Things
 *
 * Usage:
 *   node scripts/design-project-setup.js --events=LX,MC --out=setup.md
 *   node scripts/design-project-setup.js --events=TL          # stdout
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

const money = (v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : null);

function priceLine(ev) {
  const p = (ev && ev.pricing) || {};
  const parts = [];
  if (p.early_bird) parts.push(`${money(p.early_bird)} early bird${p.early_bird_through ? ` (through ${p.early_bird_through})` : ''}`);
  if (p.regular) parts.push(`${money(p.regular)} regular`);
  return parts.join(' → ') || 'TBC';
}

function slideCount(format) {
  const f = String(format || '');
  const x = f.match(/x\s*(\d+)\s*-\s*(\d+)/i);
  if (x) return Number(x[2]);
  const n = f.match(/(\d+)\s*slides?/i);
  if (n) return Number(n[1]);
  if (/single image \+ story/i.test(f)) return 2;
  return 1;
}

// Suggest a slide plan. Captions are written as short paragraphs and often
// carry one idea each, so they are the best available raw material -- but the
// mapping is not 1:1 (a two-paragraph caption regularly wants four slides), so
// this is explicitly labelled a starting point rather than a spec.
function slidePlan(row, n) {
  const paras = String(row.caption || '')
    .split(/\r?\n\s*\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const rows = [];
  if (n === 1) {
    rows.push(['1 of 1', 'A — Statement', paras[0] || 'the caption headline']);
    return { rows, paras };
  }
  rows.push(['1 of ' + n, 'A — Statement', `Hook. Open on: "${paras[0] || '(first line of the caption)'}"`]);
  for (let i = 2; i < n; i++) {
    const p = paras[i - 1];
    rows.push([`${i} of ${n}`, i === n - 1 ? 'B — Fact card' : 'A — Statement',
      p ? `"${p}"` : 'Supporting beat, or the event facts (date · venue · doors · price)']);
  }
  rows.push([`${n} of ${n}`, 'Closing', 'Coral gradient. Short CTA in Playfair 900 + "Link in bio". Wordmark.']);
  return { rows, paras };
}

function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));

  const keys = String(arg('events', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!keys.length) {
    console.error('Specify --events=LX,MC (or TL, or GG).');
    process.exit(2);
  }
  for (const k of keys) if (!brand.events[k]) { console.error(`Unknown event key: ${k}`); process.exit(2); }

  const evs = keys.map((k) => ({ key: k, ...brand.events[k] }));
  const markets = [...new Set(evs.map((e) => e.market))];
  const title = evs.map((e) => e.name).join(' + ');

  // Everything in this group still needing art, soonest first. The first one
  // that is real design work (not live photography) becomes the opening task.
  const need = rows
    .filter((r) => Q.isSchedulable(r) && !r.asset_files && Q.rowEvents(r).some((k) => keys.includes(k)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // Live-coverage rows are photographed on the night and cannot be designed in
  // advance. If a project has nothing BUT those outstanding, say so rather
  // than handing Design an impossible task.
  const isLive = (r) => /live capture|story frames/i.test(r.format);
  const designable = need.filter((r) => !isLive(r));
  const first = designable[0] || null;
  const liveOnly = !first && need.length > 0;

  const O = [];
  const P = (s = '') => O.push(s);

  P(`# SparkDate — ${title}`);
  P('');
  P('**Paste this whole file as the first message in a new Claude Design project.**');
  P('');
  P('**Sections 1–7 are reference. Section 8 is a real post — build it.** Do not');
  P('produce sample templates, do not ask questions first, do not stop to confirm.');
  P('Read the reference, then make the finished slides section 8 specifies.');
  P('');
  P('---');
  P('');

  // 1. brand
  P('## 1. What SparkDate is');
  P('');
  P('Real-world singles events in Pennsylvania. Ticketed evenings where people meet');
  P('face to face: check-in and drinks, an icebreaker, mingling, then short matched');
  P('conversation rounds at the end.');
  P('');
  P('**The positioning is anti-dating-app.** Not "a better app" — the alternative to');
  P('apps. No profiles, no swiping, no algorithm, no three weeks of texting that goes');
  P('nowhere. A room of people who decided to show up.');
  P('');
  P('**Tone: confident and plain.** Short declarative sentences. No exclamation marks,');
  P('no hype, no emoji, no "Ladies!!" energy. Warm and grown-up, never neon party');
  P('flyer. Real photos of real nights beat stock imagery every time.');
  P('');
  P('Captions already running, to set the register:');
  P('');
  P('> "Early bird\'s done. $24.99 from here."');
  P('> "Tomorrow. 6:30. Tellus360, 24 E King St, Lancaster. Last call — link in bio."');
  P('');
  P('---');
  P('');

  // 2. this project's events
  P(`## 2. The event${evs.length > 1 ? 's' : ''} in this project`);
  P('');
  for (const e of evs) {
    P(`### ${e.name}  \`${e.key}\``);
    P('');
    P(`- **City:** ${e.city}`);
    P(`- **Venue:** ${e.venue}`);
    P(`- **Date:** ${e.date}, doors ${e.doors}`);
    P(`- **Pricing:** ${priceLine(e)}`);
    P(`- **Hashtags — the only valid set for this event:**`);
    P(`  \`${(e.hashtag_pool || []).join(' ')}\``);
    P('');
  }
  if (evs.length > 1) {
    P('> **These events have different dates and prices.** Take every fact from the');
    P('> brief for the specific post. Never copy a date or price from another slide.');
    P('');
  }
  P('---');
  P('');

  // 3. colour
  const u = brand.universal;
  P('## 3. Colour');
  P('');
  P('Taken from the live site CSS. Do not invent new hues.');
  P('');
  P('| Role | Hex |');
  P('|---|---|');
  P('| **Navy — the canvas** | `#0a0e27` |');
  P('| Navy elevated | `#1a1f3a` |');
  P('| **Coral — the one action colour** | `#ff6b6b` |');
  P('| Coral deep (gradient end) | `#ff5252` |');
  P('| **Gold — sparing accent** | `#d4af37` |');
  P('| Cream — body text | `#f5f3f0` |');
  P('| White — headings only | `#ffffff` |');
  P('');
  P('**The signature pattern** — cards are translucent coral over navy, never flat grey:');
  P('');
  P('- Fill `rgba(255, 107, 107, 0.05)` · Border `1px solid rgba(255, 107, 107, 0.20)` · Radius `4px`');
  P('');
  P('**Gradients, always `135deg`:**');
  P('');
  P('- Coral action — `linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%)`');
  P('- Page dark — `linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)`');
  P('');
  P('Coral is the only thing that invites action. Gold is emphasis, never a button.');
  P('Body text is cream, not white. Design dark-first on navy.');
  P('');
  P('---');
  P('');

  // 4. type
  P('## 4. Typography');
  P('');
  P('```');
  P('Playfair Display  700, 900       →  every heading. Serif, editorial.');
  P('Inter             400, 500, 600  →  body, labels, UI.');
  P('```');
  P('');
  P('| Role | Size | Weight | Tracking |');
  P('|---|---|---|---|');
  P('| Slide headline | 48–72px | 900 | `-1px` |');
  P('| Subhead | 24–34px | 700 | normal |');
  P('| Body | 16–22px | 400–500 | normal |');
  P('| Eyebrow / label | 12–14px | 600–700 | UPPERCASE, `1–2px` |');
  P('');
  P('**The rule that makes it look right:** big serif display type is tight and heavy');
  P('(Playfair 900, negative tracking); small labels are wide, uppercase Inter. Never');
  P('set a headline in Inter. Heading line-height `1.1`, body `1.6`.');
  P('');
  P('---');
  P('');

  // 5. templates
  P('## 5. Slide templates');
  P('');
  P('The vocabulary for every post. Section 8 says which to use where — apply them to');
  P('the real post, do not build them as standalone samples.');
  P('');
  P('**A — Statement.** Navy. Playfair 900, 56–72px, white, left-aligned, generous');
  P('margins. One cream Inter line beneath. A small coral rule as the only ornament.');
  P('`SPARKDATE` wordmark bottom-left in coral Inter 600, 12px, uppercase, 2px tracking.');
  P('');
  P('**B — Fact card.** Coral-tint card on navy. Uppercase Inter eyebrow. The fact in');
  P('Playfair 900, 40–56px white. Prices: never shrink the cents. Gold allowed for one');
  P('emphasised number.');
  P('');
  P('**C — Photo.** Full-bleed photo, navy scrim 55–70% from the bottom, text in the');
  P('bottom third. Never put text over a face.');
  P('');
  P('**D — Story, 1080×1920.** Keep the **top 250px and bottom 320px clear** — Instagram');
  P('UI covers them. Leave an obvious empty band for the link or countdown sticker,');
  P('which is added by hand at posting. Do not draw a fake sticker.');
  P('');
  P('**Closing slide** (last of every carousel). Coral action gradient, white Playfair');
  P('900 headline, one Inter line, wordmark. This is the CTA.');
  P('');
  P('---');
  P('');

  // 6. rules
  P('## 6. Hard rules — breaking these means the asset is thrown away');
  P('');
  P(`**Attendance.** The only sanctioned figure is **${u.approved_stat.value}** (${u.approved_stat.context}).`);
  P(`"28" is banned — unsourced. "${u.approved_stat.proposed_revision}" is proposed but **not approved**. If a brief asks for`);
  P('any other number, stop and ask.');
  P('');
  P(`**Never use these photos:** ${u.pulled_images.join(', ')} — consent withdrawn.`);
  P(`**Cleared:** ${u.consented_images.join(', ')}.`);
  P('');
  P(`**Hashtags must match the city.** This project covers **${markets.map((m) => m.toUpperCase()).join(' and ')}**.`);
  const otherMarket = markets.includes('lancaster') ? 'Philadelphia' : 'Lancaster';
  P(`Never use ${otherMarket} tags on these events. Market-agnostic tags, allowed anywhere:`);
  P(`\`${(brand.markets._neutral.hashtags || []).join(' ')}\``);
  P('');
  P('**Prices differ per event and the same number means different things** — `$24.99`');
  P('is Marion Court\'s *regular* price and Loxley\'s *early-bird* price. Take the price');
  P('from the brief, never from another slide.');
  P('');
  P('**Run of show, if shown:** check-in and drinks → icebreaker → mingling → 7-minute');
  P('matched rounds **last**. Anything saying "no timer, no rounds" is wrong.');
  P('');
  P('---');
  P('');

  // 7. export
  const d = brand.asset_rules.dimensions;
  P('## 7. Export');
  P('');
  P('| | |');
  P('|---|---|');
  P('| Format | **PNG**, sRGB |');
  P(`| Feed | **${d.feed.width} × ${d.feed.height}** |`);
  P(`| Story / Reel | **${d.story.width} × ${d.story.height}** |`);
  P('');
  P('**Filenames must contain the row id**, zero-padded, exactly as the brief states:');
  P('');
  P('```');
  P('XX-06_1of4.png   XX-06_2of4.png   XX-06_3of4.png   XX-06_4of4.png');
  P('XX-05.png        XX-12_story.png');
  P('```');
  P('');
  P('---');
  P('');

  // 8. the real task
  if (liveOnly) {
    P('## 8. Nothing to design right now');
    P('');
    P(`All ${need.length} outstanding post(s) in this project are **live coverage** —`);
    P('photographed at the event itself, not designed in advance:');
    P('');
    for (const r of need) P(`- \`${r.row_id}\` · ${r.date} · ${r.format}`);
    P('');
    P('Set up the brand system above so you are ready, and I will paste a real post');
    P('when one needs designing.');
  } else if (!first) {
    P('## 8. Nothing outstanding');
    P('');
    P('Every post in this project already has artwork. Wait for a brief.');
  } else {
    const ev = brand.events[Q.rowEvents(first)[0]] || {};
    const n = slideCount(first.format);
    const isStory = /story|reel/i.test(first.format);
    const dim = isStory ? `${d.story.width}×${d.story.height}` : `${d.feed.width}×${d.feed.height}`;
    const { rows: plan } = slidePlan(first, n);

    P(`## 8. Build this now — ${first.row_id}`);
    P('');
    P(`**${ev.name}** · ${ev.venue} · **${ev.city}**`);
    P(`**Event date:** ${ev.date}, doors ${ev.doors} · **${priceLine(ev)}**`);
    const isReel = /reel/i.test(first.format);
    P(`**Posting:** ${first.date} at ${first.time} · **${first.format}** · **${n} ${isReel ? 'cover frame' : 'slide' + (n > 1 ? 's' : '')}** at **${dim}**`);
    P('');
    if (isReel) {
      P('> **This is a Reel — the video itself is shot separately.** What is needed');
      P('> here is the **cover frame**: a single vertical still carrying the hook, which');
      P('> is what shows in the grid and stops the scroll. Design that, not a video.');
      P('');
    }
    P('**The caption this post carries** — it gets typed into the post, so do not put');
    P('all of it in the images:');
    P('');
    P('> ' + String(first.caption || '').trim().split(/\r?\n/).join('\n> '));
    P('');
    P('**Slide plan** — a starting point, not a spec. If a better split serves the');
    P('caption, take it and tell me what you changed:');
    P('');
    P('| Slide | Template | Content |');
    P('|---|---|---|');
    for (const [a, b, c] of plan) P(`| ${a} | ${b} | ${c} |`);
    P('');
    const files = n === 1 ? `${first.row_id}.png`
      : Array.from({ length: n }, (_, i) => `${first.row_id}_${i + 1}of${n}.png`).join(', ');
    P(`**Export as:** \`${files}\``);
    P('');
    P('Build all of them, show me, and I\'ll say what to adjust. Then I\'ll paste the');
    P('next post in the same shape.');
    P('');
    if (need.length > 1) {
      P(`_After this one, ${need.length - 1} more post${need.length - 1 === 1 ? '' : 's'} in this project need artwork._`);
    }
  }
  P('');

  const text = O.join('\n');
  const dest = arg('out');
  if (dest) { fs.writeFileSync(dest, text, 'utf8'); console.log(`wrote ${dest} — ${title}, first task ${first ? first.row_id : '(none)'}, ${need.length} outstanding`); }
  else console.log(text);
}

if (require.main === module) main();
