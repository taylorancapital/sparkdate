// tests/chemistry-persistence.test.js
//
// Two failures that only ever show up at an event, which is the worst place
// to find them and the reason they get their own file.
//
// 1. THE SEATING WAS RECOMPUTED, NOT REMEMBERED. Every render re-solved it,
//    including the run-of-show's 1-second repaint. Harmless while the roster
//    is frozen — the greedy is deterministic — but door check-ins write
//    registrations during the event, and reopening the modal re-reads them.
//    One walk-in re-seeded the greedy and moved everybody, after the host had
//    already read the tables out to the room. Nothing warned anyone.
//
// 2. NOTHING SURVIVED A CLOSE OR A RELOAD. Ticked-off intros were reset on
//    close. The run clock was worse: closing the modal cleared the repaint
//    interval but left the end timestamp set, so reopening showed a frozen
//    "TIME" that never ticked again.
//
// The invariants below are the ones a host would notice being wrong, and
// several of them are about what must NOT happen — nobody already seated
// moves, a pin is not silently rebuilt, a storage failure does not take the
// panel down with it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

function lift(name) {
  const decl = new RegExp(
    `^ {8}(?:function ${name}\\s*\\(|(?:const|let) ${name}\\s*=|window\\.${name}\\s*=)`, 'm');
  const m = decl.exec(SRC);
  if (!m) throw new Error(`${name} not found in admin.html`);
  const rest = SRC.slice(m.index);
  const firstLine = rest.slice(0, rest.indexOf('\n'));
  const opens = (firstLine.match(/\{/g) || []).length;
  const closes = (firstLine.match(/\}/g) || []).length;
  if (opens === closes && /[;}]$/.test(firstLine.trim())) return firstLine;
  const close = /^ {8}\};?$/m.exec(rest.slice(firstLine.length + 1));
  if (!close) throw new Error(`${name} never closes`);
  return rest.slice(0, firstLine.length + 1 + close.index + close[0].length);
}

const LIFTED = ['CHEM_STORE_PREFIX', 'CHEM_STORE_VERSION', 'ROUND_CHOICES', '_chemShortName',
                'movesLabel', 'tableCount', 'quotas', 'fillTablePairs', 'pairLookup',
                'buildTables', 'rotateTables', 'maxRoundsFor', 'seatingTables', 'buildRounds',
                'seatedRoundOf', 'metInRounds', 'itineraryFor', 'buildOneOnOnes',
                'chemStoreRead', 'chemStoreWrite', 'chemStoreRestore', 'pinSeating',
                'rehydratePin', 'rosterDrift', 'seatLateArrivals', 'rebuildSeating', 'safe'];

// A localStorage that behaves like the real one, plus switches for the two
// ways the real one misbehaves: a private window that throws on write, and a
// browser that throws on read.
function fakeStorage() {
  const map = new Map();
  const s = {
    throwOnWrite: false, throwOnRead: false, writes: 0,
    getItem(k) { if (s.throwOnRead) throw new Error('SecurityError'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { s.writes++; if (s.throwOnWrite) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map,
  };
  return s;
}

const people = (n, prefix, gender) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, firstName: `${prefix === 'w' ? 'Wendy' : 'Marco'}${i}`, lastName: 'Quinn',
    email: `${prefix}${i}@example.com`, gender, age: 28 + (i % 9),
    interests: [], vibes: [], intent: null,
  }));

const scoreOf = (w, m) => ((+w.id.slice(1) * 7 + +m.id.slice(1) * 13) % 61) + 20;

function pairsFor(women, men) {
  const out = [];
  for (const w of women) for (const m of men) {
    out.push({ a: w, b: m, score: scoreOf(w, m), sharedInterests: [], partialInterests: [],
               sharedVibes: [], intentLabel: '', ageGap: null, limitedProfile: false });
  }
  return out;
}

function ctx({ W = 12, M = 12, storage = fakeStorage(), size = 6 } = {}) {
  const women = people(W, 'w', 'woman'), men = people(M, 'm', 'man');
  const sandbox = {
    console, Date, localStorage: storage, JSON,
    setInterval: () => 1, clearInterval: () => {},
    document: { activeElement: null, getElementById: () => null },
    _chemWomen: women, _chemMen: men, _chemPairs: pairsFor(women, men),
    // Supplied as sandbox globals rather than lifted: a lifted `let` lives in
    // the script's lexical scope, where a test assigning sandbox._x would be
    // writing to a different binding than the code reads.
    _chemEventId: null, _pinnedPlan: null,
    _introsDone: new Set(), _priorityDone: new Set(),
    _tableSize: size, _tableRound: 1, _tableRounds: 4, _roundMinutes: 15, _oneOnOneMinutes: 7,
    _runTimer: null, _runEndsAt: null, _runPaused: null, _runStep: 0, _runFind: '',
    // Render functions the store helpers call back into; stubbed so this
    // file stays about state, not markup (that is chemistry-views).
    renderTables: () => {}, renderRunOfShow: () => {}, renderIntros: () => {},
    renderPriorityIntros: () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  const evalIn = (expr) => vm.runInContext(expr, sandbox);
  // Late arrivals need the window.* helpers, which are assigned onto the
  // sandbox by the lifted source.
  return { sandbox, women, men, storage, evalIn,
           setRoster(w, m) {
             sandbox._chemWomen = w; sandbox._chemMen = m;
             sandbox._chemPairs = pairsFor(w, m);
           } };
}

// Seat ids, flattened per table, for comparing two seatings.
const shape = (tables) => tables.map(t => ({
  w: t.women.map(u => u.id).sort(),
  m: t.men.map(u => u.id).sort(),
}));

describe('pinSeating / rehydratePin', () => {
  it('returns the pinned seating instead of re-solving', () => {
    const { sandbox } = ctx();
    const pinned = sandbox.pinSeating(6);
    expect(pinned.womenByTable.flat()).toHaveLength(12);
    expect(shape(sandbox.rehydratePin(6))).toEqual(shape(sandbox.buildTables(6)));
  });

  it('holds every seat when the roster grows', () => {
    // The bug in one assertion: a walk-in used to re-seed the greedy and
    // move people who had already been told where to sit.
    const c = ctx();
    c.sandbox.pinSeating(6);
    const before = shape(c.sandbox.rehydratePin(6));

    c.setRoster([...c.women, ...people(1, 'x', 'woman')], [...c.men, ...people(2, 'y', 'man')]);
    const after = shape(c.sandbox.rehydratePin(6));
    expect(after).toEqual(before);

    // ...and the fresh solve really would have moved people, so the test
    // above is not passing by coincidence.
    expect(shape(c.sandbox.buildTables(6))).not.toEqual(before);
  });

  it('drops someone who is no longer registered without disturbing the rest', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    const before = shape(c.sandbox.rehydratePin(6));

    c.setRoster(c.women.slice(1), c.men);           // w0 refunds
    const after = shape(c.sandbox.rehydratePin(6));
    expect(after.flatMap(t => t.w)).not.toContain('w0');
    expect(after.flatMap(t => [...t.w, ...t.m])).toHaveLength(23);
    // Everyone else is where they were.
    const dropW0 = before.map(t => ({ w: t.w.filter(id => id !== 'w0'), m: t.m }));
    expect(after).toEqual(dropW0);
  });

  it('refuses a pin built at a different seat count', () => {
    // Four seats is a different number of tables, so the old partition is
    // meaningless. Better to re-solve than to serve a pin that does not fit.
    const { sandbox } = ctx();
    sandbox.pinSeating(6);
    expect(sandbox.rehydratePin(4)).toBeNull();
    expect(sandbox.rehydratePin(6)).not.toBeNull();
  });

  it('is what buildRounds actually uses', () => {
    // The pin has to reach every view, not just the Tables panel. If
    // buildRounds re-solved, the run-of-show and the intro coverage would
    // disagree with the seating chart the room was given.
    const c = ctx();
    c.sandbox.pinSeating(6);
    const pinnedR1 = shape(c.sandbox.rehydratePin(6));
    c.setRoster([...c.women, ...people(1, 'x', 'woman')], c.men);
    expect(shape(c.sandbox.buildRounds(6, 4)[0])).toEqual(pinnedR1);
  });

  it('keeps the no-repeat promise after rehydration', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    c.setRoster(c.women, [...c.men, ...people(1, 'y', 'man')]);
    const seen = new Set();
    for (const rnd of c.sandbox.buildRounds(6, 4)) {
      for (const t of rnd) for (const w of t.women) for (const m of t.men) {
        const k = w.id + '|' + m.id;
        expect(seen.has(k), `${k} seated twice`).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('rosterDrift', () => {
  it('is silent when the plan still matches the room', () => {
    const { sandbox } = ctx();
    sandbox.pinSeating(6);
    expect(sandbox.rosterDrift()).toMatchObject({ added: [], removed: 0 });
  });

  it('names who arrived and counts who left', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    c.setRoster([...c.women.slice(2), ...people(2, 'x', 'woman')], c.men);
    const drift = c.sandbox.rosterDrift();
    expect(drift.added.map(u => u.id).sort()).toEqual(['x0', 'x1']);
    expect(drift.removed).toBe(2);
  });

  it('reports nothing at all when there is no pin to compare against', () => {
    const { sandbox } = ctx();
    expect(sandbox.rosterDrift()).toEqual({ added: [], removed: 0, pinned: 0 });
  });
});

describe('seatLateArrivals', () => {
  it('seats the new arrivals and moves nobody else', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    const before = shape(c.sandbox.rehydratePin(6));

    c.setRoster([...c.women, ...people(1, 'x', 'woman')], [...c.men, ...people(1, 'y', 'man')]);
    c.sandbox.seatLateArrivals();

    const after = shape(c.sandbox.rehydratePin(6));
    const seated = after.flatMap(t => [...t.w, ...t.m]);
    expect(seated).toContain('x0');
    expect(seated).toContain('y0');
    expect(seated).toHaveLength(26);

    // Every original seat is unchanged once the two newcomers are removed.
    const stripped = after.map(t => ({
      w: t.w.filter(id => !id.startsWith('x')),
      m: t.m.filter(id => !id.startsWith('y')),
    }));
    expect(stripped).toEqual(before);
    expect(c.sandbox.rosterDrift().added).toEqual([]);
  });

  it('puts a late man in a group that rotates, so he meets a new table each seating', () => {
    // The reason the pin stores round 1 rather than every round: a man added
    // to a men-group inherits that group's whole circuit for free.
    const c = ctx();
    c.sandbox.pinSeating(6);
    c.setRoster(c.women, [...c.men, ...people(1, 'y', 'man')]);
    c.sandbox.seatLateArrivals();

    const rounds = c.sandbox.buildRounds(6, 4);
    const tables = rounds.map(rnd =>
      rnd.findIndex(t => t.men.some(m => m.id === 'y0')));
    expect(tables.every(i => i !== -1)).toBe(true);
    expect(new Set(tables).size).toBe(4);          // a different table each seating
  });

  it('fills a table that was among the emptiest', () => {
    // Stated as "was minimal", not "was table N": with 12 women across four
    // tables every group is the same size, and which of the tied tables wins
    // is settled by chemistry. Asserting an index would pin the tiebreak,
    // not the rule.
    const c = ctx();
    c.sandbox.pinSeating(6);
    const sizesBefore = c.sandbox.rehydratePin(6).map(t => t.women.length);

    c.setRoster([...c.women, ...people(1, 'x', 'woman')], c.men);
    c.sandbox.seatLateArrivals();

    const landed = c.sandbox.rehydratePin(6)
      .findIndex(t => t.women.some(u => u.id === 'x0'));
    expect(sizesBefore[landed]).toBe(Math.min(...sizesBefore));
  });

  it('picks the genuinely emptiest when the tables are uneven', () => {
    // 11 women over four tables is 3/3/3/2 — one table is really smallest,
    // and the late arrival evens the room out rather than deepening a gap.
    const c = ctx({ W: 11, M: 12 });
    c.sandbox.pinSeating(6);
    const sizesBefore = c.sandbox.rehydratePin(6).map(t => t.women.length);
    expect(Math.min(...sizesBefore)).toBe(2);
    expect(sizesBefore.filter(n => n === 2)).toHaveLength(1);

    c.setRoster([...c.women, ...people(1, 'x', 'woman')], c.men);
    c.sandbox.seatLateArrivals();

    const after = c.sandbox.rehydratePin(6).map(t => t.women.length);
    expect(after.every(n => n === 3)).toBe(true);
  });

  it('does nothing when nobody is waiting', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    const before = shape(c.sandbox.rehydratePin(6));
    c.sandbox.seatLateArrivals();
    expect(shape(c.sandbox.rehydratePin(6))).toEqual(before);
  });
});

describe('rebuildSeating', () => {
  it('re-solves and re-pins, which is why it is a button', () => {
    const c = ctx();
    c.sandbox.pinSeating(6);
    const before = shape(c.sandbox.rehydratePin(6));
    c.setRoster([...c.women, ...people(3, 'x', 'woman')], [...c.men, ...people(3, 'y', 'man')]);

    c.sandbox.rebuildSeating();
    const after = shape(c.sandbox.rehydratePin(6));
    expect(after).not.toEqual(before);
    expect(after.flatMap(t => [...t.w, ...t.m])).toHaveLength(30);
    expect(c.sandbox.rosterDrift().added).toEqual([]);
  });
});

describe('chemStore — surviving a close and a reload', () => {
  it('round-trips the pin, the clock, the prefs and the ticks', () => {
    const c = ctx();
    c.sandbox._chemEventId = 'ev1';
    c.sandbox.pinSeating(6);
    c.sandbox._runStep = 2;
    c.sandbox._runEndsAt = 1893456000000;
    c.sandbox._runPaused = null;
    c.sandbox._tableRounds = 3;
    c.sandbox._roundMinutes = 10;
    c.sandbox._introsDone = new Set(['w0|m1', 'w2|m3']);
    c.sandbox._priorityDone = new Set(['w4|m5']);
    c.sandbox.chemStoreWrite();

    // A reload: fresh context, same storage.
    const c2 = ctx({ storage: c.storage });
    c2.sandbox.chemStoreRestore('ev1');
    expect(c2.sandbox._runStep).toBe(2);
    expect(c2.sandbox._runEndsAt).toBe(1893456000000);
    expect(c2.sandbox._tableRounds).toBe(3);
    expect(c2.sandbox._roundMinutes).toBe(10);
    expect([...c2.sandbox._introsDone].sort()).toEqual(['w0|m1', 'w2|m3']);
    expect([...c2.sandbox._priorityDone]).toEqual(['w4|m5']);
    expect(shape(c2.sandbox.rehydratePin(6))).toEqual(shape(c.sandbox.rehydratePin(6)));
  });

  it('keeps each event separate', () => {
    const c = ctx();
    c.sandbox._chemEventId = 'ev1';
    c.sandbox._runStep = 3;
    c.sandbox.chemStoreWrite();

    c.sandbox.chemStoreRestore('ev2');
    expect(c.sandbox._runStep).toBe(0);
    expect(c.sandbox._pinnedPlan ?? null).toBeNull();

    c.sandbox.chemStoreRestore('ev1');
    expect(c.sandbox._runStep).toBe(3);
  });

  it('starts clean for an event it has never seen', () => {
    const { sandbox } = ctx();
    sandbox.chemStoreRestore('brand-new');
    expect(sandbox._runStep).toBe(0);
    expect(sandbox._runEndsAt).toBeNull();
    expect(sandbox._introsDone.size).toBe(0);
    expect(sandbox._tableRounds).toBe(4);
  });

  it('ignores a record written by an older version of the format', () => {
    const c = ctx();
    c.storage.setItem('sparkdate.chem.ev1', JSON.stringify({ v: 0, run: { step: 9 } }));
    c.sandbox.chemStoreRestore('ev1');
    expect(c.sandbox._runStep).toBe(0);
  });

  it('ignores corrupt JSON rather than throwing on open', () => {
    const c = ctx();
    c.storage.setItem('sparkdate.chem.ev1', '{not json');
    expect(() => c.sandbox.chemStoreRestore('ev1')).not.toThrow();
    expect(c.sandbox._runStep).toBe(0);
  });

  it('refuses out-of-range prefs from a tampered record', () => {
    const c = ctx();
    c.storage.setItem('sparkdate.chem.ev1', JSON.stringify({
      v: 1, prefs: { size: 99, rounds: 12, minutes: 3 },
    }));
    c.sandbox.chemStoreRestore('ev1');
    expect(c.sandbox._tableSize).toBe(6);
    expect(c.sandbox._tableRounds).toBe(4);
    expect(c.sandbox._roundMinutes).toBe(15);
  });

  it('survives a private window that throws on write', () => {
    // Safari private mode. The host should get a working panel that just
    // forgets, not a dead one.
    const c = ctx();
    c.sandbox._chemEventId = 'ev1';
    c.storage.throwOnWrite = true;
    expect(() => c.sandbox.pinSeating(6)).not.toThrow();
    expect(() => c.sandbox.chemStoreWrite()).not.toThrow();
    expect(c.sandbox.rehydratePin(6)).not.toBeNull();   // still pinned in memory
  });

  it('survives a browser that throws on read', () => {
    const c = ctx();
    c.storage.throwOnRead = true;
    expect(() => c.sandbox.chemStoreRestore('ev1')).not.toThrow();
    expect(c.sandbox._runStep).toBe(0);
  });

  it('lets a programming error through instead of swallowing it as a storage failure', () => {
    // Found the hard way. chemStoreWrite() used to wrap the whole payload
    // build in the try that exists for quota errors, so a reference to a
    // variable that had been renamed threw ReferenceError, got caught, and
    // persistence silently stopped — no error, nothing stored, and the panel
    // looked healthy until a reload lost the evening. Only setItem is
    // allowed to fail quietly now.
    const c = ctx();
    c.sandbox._chemEventId = 'ev1';
    vm.runInContext('_introsDone = undefined;', c.sandbox);
    expect(() => c.sandbox.chemStoreWrite()).toThrow();
  });

  it('still swallows a real storage failure after that change', () => {
    const c = ctx();
    c.sandbox._chemEventId = 'ev1';
    c.storage.throwOnWrite = true;
    expect(() => c.sandbox.chemStoreWrite()).not.toThrow();
  });

  it('writes nothing before an event is opened', () => {
    const c = ctx();
    c.sandbox._chemEventId = null;
    const before = c.storage.writes;
    c.sandbox.chemStoreWrite();
    expect(c.storage.writes).toBe(before);
  });
});
