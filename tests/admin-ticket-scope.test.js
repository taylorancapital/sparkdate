// tests/admin-ticket-scope.test.js
//
// #502 fixed the arithmetic: loadPayments() pages the ticket collection now
// instead of stopping at 200, and tests/admin-read-all.test.js guards the
// pager. This file guards the other half — whether the page SAYS what it read.
//
// Two numbers on the dashboard are drawn from a subset of the tickets, and
// until now neither admitted it:
//
//   1. The all-time cards (revenue, ARPU, CAC, LTV, both P&Ls, the campaign
//      table) sum whatever loadPayments() managed to fetch. #502 shouts when
//      the 10,000-document loop guard fires, but that notice sits on the
//      Payment History caption most of a page below the cards it invalidates,
//      and only exists in the failure case. On a normal day nothing states how
//      many tickets the totals were computed from — so a count that stops
//      being right for some future reason is invisible again.
//   2. The sales-clock heatmap reads a listener capped at 200, on purpose, and
//      presented its grid as the whole history.
//
// The failure mode both share is the one that made #502 necessary: numbers that
// keep rendering, keep agreeing with each other, and are quietly a floor. A
// standing count is what makes the next ceiling visible, whatever shape it
// takes — a raised cap, a rules change that hides rows, a read that fails soft.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift by INDENTATION, not brace-matching — safe() holds /"/g, a regex literal
// containing a double quote, and any scanner that knows strings but not regex
// literals reads it as an unterminated string and runs to the end of the file.
// Same helper as admin-read-all.test.js and admin-kpis.test.js.
function lift(name) {
  const decl = new RegExp(
    `^ {8}(?:(?:async )?function ${name}\\s*\\(|(?:const|let) ${name}\\s*=|window\\.${name}\\s*=)`, 'm');
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
vm.runInNewContext(lift('liveTicketScopeNote'), sandbox);
const { liveTicketScopeNote } = sandbox;

describe('liveTicketScopeNote — the capped heatmap admits it is a window', () => {
  it('says "not all-time" once the window is full', () => {
    const note = liveTicketScopeNote(200, 200);
    expect(note).toMatch(/Newest 200 tickets only/);
    expect(note).toMatch(/not all-time/);
    // And points at the number that IS all-time, so the two disagreeing reads
    // as scope rather than as one of them being broken.
    expect(note).toMatch(/totals above the KPIs cover every ticket/i);
  });

  it('says the window still holds everything while it does', () => {
    const note = liveTicketScopeNote(145, 200);
    expect(note).toMatch(/All 145 tickets on record/);
    expect(note).not.toMatch(/only/);
  });

  it('treats over-full the same as full, rather than falling through', () => {
    expect(liveTicketScopeNote(201, 200)).toMatch(/Newest 200 tickets only/);
  });

  it('does not say "1 tickets"', () => {
    expect(liveTicketScopeNote(1, 200)).toMatch(/All 1 ticket on record/);
  });

  it('handles an empty collection without claiming a cap', () => {
    expect(liveTicketScopeNote(0, 200)).toMatch(/All 0 tickets on record/);
  });
});

describe('admin.html — the heatmap caption is wired to the real cap', () => {
  it('shares one constant between the query and the caption', () => {
    // Two literal 200s would drift: someone raises the listener limit, the
    // caption keeps promising the old number, and it is wrong in the one place
    // it exists to be right.
    expect(SRC).toMatch(/const LIVE_TICKET_LIMIT = 200;/);
    expect(SRC).toMatch(/orderBy\('createdAt', 'desc'\), limit\(LIVE_TICKET_LIMIT\)/);
    expect(SRC).toMatch(/liveTicketScopeNote\(liveTicketsRead, LIVE_TICKET_LIMIT\)/);
  });

  it('counts raw documents, not the confirmed-only survivors', () => {
    // liveTickets is filtered to confirmed. Measuring the cap off it would call
    // a window capped at 200 "195 tickets on record" the moment five refunds
    // landed — reporting a cap as a total, which is the bug being fixed.
    expect(SRC).toMatch(/liveTicketsRead = snap\.docs\.length;/);
    expect(SRC).not.toMatch(/liveTicketScopeNote\(liveTickets\.length/);
  });

  it('keeps the listener capped — this is a cost decision, not an oversight', () => {
    const listener = SRC.slice(
      SRC.indexOf('        function startLiveTickets()'),
      SRC.indexOf('        function stopLiveTickets()'));
    expect(listener).toMatch(/limit\(LIVE_TICKET_LIMIT\)/);
    expect(listener).not.toMatch(/readAllDocs/);
  });
});

describe('admin.html — the freshness strip carries a standing ticket count', () => {
  const loadPayments = SRC.slice(
    SRC.indexOf('        async function loadPayments()'),
    SRC.indexOf("        // Monthly costs that aren't attributable"));

  const renderFreshness = SRC.slice(
    SRC.indexOf('        function renderFreshness()'),
    SRC.indexOf('        async function loadRecurring()'));

  it('records what the ticket read returned, before the confirmed filter', () => {
    // allTix is every ticket document; `tickets` is the confirmed subset. The
    // strip has to report the read, not the subset, or a page full of refunds
    // reads as a short read.
    expect(loadPayments).toMatch(/ticketLoad = \{ ok: true, loaded: allTix\.length, complete: !tkRes\.truncated \}/);
  });

  it('distinguishes a failed read from an empty collection', () => {
    // Both render a blank dashboard. Only the flag says which, and "0 tickets,
    // read fine" versus "read threw" are completely different problems.
    const katch = loadPayments.slice(loadPayments.indexOf('} catch'));
    expect(katch).toMatch(/ticketLoad = \{ ok: false, loaded: 0, complete: false \}/);
  });

  it('shows the count on the strip, and TRUNCATED when the read fell short', () => {
    expect(renderFreshness).toMatch(/ticketLoad\.loaded/);
    expect(renderFreshness).toMatch(/TRUNCATED/);
    // Coral, not gold: a short read makes every all-time figure a floor. That
    // is the same class the strip gives a Meta sync that has stopped, not the
    // softer 'warn' it gives one that is merely late.
    expect(renderFreshness).toMatch(/ticketLoad\.ok && ticketLoad\.complete \? '' : 'stale'/);
  });

  it('renders on both strips, above the Revenue and Full Report KPIs', () => {
    // The point of this line is proximity to the cards it qualifies. #502's
    // truncation notice is honest but sits on the Payment History caption, well
    // below them.
    expect(renderFreshness).toMatch(/querySelectorAll\('\.freshness-strip'\)/);
    const strips = SRC.match(/<div class="freshness-strip"><\/div>/g) || [];
    expect(strips.length).toBe(2);
    for (const tab of ['tab-report', 'tab-revenue']) {
      const from = SRC.indexOf(`id="${tab}"`);
      const slice = SRC.slice(from, from + 900);
      expect(slice).toMatch(/<div class="freshness-strip"><\/div>/);
      expect(slice).toMatch(/kpi-grid/);
    }
  });
});
