// tests/admin-kpis.test.js
//
// The revenue KPIs on the admin dashboard — ticket revenue, revenue/ticket,
// lifetime revenue per buyer, blended CAC, LTV:CAC — all come out of one
// function, `ticketKpis()` in public/admin.html. Until 2026-09-10 three of its
// definitions were wrong, and every one of them failed SILENTLY: the cards
// rendered, the arithmetic was internally consistent, and the numbers were
// simply not what their labels said (see the MECHANISM section of
// reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md).
//
//   1. "Paid" meant "not comped", so 29 of 133 tickets carrying `amount: 0`
//      (Eventbrite's free tier, two-for-one plus-ones, a manual import) counted
//      as paid tickets and their holders as buyers.
//   2. CAC divided by buyers holding exactly ONE ticket, so it went UP as
//      retention improved.
//   3. LTV multiplied revenue-per-buyer (already a lifetime figure) by
//      tickets-per-buyer, counting every repeat twice, with a 1.5 floor that
//      applied a 50% uplift no cohort had earned.
//
// A wrong number that renders is not caught by anything except a test, so the
// three are frozen here as cases 1-3 below, against the SHIPPED code lifted out
// of the page — the same technique tests/chemistry-rotation.test.js uses.
//
// The last block cross-checks kpiSnapshot against renderReport, because the
// Full Report tab reads its values off that snapshot rather than recomputing
// them: a field renamed in one place and not the other renders "undefined" in a
// card, which is exactly the class of failure this file exists for.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift a top-level declaration by INDENTATION, not by brace-matching: every
// top-level function in this script sits at eight spaces and closes on a line
// that is exactly eight spaces and a brace. A hand-rolled brace scanner is a
// trap here — safe() contains /"/g, a regex literal holding a double quote,
// which any scanner that only knows about strings reads as the start of one and
// then runs to the end of the file.
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
vm.runInNewContext(lift('ticketKpis'), sandbox);
const { ticketKpis } = sandbox;

/** A ticket doc as Firestore stores it: `amount` in CENTS. */
const t = (amount, email, extra = {}) => ({ amount, email, ...extra });

describe('ticketKpis — what counts as a paid ticket', () => {
  it('a $0 seat is not a paid ticket and its holder is not a buyer', () => {
    const k = ticketKpis([
      t(2500, 'a@x.com'),
      t(0, 'free@x.com'),                          // Eventbrite free tier
      t(0, 'plus@x.com', { isPlusOne: true }),     // two-for-one plus-one
    ], 0);

    expect(k.paidTickets).toBe(1);
    expect(k.payingBuyers).toBe(1);
    expect(k.ticketRevenue).toBe(25);
    // The old definition was `!isComp`, which counted all three.
    expect(k.paidTickets).not.toBe(3);
  });

  it('counts free-tier seats and plus-ones on their own lines, not as noise', () => {
    const k = ticketKpis([
      t(2500, 'a@x.com'),
      t(0, 'f1@x.com'),
      t(0, 'f2@x.com'),
      t(0, 'p1@x.com', { isPlusOne: true }),
      t(0, 'p2@x.com', { isPlusOne: true }),
      t(0, 'p3@x.com', { isPlusOne: true }),
    ], 0);

    expect(k.freeSeats).toBe(5);
    expect(k.freeTierSeats).toBe(2);
    expect(k.plusOneSeats).toBe(3);
    expect(k.freeTierSeats + k.plusOneSeats).toBe(k.freeSeats);
  });

  it('keeps comps a separate count, and out of revenue and every denominator', () => {
    // A comp saved WITH a price is the case that matters: counting it in
    // revenue while excluding its holder from the buyers inflates every
    // per-buyer figure. It has to be out of both.
    const k = ticketKpis([
      t(2500, 'a@x.com'),
      t(2500, 'comp@x.com', { isComp: true }),
      t(0, 'comp0@x.com', { isComp: true }),
    ], 0);

    expect(k.compCount).toBe(2);
    expect(k.ticketRevenue).toBe(25);
    expect(k.paidTickets).toBe(1);
    expect(k.payingBuyers).toBe(1);
    expect(k.freeSeats).toBe(0); // a comp is not a "free seat" line
  });

  it('a negative or missing amount is not revenue', () => {
    const k = ticketKpis([
      t(2500, 'a@x.com'),
      t(undefined, 'b@x.com'),
      t(-500, 'c@x.com'),
    ], 0);
    expect(k.paidTickets).toBe(1);
    expect(k.ticketRevenue).toBe(25);
  });
});

describe('ticketKpis — CAC divides by everyone who was acquired', () => {
  it('repeat buyers stay in the denominator', () => {
    // Three people, four paid tickets: one of them came back.
    const k = ticketKpis([
      t(2500, 'a@x.com'), t(2500, 'a@x.com'),
      t(2500, 'b@x.com'),
      t(2500, 'c@x.com'),
    ], 300);

    expect(k.payingBuyers).toBe(3);
    expect(k.repeatBuyers).toBe(1);
    expect(k.cac).toBeCloseTo(100, 6); // 300 / 3
    // The old denominator was "buyers with exactly one ticket" = 2, giving $150.
    expect(k.cac).not.toBeCloseTo(150, 6);
  });

  it('CAC does not RISE when a buyer comes back', () => {
    // This is the whole point: retention improving must not make acquisition
    // look more expensive. Same spend, same people, one extra repeat purchase.
    const before = ticketKpis([
      t(2500, 'a@x.com'), t(2500, 'b@x.com'), t(2500, 'c@x.com'),
    ], 300);
    const after = ticketKpis([
      t(2500, 'a@x.com'), t(2500, 'b@x.com'), t(2500, 'c@x.com'),
      t(2500, 'a@x.com'),
    ], 300);

    expect(after.cac).toBeLessThanOrEqual(before.cac);
  });

  it('$0 seats never enter the CAC denominator', () => {
    const k = ticketKpis([
      t(2500, 'a@x.com'),
      t(0, 'free@x.com'),
      t(0, 'plus@x.com', { isPlusOne: true }),
    ], 100);
    expect(k.cac).toBeCloseTo(100, 6); // not 100/3
  });

  it('emails are matched case- and whitespace-insensitively', () => {
    const k = ticketKpis([t(2500, 'A@X.com'), t(2500, ' a@x.com ')], 0);
    expect(k.payingBuyers).toBe(1);
    expect(k.repeatBuyers).toBe(1);
  });

  it('with no paying buyers CAC is 0, not Infinity', () => {
    const k = ticketKpis([t(0, 'free@x.com')], 500);
    expect(k.cac).toBe(0);
    expect(k.ltvCac).toBe('—');
  });
});

describe('ticketKpis — lifetime revenue per buyer does not double-count repeats', () => {
  it('is revenue per paid ticket times paid tickets per paying buyer', () => {
    // 4 tickets at $25 from 3 buyers.
    const k = ticketKpis([
      t(2500, 'a@x.com'), t(2500, 'a@x.com'),
      t(2500, 'b@x.com'),
      t(2500, 'c@x.com'),
    ], 0);

    expect(k.revPerTicket).toBeCloseTo(25, 6);
    expect(k.ticketsPerBuyer).toBeCloseTo(4 / 3, 6);
    expect(k.ltv).toBeCloseTo(100 / 3, 6);
    // The old figure was arpu × max(ticketsPerBuyer, 1.5) = 33.33 × 1.5 = 50.
    expect(k.ltv).not.toBeCloseTo(50, 6);
  });

  it('equals revenue divided by paying buyers — the identity that proves it is not squared', () => {
    const tickets = [
      t(2500, 'a@x.com'), t(1800, 'a@x.com'), t(2500, 'b@x.com'), t(1800, 'c@x.com'),
    ];
    const k = ticketKpis(tickets, 0);
    const gross = (2500 + 1800 + 2500 + 1800) / 100;

    expect(k.arpu).toBeCloseTo(gross / 3, 6);
    expect(k.ltv).toBeCloseTo(k.arpu, 6);
  });

  it('has no 1.5 floor: one ticket per buyer means LTV equals the ticket price', () => {
    const k = ticketKpis([t(2500, 'a@x.com'), t(2500, 'b@x.com')], 0);
    expect(k.ticketsPerBuyer).toBeCloseTo(1, 6);
    expect(k.ltv).toBeCloseTo(25, 6);
    expect(k.ltv).not.toBeCloseTo(37.5, 6); // 25 × 1.5
  });

  it('LTV:CAC inherits the corrected LTV', () => {
    // 4 tickets at $25 from 3 buyers, $25 acquisition spend.
    const k = ticketKpis([
      t(2500, 'a@x.com'), t(2500, 'a@x.com'), t(2500, 'b@x.com'), t(2500, 'c@x.com'),
    ], 25);
    // cac = 25/3 = 8.33; ltv = 33.33; ratio = 4.0
    expect(k.ltvCac).toBe('4.0');
  });

  it('empty input yields zeros, not NaN', () => {
    const k = ticketKpis([], 0);
    for (const key of ['ticketRevenue', 'paidTickets', 'freeSeats', 'payingBuyers',
                       'revPerTicket', 'ticketsPerBuyer', 'arpu', 'ltv', 'cac']) {
      expect(Number.isFinite(k[key]), key).toBe(true);
      expect(k[key], key).toBe(0);
    }
  });
});

describe('the measured 2026-09-10 Firestore snapshot', () => {
  // Reproduces the shape of the live data the review measured: 104 paid
  // tickets from 87 paying buyers grossing $2,506.87, alongside 29 $0 seats
  // (21 free tier, 7 plus-ones, 1 manual import) that used to count as paid.
  // Ticket prices are synthesised to hit the measured gross; the COUNTS are
  // the measured ones and are what the assertions turn on.
  const tickets = [];
  const grossCents = 250687;
  // 87 buyers: 17 of them hold two tickets (104 tickets total).
  const holdings = Array.from({ length: 87 }, (_, i) => (i < 17 ? 2 : 1));
  const totalTickets = holdings.reduce((s, n) => s + n, 0);
  let remaining = grossCents;
  let seat = 0;
  holdings.forEach((n, b) => {
    for (let j = 0; j < n; j++) {
      seat++;
      const cents = seat === totalTickets ? remaining : Math.round(grossCents / totalTickets);
      if (seat !== totalTickets) remaining -= cents;
      tickets.push(t(cents, `buyer${b}@x.com`));
    }
  });
  for (let i = 0; i < 21; i++) tickets.push(t(0, `freetier${i}@x.com`));
  for (let i = 0; i < 7; i++) tickets.push(t(0, `plusone${i}@x.com`, { isPlusOne: true }));
  tickets.push(t(0, 'manual@x.com'));

  const k = ticketKpis(tickets, 0);

  it('counts 104 paid tickets, not the 133 the old definition counted', () => {
    expect(k.paidTickets).toBe(104);
    expect(k.paidTickets + k.freeSeats).toBe(133);
  });

  it('counts 87 paying buyers, not 105', () => {
    expect(k.payingBuyers).toBe(87);
  });

  it('grosses $2,506.87 and prints a lifetime figure well under the old $35.82', () => {
    expect(k.ticketRevenue).toBeCloseTo(2506.87, 2);
    expect(k.ltv).toBeCloseTo(2506.87 / 87, 2);
    expect(k.ltv).toBeLessThan(35.82);
  });

  it('measures 1.20 tickets per buyer — under the 1.5 floor that was removed', () => {
    expect(k.ticketsPerBuyer).toBeCloseTo(104 / 87, 4);
    expect(k.ticketsPerBuyer).toBeLessThan(1.5);
  });
});

describe('kpiSnapshot keeps the Full Report tab working', () => {
  // renderReport() does not recompute anything — it reads kpiSnapshot. So a
  // field renamed in renderKPIs and not in renderReport prints "undefined" in a
  // card with nothing else going wrong. This asserts the contract in both
  // directions rather than trusting that they were edited together.
  const snapshotBlock = (() => {
    const i = SRC.indexOf('kpiSnapshot = {');
    if (i < 0) throw new Error('kpiSnapshot literal not found in admin.html');
    const close = /^ {12}\};$/m.exec(SRC.slice(i));
    if (!close) throw new Error('kpiSnapshot literal never closes');
    return SRC.slice(i, i + close.index + close[0].length);
  })();

  const reportBody = (() => {
    const i = SRC.indexOf('        function renderReport() {');
    const close = /^ {8}\}$/m.exec(SRC.slice(i));
    return SRC.slice(i, i + close.index + close[0].length);
  })();

  /**
   * Keys assigned in the snapshot literal — shorthand (`arpu,`) and
   * `key: value` alike, several to a line. Split on top-level commas rather
   * than per line, and take only the part LEFT of a colon, so a value
   * expression (`avgEvents: ticketsPerBuyer`) is never mistaken for a key.
   */
  const snapshotKeys = (() => {
    const body = snapshotBlock
      .slice(snapshotBlock.indexOf('{') + 1, snapshotBlock.lastIndexOf('}'))
      .replace(/\/\/[^\n]*/g, '');           // drop line comments
    const entries = [];
    let depth = 0, buf = '';
    for (const ch of body) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { entries.push(buf); buf = ''; } else buf += ch;
    }
    entries.push(buf);
    return new Set(entries
      .map((e) => e.split(':')[0].trim())
      .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k)));
  })();

  it('exposes the fields the corrected arithmetic introduced', () => {
    for (const key of ['paidTickets', 'freeSeats', 'freeTierSeats', 'plusOneSeats',
                       'compCount', 'payingBuyers', 'repeatBuyers', 'revPerTicket',
                       'ticketsPerBuyer']) {
      expect(snapshotKeys.has(key), `kpiSnapshot.${key}`).toBe(true);
    }
  });

  it('still exposes the legacy field names other readers rely on', () => {
    // Renamed in MEANING on 2026-09-10 (avgEvents is now paid tickets per
    // paying buyer, uniqueBuyers counts paying buyers only) but deliberately
    // NOT renamed as fields.
    for (const key of ['ticketRevenue', 'netRevenue', 'arpu', 'ltv', 'cac', 'ltvCac',
                       'avgEvents', 'uniqueBuyers', 'members', 'active',
                       'totalAcquisition', 'totalEbFees', 'totalOtherCosts',
                       'nonAcqRecurring', 'velocity', 'velocityRate', 'velocityNote']) {
      expect(snapshotKeys.has(key), `kpiSnapshot.${key}`).toBe(true);
    }
  });

  it('every field renderReport reads exists in the snapshot', () => {
    const read = new Set([...reportBody.matchAll(/\bk\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
    expect(read.size).toBeGreaterThan(5); // the scrape itself must be working
    const missing = [...read].filter((f) => !snapshotKeys.has(f));
    expect(missing, `renderReport reads kpiSnapshot fields that are never set: ${missing.join(', ')}`).toEqual([]);
  });

  it('the Full Report no longer prints the withdrawn Est. LTV / Revenue-per-buyer cards', () => {
    expect(reportBody).not.toContain("'Est. LTV'");
    expect(reportBody).toContain("'Lifetime Rev / Buyer'");
    expect(reportBody).toContain("'Revenue / Ticket'");
  });
});

describe('every KPI element renderKPIs writes to exists in the page', () => {
  // The Revenue tab card ids changed with the arithmetic (kpiARPU became
  // kpiRevPerTicket). getElementById on a missing id returns null and the write
  // throws inside renderKPIs, taking the whole Overview down with it — so both
  // directions are worth freezing.
  const body = (() => {
    const i = SRC.indexOf('        function renderKPIs() {');
    const close = /^ {8}\}$/m.exec(SRC.slice(i));
    return SRC.slice(i, i + close.index + close[0].length);
  })();

  const ids = [...new Set([...body.matchAll(/getElementById\('(kpi[A-Za-z]+)'\)/g)].map((m) => m[1]))];

  it('finds the ids in the markup', () => {
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) {
      expect(SRC.includes(`id="${id}"`), `<... id="${id}"> missing from admin.html`).toBe(true);
    }
  });

  it('has no orphaned kpiARPU card left behind', () => {
    expect(SRC).not.toContain('id="kpiARPU"');
    expect(SRC).toContain('id="kpiRevPerTicket"');
  });
});

// ─── Sales pacing ────────────────────────────────────────────────────────────
//
// The Ticket Velocity KPI these replace divided non-comp REGISTRATIONS by days
// since the event doc's createdAt and compared the result with a flat 1.5/day
// (TARGET_TICKETS_PER_DAY). Three things were wrong with it at once and none of
// them threw:
//
//   1. The benchmark was a straight line and sales are not. Measured across 128
//      dated paid tickets over five events, two thirds sell inside the final
//      fortnight (reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md, §2), so
//      a flat target reads "behind pace" for nearly every event until ~T-7 and
//      then flips, with the event's behaviour unchanged.
//   2. It read event_registrations, which carry no `amount` — a free-tier seat
//      and a $25 ticket are the same row there, so giveaways counted as demand.
//   3. It could not say the one thing worth saying: is this event selling like
//      the last five did AT THIS POINT?
//
// The replacement is pacingCurves(): each open event's paid tickets so far
// against the median/min/max of past events at the same T-minus. The fixture
// below is the real evidence table from §2, so a regression in the cumulative
// arithmetic shows up as a number that no longer matches a published report.

const paceSandbox = { console };
for (const fn of ['pacingCurves', 'paceNum', 'paceLine', 'safe', 'pacingChart']) {
  vm.runInNewContext(lift(fn), paceSandbox);
}
const { pacingCurves, paceNum, paceLine, pacingChart } = paceSandbox;

const NOW = Date.parse('2026-09-10T12:00:00Z');
const DAY = 86400000;
/** An event doc `d` days from NOW (negative = already happened). */
const ev = (id, title, daysFromNow, extra = {}) =>
  ({ id, title, date: new Date(NOW + daysFromNow * DAY), ...extra });
/** `n` paid tickets for `eventId`, each sold `tMinus` days before `eventDate`. */
const soldAt = (eventId, eventDate, tMinus, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${eventId}-${tMinus}-${i}-${Math.random()}`, eventId, amount: 2500,
    // Half a day inside the bucket, so a floor() that slipped to round() or
    // ceil() would move the ticket and break the totals below.
    createdAt: new Date(eventDate.getTime() - (tMinus + 0.5) * DAY),
    ...extra,
  }));

/**
 * The five past events, reconstructed to hit the published cumulative table
 * exactly:
 *
 *   event         | T-30 | T-14 | T-7 | T-1 | final
 *   Founders      |    0 |    2 |   9 |  20 |    21
 *   Round 2       |    4 |   13 |  19 |  27 |    29
 *   Tellus (Aug)  |    0 |    7 |  20 |  27 |    29
 *   Good Good     |    0 |    6 |  11 |  17 |    19
 *   Marion Court  |    0 |    4 |  11 |  16 |    19
 */
const PAST = [
  { id: 'founders', title: 'Founders Mixer',  at: [[35, 0], [20, 2], [10, 7],  [4, 11], [0, 1]] },
  { id: 'round2',   title: 'Round 2',         at: [[35, 4], [20, 9], [10, 6],  [4, 8],  [0, 2]] },
  { id: 'tellus',   title: 'Tellus (Aug)',    at: [[35, 0], [20, 7], [10, 13], [4, 7],  [0, 2]] },
  { id: 'goodgood', title: 'Good Good Night', at: [[35, 0], [20, 6], [10, 5],  [4, 6],  [0, 2]] },
  { id: 'marion',   title: 'Marion Court',    at: [[35, 0], [20, 4], [10, 7],  [4, 5],  [0, 3]] },
];
const pastEvents = PAST.map((p, i) => ev(p.id, p.title, -60 + i * 10));
const pastTickets = PAST.flatMap((p, i) =>
  p.at.flatMap(([tMinus, n]) => soldAt(p.id, pastEvents[i].date, tMinus, n)));

describe('pacingCurves — cumulative paid tickets by T-minus', () => {
  const { past } = pacingCurves(pastTickets, pastEvents, NOW);

  it('reproduces the published cumulative table for all five past events', () => {
    const expected = {
      founders: [0, 2, 9, 20, 21],
      round2:   [4, 13, 19, 27, 29],
      tellus:   [0, 7, 20, 27, 29],
      goodgood: [0, 6, 11, 17, 19],
      marion:   [0, 4, 11, 16, 19],
    };
    expect(past.length).toBe(5);
    for (const p of past) {
      const got = [p.cum[30], p.cum[14], p.cum[7], p.cum[1], p.cum[0]];
      expect(got, `${p.id} cumulative at T-30/14/7/1/final`).toEqual(expected[p.id]);
    }
  });

  it('cum[0] is the final total and the curve never rises as T-minus grows', () => {
    for (const p of past) {
      expect(p.final).toBe(p.cum[0]);
      for (let d = 1; d <= 60; d++) expect(p.cum[d]).toBeLessThanOrEqual(p.cum[d - 1]);
    }
  });
});

describe('pacingCurves — where an open event stands', () => {
  it('reads an open event against the median and range at its own T-minus', () => {
    // Loxleys at T-12 with 10 sold. At T-12 the past five stood at
    // 2 / 13 / 7 / 6 / 4 → median 6, range 2-13. 10 is inside that band and
    // above the median, which is the whole point: a flat 1.5/day target would
    // have wanted a ticket every day since the doc was created and called this
    // behind.
    const open = ev('loxleys', 'Loxleys', 12);
    const { open: [o] } = pacingCurves(
      [...pastTickets, ...soldAt('loxleys', open.date, 12, 10)],
      [...pastEvents, open], NOW);

    expect(o.tMinus).toBe(12);
    expect(o.sold).toBe(10);
    expect(o.median).toBe(6);
    expect(o.min).toBe(2);
    expect(o.max).toBe(13);
    expect(o.n).toBe(5);
    expect(o.sold >= o.median).toBe(true);
  });

  it('at T-7 the reference is median 11, range 9-20', () => {
    const open = ev('soon', 'Soon', 7);
    const { open: [o] } = pacingCurves(pastTickets, [...pastEvents, open], NOW);
    expect(o.median).toBe(11);
    expect(o.min).toBe(9);
    expect(o.max).toBe(20);
    expect(o.sold).toBe(0);
  });

  it('an event further out than any reference day still reads off the curve', () => {
    // Tellus Oct 6 sits at T-26 with 1 sold. Every past event was on the flat
    // part of its curve there, so "1" is not behind — it is where they all were.
    const open = ev('tellus-oct', 'Tellus Oct 6', 26);
    const { open: [o] } = pacingCurves(
      [...pastTickets, ...soldAt('tellus-oct', open.date, 26, 1)],
      [...pastEvents, open], NOW);
    expect(o.tMinus).toBe(26);
    expect(o.sold).toBe(1);
    expect(o.max).toBeLessThanOrEqual(4);  // only Round 2 had sold anything
  });

  it('orders open events soonest first, because the soonest is the actionable one', () => {
    const { open } = pacingCurves(pastTickets,
      [...pastEvents, ev('far', 'Far', 26), ev('near', 'Near', 12)], NOW);
    expect(open.map(o => o.id)).toEqual(['near', 'far']);
  });
});

describe('pacingCurves — what counts, matching ticketKpis exactly', () => {
  const openEv = ev('open', 'Open', 10);

  it('a comp is not demand and never enters a curve or a count', () => {
    const tickets = [
      ...soldAt('open', openEv.date, 10, 3),
      ...soldAt('open', openEv.date, 10, 5, { isComp: true, amount: 0 }),
      ...soldAt('founders', pastEvents[0].date, 10, 4, { isComp: true }),
    ];
    const r = pacingCurves([...pastTickets, ...tickets], [...pastEvents, openEv], NOW);
    expect(r.open[0].sold).toBe(3);
    expect(r.past.find(p => p.id === 'founders').final).toBe(21);  // not 25
  });

  it('a $0 seat — free tier or two-for-one plus-one — is not a sale', () => {
    const tickets = [
      ...soldAt('open', openEv.date, 10, 3),
      ...soldAt('open', openEv.date, 10, 4, { amount: 0 }),
      ...soldAt('open', openEv.date, 10, 2, { amount: 0, isPlusOne: true }),
    ];
    const r = pacingCurves(tickets, [openEv], NOW);
    expect(r.open[0].sold).toBe(3);
  });

  it('a canceled event is neither a reference curve nor an open event', () => {
    const r = pacingCurves(pastTickets,
      [...pastEvents.map(e => ({ ...e, status: 'canceled' })), ev('x', 'X', 5, { status: 'canceled' })],
      NOW);
    expect(r.past).toEqual([]);
    expect(r.open).toEqual([]);
  });

  it('a past event with no dated paid ticket is left out of the benchmark', () => {
    // A stub or draft event doc that never sold would otherwise sit at zero
    // for every T-minus and drag the median down with it.
    const stub = ev('stub', 'Never sold', -5);
    const undatedOnly = ev('nodate', 'Undated sales', -6);
    const r = pacingCurves(
      [...pastTickets,
       ...soldAt('nodate', undatedOnly.date, 10, 4).map(t => ({ ...t, createdAt: null }))],
      [...pastEvents, stub, undatedOnly], NOW);
    expect(r.past.map(p => p.id).sort())
      .toEqual(['founders', 'goodgood', 'marion', 'round2', 'tellus']);
  });

  it('reports zero median and an empty reference when there is no history', () => {
    const only = ev('first', 'First ever', 9);
    const r = pacingCurves(soldAt('first', only.date, 9, 4), [only], NOW);
    expect(r.past).toEqual([]);
    expect(r.open[0]).toMatchObject({ sold: 4, n: 0, median: 0, min: 0, max: 0 });
  });

  it('survives an event with no usable date instead of throwing', () => {
    const r = pacingCurves([], [{ id: 'bad', date: 'not a date' }, { id: 'none' }], NOW);
    expect(r.past).toEqual([]);
    expect(r.open).toEqual([]);
  });
});

describe('the sentence on the card', () => {
  it('reads "N sold at T-d · past events: median M (range a-b)"', () => {
    expect(paceLine({ sold: 10, tMinus: 12, n: 5, median: 6, min: 2, max: 13 }))
      .toBe('10 sold at T-12 · past events: median 6 (range 2-13)');
  });

  it('says so plainly when there is nothing to compare against', () => {
    expect(paceLine({ sold: 4, tMinus: 9, n: 0, median: 0, min: 0, max: 0 }))
      .toBe('4 sold at T-9 · no past event to compare against');
  });

  it('keeps a half-ticket median rather than rounding it away, but never prints 7.0', () => {
    expect(paceNum(7.5)).toBe('7.5');
    expect(paceNum(7)).toBe('7');
  });
});

describe('pacingChart', () => {
  const open = ev('loxleys', 'Loxleys', 12);
  const pacing = pacingCurves(
    [...pastTickets, ...soldAt('loxleys', open.date, 12, 10)],
    [...pastEvents, open], NOW);

  it('draws one muted curve per past event and one marked point per open event', () => {
    const svg = pacingChart(pacing);
    expect((svg.match(/<polyline/g) || []).length).toBe(5);
    expect((svg.match(/<circle/g) || []).length).toBe(1);
    expect(svg).toContain('10 · T-12');
    expect(svg).toContain('5 past events');
  });

  it('scales uniformly — a stretched viewBox would distort every label', () => {
    expect(pacingChart(pacing)).not.toContain('preserveAspectRatio="none"');
  });

  it('escapes an event title instead of injecting it into the SVG', () => {
    const nasty = ev('x', '</title><script>alert(1)</script>', 5);
    const svg = pacingChart(pacingCurves([...pastTickets], [...pastEvents, nasty], NOW));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('says so rather than drawing an empty box when there is nothing to pace', () => {
    expect(pacingChart({ past: [], open: [], maxT: 60 })).toContain('No events to pace yet');
    expect(pacingChart(null)).toContain('No events to pace yet');
  });
});

describe('the flat tickets-per-day target is gone', () => {
  it('TARGET_TICKETS_PER_DAY is not declared or read anywhere in the page', () => {
    // Only the note recording its removal may mention the name.
    const uses = SRC.split('\n')
      .filter((l) => l.includes('TARGET_TICKETS_PER_DAY') && !l.trim().startsWith('//'));
    expect(uses, `TARGET_TICKETS_PER_DAY still live in: ${uses.join(' | ')}`).toEqual([]);
  });

  it('the pace KPI no longer reads event_registrations', () => {
    const body = (() => {
      const i = SRC.indexOf('        function renderKPIs() {');
      const close = /^ {8}\}$/m.exec(SRC.slice(i));
      return SRC.slice(i, i + close.index + close[0].length);
    })();
    // Registrations carry no `amount`, so pacing cannot tell a $25 ticket from
    // a free seat there. renderKPIs must not READ them any more — the comment
    // saying so is allowed to name them, live code is not.
    const reads = body.split('\n')
      .filter((l) => l.includes('allRegistrations') && !l.trim().startsWith('//'));
    expect(reads, `renderKPIs still reads registrations: ${reads.join(' | ')}`).toEqual([]);
    expect(body).toContain('pacingCurves(');
  });
});
