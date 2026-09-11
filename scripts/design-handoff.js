#!/usr/bin/env node
/**
 * scripts/design-handoff.js
 *
 * Produces the Claude Design handoff: every outstanding post for a project,
 * with the text of every slide already written, the exact look to set it in,
 * and every file the publisher needs back.
 *
 * WHY THE EARLIER HANDOFFS STALLED
 *
 * They specified ONE post, so Design built one post. And they front-loaded
 * seven sections of brand reference before any work, so the model spent its
 * first turn confirming rather than producing.
 *
 * This inverts that. A look block, then the work: post after post, slide after
 * slide, with the exact headline and subhead for each. Design is typesetting,
 * not composing -- which is also why the output stays consistent across 26
 * posts instead of drifting.
 *
 * THE LOOK BLOCK IS LIFTED FROM THE TEMPLATE, AND A TEST HOLDS IT THERE
 *
 * Until 2026-09-10 the look block described Inter labels, a coral-tint fact
 * card and a coral-gradient closing slide. templates/campaign-export.template.html
 * draws none of those, and it rendered every published Loxleys slide, so a
 * Design project given this brief was asked for a look that matched nothing
 * already posted. The block now quotes the template's own values, and
 * tests/design-handoff.test.js fails if the template stops containing any of
 * them (TEMPLATE_FACTS).
 *
 * It also asks for every file a post needs: the TikTok twin (`_tt`) when the
 * post goes to TikTok, which Design was never asked for, and for "Single
 * image + Story" one feed frame plus one story frame. Two story frames is the
 * shape lib/social-publish.js refuses on Facebook (MC-12, LX-24).
 *
 * THIS IS ALSO THE PROJECT SETUP -- THERE IS NO SEPARATE ONE
 *
 * scripts/design-project-setup.js was a one-time "set up the Design project"
 * brief: brand system, templates, rules and export spec, then a single post.
 * That is the shape described above, and by 2026-09-10 it had gone stale
 * against everything it restated: the old Inter and coral-card look, "28"
 * still banned (brand.json lifted that on 08-22), an
 * approved_stat.proposed_revision brand.json never had (printed as
 * "undefined"), a run of show with a standalone icebreaker and a quoted
 * duration, and a slide planner of its own that disagreed with
 * framesForRow() -- coral-gradient closing slide, no `_tt` twins. It was
 * retired, not repaired. Paste this brief as the first message of a new
 * Design project; the look block is the setup. A copy survives on the
 * unmerged branch claude/no-approve-without-art, where #315 found it once
 * already -- do not land it again.
 *
 * Usage:
 *   node scripts/design-handoff.js --events=TL2 --out=handoff.md
 *   node scripts/design-handoff.js --events=LX,MC
 *   --asset-root=<dir>   checkout the reference slides' paths point into
 *                        (default: this one)
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

const prettyDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')
  ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US',
      { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  : iso);

// Every value the look block states, exactly as it appears in
// templates/campaign-export.template.html. Change the template and the test
// fails until this block is brought back in line with it.
//
// The label spans are pinned opening on font-size rather than font-family on
// purpose. They set no typeface, and the PNG export serialises the frame on
// its own, outside the sheet's <body> -- so the Inter the sheet page uses
// never reaches them and they render in the browser's default serif. Every
// published slide shows that serif, so it is the look, and the block says so.
const TEMPLATE_FACTS = [
  `bg:'linear-gradient(135deg,#0a0e27,#1a1f3a)', eyebrow:'#ff6b6b'`,
  `bg:'linear-gradient(135deg,#1a1f3a,#2a2f4a)', eyebrow:'#ff6b6b'`,
  `bg:'linear-gradient(135deg,#0a0e27,#141833)', eyebrow:'#d4af37'`,
  `bg:'linear-gradient(135deg,#0a0e27,#1a1f3a)', eyebrow:'#f5f3f0'`,
  `meta:'rgba(245,243,240,0.35)', h1:'#fff', h2:'#ff6b6b', sub:'rgba(245,243,240,0.75)', divider:'rgba(255,107,107,0.15)', spark:'#ff6b6b', date:'#fff', site:'rgba(245,243,240,0.4)'`,
  `h1:'#f5f3f0', h2:'#fff', sub:'rgba(245,243,240,0.6)'`,
  `let h1 = 104;`,
  `else if (isQuote) h1 = 62;`,
  `.length > 26) h1 = 82;`,
  `const pad = tt ? '190px 250px 380px 170px'`,
  `: story ? '250px 72px 320px'`,
  `: '132px 76px 126px';`,
  `const align = (s.fullBleed || tt) ? 'align-items:center;text-align:center;' : '';`,
  `top:' + (tt ? 150 : story ? 274 : 44) + 'px;left:52px;right:' + (tt ? 250 : 52) + 'px;`,
  `<span style="font-size:27px;letter-spacing:4.5px;text-transform:uppercase;font-weight:700;`,
  `<span style="font-size:27px;letter-spacing:4.5px;text-transform:uppercase;font-weight:600;`,
  `font-size:46px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(245,243,240,0.78);text-decoration:line-through;text-decoration-color:#ff6b6b;text-decoration-thickness:6px;`,
  `font-weight:' + (isQuote ? 700 : 900) + ';letter-spacing:' + (big || isPrice ? '-6px' : '-3px') + ';line-height:' + (isQuote ? 1.35 : 1.05)`,
  `font-style:italic;font-size:50px;line-height:1.4;color:' + p.sub + ';margin-top:36px;`,
  `margin-top:52px;align-self:' + (s.fullBleed || tt ? 'center' : 'flex-start')`,
  `'linear-gradient(135deg,#ff6b6b,#ff5252)') + ';color:' + (s.mode === 'coral' ? '#fff' : '#0a0e27')`,
  `font-size:30px;font-weight:700;letter-spacing:3px;text-transform:uppercase;padding:28px 48px;border-radius:12px;">GET TICKETS`,
  `bottom:' + (tt ? 0 : story ? 320 : 0) + 'px;left:0;right:0;border-top:3px solid ' + p.divider + ';padding:28px 52px;`,
  `font-weight:900;font-size:38px;"><span style="color:' + p.spark + ';">Spark</span><span style="color:' + p.date + ';">Date</span>`,
  `<span style="font-size:24px;letter-spacing:3px;text-transform:uppercase;color:' + p.site + ';">SPARKDATE.DATE`,
  `new XMLSerializer().serializeToString(clone)`,
];

/** The look, in the template's own values, plus the published slides to match. */
function lookBlock(D, assetRoot) {
  const ref = (f) => '`' + path.join(assetRoot, 'public', 'social', f) + '`';
  const feed = `${D.feed.width}×${D.feed.height}`;
  const tall = `${D.story.width}×${D.story.height}`;
  const L = [];
  const P = (s = '') => L.push(s);

  P('## The look — match the published Loxleys slides exactly');
  P('');
  P('This is a live visual system, not a new direction. Attach the reference slides');
  P('listed at the end of this section and match them: every value here is taken from');
  P('the template that rendered them. Take all copy, dates and prices from the posts');
  P('below, never from a reference image.');
  P('');
  P(`**Canvas.** Feed **${feed}**. Story, Reel cover and TikTok **${tall}**. The background`);
  P('is always a 135° navy gradient:');
  P('');
  P('| Slide type | Gradient | Label colour |');
  P('|---|---|---|');
  P('| Statement | `#0a0e27 → #1a1f3a` | coral `#ff6b6b` |');
  P('| Statement (lighter navy) | `#1a1f3a → #2a2f4a` | coral `#ff6b6b` |');
  P('| Pull quote | `#0a0e27 → #141833` | gold `#d4af37` |');
  P('| Closing | `#0a0e27 → #1a1f3a` | cream `#f5f3f0` |');
  P('');
  P('**The closing slide is navy.** Coral appears on it only as the GET TICKETS button.');
  P('');
  P('**On every slide**');
  P('');
  P('- **Label row**, 44px from the top edge and 52px in from each side: the event name');
  P('  in UPPERCASE, 27px, bold, 4.5px letter-spacing, in the label colour above.');
  P('  Carousels put the slide counter (`2/5`) top-right in the same size at weight 600,');
  P('  `rgba(245,243,240,0.35)`. Single images have no counter.');
  P('- **Footer** on the bottom edge: a full-width 3px rule in `rgba(255,107,107,0.15)`,');
  P('  then 28px top and bottom, 52px side padding. Bottom-left, the wordmark');
  P('  **SparkDate** in Playfair Display 900 at 38px, "Spark" coral and "Date" white.');
  P('  Bottom-right, `SPARKDATE.DATE` at 24px, 3px letter-spacing, `rgba(245,243,240,0.4)`.');
  P('- **Labels are a plain serif, Times New Roman: not Inter, not Playfair.** That covers');
  P('  the label row, the counter, `SPARKDATE.DATE`, the button and the struck-through');
  P('  lines. It is what every published slide shows.');
  P('');
  P('**The copy block** is centred vertically and left-aligned, padded 132px top, 76px');
  P('sides, 126px bottom.');
  P('');
  P('- **Headline:** Playfair Display 900, white, −3px letter-spacing, line-height 1.05,');
  P('  **104px**, dropping to **82px** once the headline runs past 26 characters.');
  P('- **Second headline line** (the venue on a fact slide): same size, coral `#ff6b6b`.');
  P('- **Subline:** Playfair Display italic, 50px, line-height 1.4, `rgba(245,243,240,0.75)`,');
  P('  36px below the headline.');
  P('- **Pull quote:** Playfair Display 700, 62px, cream `#f5f3f0`, line-height 1.35, curly');
  P('  quotes. The attribution sits beneath in the subline style at `rgba(245,243,240,0.6)`.');
  P('- **Struck-through lines:** UPPERCASE, 46px, weight 600, 3px letter-spacing,');
  P('  `rgba(245,243,240,0.78)`, each crossed by a 6px coral line, 18px apart.');
  P('- **GET TICKETS button:** 52px below the copy, 135° gradient `#ff6b6b → #ff5252`, navy');
  P('  `#0a0e27` text at 30px, bold, 3px letter-spacing, padding 28px 48px, 12px radius.');
  P('');
  P(`**Story and Reel cover (${tall}, filename ends \`_story\`):** the same slide, with the label`);
  P('row 274px from the top, the footer 320px above the bottom edge, and the copy block');
  P('padded 250px top, 72px sides, 320px bottom. Instagram draws over those bands.');
  P('');
  P(`**TikTok twin (${tall}, filename ends \`_tt\`):** the label row sits 150px from the top`);
  P('and stops 250px short of the right edge; the footer stays on the bottom edge. The');
  P('copy block and button are **centred**, inside padding of 190px top, 250px right,');
  P("380px bottom, 170px left. TikTok's action rail covers the right 250px and its caption");
  P('the bottom 380px, so nothing readable goes there.');
  P('');
  P('Export **PNG**, sRGB, named exactly as each slide lists.');
  P('');
  P('### Reference slides to attach');
  P('');
  P('| Attach | What it shows |');
  P('|---|---|');
  P(`| ${ref('LX-17_1of5.jpg')} | Statement |`);
  P(`| ${ref('LX-18_1of6.jpg')} | Struck-through lines |`);
  P(`| ${ref('LX-17_4of5.jpg')} | Fact slide: date, venue in coral, doors and price |`);
  P(`| ${ref('LX-20_2of3.jpg')} | Pull quote |`);
  P(`| ${ref('LX-17_5of5.jpg')} | Closing, with the GET TICKETS button |`);
  P(`| ${ref('LX-25.jpg')} | Single image, no counter |`);
  P(`| ${ref('LX-17_4of5_tt.jpg')} | TikTok twin |`);
  P('');
  return L;
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
      elevated: 'Statement (lighter navy)',
      coral: 'Coral panel',
      quote: 'Pull quote',
      stat: 'Big number (gold)',
      crossed: 'Struck-through lines',
      price: 'Price change (old price struck through)',
      endcard: 'Closing',
      photo: 'Photo background',
    }[s.mode] || s.mode;

    if (s.crossed) return { style, lines: s.crossed, head: '', head2: '', sub: '', note: '' };
    if (s.mode === 'quote') {
      return { style, head: s.line1, head2: '', sub: s.sub ? `— ${s.sub}` : '', note: '' };
    }
    const notes = [];
    if (s.cta) notes.push('GET TICKETS button below the copy.');
    if (s.mode === 'stat') notes.push('Number in gold #d4af37 at 300px.');
    return { style, head: s.line1 || '', head2: s.line2 || '', sub: s.sub || '', note: notes.join(' ') };
  });
}

/**
 * The files one slide has to come back as. The names are the ones
 * prep-social-assets.py discovers and suffixes: `_story` for Instagram's
 * 1080x1920 frame, `_tt` for TikTok's own 1080x1920 layout.
 */
function filesFor(row, k, n, D) {
  const base = n === 1 ? row.row_id : `${row.row_id}_${k + 1}of${n}`;
  const tall = `${D.story.width}×${D.story.height}`;
  // "Single image + Story" is one message in two shapes: a feed image for
  // Facebook and a story for Instagram. The planner marks both frames as
  // stories, and a post with no feed-shaped file is refused on Facebook.
  const pair = /single image \+ story/i.test(row.format || '');
  const story = pair ? k > 0 : /story|reel/i.test(row.format || '');
  const out = [story
    ? { name: `${base}_story.png`, size: `${tall}, Story layout` }
    : { name: `${base}.png`, size: `${D.feed.width}×${D.feed.height}` }];
  const platforms = String(row.platforms || '').split(',').map((p) => p.trim());
  if (platforms.includes('tiktok')) out.push({ name: `${base}_tt.png`, size: `${tall}, TikTok layout` });
  return out;
}

function buildBrief(brand, rows, keys, opts = {}) {
  const assetRoot = opts.assetRoot || REPO;
  const evs = keys.map((k) => ({ key: k, ...brand.events[k] }));
  const build = rows
    .filter((r) => Q.isSchedulable(r) && !r.asset_files && Q.rowEvents(r).some((k) => keys.includes(k)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const held = build.filter(isPhotoRow);

  const D = brand.asset_rules.dimensions;
  const plans = build.map((row) => {
    const ev = brand.events[Q.rowEvents(row)[0]] || {};
    const slides = slidesFor(row, ev, brand);
    return { row, ev, slides, files: slides.map((_, k) => filesFor(row, k, slides.length, D)) };
  });
  const totalSlides = plans.reduce((a, p) => a + p.slides.length, 0);
  const totalFiles = plans.reduce((a, p) => a + p.files.reduce((b, f) => b + f.length, 0), 0);

  const O = [];
  const P = (s = '') => O.push(s);

  // ---- the ask, first, before any reference ----
  P(`# ${evs.map((e) => e.name).join(' + ')} — 30-day content calendar`);
  P('');
  P(`**${build.length} posts · ${totalSlides} slides · ${totalFiles} files to export**`);
  P('');
  P('Every slide below has its finished text. Set it in the look described next, export');
  P('the PNGs, and name each file exactly as listed. Do not rewrite the copy, do not ask');
  P('which to start with, do not stop after the first post. Work straight down the list');
  P(`and produce all ${totalFiles} files.`);
  P('');
  P('If you can only manage part of it in one go, finish whole posts and tell me the');
  P('last row id you completed. I will paste "continue from <id>" and you carry on.');
  P('');
  for (const line of lookBlock(D, assetRoot)) P(line);
  P('---');
  P('');

  // ---- the work ----
  plans.forEach(({ row, ev, slides, files }, i) => {
    P(`## ${i + 1}. \`${row.row_id}\` — ${ev.name} — ${prettyDate(row.date)}`);
    P('');
    if (isPhotoRow(row)) {
      P(`${row.format}`);
      P('');
      P('> 📷 **Shot at the event — nothing to design.** Listed so the calendar is complete.');
      P('');
    } else {
      const count = files.reduce((a, f) => a + f.length, 0);
      P(`${slides.length} slide${slides.length > 1 ? 's' : ''} · ${count} file${count > 1 ? 's' : ''}${/reel/i.test(row.format) ? ' · Reel cover frame (video shot separately)' : ''}`);
      P('');
      P('### Slides to build');
      P('');
    }
    slides.forEach((s, k) => {
      P(`**Slide ${k + 1} of ${slides.length} — ${s.style}**`);
      if (s.lines) P(`- Lines: ${s.lines.map((l) => `**${l}**`).join(' / ')}`);
      if (s.head) P(`- Headline: **${s.head}**`);
      if (s.head2) P(`- Second line (coral): **${s.head2}**`);
      if (s.sub) P(`- Subline: ${s.sub}`);
      if (s.note) P(`- ${s.note}`);
      P(`- Export: ${files[k].map((f) => `\`${f.name}\` (${f.size})`).join(' · ')}`);
      P('');
    });

    // Everything needed to POST it, in the same block as the slides -- so this
    // one file is both the design spec and the posting calendar. Splitting
    // them is how a slide ends up promoting the wrong event.
    P('### To post it');
    P('');
    P(`- **Event:** ${ev.name} · ${ev.venue} · ${ev.city}`);
    P(`- **Event ID:** \`${ev.event_id || '—'}\``);
    P(`- **When:** ${prettyDate(row.date)} at ${row.time} · ${row.platforms.replace(/ig_story/g, 'IG Story').replace(/ig/g, 'Instagram').replace(/fb/g, 'Facebook').replace(/tiktok/g, 'TikTok').replace(/,/g, ' + ')}`);
    const closer = slides.length ? slides[slides.length - 1] : null;
    P(`- **CTA:** ${closer && closer.style === 'Closing' ? closer.head + ' — Link in bio' : 'Link in bio'}`);
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
  });

  if (held.length) {
    P('## Not for you — photography');
    P('');
    P('These are shot at the event, not designed:');
    P('');
    for (const r of held) P(`- \`${r.row_id}\` · ${prettyDate(r.date)} · ${r.format}`);
    P('');
  }

  return { text: O.join('\n'), posts: build.length, slides: totalSlides, files: totalFiles, held: held.length };
}

function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));

  const keys = String(arg('events', '')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!keys.length) { console.error('Specify --events=LX,MC'); process.exit(2); }
  for (const k of keys) if (!brand.events[k]) { console.error(`Unknown event: ${k}`); process.exit(2); }

  const brief = buildBrief(brand, rows, keys, { assetRoot: arg('asset-root', REPO) });
  const dest = arg('out');
  if (dest) {
    fs.writeFileSync(dest, brief.text, 'utf8');
    console.log(`wrote ${dest} — ${brief.posts} posts, ${brief.slides} slides, ${brief.files} files, ${brief.held} held`);
  } else console.log(brief.text);
}

if (require.main === module) main();
module.exports = { slidesFor, buildBrief, TEMPLATE_FACTS };
