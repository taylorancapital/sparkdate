// tests/chemistry-names.test.js
//
// Every panel in the chemistry tool labels people "First L." That is the
// right length for a chip, and it is fine until two people in the room share
// a first name and a last initial — at which point the seating chart shows
// the same label twice, the "where do I sit?" lookup returns two identical
// cards, and the host reads a name out to a room where two people stand up.
//
// It is the one display detail that got WORSE as this tool moved from a
// printed chart to something used live: on paper you could look up the row,
// but a host reading a chip aloud has nothing to go on. It was visible in the
// render harness, where two different men both came out as "Bo M."
//
// The fix resolves labels against the whole roster instead of one person at a
// time, and only the people who actually collide pay for it. What matters and
// is asserted here: every label in a roster is unique, nobody who was already
// unambiguous gets a longer name, and the escalation is stable rather than
// depending on the order people happen to arrive in.

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

const LIFTED = ['_nameLabels', '_nameLabelsFor', '_nameRungs', 'buildNameLabels',
                'ensureNameLabels', '_chemShortName', '_chemInitials'];

function names(women, men = []) {
  const sandbox = { console, _chemWomen: women, _chemMen: men };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIFTED.map(lift).join('\n\n'), sandbox);
  return {
    s: sandbox,
    label: (u) => vm.runInContext('_chemShortName', sandbox)(u),
    all: () => [...women, ...men].map(u => vm.runInContext('_chemShortName', sandbox)(u)),
    setRoster(w, m) { sandbox._chemWomen = w; sandbox._chemMen = m; },
  };
}

const p = (id, firstName, lastName, email) =>
  ({ id, firstName, lastName, email: email || `${id}@example.com`, gender: 'woman' });

describe('unambiguous labels', () => {
  it('leaves an uncontested name at "First L."', () => {
    const n = names([p('a', 'Wendy', 'Quinn'), p('b', 'Marco', 'Alvarez')]);
    expect(n.label(n.s._chemWomen[0])).toBe('Wendy Q.');
    expect(n.label(n.s._chemWomen[1])).toBe('Marco A.');
  });

  it('promotes only the pair that collides, not the whole room', () => {
    // The bug, in one case: two Bo M.s used to render identically.
    const bo1 = p('a', 'Bo', 'Marsh');
    const bo2 = p('b', 'Bo', 'Mitchell');
    const other = p('c', 'Wendy', 'Quinn');
    const n = names([bo1, bo2, other]);
    expect(n.label(bo1)).toBe('Bo Marsh');
    expect(n.label(bo2)).toBe('Bo Mitchell');
    expect(n.label(other)).toBe('Wendy Q.');       // untouched
  });

  it('falls through to the email when the full names also match', () => {
    const a = p('a', 'Bo', 'Marsh', 'bo.marsh@example.com');
    const b = p('b', 'Bo', 'Marsh', 'bmarsh2@example.com');
    const n = names([a, b]);
    expect(n.label(a)).toBe('Bo Marsh (bo.marsh)');
    expect(n.label(b)).toBe('Bo Marsh (bmarsh2)');
  });

  it('numbers the last resort — same name, same email local part', () => {
    const a = p('a', 'Bo', 'Marsh', 'bo@one.com');
    const b = p('b', 'Bo', 'Marsh', 'bo@two.com');
    const n = names([a, b]);
    const labels = n.all();
    expect(new Set(labels).size).toBe(2);
    expect(labels.every(l => /^Bo Marsh \(bo\) #\d$/.test(l))).toBe(true);
  });

  it('never returns the same label for two people, across messy rosters', () => {
    const rosters = [
      [p('a','Bo','Marsh'), p('b','Bo','Mitchell'), p('c','Bo','Marsh')],
      [p('a','Sarah','M'), p('b','Sarah','M'), p('c','Sarah','Moore'), p('d','Sarah','Mills')],
      [p('a','Jo',''), p('b','Jo',''), p('c','Jo','Novak')],
      [p('a','','', 'x@e.com'), p('b','','', 'y@e.com')],
      Array.from({length: 12}, (_, i) => p('p' + i, 'Alex', 'Reyes', `alex${i}@e.com`)),
    ];
    for (const roster of rosters) {
      const labels = names(roster).all();
      expect(new Set(labels).size, `collision in ${JSON.stringify(labels)}`).toBe(roster.length);
      expect(labels.every(l => l && l !== '—')).toBe(true);
    }
  });

  it('resolves across the women/men split, not within each side', () => {
    // A woman and a man can collide with each other; they appear on the same
    // seating chart.
    const w = p('w1', 'Alex', 'Reyes');
    const m = { ...p('m1', 'Alex', 'Rowe'), gender: 'man' };
    const n = names([w], [m]);
    expect(n.label(w)).toBe('Alex Reyes');
    expect(n.label(m)).toBe('Alex Rowe');
  });

  it('does not let a promoted name land on a settled one', () => {
    // "Bo Marsh" is already taken as a plain full name; the two Bo M.s being
    // promoted must not be handed it a second time.
    const settled = p('a', 'Bo', 'Marsh');       // unique at rung 0? no — collides
    const other   = p('b', 'Bo', 'Marsh', 'bo2@e.com');
    const third   = p('c', 'Bo', 'Mendez');
    const labels = names([settled, other, third]).all();
    expect(new Set(labels).size).toBe(3);
  });

  it('is stable regardless of the order people are listed in', () => {
    const mk = () => [p('a','Bo','Marsh'), p('b','Bo','Mitchell'), p('c','Wendy','Quinn')];
    const forward = mk(), backward = mk().reverse();
    const f = names(forward), b = names(backward);
    for (const id of ['a', 'b', 'c']) {
      const fu = forward.find(u => u.id === id), bu = backward.find(u => u.id === id);
      expect(f.label(fu)).toBe(b.label(bu));
    }
  });
});

describe('recomputing', () => {
  it('picks up a collision created by a walk-in', () => {
    // The live case: the room was unambiguous when the modal opened, and then
    // a second Bo checked in at the door.
    const bo1 = p('a', 'Bo', 'Marsh');
    const n = names([bo1]);
    expect(n.label(bo1)).toBe('Bo M.');

    const bo2 = p('b', 'Bo', 'Mitchell');
    n.setRoster([bo1, bo2], []);
    expect(n.label(bo1)).toBe('Bo Marsh');
    expect(n.label(bo2)).toBe('Bo Mitchell');
  });

  it('reverts when the collision leaves', () => {
    const bo1 = p('a', 'Bo', 'Marsh');
    const bo2 = p('b', 'Bo', 'Mitchell');
    const n = names([bo1, bo2]);
    expect(n.label(bo1)).toBe('Bo Marsh');
    n.setRoster([bo1], []);
    expect(n.label(bo1)).toBe('Bo M.');
  });
});

describe('edge cases that used to fall through', () => {
  it('handles a missing surname', () => {
    const u = p('a', 'Wendy', '');
    expect(names([u]).label(u)).toBe('Wendy');
  });

  it('handles a missing first name', () => {
    const u = p('a', '', 'Quinn');
    expect(names([u]).label(u)).toBe('Quinn');
  });

  it('falls back to the email local part when there is no name at all', () => {
    const u = { id: 'a', firstName: '', lastName: '', email: 'someone@example.com' };
    expect(names([u]).label(u)).toBe('someone');
  });

  it('returns a dash for nobody', () => {
    expect(names([]).label(null)).toBe('—');
    expect(names([]).label(undefined)).toBe('—');
  });

  it('labels a person who is not in the roster without inventing a suffix', () => {
    // A print run against a stale list, say. Better a plain label than a
    // confident wrong one.
    const inRoster = p('a', 'Wendy', 'Quinn');
    const stranger = p('z', 'Nadia', 'Bell');
    const n = names([inRoster]);
    expect(n.label(stranger)).toBe('Nadia B.');
  });

  it('trims stray whitespace rather than rendering it', () => {
    const u = p('a', '  Wendy  ', '  Quinn  ');
    expect(names([u]).label(u)).toBe('Wendy Q.');
  });
});
