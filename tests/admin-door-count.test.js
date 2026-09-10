// tests/admin-door-count.test.js
//
// Attendance on the admin dashboard. `mixCell()` has rendered "door N · %show"
// since #324 and NO EVENT HAS EVER CARRIED A doorCount, so that branch has been
// dead for the life of the field (see Evidence §4 of
// reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md). The show rate — the
// number that decides whether to oversell 30 seats — had therefore never been
// measured once.
//
// Two things close that: a door-count box at the end of the run-of-show screen,
// which is the only moment the number exists, and a Show rate card on the
// Retention tab beside the check-in coverage strip.
//
// The failure this file exists to prevent is the SILENT one. An uncounted night
// summed as 0 does not throw, does not blank a card and does not look wrong: it
// just quietly drags the rate down and reports a no-show crisis that never
// happened. Digital check-in reached 91 of 140 past confirmed registrations and
// is a floor, not attendance (memory: checkin-counts-undercount-attendance), so
// a metric built the naive way would be wrong in exactly that direction.
//
// `showRateFrom()` is lifted out of the shipped page and run, the same
// technique tests/admin-kpis.test.js uses on ticketKpis().

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift a top-level declaration by INDENTATION, not brace-matching — every
// top-level function in this script sits at eight spaces and closes on a line
// that is exactly eight spaces and a brace. A brace scanner dies on safe()'s
// /"/g, a regex literal holding a double quote.
function lift(name) {
  const decl = new RegExp(`^ {8}function ${name}\\s*\\(`, 'm');
  const m = decl.exec(SRC);
  if (!m) throw new Error(`${name} not found in admin.html`);
  const rest = SRC.slice(m.index);
  const firstLine = rest.slice(0, rest.indexOf('\n'));
  const close = /^ {8}\};?$/m.exec(rest.slice(firstLine.length + 1));
  if (!close) throw new Error(`${name} never closes`);
  return rest.slice(0, firstLine.length + 1 + close.index + close[0].length);
}

const sandbox = { console };
vm.runInNewContext(lift('showRateFrom'), sandbox);
const { showRateFrom } = sandbox;

/** Registrations as loadAdminEvents holds them: already status==='confirmed'. */
const regs = (spec) =>
  Object.entries(spec).flatMap(([eventId, n]) =>
    Array.from({ length: n }, (_, i) => ({ eventId, email: `p${i}@${eventId}.test` })));

describe('showRateFrom — an uncounted night is not a 0% night', () => {
  it('returns rate null, not 0, when no past event has a door count', () => {
    const out = showRateFrom(
      new Set(['e1', 'e2']),
      { e1: { doorCount: null }, e2: {} },        // never typed, and never written
      regs({ e1: 26, e2: 30 }));

    expect(out.rate).toBeNull();
    expect(out.rate).not.toBe(0);
    expect(out.events).toBe(0);
    // The denominator must be untouched too — a "0 of 56" reads as a crisis.
    expect(out.regs).toBe(0);
    expect(out.door).toBe(0);
  });

  it('undefined, null and empty string all mean "not counted"', () => {
    for (const dc of [null, undefined, '']) {
      const out = showRateFrom(new Set(['e1']), { e1: { doorCount: dc } }, regs({ e1: 10 }));
      expect(out.rate, `doorCount: ${JSON.stringify(dc)}`).toBeNull();
      expect(out.events).toBe(0);
    }
  });

  it('a real zero IS counted — nobody came is an answer', () => {
    const out = showRateFrom(new Set(['e1']), { e1: { doorCount: 0 } }, regs({ e1: 12 }));
    expect(out.events).toBe(1);
    expect(out.regs).toBe(12);
    expect(out.rate).toBe(0);
  });

  it('a garbage door count is ignored rather than coerced', () => {
    const out = showRateFrom(new Set(['e1']), { e1: { doorCount: 'lots' } }, regs({ e1: 10 }));
    expect(out.rate).toBeNull();
    expect(out.events).toBe(0);
  });
});

describe('showRateFrom — only counted events enter either side', () => {
  it('an uncounted event contributes to NEITHER numerator nor denominator', () => {
    // e1 counted: 24 through the door against 26 confirmed. e2 uncounted, and
    // three times the size. Folding e2 in as 0 would report 24/116 = 21%.
    const out = showRateFrom(
      new Set(['e1', 'e2']),
      { e1: { doorCount: 24 }, e2: { doorCount: null } },
      regs({ e1: 26, e2: 90 }));

    expect(out.events).toBe(1);
    expect(out.door).toBe(24);
    expect(out.regs).toBe(26);
    expect(out.rate).toBe(92);
    expect(out.rate).not.toBe(21);
  });

  it('pools across counted events rather than averaging their percentages', () => {
    // 24/26 and 8/20. Pooled: 32/46 = 70%. Averaging the two rates gives 66%,
    // which lets a tiny event outvote a full one.
    const out = showRateFrom(
      new Set(['e1', 'e2']),
      { e1: { doorCount: 24 }, e2: { doorCount: 8 } },
      regs({ e1: 26, e2: 20 }));

    expect(out.events).toBe(2);
    expect(out.rate).toBe(70);
  });

  it('an event with a door count but no registrations yields null, not Infinity', () => {
    const out = showRateFrom(new Set(['e1']), { e1: { doorCount: 5 } }, []);
    expect(out.events).toBe(1);
    expect(out.regs).toBe(0);
    expect(out.rate).toBeNull();
  });

  it('upcoming events are the caller\'s problem — it only walks the ids it is given', () => {
    const out = showRateFrom(
      new Set(['past']),
      { past: { doorCount: 20 }, future: { doorCount: 999 } },
      regs({ past: 25, future: 30 }));

    expect(out.door).toBe(20);
    expect(out.regs).toBe(25);
  });

  it('a door count above the registration count is reported, not clamped', () => {
    // Event 1 recorded 31 real heads against 26 registered — walk-ins and
    // plus-ones are real. A rate over 100% is information, not an error.
    const out = showRateFrom(new Set(['e1']), { e1: { doorCount: 31 } }, regs({ e1: 26 }));
    expect(out.rate).toBe(119);
  });
});

describe('the door count can actually be entered and written', () => {
  it('the run-of-show screen renders a door box, and only for a past event', () => {
    expect(SRC).toContain('id="runDoorInput"');
    // Gated on the event date having passed — a box asking how many showed up
    // is noise on an event that has not happened.
    expect(SRC).toMatch(/const runIsPast\s*=/);
    expect(SRC).toMatch(/const doorPanel\s*=\s*!runIsPast\s*\?\s*''/);
  });

  it('blank is written as null, so "not counted" survives the round trip', () => {
    const body = (() => {
      const i = SRC.indexOf('        window.runSaveDoorCount = async () => {');
      expect(i, 'runSaveDoorCount missing from admin.html').toBeGreaterThan(-1);
      const close = /^ {8}\};$/m.exec(SRC.slice(i));
      return SRC.slice(i, i + close.index + close[0].length);
    })();

    expect(body).toMatch(/raw === ''[^\n]*\?\s*null/);
    expect(body).toContain("updateDoc(doc(db, 'events', _chemEventId), { doorCount: val })");
    // The Costs row on the Events tab writes the same field the same way; the
    // two must not disagree about what a blank box means.
    expect(SRC).toContain("patch.doorCount = dcRaw === '' || dcRaw == null ? null");
  });

  it('the Retention tab feeds the card from showRateFrom, not its own arithmetic', () => {
    expect(SRC).toContain('showRateFrom(pastEventIds, evById, allRegistrations)');
    expect(SRC).toContain('sold, retention, repeat, showRate,');
    expect(SRC).toContain('not counted');
  });
});
