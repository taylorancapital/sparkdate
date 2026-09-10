// tests/chemistry-whereabouts.test.js
//
// "Where do I go next?" — the question the run of show exists to answer fast,
// and the one it could only answer for the first third of the night.
//
// renderRunOfShow used to hand the lookup `plan.filter(s => s.kind ===
// 'round')`. On a 10W/10M room at the defaults that is 3 of 9 plan steps: the
// three seated rounds. For all six 1-on-1 rounds — more than half the night by
// wall clock, and the segment the host is asked about most — it returned
// nothing at all. The pairings were never missing. buildOneOnOnes() had
// computed every one of them; they were simply never handed over.
//
// The second failure is quieter and lands on a guest rather than the host:
// in an unbalanced room a lot of people are unpaired in each 1-on-1 round and
// the panel listed only the pairs, so their names appeared nowhere. On the two
// most skewed rosters this business has actually run (9W/20M and 4W/9M) that
// is 38% of the room, every round.
//
// Both are asserted here against the SHIPPED code lifted out of
// public/admin.html, the same way the other chemistry suites lift it.

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

const LIFTED = ['ROUND_CHOICES', 'movesLabel',
  '_nameLabels', '_nameLabelsFor', '_nameRungs', 'buildNameLabels', 'ensureNameLabels',
  '_chemShortName',
  'tableCount', 'quotas', 'fillTablePairs', 'pairLookup',
  // buildTables ends by calling applyGroups (women who arrived together share
  // a table), so these travel with it.
  '_chemGroups', '_groupSplits', 'groupKeyOf', 'normaliseGroups', 'applyGroups',
  'buildTables', 'rotateTables',
  'maxRoundsFor', 'rehydratePin', 'seatingTables', 'buildRounds', 'seatedRoundOf',
  'metInRounds', 'itineraryFor', 'planLegsFor', 'idleInStep', 'legText', 'buildOneOnOnes'];

const people = (n, prefix, gender) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, firstName: `${prefix === 'w' ? 'Wendy' : 'Marco'}${i}`, lastName: 'Quinn',
    email: `${prefix}${i}@example.com`, gender, age: 30, interests: [], vibes: [], intent: null,
  }));

const varied = (w, m) => ((parseInt(w.id.slice(1), 10) * 7 + parseInt(m.id.slice(1), 10) * 13) % 61) + 20;

function room(nw, nm) {
  const women = people(nw, 'w', 'woman'), men = people(nm, 'm', 'man');
  const pairs = [];
  for (const w of women) for (const m of men) {
    pairs.push({ a: w, b: m, score: varied(w, m),
      sharedInterests: [], partialInterests: [], sharedVibes: [],
      intentLabel: '', ageGap: null, limitedProfile: false });
  }
  const sandbox = { _chemWomen: women, _chemMen: men, _chemPairs: pairs,
                    _pinnedPlan: null, _chemEventId: null, console };
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  return { sandbox, women, men };
}

// computeRunPlan() is not lifted — it reads half a dozen module-scope prefs.
// This mirrors it exactly: seated rounds first, then the 1-on-1 rounds.
function planOf(sandbox, size = 6, seatings = 3) {
  const rounds = sandbox.buildRounds(size, seatings);
  const ones = sandbox.buildOneOnOnes(rounds, 6);
  return [
    ...rounds.map((tables, i) => ({ kind: 'round', label: `Round ${i + 1}`, tables })),
    ...ones.rounds.map((pairs, i) => ({ kind: 'ones', label: `1-on-1s · round ${i + 1}`, pairs })),
  ];
}

describe('planLegsFor — the whole night, not just the seated half', () => {
  it('answers for every plan step, including all the 1-on-1 rounds', () => {
    const { sandbox, women } = room(10, 10);
    const plan = planOf(sandbox);
    const seated = plan.filter(s => s.kind === 'round').length;
    const ones = plan.filter(s => s.kind === 'ones').length;
    // The shape of the regression: 3 seated, 6 one-on-one.
    expect(seated).toBe(3);
    expect(ones).toBeGreaterThan(seated);

    const legs = sandbox.planLegsFor(women[0], plan);
    expect(legs).toHaveLength(plan.length);
    // Every 1-on-1 leg carries a real answer, where the old lookup had none.
    legs.filter(l => l.kind === 'ones').forEach((leg) => {
      expect(leg.idle === true || leg.partner !== null,
        `${leg.label} answered neither a partner nor "idle"`).toBe(true);
    });
  });

  it('names the actual partner for a 1-on-1 step', () => {
    const { sandbox, women } = room(10, 10);
    const plan = planOf(sandbox);
    const legs = sandbox.planLegsFor(women[0], plan);
    plan.forEach((step, i) => {
      if (step.kind !== 'ones') return;
      const truth = step.pairs.find(p => p.a.id === women[0].id || p.b.id === women[0].id);
      if (!truth) { expect(legs[i].idle).toBe(true); return; }
      const other = truth.a.id === women[0].id ? truth.b : truth.a;
      expect(legs[i].partner.id).toBe(other.id);
      expect(legs[i].idle).toBe(false);
    });
  });

  it('gives a table and the people to meet for a seated step', () => {
    const { sandbox, women } = room(10, 10);
    const plan = planOf(sandbox);
    const legs = sandbox.planLegsFor(women[0], plan);
    legs.filter(l => l.kind === 'round').forEach(leg => {
      expect(leg.table).toBeGreaterThan(0);
      expect(leg.withThem.length).toBeGreaterThan(0);
      // A woman is shown the men at her table, never herself.
      expect(leg.withThem.every(o => o.gender === 'man')).toBe(true);
      expect(leg.withThem.some(o => o.id === women[0].id)).toBe(false);
    });
  });

  it('agrees with itineraryFor on the seated rounds', () => {
    // The seated half already had a tested answer. This must not contradict
    // it — two functions disagreeing about where someone sits is worse than
    // one of them being silent.
    const { sandbox, women, men } = room(11, 14);
    const rounds = sandbox.buildRounds(6, 3);
    const plan = planOf(sandbox);
    for (const person of [...women, ...men]) {
      const old = sandbox.itineraryFor(person, rounds).map(l => l.table);
      const now = sandbox.planLegsFor(person, plan)
        .filter(l => l.kind === 'round').map(l => l.table);
      expect(now, person.id).toEqual(old);
    }
  });

  it('is empty rather than throwing on a missing person or plan', () => {
    const { sandbox, women } = room(6, 6);
    expect(sandbox.planLegsFor(null, planOf(sandbox))).toEqual([]);
    expect(sandbox.planLegsFor(women[0], [])).toEqual([]);
    expect(sandbox.planLegsFor(women[0], null)).toEqual([]);
  });

  it('reports a walk-in who is in no seating as idle, not as table null silently', () => {
    const { sandbox } = room(10, 10);
    const plan = planOf(sandbox);
    const stranger = { id: 'nobody', firstName: 'Late', lastName: 'Arrival', gender: 'woman' };
    const legs = sandbox.planLegsFor(stranger, plan);
    expect(legs).toHaveLength(plan.length);
    expect(legs.every(l => l.idle === true)).toBe(true);
  });
});

describe('idleInStep — the people the round forgot', () => {
  it('names everyone unpaired in a 1-on-1 round', () => {
    const { sandbox } = room(8, 14);
    const plan = planOf(sandbox);
    const ones = plan.filter(s => s.kind === 'ones');
    expect(ones.length).toBeGreaterThan(0);
    ones.forEach(step => {
      const idle = sandbox.idleInStep(step);
      const busy = new Set();
      step.pairs.forEach(p => { busy.add(p.a.id); busy.add(p.b.id); });
      expect(idle.length).toBe(22 - busy.size);
      expect(idle.every(u => !busy.has(u.id))).toBe(true);
    });
  });

  it('finds the skewed rooms this business actually runs', () => {
    // 9W/20M was Round 2; 4W/9M was Good Good. Both leave a large, entirely
    // male group with nobody, in every round. That is the number that decides
    // whether a standing 1-on-1 format is a good idea.
    for (const [nw, nm] of [[9, 20], [4, 9]]) {
      const { sandbox } = room(nw, nm);
      const plan = planOf(sandbox);
      const ones = plan.filter(s => s.kind === 'ones');
      const idle = sandbox.idleInStep(ones[0]);
      expect(idle.length, `${nw}W/${nm}M`).toBe(nm - nw);
      expect(idle.every(u => u.gender === 'man')).toBe(true);
    }
  });

  it('is empty for a balanced room', () => {
    const { sandbox } = room(10, 10);
    const plan = planOf(sandbox);
    expect(sandbox.idleInStep(plan.filter(s => s.kind === 'ones')[0])).toEqual([]);
  });

  it('is empty for a seated round — everyone is at a table by construction', () => {
    const { sandbox } = room(8, 14);
    const plan = planOf(sandbox);
    expect(sandbox.idleInStep(plan[0])).toEqual([]);
    expect(sandbox.idleInStep(null)).toEqual([]);
  });
});

describe('legText — what the host reads out', () => {
  it('reads a seated leg as a table and who is there', () => {
    const { sandbox, women } = room(10, 10);
    const legs = sandbox.planLegsFor(women[0], planOf(sandbox));
    const t = sandbox.legText(legs[0]);
    expect(t.where).toMatch(/^Table \d+$/);
    expect(t.who).toMatch(/^with /);
  });

  it('reads a 1-on-1 leg as a person, not a place', () => {
    // If the 1-on-1s are run standing there is no table to name, and the
    // answer to "where do I go" is a person. This is what makes that work.
    const { sandbox, women } = room(10, 10);
    const plan = planOf(sandbox);
    const legs = sandbox.planLegsFor(women[0], plan);
    const oneLeg = legs.find(l => l.kind === 'ones' && !l.idle);
    const t = sandbox.legText(oneLeg);
    // _chemShortName is a `const` arrow, so it lives in the script's lexical
    // scope rather than on the sandbox object — evaluate in the context.
    const label = vm.runInContext(
      `_chemShortName([..._chemWomen, ..._chemMen].find(u => u.id === ${JSON.stringify(oneLeg.partner.id)}))`,
      sandbox);
    expect(t.where).toBe(label);
    expect(t.who).toBe('one-on-one');
  });

  it('says so out loud when there is nobody', () => {
    const { sandbox, men } = room(4, 9);
    const plan = planOf(sandbox);
    const legs = sandbox.planLegsFor(men[men.length - 1], plan);
    const idleLeg = legs.find(l => l.kind === 'ones' && l.idle);
    expect(idleLeg, 'expected somebody idle in a 4W/9M room').toBeTruthy();
    expect(sandbox.legText(idleLeg).where).toBe('Sitting out');
  });

  it('handles the end of the night rather than rendering undefined', () => {
    // The NEXT cell asks for legs[stepIdx + 1], which does not exist on the
    // last step. That is a normal state, not a bug, and it has to read as one.
    const { sandbox } = room(6, 6);
    expect(sandbox.legText(null).where).toBe('Done');
    expect(sandbox.legText(undefined).where).toBe('Done');
  });
});
