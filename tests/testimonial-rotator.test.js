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
function run(src, { reduceMotion = false, steps = 4000 } = {}) {
  const sel = selectors(src);
  const nodes = {};
  const node = (key) =>
    (nodes[key] ||= {
      textContent: '',
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
    next.fn();
    states.push(snapshot());
  }
  return { states, quotes: quotesIn(src), elapsed: now };
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

    it('stops the caret blinking under prefers-reduced-motion', () => {
      expect(read(file)).toMatch(
        /@media \(prefers-reduced-motion: reduce\) \{\s*[^}]*\.typing[^{]*::after \{ animation: none; \}/,
      );
    });
  });
});
