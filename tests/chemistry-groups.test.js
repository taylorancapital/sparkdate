// tests/chemistry-groups.test.js
//
// Women who arrived together are seated together. The feature is small; the
// two ways it could go wrong are not.
//
//   1. IT COULD MOVE A SEATING THAT NOBODY ASKED IT TO MOVE. Most events have
//      no recorded parties at all — only 18% of women ever registered carry
//      the one field that identifies a shared checkout, and it has found a
//      single pair in the whole history. So the overwhelmingly common path is
//      "no parties", and on that path the seating must be the byte-identical
//      one the room got before this existed. That is the first test here and
//      it is the one that matters most.
//
//   2. IT COULD BREAK THE ROTATION. Rotation moves whole men-groups and its
//      no-repeat guarantee (tests/chemistry-rotation.test.js) rests on both
//      the men's partition and the evenness of the women's. Seating a party
//      together must not take a seat from another table to do it. So quotas
//      are asserted here as hard invariants, not as a preference: a party too
//      big for a table is split and REPORTED rather than allowed to unbalance
//      the room.
//
// Run against the SHIPPED code lifted out of public/admin.html, the same way
// tests/chemistry-rotation.test.js does it.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift by INDENTATION, not brace-matching — safe() holds /"/g, a regex with a
// double quote in it, which any hand-rolled scanner reads as a string start.
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

const NAMES = ['ROUND_CHOICES', 'movesLabel',
  '_nameLabels', '_nameLabelsFor', '_nameRungs', 'buildNameLabels', 'ensureNameLabels',
  'tableCount', 'quotas', 'fillTablePairs', 'pairLookup',
  '_chemGroups', '_groupSplits', 'groupKeyOf', 'normaliseGroups', 'applyGroups',
  'buildTables', 'rotateTables', 'maxRoundsFor', 'rehydratePin', 'seatingTables',
  'buildRounds', 'seatedRoundOf', 'metInRounds', 'itineraryFor'];

const people = (n, prefix, gender) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, firstName: `${prefix.toUpperCase()}${i}`, lastName: 'X',
    email: `${prefix}${i}@example.com`, gender, age: 30, interests: [], vibes: [], intent: null,
  }));

// Deterministic but uneven, so the greedy has something to prefer and a tie
// does not hide an ordering bug. Same generator the rotation suite uses.
const varied = (w, m) => ((parseInt(w.id.slice(1), 10) * 7 + parseInt(m.id.slice(1), 10) * 13) % 61) + 20;

// One sandbox per case: the seating functions read the roster as free
// variables, so the roster IS the input and must not leak between tests.
function seating(nw, nm, groups = []) {
  const women = people(nw, 'w', 'woman');
  const men = people(nm, 'm', 'man');
  const pairs = [];
  for (const w of women) for (const m of men) {
    pairs.push({
      a: w, b: m, score: varied(w, m),
      sharedInterests: [], partialInterests: [], sharedVibes: [],
      intentLabel: '', ageGap: null, limitedProfile: false,
    });
  }
  const sandbox = {
    _chemWomen: women, _chemMen: men, _chemPairs: pairs,
    _pinnedPlan: null, _chemEventId: null, console,
    // _chemShortName is used only by applyGroups' split report.
    _chemShortName: (u) => u.firstName,
  };
  vm.createContext(sandbox);
  vm.runInContext(NAMES.map(lift).join('\n\n'), sandbox);
  vm.runInContext(`_chemGroups = ${JSON.stringify(groups)};`, sandbox);
  return { sandbox, women, men };
}

const tableOf = (tables, id) =>
  tables.findIndex(t => t.women.some(w => w.id === id) || t.men.some(m => m.id === id));

describe('no recorded parties — the common case', () => {
  // The load-bearing test. Most events have none, and on those the seating
  // must not move by so much as one seat.
  it('leaves the seating byte-identical', () => {
    for (const [nw, nm, size] of [[4, 9, 6], [6, 6, 6], [10, 10, 6], [12, 12, 6], [10, 10, 4], [8, 14, 8]]) {
      const withFeature = seating(nw, nm, []).sandbox.buildTables(size);
      // Reference: the same solver with applyGroups neutered to identity.
      const ref = seating(nw, nm, []);
      vm.runInContext('applyGroups = (t) => t;', ref.sandbox);
      const plain = ref.sandbox.buildTables(size);
      const ids = (tt) => tt.map(t => [t.women.map(u => u.id), t.men.map(u => u.id)]);
      expect(ids(withFeature), `${nw}W/${nm}M at ${size} seats`).toEqual(ids(plain));
    }
  });
});

describe('a party is seated at one table', () => {
  it('keeps a pair together that the solver had split', () => {
    // Establish the pair is genuinely split without the feature, so the test
    // proves the change did something rather than asserting a coincidence.
    const before = seating(10, 10, []).sandbox.buildTables(6);
    const split = [];
    for (let i = 0; i < 10; i += 2) {
      if (tableOf(before, `w${i}`) !== tableOf(before, `w${i + 1}`)) split.push(i);
    }
    expect(split.length, 'expected at least one pair split by the plain solver').toBeGreaterThan(0);

    const i = split[0];
    const after = seating(10, 10, [[`w${i}`, `w${i + 1}`]]).sandbox.buildTables(6);
    expect(tableOf(after, `w${i}`)).toBe(tableOf(after, `w${i + 1}`));
  });

  it('keeps a party of three together', () => {
    const t = seating(10, 10, [['w0', 'w1', 'w2']]).sandbox.buildTables(6);
    const at = ['w0', 'w1', 'w2'].map(id => tableOf(t, id));
    expect(new Set(at).size).toBe(1);
  });

  it('keeps several parties together at once', () => {
    const groups = [['w0', 'w1'], ['w2', 'w3'], ['w4', 'w5']];
    const t = seating(10, 10, groups).sandbox.buildTables(4);
    groups.forEach(g => {
      expect(new Set(g.map(id => tableOf(t, id))).size, g.join('+')).toBe(1);
    });
  });
});

describe('quotas are never broken to do it', () => {
  // This is what protects the rotation. An unbalanced women count turns into
  // an unbalanced table two rounds later, and nothing on screen shows it.
  it('holds the same per-table counts as the plain solver', () => {
    const cases = [
      [10, 10, 6, [['w0', 'w1'], ['w2', 'w3']]],
      [10, 10, 6, [['w0', 'w1'], ['w2', 'w3'], ['w4', 'w5'], ['w6', 'w7'], ['w8', 'w9']]],
      [12, 12, 6, [['w0', 'w1', 'w2', 'w3']]],
      [8, 14, 6, [['w0', 'w1'], ['w2', 'w3']]],
    ];
    for (const [nw, nm, size, groups] of cases) {
      const ref = seating(nw, nm, []);
      vm.runInContext('applyGroups = (t) => t;', ref.sandbox);
      const plain = ref.sandbox.buildTables(size);
      const grouped = seating(nw, nm, groups).sandbox.buildTables(size);
      expect(grouped.map(t => t.women.length), `${nw}W/${nm}M size ${size}`)
        .toEqual(plain.map(t => t.women.length));
      expect(grouped.map(t => t.men.length)).toEqual(plain.map(t => t.men.length));
    }
  });

  it('seats everyone exactly once', () => {
    const s = seating(10, 10, [['w0', 'w1'], ['w2', 'w3']]);
    const t = s.sandbox.buildTables(6);
    const seated = t.flatMap(x => [...x.women, ...x.men].map(u => u.id));
    expect(seated.length).toBe(20);
    expect(new Set(seated).size).toBe(20);
  });

  it('leaves the men untouched — rotation depends on their partition', () => {
    const ref = seating(10, 10, []);
    vm.runInContext('applyGroups = (t) => t;', ref.sandbox);
    const plain = ref.sandbox.buildTables(6);
    const grouped = seating(10, 10, [['w0', 'w1'], ['w4', 'w5']]).sandbox.buildTables(6);
    expect(grouped.map(t => t.men.map(u => u.id))).toEqual(plain.map(t => t.men.map(u => u.id)));
  });
});

describe('a party too big for a table', () => {
  it('is split across tables and reported, not silently crammed in', () => {
    // 10 women over 3 tables is quotas [4,3,3]; a party of five fits nowhere.
    const s = seating(10, 10, [['w0', 'w1', 'w2', 'w3', 'w4']]);
    const t = s.sandbox.buildTables(6);
    expect(t.map(x => x.women.length)).toEqual([4, 3, 3]);
    const splits = vm.runInContext('_groupSplits', s.sandbox);
    expect(splits.length).toBe(1);
    expect(splits[0].tables.length).toBeGreaterThan(1);
  });

  it('reports nothing when every party fits', () => {
    const s = seating(10, 10, [['w0', 'w1']]);
    s.sandbox.buildTables(6);
    expect(vm.runInContext('_groupSplits', s.sandbox)).toEqual([]);
  });
});

describe('the rotation guarantee still holds', () => {
  // The promise a host repeats out loud: "everyone you're about to meet is
  // someone new." Grouping must not cost it.
  it('never repeats a pairing across rounds', () => {
    const s = seating(12, 12, [['w0', 'w1'], ['w2', 'w3'], ['w4', 'w5']]);
    const rounds = s.sandbox.buildRounds(6, 4);
    expect(rounds.length).toBeGreaterThan(1);
    const seen = new Set();
    rounds.forEach((rnd, r) => rnd.forEach(t => t.women.forEach(w => t.men.forEach(m => {
      const key = w.id + '|' + m.id;
      expect(seen.has(key), `${key} repeated by round ${r + 1}`).toBe(false);
      seen.add(key);
    }))));
  });

  it('keeps parties together in every round, not just the first', () => {
    // Women hold their seats, so this should hold by construction — assert it
    // anyway, because that is exactly the kind of invariant a later change to
    // rotateTables could quietly drop.
    const s = seating(12, 12, [['w0', 'w1']]);
    const rounds = s.sandbox.buildRounds(6, 4);
    rounds.forEach((rnd, r) => {
      expect(tableOf(rnd, 'w0'), `round ${r + 1}`).toBe(tableOf(rnd, 'w1'));
    });
  });
});

describe('normaliseGroups', () => {
  const norm = (groups, ids) => {
    const s = seating(1, 1, []);
    return s.sandbox.normaliseGroups(groups, ids.map(id => ({ id })));
  };

  it('drops people who are no longer registered', () => {
    expect(norm([['a', 'b', 'gone']], ['a', 'b'])).toEqual([['a', 'b']]);
  });

  it('drops a party that shrinks to one', () => {
    expect(norm([['a', 'gone']], ['a'])).toEqual([]);
  });

  it('merges overlapping parties — linking A-B then B-C is one party of three', () => {
    const out = norm([['a', 'b'], ['b', 'c']], ['a', 'b', 'c']);
    expect(out.length).toBe(1);
    expect([...out[0]].sort()).toEqual(['a', 'b', 'c']);
  });

  it('de-duplicates a repeated id', () => {
    expect(norm([['a', 'a', 'b']], ['a', 'b'])).toEqual([['a', 'b']]);
  });
});
