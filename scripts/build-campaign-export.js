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
    // Never sentence-split a quotation. MC-08's testimonial runs past 110
    // characters, so the generic split cut it mid-sentence and left the
    // opening quotation mark orphaned on its own frame.
    if (/^["“]/.test(p.trim())) { out.push(p); continue; }
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
 * Turn one chunk of caption into a headline plus (optionally) a subline.
 *
 * The template sets BOTH line1 and line2 in Playfair 900 at 82-104px. Feeding
 * a long sentence into them produced two enormous lines of body prose -- 15 of
 * 90 frames ran over 60 characters, and a 152-character one filled the canvas
 * edge to edge. A headline has to be short enough to read at a glance while
 * someone is scrolling; the rest belongs in `sub`, which renders as small
 * italic serif.
 *
 * So: cut at the first strong boundary inside the first ~46 characters, and
 * demote everything after it. Boundaries in order of preference -- sentence
 * end, em dash, colon, then comma -- because that is roughly the order in
 * which a break reads as deliberate rather than accidental.
 */
function headlineAndSub(text) {
  const clean = (x) => String(x || '').trim().replace(/[\s·,;:-]+$/, '').trim();
  const t = clean(text);
  if (!t) return { line1: '', line2: '', sub: '' };

  // Short enough to stand alone: split across the two display lines only if it
  // needs a second, which keeps "Three days." and "Last call" as-is.
  if (t.length <= 46) return { line1: t, line2: '', sub: '' };

  const boundaries = [/([.!?])\s+/g, /\s+[—-]\s+/g, /:\s+/g, /,\s+/g];
  for (const re of boundaries) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const cut = m.index + (m[1] ? 1 : 0);
      const head = clean(t.slice(0, cut));
      // A hook wants roughly four to eight words. Below ~14 chars it is a
      // fragment, above ~52 it stops being a headline.
      if (head.length >= 14 && head.length <= 52) {
        return { line1: head, line2: '', sub: clean(t.slice(m.index + m[0].length)) };
      }
    }
  }

  // No usable boundary -- break on a word near 46 and demote the tail.
  const words = t.split(' ');
  let a = '';
  for (const w of words) {
    if ((a + ' ' + w).trim().length > 46) break;
    a = (a + ' ' + w).trim();
  }
  if (!a) a = t.slice(0, 46);
  return { line1: clean(a), line2: '', sub: clean(t.slice(a.length)) };
}

/** Back-compat shim: some call sites still want a pure two-line split. */
function twoLines(text) {
  const r = headlineAndSub(text);
  return { line1: r.line1, line2: r.line2 };
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


/**
 * Pick a frame mode from what the copy actually IS, not just its position.
 *
 * `stat`, `quote` and `crossed` all exist in the template and none were ever
 * emitted -- so the approved attendance figure (gold, 300px) and the Quang
 * testimonial (gold eyebrow, italic serif) were being set as ordinary
 * statement frames. Both facts already live in brand.json; this only routes
 * them to the mode built for them.
 */
function pickMode(text, fallback) {
  const t = String(text || '').trim();

  // A testimonial STARTS with a quotation mark. Scare-quotes mid-sentence are
  // not testimonials -- LX-18 ("sorry, crazy week") and LX-23 ("next time")
  // both contain quotes and neither is one, and a looser test caught both.
  if (/^["\u201c]/.test(t)) return 'quote';

  // The differentiation beat: three or more "No ..." clauses in a row. The
  // template strikes these through in coral, which is the brand's sharpest
  // visual device and was never being generated.
  if ((t.match(/\bNo /g) || []).length >= 3) return 'crossed';

  // The one sanctioned proof number, used AS a proof point. The window is
  // tight and demands a headcount word immediately after, because every
  // Loxley's caption also contains "September 22".
  if (/\b22 (people|attendees)\b/i.test(t)) return 'stat';

  return fallback;
}

/**
 * Build the content fields for a frame. Two modes do not take line1/line2 the
 * way the others do:
 *
 *   quote   — must not break mid-sentence. The generic 46-character split cut
 *             the Quang testimonial in half and orphaned its opening quotation
 *             mark. Break at the closing quote instead; the attribution drops
 *             to `sub`.
 *   crossed — takes an ARRAY, which the template renders as struck-through
 *             uppercase lines. Passing line1/line2 renders nothing at all.
 */
function contentSpec(text, mode) {
  const t = String(text || '').trim();

  if (mode === 'quote') {
    const m = t.match(/^([“"][^”"]*[”"])\s*[—–-]?\s*(.*)$/);
    if (m) return { line1: m[1].trim(), line2: '', sub: m[2].trim(), pullQuote: true };
    return { ...headlineAndSub(t), pullQuote: true };
  }

  if (mode === 'crossed') {
    // "No profiles. No swiping. No 'sorry, crazy week' texts." -> three lines.
    const items = t.split(/(?<=\.)\s+/).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean);
    if (items.length >= 2) return { crossed: items.slice(0, 4), line1: '', line2: '' };
    return headlineAndSub(t);
  }

  return headlineAndSub(t);
}

/**
 * Pick `count` testimonials for a row, deterministically.
 *
 * A testimonial post is a 3-slide carousel, and until six quotes existed it
 * ran ONE quote split across three frames -- the same words twice, which is
 * the opposite of social proof. Different people on each slide is what that
 * beat is for.
 *
 * Seeded off the row id so the same post always renders the same set (no
 * churn between builds), but MC-08 and LX-20 do not show an identical wall.
 * Shortest-first, because a quote frame reads at a glance and "Cool
 * Atmosphere!" lands harder at 62px than a 118-character sentence.
 */
function pickTestimonials(brand, rowId, count) {
  const all = (brand.universal.approved_testimonials || []).slice();
  if (!all.length) return [];
  let seed = 0;
  for (const ch of String(rowId)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;

  // Alternate substantial and punchy rather than taking consecutive entries.
  // A straight rotation handed MC-08 the two shortest quotes -- "Cool
  // Atmosphere!" and "A night to remember!" -- which is a thin wall, while
  // LX-20 got the two longest and both rendered small. One of each reads
  // better and gives the frame a reason to be two frames.
  const byLength = all.slice().sort((a, b) => b.quote.length - a.quote.length);
  const long = byLength.slice(0, Math.ceil(byLength.length / 2));
  const short = byLength.slice(Math.ceil(byLength.length / 2));

  const out = [];
  for (let i = 0; i < count; i++) {
    const pool = i % 2 === 0 ? long : short;
    if (!pool.length) break;
    out.push(pool[(seed + i) % pool.length]);
  }
  // Never repeat a person inside one post.
  const seen = new Set();
  return out.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
}

/** Turn one queue row into the frame objects the renderer expects. */
function framesForRow(row, ev, brand) {
  const n = slideCount(row.format);
  const u = units(row.caption);
  const story = /story|reel/i.test(row.format);

  // The eyebrow names the event the COPY is about, which is not always the
  // sheet it appears in. GG-07 recaps Good Good Things and forward-promotes
  // Loxley's, so it lands in both sheets -- and in the Loxley's sheet it was
  // captioned "Last night at Good Good Things" under a LOXLEYS eyebrow. Same
  // for MC-15. Use the row's own primary event.
  //
  // The FACT frame deliberately keeps the sheet's event: a recap points at
  // whatever is still on sale, which is the point of running it.
  const primary = brand.events[Q.rowEvents(row)[0]] || ev;
  const eyebrow = primary.name || ev.name || row.row_id;
  const label = `${prettyDate(row.date)} — ${row.row_id}`;
  const out = [];

  // If a frame ever carries an image it MUST be photo mode -- every other
  // palette sets line2 coral, and the scrim is only 45% navy where the
  // headline sits. Silent until you look at the exported PNG.
  const push = (mode, s) => out.push({
    group: 'organic',
    id: row.row_id.toLowerCase(),
    label,
    n: out.length + 1,
    of: n,
    s: { mode: s.img ? 'photo' : mode, eyebrow, story: story || undefined, ...s },
  });

  if (n === 1) {
    const m0 = pickMode(u[0], 'page');
    const h = contentSpec(u[0], m0);
    push(m0, { ...h, sub: h.sub || u[1] || '' });
    return out;
  }

  // A testimonial post becomes a wall of DIFFERENT people, not one quote cut
  // into pieces. Detected off the first chunk, which is where the quote sits.
  if (pickMode(u[0], 'page') === 'quote') {
    const picks = pickTestimonials(brand, row.row_id, n - 1);
    for (const t of picks) {
      push('quote', {
        line1: `“${t.quote}”`,
        line2: '',
        sub: t.attribution,
        pullQuote: true,
      });
    }
    // Pad if there are fewer testimonials than slides, so the count still
    // matches the format the queue promises.
    while (out.length < n - 1) push('elevated', headlineAndSub(u[1] || ev.name || ''));
    push('endcard', { ...headlineAndSub(`${prettyDate(ev.date)} · ${ev.venue || ''}`), cta: 'Get tickets' });
    return out;
  }

  // 1: the hook.
  { const m0 = pickMode(u[0], 'page'); push(m0, contentSpec(u[0], m0)); }

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
      const mi = pickMode(u[i] || '', i % 2 ? 'elevated' : 'page');
      push(mi, contentSpec(u[i] || '', mi));
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
  push('endcard', { ...headlineAndSub(closing), cta: 'Get tickets' });

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
