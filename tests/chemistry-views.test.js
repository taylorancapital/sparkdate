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
  if (firstLine.includes('{') && /\};?$/.test(firstLine.trim())) return firstLine;
  const close = /^ {8}\};?$/m.exec(rest.slice(firstLine.length + 1));
  if (!close) throw new Error(`${name} never closes`);
  return rest.slice(0, firstLine.length + 1 + close.index + close[0].length);
}

const LIFTED = ['_chemShortName', '_chemInitials',
                'tableCount', 'quotas', 'fillTablePairs', 'pairLookup', 'buildTables', 'rotateTables',
                'maxRoundsFor', 'buildRounds', 'seatedRoundOf', 'metInRounds', 'itineraryFor',
                'buildOneOnOnes', 'introRowsFor', 'renderIntros', 'renderPriorityIntros',
                'renderTables', 'renderRunOfShow', 'renderFindPanel', 'findAttendees',
                'buildRunPlan', 'fmtClock', 'safe'];

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

function view(W = 12, M = 12) {
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
    _introsDone: new Set(), _priorityDone: new Set(), _prioOnlyManual: false,
    _tableSize: 6, _tableRound: 1, _tableRounds: 3, _roundMinutes: 15,
    _runTimer: null, _runEndsAt: null, _runPaused: null, _runStep: 0, _runFind: '',
    ONE_ON_ONE_MS: 5 * 60 * 1000,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  return { sandbox, nodes: dom.nodes, women, men, pairs };
}

describe('renderTables', () => {
  it('renders without throwing and offers both round counts', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('Table 1');
    expect(html).toContain('setTableRounds(2)');
    expect(html).toContain('setTableRounds(3)');
    expect(html).toContain('Seats per table');
  });

  it('states how many rounds the table count actually supports', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).toContain('with no pairing repeated');
  });

  it('warns when the host asks for more rounds than the room can serve', () => {
    // 6W/7M at six seats is two tables, so round three would repeat round
    // one. The host has to be told, not quietly given two.
    const { sandbox, nodes } = view(6, 7);
    sandbox._tableRounds = 3;
    sandbox.renderTables();
    const html = nodes.get('tablesView').innerHTML;
    expect(html).toContain('rotation-warn');
    expect(html).toContain('re-seat round 1');
  });

  it('does not warn when the rounds asked for all fit', () => {
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
    // Host is looking at round 3, then switches to 2 rounds. Round 3 no
    // longer exists; the view must not render an empty table list.
    const { sandbox, nodes } = view();
    sandbox._tableRound = 3;
    sandbox._tableRounds = 2;
    sandbox.renderTables();
    expect(sandbox._tableRound).toBe(2);
    expect(nodes.get('tablesView').innerHTML).toContain('Table 1');
  });

  it('says how many pairs the rotation leaves for the host', () => {
    const { sandbox, nodes } = view();
    sandbox.renderTables();
    expect(nodes.get('tablesView').innerHTML).toMatch(/pairs never share a table/);
  });
});

describe('renderIntros', () => {
  let ctx;
  beforeEach(() => { ctx = view(); ctx.sandbox.renderIntros(); });

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
    const { sandbox, nodes } = view();
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toMatch(/<strong>\d+<\/strong> of \d+ pairs are never seated together/);
    expect(html.indexOf('intro-tag manual')).toBeLessThan(html.indexOf('intro-tag seated'));
  });

  it('can hide everything the rotation already covers', () => {
    const { sandbox, nodes } = view();
    sandbox._prioOnlyManual = true;
    sandbox.renderPriorityIntros();
    const html = nodes.get('scheduleView').innerHTML;
    expect(html).toContain('intro-tag manual');
    expect(html).not.toContain('intro-tag seated');
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

  it('carries the round-length and round-count controls', () => {
    const { sandbox, nodes } = view();
    sandbox.renderRunOfShow();
    const html = nodes.get('runView').innerHTML;
    expect(html).toContain('setRoundMinutes(10)');
    expect(html).toContain('setRoundMinutes(20)');
    expect(html).toContain('setTableRounds(3)');
    expect(html).toContain('3 seated rounds');
  });

  it('honours a changed round length in the clock and the plan', () => {
    const { sandbox, nodes } = view();
    sandbox._roundMinutes = 10;
    sandbox.renderRunOfShow();
    expect(nodes.get('runView').innerHTML).toContain('10:00');
  });

  it('steps through every seated round before the 1-on-1s', () => {
    const { sandbox, nodes } = view();
    const plan = sandbox.buildRunPlan();
    const seated = plan.filter(s => s.kind === 'round');
    expect(seated).toHaveLength(3);
    expect(plan.slice(0, 3).every(s => s.kind === 'round')).toBe(true);
    expect(plan.slice(3).every(s => s.kind === 'ones')).toBe(true);

    sandbox._runStep = 1;
    sandbox.renderRunOfShow();
    let html = nodes.get('runView').innerHTML;
    expect(html).toContain('Round 2');
    expect(html).toContain('Women stay seated. Men move one table along.');
    expect(html).toContain('men from');

    sandbox._runStep = 3;
    sandbox.renderRunOfShow();
    html = nodes.get('runView').innerHTML;
    expect(html).toContain('1-on-1s');
    expect(html).toContain('05:00');
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
