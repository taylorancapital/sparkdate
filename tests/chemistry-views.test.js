// tests/chemistry-views.test.js
//
// The seating maths is pinned in tests/chemistry-rotation.test.js. This file
// covers the other way these views fail, which is louder and stupider: a
// render function that throws.
//
// Every one of them is called from switchChemView() when the host taps a tab,
// and three of the five are also called from a 1-second interval during a
// live event. A reference to a helper that was renamed, or an element id that
// was never added to the modal, produces a blank panel and a console error
// nobody is looking at — at 6:30pm, in a loud room, holding a phone.
//
// So each view is rendered here against a stub DOM: no jsdom (this repo has
// no DOM test dependency and this does not justify adding one), just enough
// of document to record what each render writes and to prove it wrote
// something. The assertions stay on facts a host would notice — the round
// controls exist, the rotation instruction appears in round 2 and not round
// 1, the lookup finds a person and lists their table for every round.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Same indentation-based lifter as chemistry-rotation.test.js. Duplicated
// rather than shared: a helper module between two test files is one more
// thing to keep in step, and this is fifteen lines.
function lift(name) {
  const decl = new RegExp(`^ {8}(?:function ${name}\\s*\\(|const ${name}\\s*=)`, 'm');
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

const LIFTED = ['INTENT_LABELS', 'ROUND_CHOICES', '_chemShortName', '_chemInitials',
                'movesLabel', 'tableCount', 'quotas', 'fillTablePairs', 'pairLookup',
                'buildTables', 'rotateTables', 'maxRoundsFor', 'rehydratePin', 'seatingTables',
                'buildRounds', 'seatedRoundOf', 'rosterDrift', 'driftNote', 'pinSeating',
                'chemStoreWrite',
                'metInRounds', 'itineraryFor', 'buildOneOnOnes', 'introRowsFor',
                'topMatchesFor', 'shortlistControl', 'prioRows', 'renderChemistryCards',
                'renderIntros', 'renderPriorityIntros', 'renderTables', 'renderRunOfShow',
                'renderFindPanel', 'findAttendees', 'runPlanKey', 'computeRunPlan', 'buildRunPlan', 'fmtClock', 'safe'];

// Element ids the chemistry modal actually declares. Rendering into an id
// that is not in the markup is the exact bug this file exists to catch, so
// the stub refuses unknown ids rather than inventing them.
const MODAL_IDS = ['chemView', 'introsView', 'introsHeader', 'introsGrid', 'scheduleView',
                   'tablesView', 'runView', 'candidateTable', 'candidateStats',
                   'candidateModal', 'candidateModalTitle', 'candidateModalSub',
                   'viewChemBtn', 'viewIntrosBtn', 'viewScheduleBtn', 'viewTablesBtn',
                   'viewRunBtn', 'runFindInput'];

function stubDom() {
  const nodes = new Map();
  const make = (id) => ({
    id, innerHTML: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    focus() {}, setSelectionRange() {},
  });
  MODAL_IDS.forEach(id => nodes.set(id, make(id)));
  return {
    nodes,
    document: {
      activeElement: null,
      getElementById(id) {
        if (!nodes.has(id)) throw new Error(`render wrote to unknown element id "${id}"`);
        // runFindInput only exists once the panel has rendered it.
        if (id === 'runFindInput' && !nodes.get('runView').innerHTML.includes('runFindInput')) return null;
        return nodes.get(id);
      },
    },
  };
}

const people = (n, prefix, gender) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, firstName: `${prefix === 'w' ? 'Wendy' : 'Marco'}${i}`, lastName: 'Quinn',
    email: `${prefix}${i}@example.com`, gender, age: 28 + (i % 9),
    interests: ['hiking', 'jazz'], vibes: ['adventurous'], intent: 'long_term',
  }));

// A 12x12 room at six seats is four tables, and four seatings across four
// tables is a COMPLETE round robin — every woman meets every man and the
// manual intro list empties. That is the right answer and it gets its own
// test, but it makes a useless fixture for the views that exist to show what
// the rotation misses. Those pass size 4: six tables, four seatings, so each
// woman meets eight of the twelve men and four intros are left to the host.
function view(W = 12, M = 12, size = 6) {
  const women = people(W, 'w', 'woman'), men = people(M, 'm', 'man');
  const pairs = [];
  for (const w of women) for (const m of men) {
    pairs.push({
      a: w, b: m,
      score: ((+w.id.slice(1) * 7 + +m.id.slice(1) * 13) % 61) + 20,
      sharedInterests: ['hiking'], partialInterests: [], sharedVibes: ['adventurous'],
      intentLabel: 'Same · Long-term', ageGap: 2, limitedProfile: false,
    });
  }
  const dom = stubDom();
  const sandbox = {
    console, setInterval: () => 1, clearInterval: () => {}, Date,
    document: dom.document,
    _chemWomen: women, _chemMen: men, _chemPairs: pairs,
    // Pinning is covered in chemistry-persistence; these render against a
    // fresh solve, so the pin stays null.
    _pinnedPlan: null, _chemEventId: null, _runPlanCache: null,
    _introsDone: new Set(), _priorityDone: new Set(), _prioMode: 'all', _shortlistN: 3,
    _tableSize: size, _tableRound: 1, _tableRounds: 4, _roundMinutes: 15,
    _runTimer: null, _runEndsAt: null, _runPaused: null, _runStep: 0, _runFind: '',
    ONE_ON_ONE_MS: 5 * 60 * 1000,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  return { sandbox, nodes: dom.nodes, women, men, pairs };
}

describe('renderTables', () => {
  it('renders without throwing and offers every seating count', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('Table 1');
    for (const n of [2, 3, 4]) expect(html).toContain(`setTableRounds(${n})`);
    expect(html).toContain('Seats per table');
  });

  it('counts in seatings and states the moves beside them', () => {
    // Four seatings is three moves. The host says "moves"; the code says
    // "seatings"; the label has to carry both or they mean different nights.
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('Seatings');
    expect(html).toContain('4 seatings');
    expect(html).toContain('3 moves');
    expect(html).toContain('with no pairing repeated');
  });

  it('offers a "showing" button for all four seatings', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`setTableRound(${n})`);
  });

  it('warns when the host asks for more seatings than the room can serve', () => {
    // 6W/7M at six seats is two tables, so a third seating would repeat the
    // first. The host has to be told, not quietly given two.
    const { sandbox, nodes } = view(6, 7);
    sandbox._tableRounds = 4;
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('rotation-warn');
    expect(html).toContain('back exactly where round 1 had it');
    expect(html).toContain('Asked for 4');
  });

  it('disables the seatings the room cannot serve rather than hiding them', () => {
    const { sandbox, nodes } = view(6, 7);
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('setTableRound(3)');
    expect(html).toMatch(/setTableRound\(3\)"\s+disabled/);
    expect(html).toMatch(/setTableRound\(4\)"\s+disabled/);
    expect(html).not.toMatch(/setTableRound\(2\)"\s+disabled/);
  });

  it('does not warn when the seatings asked for all fit', () => {
    const { sandbox, nodes } = view(12, 12);
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).not.toContain('rotation-warn');
  });

  it('shows the move instruction only from round two on', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).not.toContain('Men from table');
    sandbox._tableRound = 2;
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('Men from table');
    expect(html).toContain('Men move one table along');
  });

  it('falls back to a valid round when the count drops under it', () => {
    // Host is looking at seating 4, then switches to 2. Seating 4 no longer
    // exists; the view must not render an empty table list.
    const { sandbox, nodes } = view();
    sandbox._tableRound = 4;
    sandbox._tableRounds = 2;
    sandbox.renderTables();
    expect(sandbox._tableRound).toBe(2);
    expect(nodes.get('tablesView').innerHTML).toContain('Table 1');
  });

  it('says how many pairs the rotation leaves for the host', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).toMatch(/pairs never share a table/);
  });

  it('says the seating is pinned, and offers a rebuild', () => {
    const { sandbox, nodes } = view();
    sandbox.pinSeating(6);
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('Seating pinned at');
    expect(html).toContain('will not change on its own');
    expect(html).toContain('rebuildSeating()');
    expect(html).not.toContain('pin-note drift');
  });

  it('names the late arrivals and offers to seat them without moving anyone', () => {
    // The banner is the safety net for the failure this whole change exists
    // to remove: a walk-in silently re-seeding the seating after the host
    // has already read the tables out.
    const { sandbox, nodes } = view();
    sandbox.pinSeating(6);
    sandbox._chemWomen = [...sandbox._chemWomen, {
      id: 'late1', firstName: 'Nadia', lastName: 'Okafor', email: 'l@example.com',
      gender: 'woman', age: 31, interests: [], vibes: [], intent: null,
    }];
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('pin-note drift');
    expect(html).toContain('has arrived since');
    expect(html).toContain('seatLateArrivals()');
    expect(html).toContain('Seat 1 new');
    expect(html).toContain('Nadia O.');
  });

  it('says nothing about pinning before a plan is pinned', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).not.toContain('pin-note');
  });

  it('says so when the rotation covers the entire room', () => {
    // Four seatings across four tables is a complete round robin: every
    // woman meets every man and there is nothing left to introduce. Worth
    // saying out loud — it is the reason to pick the fourth seating.
    const { sandbox, nodes } = view(12, 12, 6);
    expect(sandbox.buildRounds(6, 4)).toHaveLength(4);
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('the rotation covers the whole room');
    expect(html).not.toMatch(/pairs never share a table/);
  });
});

describe('renderIntros', () => {
  // Size 4 so the rotation leaves work behind — see the note on view().
  let ctx;
  beforeEach(() => { ctx = view(12, 12, 4); ctx.sandbox.renderIntros(); });

  it('tags every match with its round or marks it as a manual intro', () => {
    const html = ctx.nodes.get('introsGrid').innerHTML;
    expect(html).toContain('intro-tag seated');
    expect(html).toContain('intro-tag manual');
  });

  it('puts the manual intros above the ones the seating covers', () => {
    // This is the whole change to this view: a flat score ranking sent the
    // host chasing introductions the rotation was about to make anyway.
    // Checked in EVERY column, not just the first — the ordering is applied
    // per woman, so one column silently reverting would be invisible.
    const cols = ctx.nodes.get('introsGrid').innerHTML
      .split('<div class="intro-col">').slice(1);
    expect(cols).toHaveLength(ctx.women.length);
    for (const col of cols) {
      const tags = [...col.matchAll(/intro-tag (manual|seated)/g)].map(m => m[1]);
      expect(tags).toContain('manual');
      expect(tags).toContain('seated');
      // The last manual intro comes before the first seated pair: once the
      // rotation starts covering them, nothing needing a host follows.
      expect(tags.lastIndexOf('manual')).toBeLessThan(tags.indexOf('seated'));
    }
  });

  it('writes the coverage summary into its own header element', () => {
    expect(ctx.nodes.get('introsHeader').innerHTML).toMatch(/of \d+ pairs together on their own/);
  });

  it('lists every man for every woman, none dropped by the reordering', () => {
    const rows = ctx.nodes.get('introsGrid').innerHTML.match(/class="intro-item/g) || [];
    expect(rows).toHaveLength(ctx.women.length * ctx.men.length);
  });
});

describe('renderPriorityIntros', () => {
  it('leads with the pairs no round seats together', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toMatch(/<strong>\d+<\/strong> of \d+ pairs are never seated together/);
    const rows = html.slice(html.indexOf('prio-list'));
    expect(rows.lastIndexOf('intro-tag manual')).toBeLessThan(rows.indexOf('intro-tag seated'));
  });

  it('offers all three modes', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toContain("setPrioMode('all')");
    expect(html).toContain("setPrioMode('manual')");
    expect(html).toContain("setPrioMode('top')");
    expect(html).toContain('Top 3 each');
  });

  it('can hide everything the rotation already covers', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox._prioMode = 'manual';
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toContain('intro-tag manual');
    expect(html.slice(html.indexOf('prio-list'))).not.toContain('intro-tag seated');
  });

  it('cuts to each woman\'s top N in "top" mode', () => {
    const { sandbox, nodes, women } = view(12, 12, 4);
    sandbox._prioMode = 'top';
    sandbox._shortlistN = 3;
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    const rows = (html.match(/class="prio-item/g) || []).length;
    expect(rows).toBe(women.length * 3);
    expect(html).toContain('shortlist-ctl');
    expect(html).toContain('setShortlistN(5)');
  });

  it('honours the shortlist size, and treats "All" as no cut', () => {
    const { sandbox, nodes, women, men } = view(12, 12, 4);
    sandbox._prioMode = 'top';
    sandbox._shortlistN = 5;
    sandbox.renderPriorityIntros();
    expect((nodes.get('scheduleView').innerHTML.match(/class="prio-item/g) || []).length)
      .toBe(women.length * 5);
    sandbox._shortlistN = 0;
    sandbox.renderPriorityIntros();
    expect((nodes.get('scheduleView').innerHTML.match(/class="prio-item/g) || []).length)
      .toBe(women.length * men.length);
  });

  it('keeps the manual intros first inside the shortlist too', () => {
    // A woman's top 3 can contain both kinds. The one the seating will never
    // reach is still the one to walk over and introduce.
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox._prioMode = 'top';
    sandbox.renderPriorityIntros();
    const rows = nodes.get('scheduleView').innerHTML;
    const list = rows.slice(rows.indexOf('prio-list'));
    const tags = [...list.matchAll(/intro-tag (manual|seated)/g)].map(m => m[1]);
    expect(tags).toContain('manual');
    expect(tags.lastIndexOf('manual')).toBeLessThan(tags.indexOf('seated'));
  });

  it('says how much of the list the shortlist is hiding', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox._prioMode = 'top';
    sandbox.renderPriorityIntros();
    expect(nodes.get('scheduleView').innerHTML).toMatch(/Showing \d+ of \d+/);
  });

  it('explains an empty "intros only" instead of showing a blank list', () => {
    // On a room the rotation fully covers, "Intros only" is legitimately
    // empty. A blank panel reads as broken; the reason does not.
    const { sandbox, nodes } = view(12, 12, 6);
    sandbox._prioMode = 'manual';
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toContain('Nothing to introduce by hand');
    expect(html).toMatch(/printPriorityIntros\(\)"\s+disabled/);
  });

  it('shows the shortlist control only in the mode that uses it', () => {
    const { sandbox, nodes } = view(12, 12, 4);
    sandbox._prioMode = 'all';
    sandbox.renderPriorityIntros();
    expect(nodes.get('scheduleView').innerHTML).not.toContain('shortlist-ctl');
  });
});

describe('renderChemistryCards', () => {
  it('renders one card per woman with her top N', () => {
    const { sandbox, nodes, women } = view();
    sandbox.renderChemistryCards();
    const html = nodes.get('candidateTable').innerHTML;
    expect((html.match(/class="chem-card"/g) || []).length).toBe(women.length);
    expect((html.match(/class="chem-match-row"/g) || []).length).toBe(women.length * 3);
  });

  it('carries the same shortlist control as the intro list', () => {
    const { sandbox, nodes } = view();
    sandbox.renderChemistryCards();
    const html = nodes.get('candidateTable').innerHTML;
    expect(html).toContain('shortlist-ctl');
    expect(html).toContain('setShortlistN(3)');
    expect(html).toContain('setShortlistN(0)');
  });

  it('honours the shortlist size', () => {
    // The count used to be hardcoded to three here and absent from the intro
    // list; one setting now drives both, so they cannot disagree.
    const { sandbox, nodes, women, men } = view();
    sandbox._shortlistN = 5;
    sandbox.renderChemistryCards();
    expect((nodes.get('candidateTable').innerHTML.match(/class="chem-match-row"/g) || []).length)
      .toBe(women.length * 5);
    sandbox._shortlistN = 0;
    sandbox.renderChemistryCards();
    expect((nodes.get('candidateTable').innerHTML.match(/class="chem-match-row"/g) || []).length)
      .toBe(women.length * men.length);
  });

  it('ranks each card best-first', () => {
    const { sandbox, nodes } = view();
    sandbox.renderChemistryCards();
    const card = nodes.get('candidateTable').innerHTML.split('class="chem-card"')[1];
    const scores = [...card.matchAll(/chem-match-score[^>]*>(\d+)</g)].map(m => +m[1]);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('renders an empty room as a message, not a crash', () => {
    const { sandbox, nodes } = view();
    sandbox._chemPairs = [];
    expect(() => sandbox.renderChemistryCards()).not.toThrow();
    expect(nodes.get('candidateTable').innerHTML).toContain('No opposite-gender pairs yet');
  });
});

describe('renderRunOfShow', () => {
  it('renders the live panel with a clock, controls and the seating', () => {
    const { sandbox, nodes } = view();
    sandbox.renderRunOfShow();
    const html = nodes.get('runView').innerHTML;
    expect(html).toContain('run-clock');
    expect(html).toContain('15:00');
    expect(html).toContain('Round 1');
    expect(html).toContain('Table 1');
    expect(html).toContain('runStart()');
  });

  it('carries the round-length and seating-count controls', () => {
    const { sandbox, nodes } = view();
    sandbox.renderRunOfShow();
    const html = nodes.get('runView').innerHTML;
    expect(html).toContain('setRoundMinutes(10)');
    expect(html).toContain('setRoundMinutes(20)');
    for (const n of [2, 3, 4]) expect(html).toContain(`setTableRounds(${n})`);
    expect(html).toContain('4 seatings (3 moves)');
  });

  it('states the total table time, since four seatings is an hour of it', () => {
    // 4 x 15 is 60 minutes before anyone gets a 1-on-1. A host choosing the
    // fourth seating should see the hour, not discover it at 7:40.
    const { sandbox, nodes } = view();
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('<strong>60 min of tables</strong>');
    sandbox._roundMinutes = 10;
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('<strong>40 min of tables</strong>');
  });

  it('honours a changed round length in the clock and the plan', () => {
    const { sandbox, nodes } = view();
    sandbox._roundMinutes = 10;
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('10:00');
  });

  it('steps through all four seatings before the 1-on-1s', () => {
    const { sandbox, nodes } = view();
    const plan = sandbox.buildRunPlan();
    const seated = plan.filter(s => s.kind === 'round');
    expect(seated).toHaveLength(4);
    expect(plan.slice(0, 4).every(s => s.kind === 'round')).toBe(true);
    expect(plan.slice(4).every(s => s.kind === 'ones')).toBe(true);

    // Every seating after the first is a move, and says so.
    for (const step of [1, 2, 3]) {
      sandbox._runStep = step;
      sandbox.renderRunOfShow();
      const html = nodes.get('runView').innerHTML;
      expect(html).toContain(`Round ${step + 1}`);
      expect(html).toContain('Women stay seated. Men move one table along.');
      expect(html).toContain('men from');
    }

    sandbox._runStep = 4;
    sandbox.renderRunOfShow();
    const html = nodes.get('runView').innerHTML;
    expect(html).toContain('1-on-1s');
    expect(html).toContain('05:00');
  });

  it('does not re-solve the night on every clock tick', () => {
    // renderRunOfShow is on a 1-second interval. This used to rebuild the
    // seating, the rotation and the 1-on-1 packing sixty times a minute.
    const { sandbox } = view();
    const first = sandbox.buildRunPlan();
    expect(sandbox.buildRunPlan()).toBe(first);       // same object, not a rebuild
  });

  it('does re-solve when something the plan depends on changes', () => {
    const { sandbox } = view();
    const first = sandbox.buildRunPlan();
    sandbox._tableRounds = 2;
    const second = sandbox.buildRunPlan();
    expect(second).not.toBe(first);
    expect(second.filter(s => s.kind === 'round')).toHaveLength(2);

    sandbox._roundMinutes = 10;
    expect(sandbox.buildRunPlan()).not.toBe(second);
  });

  it('re-solves after a re-pin, so a rebuild reaches the run of show', () => {
    const { sandbox } = view();
    sandbox.pinSeating(6);
    const first = sandbox.buildRunPlan();
    sandbox.pinSeating(6);                            // stamps a new builtAt
    expect(sandbox.buildRunPlan()).not.toBe(first);
  });

  it('shows the lookup box on every render — it is the point of the view', () => {
    const { sandbox, nodes } = view();
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('Where do I sit?');
  });

  it('answers "where do I sit" with a table for every round', () => {
    const { sandbox, nodes } = view();
    sandbox._runFind = 'Marco3';
    sandbox.renderRunOfShow();
    const html = nodes.get('runView').innerHTML;
    expect(html).toContain('Marco3');
    expect((html.match(/run-find-leg/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('R1');
    expect(html).toContain('R3');
    expect(html).toContain('Table');
  });

  it('marks the round currently running in the lookup', () => {
    const { sandbox, nodes } = view();
    sandbox._runFind = 'Wendy0';
    sandbox._runStep = 1;
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('run-find-leg now');
  });

  it('says so plainly when the name is not in the room', () => {
    const { sandbox, nodes } = view();
    sandbox._runFind = 'Nobody';
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('No one by that name');
  });

  it('ignores a query too short to mean anything', () => {
    const { sandbox } = view();
    expect(sandbox.findAttendees('W')).toEqual([]);
    expect(sandbox.findAttendees('  ')).toEqual([]);
    expect(sandbox.findAttendees('Wendy1').length).toBeGreaterThan(0);
  });

  it('finds people by surname and by email too', () => {
    const { sandbox } = view();
    expect(sandbox.findAttendees('quinn').length).toBeGreaterThan(0);
    expect(sandbox.findAttendees('m4@example').map(u => u.id)).toEqual(['m4']);
  });

  it('tells the host when the room asked for more rounds than it can serve', () => {
    const { sandbox, nodes } = view(6, 7);
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('only 2 fit without repeating');
  });

  it('renders an empty room as a message, not a crash', () => {
    const { sandbox, nodes } = view();
    sandbox._chemWomen = []; sandbox._chemMen = []; sandbox._chemPairs = [];
    expect(() => sandbox.renderRunOfShow()).not.toThrow();
    expect(nodes.get('runView').innerHTML).toContain('No attendees scored yet');
  });
});
