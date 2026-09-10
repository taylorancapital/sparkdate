// tests/chemistry-party-seed.test.js
//
// Which registrations count as "arrived together", before the host links
// anyone by hand.
//
// This is the half of the seating feature that is easiest to ship broken,
// because breaking it produces no error: a party detector that reads the
// wrong field finds nobody, the seating looks entirely reasonable, and the
// friends are quietly split. That is exactly what happened — the seeding read
// `paymentIntentId` only, which is carried by 18% of women ever registered and
// had identified ONE pair in the whole history, while Eventbrite (37% of
// women, the larger half) had its order id stored and never read.
//
// So the field coverage is asserted here as hard as the grouping itself.

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

function ctx() {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(['seedParties', 'normaliseGroups'].map(lift).join('\n\n'), sandbox);
  return sandbox;
}

const woman = (id, email) => ({ id, email, gender: 'woman', firstName: id, lastName: 'X' });
const man = (id, email) => ({ id, email, gender: 'man', firstName: id, lastName: 'X' });

// Sorted for comparison — the order parties come out in is not a contract.
const norm = (groups) => groups.map(g => [...g].sort()).sort();

describe('seedParties', () => {
  const sb = ctx();

  it('groups two women on one Stripe checkout — the 2-for-1 and its +1', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', paymentIntentId: 'pi_1' },
      { userId: 'w2', email: 'b@e.com', paymentIntentId: 'pi_1' },
    ];
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2']]);
  });

  // The regression. Eventbrite is the larger half of the room and its order id
  // was stored and never read.
  it('groups two women on one Eventbrite order', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', orderId: '1234567890' },
      { userId: 'w2', email: 'b@e.com', orderId: '1234567890' },
    ];
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2']]);
  });

  it('keeps Stripe and Eventbrite parties apart in one room', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com'),
                       woman('w3', 'c@e.com'), woman('w4', 'd@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', paymentIntentId: 'pi_1' },
      { userId: 'w2', email: 'b@e.com', paymentIntentId: 'pi_1' },
      { userId: 'w3', email: 'c@e.com', orderId: 'eb_9' },
      { userId: 'w4', email: 'd@e.com', orderId: 'eb_9' },
    ];
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2'], ['w3', 'w4']]);
  });

  it('prefers the Stripe key when a row somehow carries both', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', paymentIntentId: 'pi_1', orderId: 'eb_9' },
      { userId: 'w2', email: 'b@e.com', paymentIntentId: 'pi_1' },
    ];
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2']]);
  });

  // The one that matters most for a walk-in room: no key must mean no party,
  // never one enormous party of everyone the data does not know about.
  it('groups nobody when the registrations carry no purchase key at all', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com'), woman('w3', 'c@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', source: 'checkin' },
      { userId: 'w2', email: 'b@e.com', source: 'checkin', paymentIntentId: null },
      { userId: 'w3', email: 'c@e.com', source: 'eventbrite_import', orderId: '' },
    ];
    expect(sb.seedParties(regs, attendees)).toEqual([]);
  });

  it('splits a mixed-gender checkout — a man rotates away from her table anyway', () => {
    const attendees = [woman('w1', 'a@e.com'), man('m1', 'b@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', orderId: 'eb_9' },
      { userId: 'm1', email: 'b@e.com', orderId: 'eb_9' },
    ];
    // Two single-gender groups of one, which normaliseGroups then discards.
    expect(sb.normaliseGroups(sb.seedParties(regs, attendees), attendees)).toEqual([]);
  });

  it('matches a guest registration by email when it has no userId', () => {
    // A +1 never authenticates, so its registration carries userId: null and
    // only the email ties it to the attendee record.
    const attendees = [woman('w1', 'buyer@e.com'), woman('w2', 'plusone@e.com')];
    const regs = [
      { userId: 'w1', email: 'buyer@e.com', paymentIntentId: 'pi_1' },
      { userId: null, email: 'PlusOne@E.com', paymentIntentId: 'pi_1' },
    ];
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2']]);
  });

  it('ignores a registration for somebody not in the room', () => {
    const attendees = [woman('w1', 'a@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', orderId: 'eb_9' },
      { userId: 'refunded', email: 'gone@e.com', orderId: 'eb_9' },
    ];
    expect(sb.seedParties(regs, attendees)).toEqual([['w1']]);
  });

  it('does not list the same person twice on a duplicated registration', () => {
    const attendees = [woman('w1', 'a@e.com')];
    const regs = [
      { userId: 'w1', email: 'a@e.com', orderId: 'eb_9' },
      { userId: 'w1', email: 'a@e.com', orderId: 'eb_9' },
    ];
    expect(sb.seedParties(regs, attendees)).toEqual([['w1']]);
  });

  it('handles an empty or missing registration list', () => {
    expect(sb.seedParties([], [])).toEqual([]);
    expect(sb.seedParties(null, [])).toEqual([]);
  });

  it('groups a party of three on one order', () => {
    const attendees = [woman('w1', 'a@e.com'), woman('w2', 'b@e.com'), woman('w3', 'c@e.com')];
    const regs = ['a', 'b', 'c'].map((c, i) =>
      ({ userId: `w${i + 1}`, email: `${c}@e.com`, orderId: 'eb_9' }));
    expect(norm(sb.seedParties(regs, attendees))).toEqual([['w1', 'w2', 'w3']]);
  });
});
