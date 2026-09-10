// tests/admin-subscriptions-retired.test.js
//
// Memberships are paused (api/declare-connection.js says so at the top). The
// `payments` collection holds ZERO documents and all 117 users sit at
// subscriptionStatus null, tier free — so on 2026-09-10 four surfaces on the
// admin dashboard were describing a product that does not run (Evidence
// "dead weight" and Decision 9 of
// reports/ADMIN_DASHBOARD_METRICS_REVIEW_2026-09-10.md):
//
//   1. the Active Subscriptions KPI card on Revenue, and its twin in the Full
//      Report card list — 0 of 117, in a KPI slot, every render;
//   2. the Subscription Breakdown table, a whole card printing a modelled
//      monthly revenue nobody was ever billed;
//   3. the subscription rows and the $0.00 Subscriptions chip in Payment
//      History;
//   4. the Members-table LTV column, TIER_PRICES[tier] × AVG_LIFETIME_MONTHS —
//      a $180 figure with no dollar behind it.
//
// This file freezes the removal. The reason it is worth a test rather than a
// commit message: a KPI card is cheap to re-add and expensive to notice, and
// two of these four were themselves re-homed rather than removed the last time
// the Overview was reorganised. If memberships come back, delete this file in
// the same change that brings the cards back — do not weaken it one assertion
// at a time.
//
// loadPayments() deliberately still READS `payments`. That is not an
// oversight: the read is free against an empty collection and keeps the
// restore a markup change. Only the rendering is gone.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

/** Slice a top-level function body out by indentation. */
function body(header) {
  const i = SRC.indexOf(header);
  expect(i, `${header.trim()} missing from admin.html`).toBeGreaterThan(-1);
  const close = /^ {8}\};?$/m.exec(SRC.slice(i));
  return SRC.slice(i, i + close.index + close[0].length);
}

describe('the Active Subscriptions KPI is gone from both places it rendered', () => {
  it('has no kpiActive card left in the markup', () => {
    expect(SRC).not.toContain('id="kpiActive"');
    expect(SRC).not.toContain('id="kpiActiveTrend"');
  });

  it('renderKPIs writes to neither element', () => {
    const b = body('        function renderKPIs() {');
    expect(b).not.toContain("getElementById('kpiActive')");
    expect(b).not.toContain("getElementById('kpiActiveTrend')");
  });

  it('the Full Report card list no longer prints it', () => {
    const b = body('        function renderReport() {');
    expect(b).not.toContain("'Active Subscriptions'");
    // The cards either side of it are untouched.
    expect(b).toContain("'Ticket Velocity'");
    expect(b).toContain("'Total Members'");
  });

  it('kpiSnapshot still carries `active`, so the restore stays a markup change', () => {
    // tests/admin-kpis.test.js asserts the same field from the other
    // direction. Computing it costs one filter over an already-loaded array.
    const b = body('        function renderKPIs() {');
    expect(b).toMatch(/const active = allUsers\.filter/);
    expect(b).toMatch(/^\s*active,$/m);
  });
});

describe('the Subscription Breakdown card is gone entirely', () => {
  it('leaves no markup behind', () => {
    // The phrase survives in one Overview comment recording where the card
    // went and why it was then retired; the CARD is what must not come back.
    expect(SRC).not.toContain('<h2 class="card-title">Subscription Breakdown</h2>');
    expect(SRC).not.toContain('id="tierBreakdown"');
  });

  it('leaves no renderer behind, and nothing calls one', () => {
    expect(SRC).not.toContain('renderTierBreakdown');
  });

  it('drops the constants that only it and the LTV column used', () => {
    expect(SRC).not.toMatch(/const TIER_PRICES\s*=/);
    expect(SRC).not.toMatch(/const AVG_LIFETIME_MONTHS\s*=/);
    // TIER_LABELS stays — tierBadge() still has to name a tier.
    expect(SRC).toMatch(/const TIER_LABELS\s*=/);
    expect(SRC).toContain('TIER_LABELS[tier]');
  });
});

describe('Payment History shows tickets only', () => {
  const b = body('        function renderPaymentHistory() {');

  it('renders no subscription rows and no Subscription badge', () => {
    expect(b).not.toContain('Subscription</span>');
    expect(b).not.toContain("_type === 'subscription'");
  });

  it('builds its rows from tickets, not from everything in allPayments', () => {
    expect(b).toContain("const ticketPayments = allPayments.filter(p => p._type === 'ticket')");
    expect(b).toContain('[...ticketPayments, ...refundedPayments]');
    expect(b).not.toContain('[...allPayments, ...refundedPayments]');
  });

  it('has no Subscriptions chip and no ticket+subscription grand total', () => {
    expect(b).not.toContain('Subscriptions</div>');
    expect(b).not.toMatch(/\bsubTotal\b/);
    expect(b).not.toMatch(/\bgrandTotal\b/);
    // Refunds are still shown and still excluded from the money.
    expect(b).toContain('refundChip');
  });

  it('loadPayments still reads `payments` — the read is deliberate', () => {
    const lp = body('        async function loadPayments() {');
    expect(lp).toMatch(/readAllDocs\('payments'/);
    expect(lp).toContain("_type: 'subscription'");
  });
});

describe('the Members table has no LTV column', () => {
  it('drops the header and reflows the empty-state colspan', () => {
    expect(SRC).not.toContain('<th>LTV</th>');
    const table = SRC.slice(SRC.indexOf('<tbody id="allMembers">'));
    expect(table.slice(0, 200)).toContain('colspan="7"');
  });

  it('renderAllMembers computes no per-member lifetime value', () => {
    const b = body('        function renderAllMembers() {');
    expect(b).not.toContain('AVG_LIFETIME_MONTHS');
    expect(b).not.toMatch(/\bltv\b/);
    expect(b).toContain('colspan="7"');
    // Seven cells per row, matching the seven headers. Counted over the row
    // template alone -- the empty-state row above it is a <td> too.
    const row = b.slice(b.indexOf('tbody.innerHTML = filtered.map'));
    expect((row.match(/<td/g) || []).length).toBe(7);
  });
});
