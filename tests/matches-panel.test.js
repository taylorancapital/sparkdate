// tests/matches-panel.test.js
//
// The Matches panel on the Retention tab is the only place the dashboard
// says whether the product's promise happened — "if they tell us the same
// about you, we exchange your contact info". Its arithmetic is the whole
// value of the panel: a share computed against the wrong denominator, or a
// pick counted twice, would read as a real change in how the events are
// going and there is nothing on the page to check it against.
//
// So the four settled events from the 2026-09-10 Firestore read
// (reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md, PR #498) are
// rebuilt here as fixtures and their measured numbers pinned:
//
//   Founders Mixer   24 attendees / 15 pickers / 67 picks / 12 matches / 11 matched
//   Round 2          30 / 16 / 47 / 13 / 14
//   Tellus AfterDark 34 / 13 / 36 /  2 /  3
//   Good Good        23 / 10 / 21 /  4 /  6
//
// Same indentation-based lifter as tests/chemistry-views.test.js — this
// repo has no DOM test dependency and computeMatchStats is deliberately
// pure, taking its collections as arguments so it can be exercised without
// Firestore or a document.

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

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(['toEventDate', 'MATCH_WINDOW_DAYS', 'computeMatchStats'].map(lift).join('\n\n'), sandbox);
// A function declaration lands on the sandbox object; a top-level `const`
// does not, so the window has to be read back as an expression.
const computeMatchStats = sandbox.computeMatchStats;
const MATCH_WINDOW_DAYS = vm.runInContext('MATCH_WINDOW_DAYS', sandbox);

// ── Fixture builder ────────────────────────────────────────────────
//
// Real shapes, synthetic people. Registrations carry an email (the join
// key loadRetention uses); intents, matches and prompts carry uids only,
// which is exactly the asymmetry the panel has to bridge.

const NOW = Date.parse('2026-09-10T10:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// The first `women` registrations are the women. `wCheckedIn` of those and
// `mCheckedIn` of the men carry a door scan; the rest legitimately have no
// timestamp (Eventbrite imports, missed scans), which is the whole reason
// check-in is a floor.
function attendees(ev, n, women, wCheckedIn = 0, mCheckedIn = 0) {
  return Array.from({ length: n }, (_, i) => {
    const isWoman = i < women;
    const scanned = isWoman ? i < wCheckedIn : (i - women) < mCheckedIn;
    return {
      eventId: ev, userId: `${ev}-u${i}`, email: `${ev}-p${i}@example.com`,
      status: 'confirmed', gender: isWoman ? 'woman' : 'man',
      ...(scanned ? { checkedInAt: dateOf(ev) } : {}),
    };
  });
}
const dateOf = () => '2026-06-01T23:30:00Z'; // any timestamp; only truthiness is read

// `pickers` people each pick somebody, `wPickers` of them women; picks are
// spread across those pickers so the total lands exactly on `picks`.
// `matchPairs` of the pairs become mutual.
function eventFixture({ id, venue, dateISO, n, women, pickers, picks, matchPairs, matchedPeople, prompted,
                        wPickers = 0, wCheckedIn = 0, mCheckedIn = 0 }) {
  const regs = attendees(id, n, women, wCheckedIn, mCheckedIn);
  // Pickers: the first wPickers women, then men. Deliberately independent of
  // who checked in, so a woman can pick without having been scanned — the
  // case that pushes the rate over 100%.
  const pickerRegs = [
    ...regs.slice(0, wPickers),
    ...regs.slice(women, women + (pickers - wPickers)),
  ];
  const intents = [];
  for (let i = 0; i < picks; i++) {
    const from = pickerRegs[i % pickerRegs.length].userId;   // round-robin over the pickers
    const to = regs[(i * 7 + 3) % n].userId;
    intents.push({ fromUserId: from, toUserId: to, eventId: id, createdAt: dateISO });
  }
  // Mutual matches are their own docs (declare-connection writes them as a
  // lock), so build them independently and let matchedPeople name exactly
  // who ends up in one — pairs can share a person, which is why "matched"
  // is not simply 2 × matches.
  const matches = [];
  for (let i = 0; i < matchPairs; i++) {
    const a = matchedPeople[(i * 2) % matchedPeople.length];
    const b = matchedPeople[(i * 2 + 1) % matchedPeople.length];
    matches.push({ eventId: id, users: [`${id}-u${a}`, `${id}-u${b}`], matchedAt: dateISO });
  }
  const prompts = Array.from({ length: prompted }, (_, i) => ({
    userId: `${id}-u${i}`, eventId: id, sentAt: dateISO,
  }));
  return {
    event: { id, venue, date: dateISO },
    regs, intents, matches, prompts,
  };
}

// matchedPeople lists are chosen so the distinct-person count comes out at
// the measured "attendees matched" figure for each event.
const seq = (n) => Array.from({ length: n }, (_, i) => i);

// Women registered per event come from the review's §3 gender shares:
// 33% of 24, 31% of 30, 47% of 34, 26% of 23, 45% of 29.
// Women pickers (5 / 5 / 2 / 2 / 3) sum to the 17 the review counted
// all-time, and women checked in (7 / 3 / 10 / 2 / 8) are the door scans.
const FIXTURES = [
  eventFixture({ id: 'founders', venue: 'Founders Mixer', dateISO: '2026-06-24T23:00:00Z',
    n: 24, women: 8, pickers: 15, picks: 67, matchPairs: 12, matchedPeople: seq(11), prompted: 22,
    wPickers: 5, wCheckedIn: 7, mCheckedIn: 9 }),
  eventFixture({ id: 'round2', venue: 'Round 2 — Summer Nights', dateISO: '2026-07-29T23:00:00Z',
    n: 30, women: 9, pickers: 16, picks: 47, matchPairs: 13, matchedPeople: seq(14), prompted: 28,
    wPickers: 5, wCheckedIn: 3, mCheckedIn: 12 }),
  eventFixture({ id: 'tellus', venue: 'Tellus AfterDark: Singles Edition', dateISO: '2026-08-26T23:00:00Z',
    n: 34, women: 16, pickers: 13, picks: 36, matchPairs: 2, matchedPeople: seq(3), prompted: 32,
    wPickers: 2, wCheckedIn: 10, mCheckedIn: 14 }),
  eventFixture({ id: 'goodgood', venue: 'Good Good Night', dateISO: '2026-08-31T23:00:00Z',
    n: 23, women: 6, pickers: 10, picks: 21, matchPairs: 4, matchedPeople: seq(6), prompted: 21,
    wPickers: 2, wCheckedIn: 2, mCheckedIn: 11 }),
];

// Marion Court: two days old at the reference read, still accumulating.
const MARION = eventFixture({ id: 'marion', venue: 'Marion Court', dateISO: '2026-09-08T23:00:00Z',
  n: 29, women: 13, pickers: 11, picks: 60, matchPairs: 3, matchedPeople: seq(5), prompted: 27,
  wPickers: 3, wCheckedIn: 8, mCheckedIn: 10 });

// An event that has not happened yet has no picks to count.
const UPCOMING = {
  event: { id: 'loxleys', venue: 'Loxleys', date: '2026-09-22T23:00:00Z' },
  regs: attendees('loxleys', 10, 4), intents: [], matches: [], prompts: [],
};

function run(fixtures, { users = [], now = NOW } = {}) {
  const flat = (k) => fixtures.flatMap(f => f[k]);
  return computeMatchStats({
    events: fixtures.map(f => f.event),
    registrations: flat('regs'),
    users,
    intents: flat('intents'),
    matches: flat('matches'),
    prompts: flat('prompts'),
    now,
  });
}

const byId = (d, id) => d.events.find(e => e.id === id);

describe('computeMatchStats — the four measured events', () => {
  const d = run(FIXTURES);

  const CASES = [
    ['founders', 'Founders Mixer', 24, 22, 15, 67, 12, 11],
    ['round2', 'Round 2 — Summer Nights', 30, 28, 16, 47, 13, 14],
    ['tellus', 'Tellus AfterDark: Singles Edition', 34, 32, 13, 36, 2, 3],
    ['goodgood', 'Good Good Night', 23, 21, 10, 21, 4, 6],
  ];

  it.each(CASES)('%s reproduces its 2026-09-10 numbers',
    (id, venue, attendeeCount, prompted, pickers, picks, matches, matched) => {
      const e = byId(d, id);
      expect(e.venue).toBe(venue);
      expect(e.attendees).toBe(attendeeCount);
      expect(e.prompted).toBe(prompted);
      expect(e.pickers).toBe(pickers);
      expect(e.picks).toBe(picks);
      expect(e.matches).toBe(matches);
      expect(e.matched).toBe(matched);
    });

  it('reads Tellus as the outlier it is: best attendance, worst matched share', () => {
    const tellus = byId(d, 'tellus');
    const founders = byId(d, 'founders');
    // The finding that justified building this panel at all — 34 attendees
    // producing 3 matched people, against 24 producing 11.
    expect(tellus.attendees).toBeGreaterThan(founders.attendees);
    expect(tellus.matchedShare).toBeLessThan(founders.matchedShare / 3);
    expect(Math.round(tellus.matchedShare)).toBe(9);
    expect(Math.round(founders.matchedShare)).toBe(46);
  });

  it('shares are computed against attendees, not against pickers', () => {
    const e = byId(d, 'round2');
    expect(e.pickerShare).toBeCloseTo(16 / 30 * 100, 6);
    expect(e.matchedShare).toBeCloseTo(14 / 30 * 100, 6);
  });

  it('lists events newest first', () => {
    expect(d.events.map(e => e.id)).toEqual(['goodgood', 'tellus', 'round2', 'founders']);
  });
});

describe('the still-open window', () => {
  it('marks an event under the window as open and older ones as settled', () => {
    const d = run([...FIXTURES, MARION]);
    expect(byId(d, 'marion').open).toBe(true);
    expect(byId(d, 'goodgood').open).toBe(false);
    // 2026-09-08 is 2 days before the reference now; the window is 7.
    expect(MATCH_WINDOW_DAYS).toBe(7);
  });

  it('keeps an open event out of the headline matched share', () => {
    const settledOnly = run(FIXTURES);
    const withMarion = run([...FIXTURES, MARION]);
    // Marion Court's 5 matched of 29 would drag the all-time share down.
    // It appears as a row, but the headline is unchanged.
    expect(withMarion.totals.matchedShare).toBeCloseTo(settledOnly.totals.matchedShare, 6);
    expect(withMarion.events.length).toBe(5);
    expect(withMarion.totals.settledEvents).toBe(4);
    expect(withMarion.totals.matches).toBe(settledOnly.totals.matches + 3);
  });

  it('an event exactly at the window boundary is settled, not open', () => {
    const boundary = eventFixture({ id: 'edge', venue: 'Edge', dateISO: daysAgo(MATCH_WINDOW_DAYS),
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4 });
    expect(byId(run([boundary]), 'edge').open).toBe(false);
    const inside = eventFixture({ id: 'edge2', venue: 'Edge2', dateISO: daysAgo(MATCH_WINDOW_DAYS - 0.5),
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4 });
    expect(byId(run([inside]), 'edge2').open).toBe(true);
  });
});

describe('what the panel must not count', () => {
  it('ignores upcoming events entirely', () => {
    const d = run([...FIXTURES, UPCOMING]);
    expect(byId(d, 'loxleys')).toBeUndefined();
    expect(d.totals.attendees).toBe(24 + 30 + 34 + 23);
  });

  it('does not leak picks across events', () => {
    // Same person, two nights, picks on both. Each event sees only its own.
    const a = eventFixture({ id: 'a', venue: 'A', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 4, matchPairs: 1, matchedPeople: [0, 1], prompted: 4 });
    const b = eventFixture({ id: 'b', venue: 'B', dateISO: '2026-07-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 6, matchPairs: 2, matchedPeople: [0, 1, 2], prompted: 3 });
    const d = run([a, b]);
    expect(byId(d, 'a').picks).toBe(4);
    expect(byId(d, 'b').picks).toBe(6);
    expect(byId(d, 'a').matches).toBe(1);
    expect(byId(d, 'b').matches).toBe(2);
  });

  it('counts an attendee once when two registrations share an email', () => {
    // The duplicate-uid case loadRetention's email key exists for: one
    // human, two Firebase uids, same email. The attendee denominator must
    // not double-count them.
    const f = eventFixture({ id: 'dupe', venue: 'Dupe', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 3, picks: 5, matchPairs: 1, matchedPeople: [0, 1], prompted: 6 });
    f.regs.push({ eventId: 'dupe', userId: 'dupe-alt', email: 'dupe-p0@example.com',
                  status: 'confirmed', gender: 'woman' });
    expect(byId(run([f]), 'dupe').attendees).toBe(6);
  });

  it('counts one mutual match once even though both people are in it', () => {
    const f = eventFixture({ id: 'pair', venue: 'Pair', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4 });
    const e = byId(run([f]), 'pair');
    expect(e.matches).toBe(1);
    expect(e.matched).toBe(2);
  });

  it('counts a person in two matches once in "attendees matched"', () => {
    const f = eventFixture({ id: 'hub', venue: 'Hub', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 3, picks: 4, matchPairs: 0, matchedPeople: [], prompted: 6 });
    f.matches = [
      { eventId: 'hub', users: ['hub-u0', 'hub-u1'], matchedAt: '2026-06-02T00:00:00Z' },
      { eventId: 'hub', users: ['hub-u0', 'hub-u2'], matchedAt: '2026-06-02T00:00:00Z' },
    ];
    const e = byId(run([f]), 'hub');
    expect(e.matches).toBe(2);
    expect(e.matched).toBe(3); // not 4
  });

  it('counts a person who picked five people as one picker', () => {
    const f = eventFixture({ id: 'keen', venue: 'Keen', dateISO: '2026-06-01T23:00:00Z',
      n: 8, women: 4, pickers: 1, picks: 5, matchPairs: 0, matchedPeople: [], prompted: 8 });
    const e = byId(run([f]), 'keen');
    expect(e.picks).toBe(5);
    expect(e.pickers).toBe(1);
  });

  it('does not count an unconfirmed registration — the caller filters those', () => {
    // allRegistrations is already status==='confirmed' (loadAdminEvents), so
    // this pins the contract rather than a second filter: whatever the
    // caller hands over IS the attendee set.
    const f = eventFixture({ id: 'conf', venue: 'Conf', dateISO: '2026-06-01T23:00:00Z',
      n: 5, women: 2, pickers: 2, picks: 3, matchPairs: 1, matchedPeople: [0, 1], prompted: 5 });
    expect(byId(run([f]), 'conf').attendees).toBe(5);
  });
});

describe('prompts', () => {
  it('unions the lock collection with the legacy per-registration flag', () => {
    // api/cron-send-emails.js treats postEventPromptSent on the registration
    // as "already sent" alongside post_event_prompts, so a prompt recorded
    // only the legacy way must still count as prompted.
    const f = eventFixture({ id: 'pr', venue: 'Pr', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 2, picks: 3, matchPairs: 1, matchedPeople: [0, 1], prompted: 2 });
    f.regs[4].postEventPromptSent = true;
    f.regs[5].postEventPromptSent = true;
    expect(byId(run([f]), 'pr').prompted).toBe(4);
  });

  it('does not double-count a person recorded both ways', () => {
    const f = eventFixture({ id: 'pr2', venue: 'Pr2', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 2, picks: 3, matchPairs: 1, matchedPeople: [0, 1], prompted: 3 });
    f.regs[0].postEventPromptSent = true; // already has a post_event_prompts doc
    expect(byId(run([f]), 'pr2').prompted).toBe(3);
  });
});

describe('women picked / checked in', () => {
  const d = run([...FIXTURES, MARION]);

  // The measured pairs, 2026-09-10.
  const CASES = [
    ['founders', 5, 7],
    ['round2', 5, 3],
    ['tellus', 2, 10],
    ['goodgood', 2, 2],
    ['marion', 3, 8],
  ];

  it.each(CASES)('%s: %i women picked of %i checked in', (id, picked, checkedIn) => {
    const e = byId(d, id);
    expect(e.womenPicked).toBe(picked);
    expect(e.womenCheckedIn).toBe(checkedIn);
    expect(e.womenPickRate).toBeCloseTo(picked / checkedIn * 100, 6);
  });

  it('lets the rate exceed 100% rather than clamping it', () => {
    // Round 2: 5 women picked, 3 women scanned at the door. Check-in is a
    // floor, not attendance — two women who picked never scanned. Clamping
    // this to 100% would hide a check-in gap by pretending it is a ceiling.
    const e = byId(d, 'round2');
    expect(e.womenPickRate).toBeGreaterThan(100);
    expect(e.womenPickRate).toBeCloseTo(166.666, 2);
  });

  it('reads Tellus as the low one: most women in the room, fewest answering', () => {
    const tellus = byId(d, 'tellus');
    expect(tellus.womenCheckedIn).toBe(10);   // the largest of any event
    expect(tellus.womenPickRate).toBe(20);    // and the lowest rate
    FIXTURES.filter(f => f.event.id !== 'tellus')
      .forEach(f => expect(byId(d, f.event.id).womenPickRate).toBeGreaterThan(20));
  });

  it('counts men the same way, on their own denominator', () => {
    const e = byId(d, 'tellus');
    expect(e.menPicked).toBe(11);             // 13 pickers, 2 of them women
    expect(e.menCheckedIn).toBe(14);
    expect(e.menPickRate).toBeCloseTo(11 / 14 * 100, 6);
  });

  it('registered is not check-in: the unscanned still count as attendees', () => {
    const e = byId(d, 'goodgood');
    expect(e.womenRegistered).toBe(6);
    expect(e.womenCheckedIn).toBe(2);
    expect(e.attendees).toBe(23);
    expect(e.womenRegistered + e.menRegistered).toBe(e.attendees);
  });

  it('is 0, not NaN, when nobody scanned in', () => {
    const f = eventFixture({ id: 'noscan', venue: 'No scan', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 3, picks: 3, matchPairs: 1, matchedPeople: [0, 1], prompted: 6,
      wPickers: 2, wCheckedIn: 0, mCheckedIn: 0 });
    const e = byId(run([f]), 'noscan');
    expect(e.womenCheckedIn).toBe(0);
    expect(e.womenPicked).toBe(2);
    expect(e.womenPickRate).toBe(0);
    expect(Number.isFinite(e.womenPickRate)).toBe(true);
  });

  it('counts one check-in for a person with two registration rows', () => {
    // The duplicate-uid person again: scanned on one row only. She is one
    // woman in the room, so she must not add two to the denominator.
    const f = eventFixture({ id: 'dupin', venue: 'Dup in', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4,
      wPickers: 2, wCheckedIn: 1, mCheckedIn: 0 });
    f.regs.push({ eventId: 'dupin', userId: 'dupin-alt', email: 'dupin-p0@example.com',
                  status: 'confirmed', gender: 'woman', checkedInAt: '2026-06-01T23:40:00Z' });
    const e = byId(run([f]), 'dupin');
    expect(e.womenRegistered).toBe(2);
    expect(e.womenCheckedIn).toBe(1);
  });

  it('counts a check-in on either duplicate row', () => {
    // Scanned on the second row, not the first: still checked in.
    const f = eventFixture({ id: 'dupin2', venue: 'Dup in 2', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4,
      wPickers: 2, wCheckedIn: 0, mCheckedIn: 0 });
    f.regs.push({ eventId: 'dupin2', userId: 'dupin2-alt', email: 'dupin2-p0@example.com',
                  status: 'confirmed', gender: 'woman', checkedInAt: '2026-06-01T23:40:00Z' });
    expect(byId(run([f]), 'dupin2').womenCheckedIn).toBe(1);
  });

  it('resolves the counted gender from the profile, like the picker split', () => {
    const f = eventFixture({ id: 'gp', venue: 'Gp', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 0, matchedPeople: [], prompted: 4,
      wPickers: 2, wCheckedIn: 2, mCheckedIn: 2 });
    // The registration says man; the profile says woman. Both the numerator
    // and the denominator must move together, or the rate is nonsense.
    const e = byId(run([f], { users: [{ id: 'gp-u2', gender: 'woman' }] }), 'gp');
    expect(e.womenRegistered).toBe(3);
    expect(e.womenCheckedIn).toBe(3);
    expect(e.menRegistered).toBe(1);
    expect(e.menCheckedIn).toBe(1);
  });

  it('pools the totals rather than averaging the per-event rates', () => {
    // The average of the five rates is ~79%; the pooled rate is 17/30.
    expect(d.totals.womenPicked).toBe(17);
    expect(d.totals.womenCheckedIn).toBe(7 + 3 + 10 + 2 + 8);
    expect(d.totals.womenPickRate).toBeCloseTo(17 / 30 * 100, 6);
    expect(d.totals.menPicked).toBe(48);
    expect(d.totals.menPickRate).toBeCloseTo(48 / d.totals.menCheckedIn * 100, 6);
  });
});

describe('the women / men picker split', () => {
  it('prefers users[].gender and falls back to the registration', () => {
    const f = eventFixture({ id: 'g', venue: 'G', dateISO: '2026-06-01T23:00:00Z',
      n: 6, women: 3, pickers: 6, picks: 6, matchPairs: 0, matchedPeople: [], prompted: 6, wPickers: 3 });
    // Registrations say 3 W / 3 M. The profile disagrees for one man.
    const users = [{ id: 'g-u3', gender: 'woman' }];
    const e = byId(run([f], { users }), 'g');
    expect(e.pickers).toBe(6);
    expect(e.pickersWomen).toBe(4);
    expect(e.pickersMen).toBe(2);
    expect(e.pickersUnknown).toBe(0);
  });

  it('reports pickers with no gender anywhere as unknown, not as men', () => {
    const f = eventFixture({ id: 'gu', venue: 'Gu', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 4, picks: 4, matchPairs: 0, matchedPeople: [], prompted: 4, wPickers: 2 });
    delete f.regs[2].gender;
    delete f.regs[3].gender;
    const e = byId(run([f]), 'gu');
    expect(e.pickersWomen).toBe(2);
    expect(e.pickersMen).toBe(0);
    expect(e.pickersUnknown).toBe(2);
    expect(e.pickersWomen + e.pickersMen + e.pickersUnknown).toBe(e.pickers);
  });

  it('normalises case and whitespace on gender', () => {
    const f = eventFixture({ id: 'gc', venue: 'Gc', dateISO: '2026-06-01T23:00:00Z',
      n: 2, women: 1, pickers: 2, picks: 2, matchPairs: 0, matchedPeople: [], prompted: 2, wPickers: 1 });
    f.regs[0].gender = ' Woman ';
    f.regs[1].gender = 'MAN';
    const e = byId(run([f]), 'gc');
    expect(e.pickersWomen).toBe(1);
    expect(e.pickersMen).toBe(1);
  });

  it('carries the Tellus picker skew: mostly men answering', () => {
    // 2 women picked against 11 men at Tellus (review §1). Rebuilt here
    // from the fixture's own gender assignment rather than asserted from
    // the report, so the assertion is about the arithmetic.
    const tellus = FIXTURES.find(f => f.event.id === 'tellus');
    const e = byId(run([tellus]), 'tellus');
    expect(e.pickersWomen + e.pickersMen).toBe(13);
  });
});

describe('degenerate input', () => {
  it('returns empty totals with nothing to count', () => {
    const d = computeMatchStats({ events: [], registrations: [], users: [], intents: [], matches: [], prompts: [], now: NOW });
    expect(d.events).toEqual([]);
    expect(d.totals.matchedShare).toBe(0);
    expect(d.totals.matches).toBe(0);
  });

  it('does not divide by zero for an event whose attendees are all uid-less', () => {
    // Picks arrived but no registration row carries a usable key: the
    // share must be 0, not NaN or Infinity.
    const f = {
      event: { id: 'nz', venue: 'Nz', date: '2026-06-01T23:00:00Z' },
      regs: [{ eventId: 'nz', status: 'confirmed' }],
      intents: [{ fromUserId: 'x', toUserId: 'y', eventId: 'nz', createdAt: '2026-06-02T00:00:00Z' }],
      matches: [], prompts: [],
    };
    const e = byId(run([f]), 'nz');
    expect(e.attendees).toBe(0);
    expect(Number.isFinite(e.pickerShare)).toBe(true);
    expect(e.pickerShare).toBe(0);
    expect(e.matchedShare).toBe(0);
  });

  it('skips an intent with no eventId or no fromUserId', () => {
    const f = eventFixture({ id: 'bad', venue: 'Bad', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 0, matchedPeople: [], prompted: 4 });
    f.intents.push({ toUserId: 'bad-u1', eventId: 'bad', createdAt: '2026-06-02T00:00:00Z' });
    f.intents.push({ fromUserId: 'bad-u0', toUserId: 'bad-u1', createdAt: '2026-06-02T00:00:00Z' });
    expect(byId(run([f]), 'bad').picks).toBe(2);
  });

  it('tolerates an event with an unparseable date by omitting it', () => {
    const f = {
      event: { id: 'nd', venue: 'No date', date: 'not a date' },
      regs: attendees('nd', 3, 1), intents: [], matches: [], prompts: [],
    };
    expect(byId(run([f]), 'nd')).toBeUndefined();
  });

  it('keeps an event that has picks but no registrations on file', () => {
    // declare-connection never blocks on attendance, so picks can exist
    // for an event whose registration rows are dirty. Hiding the row would
    // hide real picks; the share is what goes to zero.
    const f = {
      event: { id: 'dirty', venue: 'Dirty', date: '2026-06-01T23:00:00Z' },
      regs: [],
      intents: [{ fromUserId: 'a', toUserId: 'b', eventId: 'dirty', createdAt: '2026-06-02T00:00:00Z' }],
      matches: [], prompts: [],
    };
    const e = byId(run([f]), 'dirty');
    expect(e).toBeDefined();
    expect(e.picks).toBe(1);
    expect(e.attendees).toBe(0);
  });
});

// ── The render ─────────────────────────────────────────────────────
//
// Same reason tests/chemistry-views.test.js renders its panels: the
// louder failure mode is not a wrong number, it is a render function that
// throws and leaves an empty card with a console error nobody is reading.
// Stub DOM, no jsdom (this repo has no DOM test dependency).

function stubDom() {
  const node = { id: 'matchesBody', innerHTML: '', style: {} };
  return {
    node,
    document: {
      getElementById(id) {
        if (id !== 'matchesBody') throw new Error(`render wrote to unknown element id "${id}"`);
        return node;
      },
    },
  };
}

function render(stats) {
  const dom = stubDom();
  const ctx = { console, document: dom.document, window: {} };
  vm.createContext(ctx);
  vm.runInContext(['safe', 'retentionColor', 'MATCH_WINDOW_DAYS', 'renderMatches'].map(lift).join('\n\n'), ctx);
  ctx.renderMatches(stats);
  return dom.node.innerHTML;
}

describe('renderMatches', () => {
  it('renders every event as a row, with the measured numbers on the page', () => {
    const html = render(run([...FIXTURES, MARION]));
    expect(html).toContain('Founders Mixer');
    expect(html).toContain('Marion Court');
    // One <tr> per event, plus the header row.
    expect((html.match(/<tr>/g) || []).length).toBe(5 + 1);
    expect((html.match(/<td /g) || []).length).toBe(5 * 9 - 5); // 9 cells a row, the first has no attrs
    // Tellus: 34 attendees, 13 pickers, 36 picks, 2 mutual.
    const tellusRow = html.split('<tr>').find(r => r.includes('Tellus'));
    expect(tellusRow).toContain('>34<');
    expect(tellusRow).toContain('>36<');
  });

  it('badges the open event and only the open event', () => {
    const html = render(run([...FIXTURES, MARION]));
    expect((html.match(/still open/g) || []).length).toBe(1);
    expect(html.split('<tr>').find(r => r.includes('Marion Court'))).toContain('still open');
    expect(html.split('<tr>').find(r => r.includes('Good Good'))).not.toContain('still open');
  });

  it('shows the headline share over settled events', () => {
    const html = render(run([...FIXTURES, MARION]));
    expect(html).toContain('Attendees matched');
    expect(html).toContain('4 settled events');
    expect(html).toContain('open ones excluded');
  });

  it('renders the empty state rather than an empty card', () => {
    const html = render(computeMatchStats({
      events: [], registrations: [], users: [], intents: [], matches: [], prompts: [], now: NOW,
    }));
    expect(html).toContain('No picks yet');
    expect(html).not.toContain('<table');
  });

  it('escapes a venue name that carries markup', () => {
    const f = eventFixture({ id: 'xss', venue: '<img src=x onerror=alert(1)>', dateISO: '2026-06-01T23:00:00Z',
      n: 4, women: 2, pickers: 2, picks: 2, matchPairs: 1, matchedPeople: [0, 1], prompted: 4 });
    const html = render(run([f]));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('totals', () => {
  const d = run([...FIXTURES, MARION]);

  it('sums every row, open ones included, for the count metrics', () => {
    expect(d.totals.picks).toBe(67 + 47 + 36 + 21 + 60);
    expect(d.totals.matches).toBe(12 + 13 + 2 + 4 + 3);
    expect(d.totals.pickers).toBe(15 + 16 + 13 + 10 + 11);
  });

  it('takes the headline matched share over settled attendees only', () => {
    expect(d.totals.matchedShare).toBeCloseTo((11 + 14 + 3 + 6) / (24 + 30 + 34 + 23) * 100, 6);
  });
});
