// tests/chemistry-timer.test.js
//
// Six bugs found auditing the run-of-show clock, all of which needed a live
// event to notice and one of which was a crash.
//
//   1. runStart() and runNext() indexed the plan with an unclamped _runStep
//      and threw on undefined.ms.
//   2. ...which was reachable in ordinary use: seating late arrivals repacks
//      the 1-on-1s, and on a 12x12 room that took the plan from 10 segments
//      to 8 while the host sat on step 9. Pressing Start there died.
//   3. Reopening a past event restored its end timestamp, so the panel read
//      "TIME" on a round that finished days earlier — and started a
//      once-a-second repaint of it.
//   4. Nudging the round length from 15m to 20m called runReset(), throwing
//      away the host's place in the night and the clock with it.
//   5. fmtClock rounded, so the last half-second of every segment displayed
//      00:00 while the round was still running. A host reading 00:00 calls
//      time half a second early, every round.
//   6. Pausing while overtime stored a negative remainder; Resume then set an
//      end time already in the past and looked like it had done nothing.
//
// The 1-on-1 length moved from a hardcoded 5-minute constant to a setting
// (default 7), and a running segment can be stretched or cut by a minute
// without touching the plan — the room, not the number, decides.

import { describe, it, expect } from 'vitest';
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

const LIFTED = ['ROUND_CHOICES', 'CHEM_STORE_PREFIX', 'CHEM_STORE_VERSION', '_chemShortName',
                'movesLabel', 'tableCount', 'quotas', 'fillTablePairs', 'pairLookup', 'buildTables',
                'rotateTables', 'maxRoundsFor', 'rehydratePin', 'seatingTables', 'buildRounds',
                'seatedRoundOf', 'metInRounds', 'itineraryFor', 'buildOneOnOnes',
                'runPlanKey', 'computeRunPlan', 'buildRunPlan', 'fmtClock', 'runStepIn',
                'ensureRunTimer', 'runStart', 'runPause', 'runNext', 'runReset', 'runNudge',
                'shiftRunClock', 'setRoundMinutes', 'setOneOnOneMinutes',
                'chemStoreRead', 'chemStoreWrite', 'chemStoreRestore', 'pinSeating', 'safe'];

const person = (id, g) => ({ id, firstName: id, lastName: 'Q', email: `${id}@example.com`,
  gender: g, age: 30, interests: [], vibes: [], intent: null });

const mkPairs = (ws, ms) => {
  const out = [];
  for (const w of ws) for (const m of ms) {
    out.push({ a: w, b: m, score: ((+w.id.slice(1) * 17 + +m.id.slice(1) * 29) % 61) + 22,
               sharedInterests: [], partialInterests: [], sharedVibes: [], ageGap: null });
  }
  return out;
};

function ctx({ W = 12, M = 12, store = new Map() } = {}) {
  const women = Array.from({ length: W }, (_, i) => person('w' + i, 'woman'));
  const men   = Array.from({ length: M }, (_, i) => person('m' + i, 'man'));
  const sandbox = {
    console, Date, JSON,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null,
                    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { getElementById: () => null },
    setInterval: () => 1, clearInterval: () => {},
    _chemWomen: women, _chemMen: men, _chemPairs: mkPairs(women, men),
    _chemEventId: 'ev', _pinnedPlan: null, _runPlanCache: null,
    _introsDone: new Set(), _priorityDone: new Set(),
    _tableSize: 6, _tableRound: 1, _tableRounds: 4, _roundMinutes: 15, _oneOnOneMinutes: 7,
    _runTimer: null, _runEndsAt: null, _runPaused: null, _runStep: 0, _runFind: '',
    renderTables: () => {}, renderRunOfShow: () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  return { s: sandbox, women, men, store,
           setRoster(w, m) { sandbox._chemWomen = w; sandbox._chemMen = m;
                             sandbox._chemPairs = mkPairs(w, m); } };
}

const mins = (ms) => Math.round(ms / 60000);

describe('fmtClock', () => {
  it('ceils, so a running segment never shows 00:00', () => {
    const { s } = ctx();
    expect(s.fmtClock(1)).toBe('00:01');
    expect(s.fmtClock(400)).toBe('00:01');
    expect(s.fmtClock(999)).toBe('00:01');
    expect(s.fmtClock(1000)).toBe('00:01');
    expect(s.fmtClock(1001)).toBe('00:02');
  });
  it('shows 00:00 only at zero and below', () => {
    const { s } = ctx();
    expect(s.fmtClock(0)).toBe('00:00');
    expect(s.fmtClock(-5000)).toBe('00:00');
  });
  it('formats whole minutes without drift', () => {
    const { s } = ctx();
    expect(s.fmtClock(15 * 60000)).toBe('15:00');
    expect(s.fmtClock(7 * 60000)).toBe('07:00');
    expect(s.fmtClock(61000)).toBe('01:01');
  });
});

describe('runStepIn — the crash', () => {
  it('clamps a step past the end of the plan instead of throwing', () => {
    const { s } = ctx();
    s.pinSeating(6);
    const len = s.buildRunPlan().length;
    s._runStep = len + 5;
    expect(() => s.runStart()).not.toThrow();
    expect(s._runStep).toBe(len - 1);
  });

  it('clamps a negative step', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = -3;
    expect(() => s.runStart()).not.toThrow();
    expect(s._runStep).toBe(0);
  });

  it('survives the real path: late arrivals shrinking the plan under the host', () => {
    // The reachable version of the crash. Not hypothetical — this is what
    // "Seat N new" does to the 1-on-1 packing.
    const c = ctx();
    c.s.pinSeating(6);
    const before = c.s.buildRunPlan().length;
    c.s._runStep = before - 1;

    c.setRoster([...c.s._chemWomen, person('w90', 'woman'), person('w91', 'woman')],
                [...c.s._chemMen, person('m90', 'man')]);
    c.s.pinSeating(6);
    const after = c.s.buildRunPlan().length;
    expect(after).toBeLessThan(before);            // the premise really holds

    expect(() => c.s.runStart()).not.toThrow();
    expect(() => c.s.runNext()).not.toThrow();
    expect(c.s._runStep).toBeLessThan(after);
  });

  it('does nothing rather than throwing when there is no plan at all', () => {
    const { s } = ctx();
    s._chemWomen = []; s._chemMen = []; s._chemPairs = []; s._pinnedPlan = null;
    s._runPlanCache = null;
    expect(() => s.runStart()).not.toThrow();
    expect(() => s.runNext()).not.toThrow();
  });
});

describe('runPause', () => {
  it('freezes at zero rather than storing a negative remainder', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() - 90 * 1000;         // 90 seconds overtime
    s._runPaused = null;
    s.runPause();
    expect(s._runPaused).toBe(0);
  });

  it('resuming after an overtime pause leaves the clock at time, not in the past', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() - 90 * 1000;
    s._runPaused = null;
    s.runPause();
    s.runPause();                                   // resume
    expect(s._runPaused).toBeNull();
    expect(s._runEndsAt - Date.now()).toBeGreaterThanOrEqual(-1000);
    expect(s._runEndsAt - Date.now()).toBeLessThanOrEqual(1000);
  });

  it('round-trips a normal pause without losing time', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() + 8 * 60000;
    s._runPaused = null;
    s.runPause();
    expect(mins(s._runPaused)).toBe(8);
    s.runPause();
    expect(mins(s._runEndsAt - Date.now())).toBe(8);
  });
});

describe('setRoundMinutes / setOneOnOneMinutes', () => {
  it('keeps the host’s place instead of resetting the night', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = 2;
    s._runEndsAt = Date.now() + 9 * 60000;
    s.setRoundMinutes(20);
    expect(s._runStep).toBe(2);
    expect(s._runEndsAt).not.toBeNull();
  });

  it('extends a running round by the difference', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = 0;                                 // a seated round
    s._runEndsAt = Date.now() + 9 * 60000;
    s.setRoundMinutes(20);                          // 15 -> 20 is +5
    expect(mins(s._runEndsAt - Date.now())).toBe(14);
  });

  it('shortens a running round, never below now', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = 0;
    s._runEndsAt = Date.now() + 2 * 60000;
    s.setRoundMinutes(10);                          // 15 -> 10 is -5, past zero
    expect(s._runEndsAt - Date.now()).toBeLessThanOrEqual(1000);
    expect(s._runEndsAt).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('leaves a running 1-on-1 alone when the ROUND length changes', () => {
    const { s } = ctx();
    s.pinSeating(6);
    const plan = s.buildRunPlan();
    s._runStep = plan.findIndex(x => x.kind === 'ones');
    s._runEndsAt = Date.now() + 4 * 60000;
    s.setRoundMinutes(20);
    expect(mins(s._runEndsAt - Date.now())).toBe(4);
  });

  it('changes the 1-on-1 length and stretches a running 1-on-1', () => {
    const { s } = ctx();
    s.pinSeating(6);
    const plan = s.buildRunPlan();
    s._runStep = plan.findIndex(x => x.kind === 'ones');
    s._runEndsAt = Date.now() + 4 * 60000;
    s.setOneOnOneMinutes(10);                       // 7 -> 10 is +3
    expect(mins(s._runEndsAt - Date.now())).toBe(7);
    expect(s._runStep).toBeGreaterThan(0);
  });

  it('adjusts a paused clock too', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = 0;
    s._runEndsAt = Date.now() + 9 * 60000;
    s.runPause();
    s.setRoundMinutes(20);
    expect(mins(s._runPaused)).toBe(14);
  });
});

describe('the 1-on-1 length', () => {
  it('defaults to seven minutes, not five', () => {
    const { s } = ctx();
    s.pinSeating(6);
    const ones = s.buildRunPlan().find(x => x.kind === 'ones');
    expect(ones.ms).toBe(7 * 60 * 1000);
  });

  it('flows through every 1-on-1 segment in the plan', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s.setOneOnOneMinutes(10);
    const ones = s.buildRunPlan().filter(x => x.kind === 'ones');
    expect(ones.length).toBeGreaterThan(0);
    for (const seg of ones) expect(seg.ms).toBe(10 * 60 * 1000);
  });

  it('does not disturb the seated rounds', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s.setOneOnOneMinutes(5);
    for (const seg of s.buildRunPlan().filter(x => x.kind === 'round')) {
      expect(seg.ms).toBe(15 * 60 * 1000);
    }
  });
});

describe('runNudge — going with the flow of the room', () => {
  it('gives a running segment another minute', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() + 3 * 60000;
    s.runNudge(1);
    expect(mins(s._runEndsAt - Date.now())).toBe(4);
    s.runNudge(2);
    expect(mins(s._runEndsAt - Date.now())).toBe(6);
  });

  it('takes a minute back, never past zero', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() + 3 * 60000;
    s.runNudge(-1);
    expect(mins(s._runEndsAt - Date.now())).toBe(2);
    s.runNudge(-5);
    expect(s._runEndsAt - Date.now()).toBeLessThanOrEqual(1000);
    expect(s._runEndsAt).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('extends from NOW when the segment has already run over', () => {
    // "+1" two minutes late has to mean one more minute from here. Adding to
    // the elapsed end time would give a button that visibly does nothing.
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() - 2 * 60000;
    s.runNudge(1);
    expect(mins(s._runEndsAt - Date.now())).toBe(1);
  });

  it('nudges a paused segment without resuming it', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = Date.now() + 5 * 60000;
    s.runPause();
    s.runNudge(1);
    expect(s._runPaused).not.toBeNull();
    expect(mins(s._runPaused)).toBe(6);
  });

  it('does nothing when no clock is running', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runEndsAt = null; s._runPaused = null;
    s.runNudge(1);
    expect(s._runEndsAt).toBeNull();
    expect(s._runPaused).toBeNull();
  });

  it('never moves the step or the seating', () => {
    const { s } = ctx();
    s.pinSeating(6);
    s._runStep = 1;
    s._runEndsAt = Date.now() + 5 * 60000;
    const seatingBefore = JSON.stringify(s._pinnedPlan);
    s.runNudge(2);
    expect(s._runStep).toBe(1);
    expect(JSON.stringify(s._pinnedPlan)).toBe(seatingBefore);
  });
});

describe('restoring a clock from storage', () => {
  const write = (store, id, rec) =>
    store.set('sparkdate.chem.' + id, JSON.stringify({ v: 1, ...rec }));

  it('restores a run that is genuinely still in progress', () => {
    const store = new Map();
    write(store, 'ev', { savedAt: Date.now() - 60000,
                         run: { step: 2, endsAt: Date.now() + 5 * 60000, paused: null } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._runStep).toBe(2);
    expect(s._runEndsAt).not.toBeNull();
  });

  it('drops a clock from an event that ran days ago', () => {
    const store = new Map();
    const weekAgo = Date.now() - 7 * 86400000;
    write(store, 'ev', { savedAt: weekAgo, run: { step: 3, endsAt: weekAgo, paused: null } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._runEndsAt).toBeNull();
    expect(s._runStep).toBe(0);
  });

  it('drops a stale clock even when the record was re-written today', () => {
    // Ticking an intro the morning after re-writes the record with a fresh
    // savedAt while still carrying last night's endsAt. savedAt alone would
    // have called this fresh and shown "TIME" on a round that ended in bed.
    const store = new Map();
    write(store, 'ev', { savedAt: Date.now(),
                         run: { step: 3, endsAt: Date.now() - 6 * 86400000, paused: null } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._runEndsAt).toBeNull();
  });

  it('keeps a PAUSED run whose endsAt is stale by design', () => {
    // A paused run's endsAt is meaningless — the remaining time lives in
    // `paused`. Judging it by endsAt would throw away every paused run.
    const store = new Map();
    write(store, 'ev', { savedAt: Date.now() - 120000,
                         run: { step: 1, endsAt: Date.now() - 3 * 60000, paused: 6 * 60000 } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._runPaused).toBe(6 * 60000);
    expect(s._runStep).toBe(1);
  });

  it('round-trips the 1-on-1 length', () => {
    const c = ctx();
    c.s._chemEventId = 'ev';
    c.s.setOneOnOneMinutes(10);
    c.s.chemStoreWrite();
    const c2 = ctx({ store: c.store });
    c2.s.chemStoreRestore('ev');
    expect(c2.s._oneOnOneMinutes).toBe(10);
  });

  it('refuses a 1-on-1 length that is not on the dial', () => {
    const store = new Map();
    write(store, 'ev', { savedAt: Date.now(), prefs: { oneOnOne: 90 } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._oneOnOneMinutes).toBe(7);
  });

  it('refuses a negative step', () => {
    const store = new Map();
    write(store, 'ev', { savedAt: Date.now(),
                         run: { step: -4, endsAt: Date.now() + 60000, paused: null } });
    const { s } = ctx({ store });
    s.chemStoreRestore('ev');
    expect(s._runStep).toBe(0);
  });
});
