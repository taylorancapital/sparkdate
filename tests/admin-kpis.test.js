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
