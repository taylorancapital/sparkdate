// tests/admin-read-all.test.js
//
// public/admin.html used to read the 200 newest tickets and call the result
// "all time". Every all-time figure on the dashboard -- revenue, net revenue,
// CAC, LTV:CAC, the channel and event P&L, the campaign panel's all-time cost
// per ticket -- sums that one list, so past 200 tickets they would all have
// stopped growing at once, with nothing erroring and no figure looking wrong.
// There were 145 confirmed tickets and events sell 19-29.
//
// readAllDocs() replaces the cap with paging. The failure it guards against is
// invisible by construction, so the paging is asserted here against the SHIPPED
// code lifted out of the page -- the same technique tests/admin-kpis.test.js
// and tests/chemistry-rotation.test.js use.
//
// What actually matters, and what each block below covers:
//   - it must not stop early (that was the bug);
//   - it must not loop forever (that would be a worse bug);
//   - it must never count a document twice (that would be phantom revenue);
//   - and if it ever does stop early at the loop guard, the page has to SAY so,
//     because a truncation nobody can see is what this replaced.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public', 'admin.html'), 'utf8');

// Lift a top-level declaration by INDENTATION, not by brace-matching: every
// top-level declaration in this script sits at eight spaces and closes on a
// line that is exactly eight spaces and a brace. A hand-rolled brace scanner is
// a trap here -- safe() contains /"/g, a regex literal holding a double quote,
// which any scanner that only knows about strings reads as the start of one and
// then runs to the end of the file.
function lift(name) {
  const decl = new RegExp(
    `^ {8}(?:async function ${name}\\s*\\(|function ${name}\\s*\\(|(?:const|let) ${name}\\s*=|window\\.${name}\\s*=)`, 'm');
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

// PAGE_SIZE and HARD_CAP are lexical consts in the page's script, so they are
// lifted alongside the function and evaluated in the same context rather than
// being re-declared here — the test asserts against the SHIPPED numbers.
const PAGE_SIZE = Number(/const PAGE_SIZE = (\d+);/.exec(SRC)[1]);
const HARD_CAP = Number(/const HARD_CAP = (\d+);/.exec(SRC)[1]);

/**
 * Run readAllDocs() against a fake Firestore.
 *
 * `pages` is a function (callNumber, cursor) -> array of {id, data} to return.
 * Returns the result plus the recorded query descriptors, so the test can
 * assert HOW it paged and not merely what came back.
 */
function run(pages) {
  const calls = [];
  const sandbox = {
    console,
    db: { __db: true },
    collection: (db, name) => ({ kind: 'collection', db, name }),
    orderBy: (field, dir) => ({ kind: 'orderBy', field, dir }),
    limit: (n) => ({ kind: 'limit', n }),
    startAfter: (cursor) => ({ kind: 'startAfter', cursor }),
    query: (...parts) => ({ kind: 'query', parts }),
    getDocs: async (q) => {
      const startAfterPart = q.parts.find((p) => p.kind === 'startAfter');
      const docs = pages(calls.length, startAfterPart ? startAfterPart.cursor : null);
      calls.push({ q, cursor: startAfterPart ? startAfterPart.cursor : null });
      return { docs };
    },
  };
  vm.runInNewContext(
    `${lift('PAGE_SIZE')}\n${lift('HARD_CAP')}\n${lift('readAllDocs')}\n` +
    `globalThis.__run = (c, f) => readAllDocs(c, f);`,
    sandbox
  );
  return { calls, go: (col, field) => sandbox.__run(col, field) };
}

/** n fake doc snapshots, ids numbered from `from`. */
const docs = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `d${from + i}`, data: () => ({ n: from + i }) }));

describe('readAllDocs — it must not stop early', () => {
  it('a collection smaller than one page is read in a single query', async () => {
    const h = run(() => docs(145));
    const res = await h.go('tickets', 'createdAt');

    expect(res.docs).toHaveLength(145);
    expect(res.truncated).toBe(false);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].cursor).toBe(null);
  });

  it('keeps paging past the old 200-ticket cap', async () => {
    // 1,203 documents: the exact shape the cap used to silently truncate.
    const all = docs(1203);
    const h = run((call) => all.slice(call * PAGE_SIZE, (call + 1) * PAGE_SIZE));
    const res = await h.go('tickets', 'createdAt');

    expect(res.docs).toHaveLength(1203);
    expect(res.truncated).toBe(false);
    expect(h.calls).toHaveLength(Math.ceil(1203 / PAGE_SIZE));
    expect(res.docs.map((d) => d.id)).toEqual(all.map((d) => d.id));
  });

  it('pages again when the collection is an exact multiple of the page size', async () => {
    // The off-by-one that would silently drop everything past the first page:
    // a full page is not proof there is nothing after it.
    const all = docs(PAGE_SIZE);
    const h = run((call) => (call === 0 ? all : []));
    const res = await h.go('tickets', 'createdAt');

    expect(res.docs).toHaveLength(PAGE_SIZE);
    expect(h.calls).toHaveLength(2);
    expect(res.truncated).toBe(false);
  });

  it('carries the LAST document of each page as the next cursor', async () => {
    const all = docs(PAGE_SIZE * 2 + 3);
    const h = run((call) => all.slice(call * PAGE_SIZE, (call + 1) * PAGE_SIZE));
    await h.go('tickets', 'createdAt');

    expect(h.calls[0].cursor).toBe(null);
    expect(h.calls[1].cursor).toBe(all[PAGE_SIZE - 1]);
    expect(h.calls[2].cursor).toBe(all[PAGE_SIZE * 2 - 1]);
  });

  it('passes the collection name and order field straight through', async () => {
    const h = run(() => docs(3));
    await h.go('payments', 'paidAt');

    const parts = h.calls[0].q.parts;
    expect(parts.find((p) => p.kind === 'collection').name).toBe('payments');
    const order = parts.find((p) => p.kind === 'orderBy');
    expect(order.field).toBe('paidAt');
    expect(order.dir).toBe('desc'); // newest first, as the table renders
  });

  it('an empty collection reads clean', async () => {
    const h = run(() => []);
    const res = await h.go('tickets', 'createdAt');
    expect(res.docs).toEqual([]);
    expect(res.truncated).toBe(false);
    expect(h.calls).toHaveLength(1);
  });
});

describe('readAllDocs — it must not loop forever, and must say when it stops', () => {
  it('stops at the hard cap and reports it', async () => {
    // A collection that never runs out: every page comes back full and fresh.
    let issued = 0;
    const h = run(() => {
      const page = docs(PAGE_SIZE, issued);
      issued += PAGE_SIZE;
      return page;
    });
    const res = await h.go('tickets', 'createdAt');

    expect(res.truncated).toBe(true);
    expect(res.docs.length).toBeGreaterThanOrEqual(HARD_CAP);
    expect(h.calls.length).toBeLessThanOrEqual(Math.ceil(HARD_CAP / PAGE_SIZE) + 1);
  });

  it('the hard cap sits far above anything the business will see soon', async () => {
    // 145 tickets at ~25 an event. The guard must not become the new 200.
    expect(HARD_CAP).toBeGreaterThanOrEqual(5000);
    expect(PAGE_SIZE).toBeGreaterThan(200);
  });
});

describe('readAllDocs — a document is never counted twice', () => {
  it('deduplicates an id returned on two pages', async () => {
    // Concurrent writes can shift a document across a page boundary. A missed
    // brand-new ticket is harmless (the next refresh catches it); a duplicated
    // one is revenue that was never earned.
    const first = docs(PAGE_SIZE);
    const overlap = [first[PAGE_SIZE - 1], ...docs(4, PAGE_SIZE)];
    const h = run((call) => (call === 0 ? first : call === 1 ? overlap : []));
    const res = await h.go('tickets', 'createdAt');

    expect(res.docs).toHaveLength(PAGE_SIZE + 4);
    expect(new Set(res.docs.map((d) => d.id)).size).toBe(res.docs.length);
  });
});

describe('the page no longer caps its all-time reads', () => {
  const loadPayments = (() => {
    const i = SRC.indexOf('        async function loadPayments() {');
    const close = /^ {8}\}$/m.exec(SRC.slice(i));
    return SRC.slice(i, i + close.index + close[0].length);
  })();

  it('loadPayments pages both collections instead of taking the newest 200', () => {
    expect(loadPayments).not.toMatch(/limit\(200\)/);
    expect(loadPayments).toContain("readAllDocs('tickets', 'createdAt')");
    expect(loadPayments).toContain("readAllDocs('payments', 'paidAt')");
  });

  it('startAfter is actually imported, or every page after the first throws', () => {
    const imports = /import \{([^}]+)\} from "https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+firebase-firestore\.js"/.exec(SRC);
    expect(imports, 'firestore import line not found').toBeTruthy();
    expect(imports[1].split(',').map((x) => x.trim())).toContain('startAfter');
  });

  it('a truncated read is surfaced in the Payment History caption, not swallowed', () => {
    const i = SRC.indexOf('        function renderPaymentHistory() {');
    const close = /^ {8}\}$/m.exec(SRC.slice(i));
    const body = SRC.slice(i, i + close.index + close[0].length);
    expect(body).toContain('paymentsTruncated');
    expect(body).toMatch(/floor, not a total/);
  });

  it('the stale comments claiming a 200 cap are gone', () => {
    // Two comments elsewhere on the page justified their own behaviour by
    // pointing at this cap. A comment that describes arithmetic that no longer
    // happens is how the next reader gets misled.
    expect(SRC).not.toMatch(/allPayments is itself capped/);
    expect(SRC).not.toMatch(/loadPayments\(\) caps at the 200 newest tickets/);
  });
});
