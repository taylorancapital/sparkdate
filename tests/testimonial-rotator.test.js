// tests/testimonial-rotator.test.js
//
// A quote caught mid-animation must never be readable as a quote that was cut
// off. That single sentence has now been got wrong, fixed, and got wrong again
// across three commits:
//
//   #161  gave the CTA quote boxes a typewriter that set the attribution
//         BEFORE typing, next to a CSS closing quote mark that was always
//         present — so a half-typed quote arrived fully punctuated and signed.
//   #316  diagnosed exactly that for the new proof bar and held the name back
//         there, but left the six older copies on the old pattern.
//   #337  concluded the typewriter itself was the problem and replaced it with
//         a crossfade in all six.
//
// The typewriter was never the problem; the punctuation was. Text that stops
// mid-sentence with a cursor after it reads as text still being written. The
// identical text with a closing quote mark and a name after it reads as text
// that was truncated. So the rotators type again, and these are the rules that
// make that safe — pinned here rather than in a comment, because a comment is
// what failed the last three times:
//
//   1. An incomplete quote never carries an attribution.
//   2. An incomplete quote is always marked .typing, which is what puts the
//      caret on screen (the CSS half is asserted at the bottom of this file).
//   3. A finished, signed quote is never marked .typing.
//
// There is no shared bundle (standalone static pages, no bundler), so the
// rotator is duplicated across the pages that carry a quote box. These tests
// read the SHIPPED code out of each page rather than a copy kept here, so a
// seventh copy is covered the day it is added.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const PUBLIC = path.join(process.cwd(), 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const htmlFiles = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));

// Lifting a rotator means lifting the WHOLE IIFE, not a slice of it: two
// shapes ship on the site, and the proof bar's wraps its body in a start()
// that waits for DOMContentLoaded. Cutting at a fixed end marker leaves that
// one brace-unbalanced. So find the IIFE the declaration sits in, and
// brace-match to its end — skipping strings and comments, since a `{` inside
// either is not depth.
function iifeAround(src, at) {
  const open = src.lastIndexOf('(function () {', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = src.indexOf('{', open); i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      // Skip the string. None of these span a line, so a stray quote in a
      // comment cannot run away to the end of the file.
      const end = src.indexOf('\n', i);
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      if (i > end && end !== -1) i = end;
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      return src.slice(open, src.indexOf(';', i) + 1);
    }
  }
  return null;
}

/** Every rotator on the site, as {file, index, src}. */
const rotators = htmlFiles.flatMap((file) => {
  const src = read(file);
  const out = [];
  for (const m of src.matchAll(/var TESTIMONIALS = \[/g)) {
    const iife = iifeAround(src, m.index);
    if (iife) out.push({ file, index: out.length, src: iife });
  }
  return out;
});

/** The three elements a rotator drives, read out of its own source. */
function selectors(src) {
  const one = (re) => (src.match(re) || [])[1];
  return {
    text: one(/var textEl = document\.getElementById\('([^']+)'\)/),
    who: one(/var whoEl = document\.getElementById\('([^']+)'\)/),
    box: one(/var boxEl = document\.(?:getElementById|querySelector)\('([^']+)'\)/),
  };
}

/**
 * Runs a rotator against a DOM stub and a clock we control, stepping the clock
 * one queued callback at a time and handing every intermediate state to
 * `check`. Real timers are useless here: the browser throttles a background
 * tab's setTimeout to ~1s, so a wall-clock run samples a handful of frames and
 * proves nothing about the frames it missed. This visits every frame.
 */
function run(src, { reduceMotion = false, steps = 4000, hiddenTicks = 0, zeroWidthTicks = 0 } = {}) {
  const sel = selectors(src);
  const nodes = {};
  // Two ways a box is present but unmeasurable, both hit for real on
  // 2026-09-03. `hiddenTicks` gives it no layout at all for the first N
  // queued callbacks -- two of the six rotators live inside a checkout modal
  // that is closed when the page loads. `zeroWidthTicks` gives it height but
  // no width, where every quote wraps to one character a line.
  let ticks = 0;

  // A fake layout engine: CHARS_PER_LINE characters wrap to a line, each
  // LINE_PX tall. Crude, but enough to tell a reservation that measured every
  // quote from one that measured only the first, or none -- which is the
  // difference the tests below are actually about.
  const CHARS_PER_LINE = 40;
  const LINE_PX = 20;
  const BOX_W = CHARS_PER_LINE * 8;
  const rect = (key) => {
    // Hidden: no layout at all, the way a display:none ancestor reports.
    if (ticks < hiddenTicks) return { width: 0, height: 0 };
    // Laid out but zero-width: every quote wraps to one character a line, so
    // the box has plenty of height and the measurement is still worthless.
    if (ticks < zeroWidthTicks) {
      const chars = (key === sel.box ? node(sel.text).textContent : node(key).textContent).length;
      return { width: 0, height: Math.max(1, chars) * LINE_PX };
    }
    // Two of the six pages reserve on the BOX rather than on the paragraph:
    // their quote is typed into a <span>, and min-height does not apply to an
    // inline element. So the box is modelled as wrapping the text and the
    // attribution, which is what those pages measure.
    const content =
      key === sel.box
        ? node(sel.text).textContent + node(sel.who).textContent
        : node(key).textContent;
    return {
      width: BOX_W,
      height: Math.max(1, Math.ceil(content.length / CHARS_PER_LINE)) * LINE_PX,
    };
  };

  const node = (key) =>
    (nodes[key] ||= {
      textContent: '',
      style: {},
      getBoundingClientRect: () => rect(key),
      classes: new Set(),
      classList: {
        add(c) { nodes[key].classes.add(c); },
        remove(c) { nodes[key].classes.delete(c); },
        contains(c) { return nodes[key].classes.has(c); },
      },
    });

  let now = 0;
  let seq = 0;
  const queue = [];
  const listeners = [];
  const sandbox = {
    document: {
      getElementById: (id) => node(id),
      querySelector: (s) => node(s),
      // 'complete', so a rotator that defers to DOMContentLoaded takes the
      // else-branch and starts immediately. The listener path is kept
      // working anyway, in case a copy ever registers unconditionally.
      readyState: 'complete',
      addEventListener: (_e, fn) => listeners.push(fn),
    },
    window: { matchMedia: () => ({ matches: reduceMotion }) },
    setTimeout: (fn, ms) => queue.push({ at: now + (ms || 0), seq: seq++, fn }),
  };
  sandbox.window.setTimeout = sandbox.setTimeout;

  const states = [];
  const snapshot = () => ({
    text: node(sel.text).textContent,
    who: node(sel.who).textContent,
    typing: node(sel.box).classList.contains('typing'),
  });

  vm.runInNewContext(src, sandbox);
  listeners.forEach((fn) => fn());
  states.push(snapshot());

  for (let i = 0; i < steps && queue.length; i++) {
    queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const next = queue.shift();
    now = next.at;
    ticks++;
    next.fn();
    states.push(snapshot());
  }
  // The reservation lands on whichever element that page sizes -- the
  // paragraph on four of them, the box on the two whose quote is a <span>.
  const reserved = Math.max(
    parseFloat(node(sel.text).style.minHeight) || 0,
    parseFloat(node(sel.box).style.minHeight) || 0,
  );
  return { states, quotes: quotesIn(src), elapsed: now, reserved, LINE_PX, CHARS_PER_LINE };
}

/** The quote strings a rotator was given. */
function quotesIn(src) {
  return [...src.matchAll(/\{ q: "((?:[^"\\]|\\.)*)", who: "([^"]+)" \}/g)].map((m) => ({
    q: m[1].replace(/\\"/g, '"'),
    who: m[2],
  }));
}

describe('testimonial rotators', () => {
  it('finds every copy on the site', () => {
    // Guard on the guard: an empty list passes everything below vacuously.
    expect(rotators.length).toBeGreaterThanOrEqual(6);
  });

  describe.each(rotators.map((r) => [`${r.file} #${r.index}`, r]))('%s', (_label, rot) => {
    it('drives three real elements', () => {
      const sel = selectors(rot.src);
      expect(sel.text).toBeTruthy();
      expect(sel.who).toBeTruthy();
      expect(sel.box).toBeTruthy();
    });

    it('never signs a quote it has not finished typing', () => {
      const { states, quotes } = run(rot.src);
      const complete = new Set(quotes.map((q) => q.q));
      const offenders = states.filter((s) => s.text && !complete.has(s.text) && s.who);
      expect(offenders.slice(0, 3)).toEqual([]);
    });

    it('marks every unfinished quote .typing, so the caret is on screen', () => {
      const { states, quotes } = run(rot.src);
      const complete = new Set(quotes.map((q) => q.q));
      const offenders = states.filter((s) => s.text && !complete.has(s.text) && !s.typing);
      expect(offenders.slice(0, 3)).toEqual([]);
    });

    it('drops .typing once the quote is finished and signed', () => {
      const { states } = run(rot.src);
      const offenders = states.filter((s) => s.who && s.typing);
      expect(offenders.slice(0, 3)).toEqual([]);
    });

    it('actually completes and signs every quote it carries', () => {
      // Without this the three rules above could be satisfied by a rotator
      // that types nothing at all.
      const { states, quotes } = run(rot.src);
      const signed = new Set(states.filter((s) => s.who).map((s) => s.text));
      for (const q of quotes) expect(signed).toContain(q.q);
    });

    it('reserves the height of its TALLEST quote, not its first', () => {
      // Why this is a test and not a CSS constant: the box used to reserve a
      // hand-picked two lines, so anything longer shoved the section at every
      // rotation -- and the fix for THAT was to allow only short quotes,
      // which is why all four quotes on the site were from men. The one
      // approved quote from a woman is the long one. A measured reservation
      // is what lets her be in the rotation at all, so it is pinned here.
      const { reserved, quotes, LINE_PX, CHARS_PER_LINE } = run(rot.src);
      const lines = (s) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));
      const tallest = Math.max(...quotes.map((q) => lines(q.q))) * LINE_PX;
      expect(reserved).toBeGreaterThanOrEqual(tallest);
    });

    it('never writes a reservation it measured while hidden', () => {
      // Found in the browser on 2026-09-03, not by this suite. event.html and
      // events.html put the quote box inside a checkout modal that is
      // display:none at load, so the first measurement returned 0 for every
      // quote -- and an inline min-height:0px OVERRIDES the CSS floor, so
      // those two pages ended up with no reservation at all, worse than the
      // constant they started with. A reservation must come from a box that
      // was actually on screen, and must arrive once it is.
      const { reserved, quotes, LINE_PX, CHARS_PER_LINE } = run(rot.src, { hiddenTicks: 40 });
      const lines = (s) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));
      const tallest = Math.max(...quotes.map((q) => lines(q.q))) * LINE_PX;
      expect(reserved).toBeGreaterThanOrEqual(tallest);
    });

    it('never writes a reservation it measured at zero width', () => {
      // Also found in the browser, and the nastier of the two: a zero-width
      // box still HAS height -- the quote just wraps to one character a line
      // -- so a guard that only checks height sails straight past it and
      // writes a reservation several times too tall. Seen at innerWidth 0.
      const { reserved, quotes, LINE_PX, CHARS_PER_LINE } = run(rot.src, { zeroWidthTicks: 40 });
      const lines = (s) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));
      const tallest = Math.max(...quotes.map((q) => lines(q.q))) * LINE_PX;
      expect(reserved).toBeGreaterThanOrEqual(tallest);
      // The point of the guard: it must not have taken the bogus measurement.
      const bogus = Math.max(...quotes.map((q) => q.q.length)) * LINE_PX;
      expect(reserved).toBeLessThan(bogus);
    });

    it('puts every woman ahead of every man', () => {
      // Taylor's standing instruction, given 2026-09-03 and repeated on
      // 09-04 when he supplied two more. It is the reason the reservation
      // above had to change: the box took short quotes only, the one
      // approved quote from a woman was the long one, so the rotation was
      // four men purely as a side effect of a layout constant.
      //
      // Asserted as an ORDERING, not as "the first one is a woman" -- the
      // weaker version passes a list that reads Molly, Jeff, Helesha, and
      // that is not what was asked for.
      //
      // Sourced from content/brand.json's attributions. Evidence for the
      // genders, since guessing from names is exactly how this goes wrong:
      // Molly is the woman brand.json was built around; Anonymous M. is
      // anonymised BECAUSE she is a specific woman who asked for privacy;
      // Helesha was identified as a woman by another guest in writing.
      // Alex reads ambiguous and is a man -- established 2026-09-04 from a
      // guest email ("i dont even remember who he is"), which is worth
      // keeping written down because the name invites the opposite guess.
      // Quang is a man per reports/AD_LEVER_WOMEN_2026-09-02.md.
      const WOMEN = ['Molly', 'Helesha', 'Anonymous M.'];
      const quotes = quotesIn(rot.src);
      expect(quotes.length).toBeGreaterThan(0);

      // A ninth name nobody has classified must not slip through as a man.
      const KNOWN_MEN = ['Jeff', 'Luke', 'James', 'Alex', 'Quang'];
      const unclassified = quotes
        .map((q) => q.who)
        .filter((w) => !WOMEN.includes(w) && !KNOWN_MEN.includes(w));
      expect(unclassified).toEqual([]);

      const isWoman = quotes.map((q) => WOMEN.includes(q.who));
      const firstMan = isWoman.indexOf(false);
      if (firstMan !== -1) {
        // No woman may appear after the first man.
        expect(isWoman.slice(firstMan).filter(Boolean)).toEqual([]);
      }
      expect(isWoman[0]).toBe(true);
    });

    it('holds a finished quote longer than it spent typing it', () => {
      // The other half of why this read badly before: at 32ms/char against a
      // 3.4s hold, the longest quote spent more of its life half-written than
      // whole. Whatever the constants say, the hold has to win.
      const typeMs = Number((rot.src.match(/TYPE_MS = (\d+)/) || [])[1]);
      const holdMs = Number((rot.src.match(/HOLD_MS = (\d+)/) || [])[1]);
      const longest = Math.max(...quotesIn(rot.src).map((q) => q.q.length));
      expect(holdMs).toBeGreaterThan(longest * typeMs);
    });

    it('shows only whole quotes under prefers-reduced-motion', () => {
      const { states, quotes } = run(rot.src, { reduceMotion: true });
      const complete = new Set(quotes.map((q) => q.q));
      const partial = states.filter((s) => s.text && !complete.has(s.text));
      expect(partial.slice(0, 3)).toEqual([]);
      expect(states.some((s) => s.who)).toBe(true);
    });
  });

  // The CSS half of rule 2. The JS can set .typing faithfully and still render
  // a quote that looks truncated if nothing is drawn in the closing mark's
  // slot — which is the state the page shipped in before this change.
  describe.each([...new Set(rotators.map((r) => r.file))])('%s caret CSS', (file) => {
    it('draws a caret while .typing', () => {
      const css = read(file);
      expect(css).toMatch(/\.typing[^{]*::after\s*\{[^}]*animation:\s*sdCaretBlink/);
      expect(css).toMatch(/@keyframes sdCaretBlink/);
    });

    it('scopes the caret rule to something that can actually match', () => {
      // Five of the six pages shipped this rule as
      //     .box.typing .box p::after
      // -- the box nested inside ITSELF, which matches nothing. So no caret
      // was ever drawn and the closing quote mark stayed on screen through
      // the whole type, which is precisely the "reads as truncated" bug the
      // caret exists to prevent. The assertion above passed anyway, because
      // its [^{]* swallowed the stray descendant without noticing it.
      //
      // So assert on the selector's SHAPE: no class appearing before .typing
      // may appear again after it. Verified against the live pages on
      // 2026-09-03 -- index.html was the only one drawing a caret.
      const css = read(file);
      const m = css.match(/([^{}]*?\.typing[^{}]*?)::after\s*\{[^}]*sdCaretBlink/);
      expect(m).toBeTruthy();
      const sel = m[1].trim();
      const cut = sel.indexOf('.typing');
      const before = sel.slice(0, cut).match(/\.[\w-]+/g) || [];
      const after = sel.slice(cut + '.typing'.length);
      for (const cls of before) expect(after).not.toContain(cls);
    });

    it('stops the caret blinking under prefers-reduced-motion', () => {
      expect(read(file)).toMatch(
        /@media \(prefers-reduced-motion: reduce\) \{\s*[^}]*\.typing[^{]*::after \{ animation: none; \}/,
      );
    });
  });
});
