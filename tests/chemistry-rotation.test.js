// tests/chemistry-rotation.test.js
//
// The seating half of the chemistry tool makes one promise the host repeats
// out loud to a room: "everyone you're about to meet is someone new." It is
// the only claim in the dashboard that a guest can personally falsify, in
// public, thirty seconds after it is made.
//
// That promise rests on a structural property, not on a score: with T tables,
// men rotating one table per round meet an entirely new set of women each
// round, for T rounds. Nothing about it is approximate — but it holds only
// while two preconditions do, and both were broken before this file existed:
//
//   1. Men must be split EVENLY across tables. Rotation moves whole men-
//      groups, so a 6-man table beside a 2-man table becomes a 6-man/2-woman
//      table in round two. The old builder produced exactly that on the real
//      Good Good roster (4 women, 9 men at six seats): tables of 3W/3M and
//      1W/6M, which round two turned into 3W/6M and 1W/3M.
//   2. Rounds must stop at T. Offset T is offset 0 — round three at two
//      tables is round one again, seat for seat, presented as fresh.
//
// Both are invisible from the screen: the seating still renders, the names
// are still there, and only the room finds out. So they are asserted here
// against the SHIPPED code lifted out of public/admin.html, the same way
// tests/testimonial-rotator.test.js runs the rotators the site actually
// serves rather than a copy kept in the test.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift a top-level declaration out of the page by INDENTATION, not by
// brace-matching: every top-level function in this script sits at eight
// spaces and closes on a line that is exactly eight spaces and a brace.
//
// Brace-matching JS with a hand-rolled scanner looks tempting and is a trap
// here — safe() contains /"/g, a regex literal holding a double quote, which
// any scanner that only knows about strings reads as the start of one and
// then runs to the end of the file. Indentation has no such ambiguity.
function lift(name) {
  const decl = new RegExp(`^ {8}(?:function ${name}\\s*\\(|const ${name}\\s*=)`, 'm');
  const m = decl.exec(SRC);
  if (!m) throw new Error(`${name} not found in admin.html`);
  const rest = SRC.slice(m.index);
  const firstLine = rest.slice(0, rest.indexOf('\n'));
  // A declaration whose braces balance on its own line is complete there —
  // covers `const ROUND_CHOICES = [2, 3, 4];` and one-line functions alike.
  const opens = (firstLine.match(/\{/g) || []).length;
  const closes = (firstLine.match(/\}/g) || []).length;
  if (opens === closes && /[;}]$/.test(firstLine.trim())) return firstLine;
  const close = /^ {8}\};?$/m.exec(rest.slice(firstLine.length + 1));
  if (!close) throw new Error(`${name} never closes`);
  return rest.slice(0, firstLine.length + 1 + close.index + close[0].length);
}

const NAMES = ['ROUND_CHOICES', 'movesLabel', 'tableCount', 'quotas', 'fillTablePairs',
               'pairLookup', 'buildTables', 'rotateTables', 'maxRoundsFor', 'buildRounds',
               'seatedRoundOf', 'metInRounds', 'itineraryFor', 'buildOneOnOnes',
               'topMatchesFor'];

// One sandbox per case: the seating functions read the module-scope roster
// (_chemWomen / _chemMen / _chemPairs) as free variables, so the roster IS
// the input and must not leak between tests.
function seating(women, men, scoreOf) {
  const pairs = [];
  for (const w of women) for (const m of men) {
    pairs.push({
      a: w, b: m,
      score: scoreOf ? scoreOf(w, m) : 50,
      sharedInterests: [], partialInterests: [], sharedVibes: [],
      intentLabel: '', ageGap: null, limitedProfile: false,
    });
  }
  const sandbox = { _chemWomen: women, _chemMen: men, _chemPairs: pairs, console };
  vm.createContext(sandbox);
  vm.runInContext(NAMES.map(lift).join('\n\n'), sandbox);
  // `function` declarations land on the sandbox object; `const` ones stay in
  // the script's lexical scope and are only reachable by evaluating in it.
  const evalIn = (expr) => vm.runInContext(expr, sandbox);
  return { sandbox, pairs, evalIn };
}

const people = (n, prefix, gender) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, firstName: `${prefix.toUpperCase()}${i}`, lastName: 'X',
    email: `${prefix}${i}@example.com`, gender, age: 30, interests: [], vibes: [], intent: null,
  }));

const roster = (w, m) => [people(w, 'w', 'woman'), people(m, 'm', 'man')];

// Deterministic but uneven scores, so the greedy seeding has something to
// prefer and ties do not hide an ordering bug.
const varied = (w, m) => ((parseInt(w.id.slice(1), 10) * 7 + parseInt(m.id.slice(1), 10) * 13) % 61) + 20;

const key = (w, m) => `${w.id}|${m.id}`;
const everyone = (t) => [...t.women, ...t.men];

describe('quotas', () => {
  const q = (n, t) => seating(...roster(1, 1)).sandbox.quotas(n, t);
  it('splits evenly when it divides', () => {
    expect(q(9, 3)).toEqual([3, 3, 3]);
    expect(q(8, 4)).toEqual([2, 2, 2, 2]);
  });
  it('gives the remainder to the earliest tables, one each', () => {
    expect(q(10, 3)).toEqual([4, 3, 3]);
    expect(q(11, 3)).toEqual([4, 4, 3]);
  });
  it('never differs by more than one — that is the whole point', () => {
    for (const n of [1, 2, 5, 7, 13, 30]) {
      for (const t of [1, 2, 3, 4, 5]) {
        const out = q(n, t);
        expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
        expect(out.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });
});

describe('tableCount', () => {
  it('is capped by the smaller side of the room', () => {
    // 4 women can only anchor 4 tables however many men turn up: a table
    // with no woman has nothing to rotate and nothing to talk across.
    const { sandbox } = seating(...roster(4, 20), varied);
    expect(sandbox.tableCount(4)).toBeLessThanOrEqual(4);
    expect(sandbox.tableCount(2)).toBeLessThanOrEqual(4);
  });
  it('follows the seat count when the room is balanced', () => {
    const { sandbox } = seating(...roster(12, 12), varied);
    expect(sandbox.tableCount(6)).toBe(4);
    expect(sandbox.tableCount(8)).toBe(3);
  });
  it('is at least one whenever anyone is present', () => {
    expect(seating(...roster(1, 1)).sandbox.tableCount(6)).toBe(1);
    expect(seating(people(3, 'w', 'woman'), []).sandbox.tableCount(6)).toBe(1);
  });
  it('is zero for an empty room', () => {
    expect(seating([], []).sandbox.tableCount(6)).toBe(0);
  });
});

describe('buildTables', () => {
  it('seats every attendee exactly once', () => {
    const [w, m] = roster(11, 14);
    const { sandbox } = seating(w, m, varied);
    const tables = sandbox.buildTables(6);
    const seen = tables.flatMap(everyone).map(u => u.id);
    expect(new Set(seen).size).toBe(seen.length);      // nobody twice
    expect(seen.sort()).toEqual([...w, ...m].map(u => u.id).sort());
  });

  it('splits men evenly enough that rotation stays balanced', () => {
    // The bug this pins: the old builder filled table 1 to its cap and let
    // the rest pile onto the last one. Rotating those groups produced a
    // 3W/6M table beside a 1W/3M table on a real roster.
    for (const [W, M, size] of [[4, 9, 6], [11, 14, 6], [7, 7, 4], [20, 8, 8], [3, 30, 6]]) {
      const { sandbox } = seating(...roster(W, M), varied);
      const tables = sandbox.buildTables(size);
      const menCounts   = tables.map(t => t.men.length);
      const womenCounts = tables.map(t => t.women.length);
      expect(Math.max(...menCounts)   - Math.min(...menCounts)).toBeLessThanOrEqual(1);
      expect(Math.max(...womenCounts) - Math.min(...womenCounts)).toBeLessThanOrEqual(1);
    }
  });

  it('gives every table at least one woman and one man', () => {
    const { sandbox } = seating(...roster(5, 17), varied);
    for (const t of sandbox.buildTables(6)) {
      expect(t.women.length).toBeGreaterThan(0);
      expect(t.men.length).toBeGreaterThan(0);
    }
  });

  it('anchors table one on the strongest pair in the room', () => {
    const [w, m] = roster(6, 6);
    const { sandbox, pairs } = seating(w, m, (a, b) => (a.id === 'w3' && b.id === 'm4' ? 99 : 30));
    expect(Math.max(...pairs.map(p => p.score))).toBe(99);
    const first = sandbox.buildTables(4)[0];
    expect(first.women.map(u => u.id)).toContain('w3');
    expect(first.men.map(u => u.id)).toContain('m4');
  });

  it('survives a single-gender room without crashing', () => {
    const { sandbox } = seating(people(5, 'w', 'woman'), []);
    const tables = sandbox.buildTables(6);
    expect(tables).toHaveLength(1);
    expect(tables[0].women).toHaveLength(5);
    expect(tables[0].men).toHaveLength(0);
  });

  it('returns nothing for an empty room', () => {
    expect(seating([], []).sandbox.buildTables(6)).toEqual([]);
  });
});

describe('rotateTables', () => {
  it('moves every man and holds every woman', () => {
    const { sandbox } = seating(...roster(12, 12), varied);
    const r1 = sandbox.buildTables(6);
    const r2 = sandbox.rotateTables(r1, 1);
    r1.forEach((t, i) => {
      expect(r2[i].women).toEqual(t.women);              // women stay put
      expect(r2[i].men).not.toEqual(t.men);              // men all moved
    });
  });

  it('refuses to rotate a single table', () => {
    const { sandbox } = seating(...roster(2, 2), varied);
    expect(sandbox.rotateTables(sandbox.buildTables(8), 1)).toBeNull();
  });

  it('refuses the offset that would re-seat round one', () => {
    // Offset T is offset 0. Serving it as a fresh round is the failure the
    // host would have to apologise for in the room.
    const { sandbox } = seating(...roster(12, 12), varied);
    const r1 = sandbox.buildTables(6);
    expect(r1.length).toBe(4);
    expect(sandbox.rotateTables(r1, r1.length)).toBeNull();
    expect(sandbox.rotateTables(r1, 0)).toBeNull();
  });

  it('keeps table balance in every rotated round', () => {
    const { sandbox } = seating(...roster(4, 9), varied);
    const r1 = sandbox.buildTables(4);
    for (let k = 1; k < r1.length; k++) {
      const rot = sandbox.rotateTables(r1, k);
      const sizes = rot.map(t => t.women.length + t.men.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
    }
  });
});

describe('seatings vs moves', () => {
  // "Three rotations" reads as three moves to a host and three sittings to
  // the code. Four seatings is three moves; the control counts seatings and
  // the label states the moves, so nobody has to do the conversion at 6:30.
  it('reports one fewer move than there are seatings', () => {
    const { sandbox } = seating(...roster(2, 2));
    expect(sandbox.movesLabel(1)).toBe('0 moves');
    expect(sandbox.movesLabel(2)).toBe('1 move');
    expect(sandbox.movesLabel(3)).toBe('2 moves');
    expect(sandbox.movesLabel(4)).toBe('3 moves');
  });
  it('never reports a negative move count', () => {
    const { sandbox } = seating(...roster(2, 2));
    expect(sandbox.movesLabel(0)).toBe('0 moves');
  });
  it('offers 2, 3 and 4 seatings — three moves is the top of the range', () => {
    const { evalIn } = seating(...roster(2, 2));
    expect(evalIn('ROUND_CHOICES')).toEqual([2, 3, 4]);
  });
});

describe('buildRounds — the no-repeats promise', () => {
  it('never seats the same pair twice, across every roster and round count', () => {
    for (const [W, M, size] of [[12, 12, 6], [4, 9, 4], [11, 14, 6], [9, 9, 4], [20, 16, 8]]) {
      const { sandbox } = seating(...roster(W, M), varied);
      for (const wanted of [2, 3, 4]) {
        const rounds = sandbox.buildRounds(size, wanted);
        const seen = new Set();
        rounds.forEach((rnd, ri) => rnd.forEach(t => t.women.forEach(w => t.men.forEach(m => {
          const k = key(w, m);
          expect(seen.has(k),
            `${W}W/${M}M @${size}: ${k} seated twice by round ${ri + 1}`).toBe(false);
          seen.add(k);
        }))));
      }
    }
  });

  it('seats everyone exactly once per round', () => {
    const { sandbox } = seating(...roster(11, 14), varied);
    for (const rnd of sandbox.buildRounds(6, 3)) {
      const ids = rnd.flatMap(everyone).map(u => u.id);
      expect(new Set(ids).size).toBe(25);
    }
  });

  it('caps the round count at the number of tables', () => {
    // Two tables cannot serve three rounds. Asking for three has to yield
    // two rather than a silent repeat of round one.
    const { sandbox } = seating(...roster(6, 7), varied);
    const tables = sandbox.buildTables(6);
    expect(tables.length).toBe(2);
    expect(sandbox.buildRounds(6, 3)).toHaveLength(2);
    expect(sandbox.buildRounds(6, 2)).toHaveLength(2);
  });

  it('delivers three rounds when three tables exist', () => {
    const { sandbox } = seating(...roster(9, 9), varied);
    expect(sandbox.buildTables(6).length).toBe(3);
    expect(sandbox.buildRounds(6, 3)).toHaveLength(3);
  });

  it('delivers four seatings — three moves — when four tables exist', () => {
    const { sandbox } = seating(...roster(12, 12), varied);
    expect(sandbox.buildTables(6).length).toBe(4);
    const rounds = sandbox.buildRounds(6, 4);
    expect(rounds).toHaveLength(4);
    // The fourth seating is the last one the circuit has: a fifth would put
    // every man back at the table he started at.
    expect(sandbox.buildRounds(6, 5)).toHaveLength(4);
    expect(sandbox.rotateTables(rounds[0], 4)).toBeNull();
  });

  it('covers more of the room with each extra seating', () => {
    // The reason to add a fourth: it is the only thing that shrinks the
    // host's manual intro list without changing the roster.
    const { sandbox, pairs } = seating(...roster(12, 12), varied);
    const covered = n => sandbox.seatedRoundOf(sandbox.buildRounds(6, n)).size;
    expect(covered(2)).toBeLessThan(covered(3));
    expect(covered(3)).toBeLessThan(covered(4));
    expect(covered(4)).toBeLessThanOrEqual(pairs.length);
  });

  it('gives one round for a one-table room, not zero', () => {
    const { sandbox } = seating(...roster(2, 2), varied);
    expect(sandbox.buildRounds(8, 3)).toHaveLength(1);
  });

  it('fills the pair list of rotated rounds, not just round one', () => {
    // Round 2 arrives from rotateTables with fresh membership; if its pairs
    // were left empty the table average and the "talk about" topics would
    // describe round 1 while showing round 2's names.
    const { sandbox } = seating(...roster(12, 12), varied);
    const rounds = sandbox.buildRounds(6, 3);
    rounds.forEach(rnd => rnd.forEach(t => {
      expect(t.pairs.length).toBe(t.women.length * t.men.length);
    }));
  });
});

describe('seatedRoundOf', () => {
  it('reports the round each pair shares a table, and omits the rest', () => {
    const { sandbox, pairs } = seating(...roster(9, 9), varied);
    const rounds = sandbox.buildRounds(6, 3);
    const map = sandbox.seatedRoundOf(rounds);

    // Every entry points at a round that really does seat them.
    for (const [k, r] of map) {
      const [wId, mId] = k.split('|');
      const t = rounds[r - 1].find(tb => tb.women.some(w => w.id === wId));
      expect(t.men.some(m => m.id === mId), `${k} not at its claimed round ${r}`).toBe(true);
    }
    // And a pair with no entry is seated in no round at all.
    const unseated = pairs.filter(p => !map.has(key(p.a, p.b)));
    for (const p of unseated) {
      for (const rnd of rounds) {
        const t = rnd.find(tb => tb.women.some(w => w.id === p.a.id));
        expect(t.men.some(m => m.id === p.b.id)).toBe(false);
      }
    }
    expect(map.size + unseated.length).toBe(pairs.length);
  });

  it('agrees with metInRounds', () => {
    const { sandbox } = seating(...roster(11, 14), varied);
    const rounds = sandbox.buildRounds(6, 3);
    expect([...sandbox.metInRounds(rounds)].sort())
      .toEqual([...sandbox.seatedRoundOf(rounds).keys()].sort());
  });

  it('leaves work for the host to do — three rounds do not cover a big room', () => {
    // If the rotation covered every pair there would be no intro list at
    // all; the intro views exist because it does not.
    const { sandbox, pairs } = seating(...roster(12, 12), varied);
    expect(sandbox.seatedRoundOf(sandbox.buildRounds(6, 3)).size).toBeLessThan(pairs.length);
  });
});

describe('itineraryFor', () => {
  it('places every person at exactly one table per round', () => {
    const [w, m] = roster(11, 14);
    const { sandbox } = seating(w, m, varied);
    const rounds = sandbox.buildRounds(6, 3);
    for (const person of [...w, ...m]) {
      const legs = sandbox.itineraryFor(person, rounds);
      expect(legs).toHaveLength(rounds.length);
      for (const leg of legs) {
        expect(leg.table, `${person.id} unseated in round ${leg.round}`).not.toBeNull();
        expect(leg.withThem.length).toBeGreaterThan(0);
        expect(leg.withThem.some(o => o.id === person.id)).toBe(false);  // never themselves
      }
    }
  });

  it('lists the opposite gender at each table — who they are there to meet', () => {
    const [w, m] = roster(9, 9);
    const { sandbox } = seating(w, m, varied);
    const rounds = sandbox.buildRounds(6, 3);
    const legs = sandbox.itineraryFor(w[0], rounds);
    for (const leg of legs) expect(leg.withThem.every(o => o.gender === 'man')).toBe(true);
    // A woman holds her table all night; that is what "women stay" means.
    expect(new Set(legs.map(l => l.table)).size).toBe(1);
    // A man's table changes every round; that is what "men move" means.
    const his = sandbox.itineraryFor(m[0], rounds).map(l => l.table);
    expect(new Set(his).size).toBe(his.length);
  });
});

describe('topMatchesFor — the shortlist both views share', () => {
  it('returns a woman\'s N strongest, best first', () => {
    const { sandbox } = seating(...roster(6, 9), varied);
    const w = sandbox._chemWomen ? sandbox._chemWomen[0] : null;
    const her = sandbox.topMatchesFor(people(6, 'w', 'woman')[0], 3);
    expect(her).toHaveLength(3);
    expect(her.map(x => x.score)).toEqual([...her.map(x => x.score)].sort((a, b) => b - a));
    // and they really are the top three of all nine
    const all = sandbox.topMatchesFor(people(6, 'w', 'woman')[0], 0);
    expect(her.map(x => x.man.id)).toEqual(all.slice(0, 3).map(x => x.man.id));
  });

  it('treats 0 as "all of them" rather than an empty list', () => {
    // The control's "All" option passes 0. A slice(0, 0) there would blank
    // both the Chemistry cards and the Top-N intro mode at once.
    const { sandbox } = seating(...roster(6, 9), varied);
    expect(sandbox.topMatchesFor(people(6, 'w', 'woman')[0], 0)).toHaveLength(9);
  });

  it('asks for more than exist without padding or throwing', () => {
    const { sandbox } = seating(...roster(4, 2), varied);
    expect(sandbox.topMatchesFor(people(4, 'w', 'woman')[0], 5)).toHaveLength(2);
  });

  it('gives a woman with no men an empty list', () => {
    const { sandbox } = seating(people(3, 'w', 'woman'), []);
    expect(sandbox.topMatchesFor(people(3, 'w', 'woman')[0], 3)).toEqual([]);
  });
});

describe('buildOneOnOnes', () => {
  it('never re-pairs two people who already shared a table', () => {
    const { sandbox } = seating(...roster(12, 12), varied);
    const rounds = sandbox.buildRounds(6, 3);
    const met = sandbox.metInRounds(rounds);
    const out = sandbox.buildOneOnOnes(rounds, 6);
    expect(out.revisiting).toBe(false);
    out.rounds.flat().forEach(p => expect(met.has(key(p.a, p.b))).toBe(false));
  });

  it('pairs each person at most once per 1-on-1 round', () => {
    const { sandbox } = seating(...roster(12, 12), varied);
    const out = sandbox.buildOneOnOnes(sandbox.buildRounds(6, 3), 6);
    for (const rnd of out.rounds) {
      const ids = rnd.flatMap(p => [p.a.id, p.b.id]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('falls back to the best matches, flagged, once the room is exhausted', () => {
    // A small room where three rounds seat everyone with everyone. Showing
    // the host a blank panel mid-event is the one outcome worse than a
    // repeat, so the fallback fires and says what it is.
    const { sandbox } = seating(...roster(3, 3), varied);
    const rounds = sandbox.buildRounds(4, 3);
    const met = sandbox.metInRounds(rounds);
    const out = sandbox.buildOneOnOnes(rounds, 6);
    if (met.size === 9) {
      expect(out.revisiting).toBe(true);
      expect(out.rounds.length).toBeGreaterThan(0);
    }
  });
});
