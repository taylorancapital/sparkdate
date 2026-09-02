#!/usr/bin/env node
/**
 * scripts/meta-fix-audience-buyers.js
 *
 * Repairs the buyer exclusion on a website custom audience so it keys off the
 * pixel's Purchase EVENT instead of a URL substring.
 *
 * WHY. "Visited but did not order tickets" (120249320696310542) excluded
 * `url i_contains "orders" OR url i_contains "order"`. sparkdate.date has no
 * such page: there is no /order or /orders route, nothing in vercel.json, and
 * api/purchase-ticket.js sets `allow_redirects: 'never'`, so checkout is an
 * in-page Stripe Payment Intent and a buyer never lands on a distinct URL.
 * The exclusion therefore matched NOBODY -- the audience was "all site
 * visitors, 60 days" wearing a name that promised otherwise, and a report
 * repeated the promise on the strength of the name.
 *
 * A URL-substring exclusion cannot work on this site. An event exclusion can:
 * the pixel fires Purchase from the page and server-side (18 in the seven days
 * to 2026-09-02), so Purchase is the only reliable "this person bought" signal.
 *
 * WHETHER `rule` IS WRITABLE ON AN EXISTING AUDIENCE IS AN OPEN QUESTION until
 * this is run -- the Marketing API docs demonstrate updating only `name`. Same
 * shape of doubt as tracking_specs, which turned out to be writable
 * (memory tracking-specs-append-never-replace). So: back the old rule up to a
 * file, write, then read the rule BACK from the API and check the inclusion
 * survived unchanged and the exclusion is now event-based. A silent no-op and a
 * partial write are both louder failures than an error.
 *
 * Changing a rule does not touch any ad set, so nothing re-enters the learning
 * phase. Check the audience is an orphan first anyway -- this script prints
 * nothing about consumers, so confirm separately before running it on an
 * audience something live depends on.
 *
 * DRY RUN IS THE DEFAULT. Nothing changes without --execute.
 *
 * Usage:
 *   node scripts/meta-fix-audience-buyers.js --audience=<id>            # dry run
 *   node scripts/meta-fix-audience-buyers.js --audience=<id> --execute
 *   node scripts/meta-fix-audience-buyers.js --audience=<id> --restore=<backup.json>
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required, needs ads_management
 */

'use strict';

const fs = require('fs');
const path = require('path');

const V = 'v21.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const DEFAULT_PIXEL = '4390442851170732';

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const AUDIENCE = flag('audience');
const EXECUTE = flag('execute') === true;
const RESTORE = flag('restore');
const PIXEL = flag('pixel') || DEFAULT_PIXEL;
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

// The documented shape for matching a pixel event in a website audience rule:
// field "event", operator "i_contains". Among the events this site fires
// (PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo,
// Purchase, Lead) only Purchase contains "Purchase", so i_contains is exact
// enough here and is what Meta's own UI emits.
const buyerExclusion = (retentionSeconds) => ({
  operator: 'or',
  rules: [{
    event_sources: [{ type: 'pixel', id: Number(PIXEL) }],
    retention_seconds: retentionSeconds,
    filter: { operator: 'and', filters: [{ field: 'event', operator: 'i_contains', value: 'Purchase' }] },
  }],
});

const describe = (f) => {
  if (!f) return '(none)';
  if (f.filters) return `(${f.filters.map(describe).join(` ${f.operator.toUpperCase()} `)})`;
  return `${f.field} ${f.operator} "${f.value}"`;
};

const show = (label, rule) => {
  for (const r of (rule.inclusions && rule.inclusions.rules) || []) {
    console.log(`  ${label} INCLUDE  ${describe(r.filter)}   [${r.retention_seconds / 86400}d]`);
  }
  const ex = (rule.exclusions && rule.exclusions.rules) || [];
  if (!ex.length) console.log(`  ${label} EXCLUDE  (none)`);
  for (const r of ex) console.log(`  ${label} EXCLUDE  ${describe(r.filter)}   [${r.retention_seconds / 86400}d]`);
};

async function get(id, fields) {
  const url = new URL(`${GRAPH}/${id}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`GET ${id}: ${body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`}`);
  }
  return body;
}

async function post(id, fields) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set('access_token', TOKEN);
  const res = await fetch(`${GRAPH}/${id}`, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`POST ${id}: ${body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`}`);
  }
  return body;
}

const parseRule = (r) => (typeof r === 'string' ? JSON.parse(r) : r);
const excludesPurchaseEvent = (rule) =>
  ((rule.exclusions && rule.exclusions.rules) || []).some((r) =>
    JSON.stringify(r.filter || {}).includes('"event"') && JSON.stringify(r.filter || {}).toLowerCase().includes('purchase'));

async function main() {
  if (!TOKEN) {
    console.error('ERROR: META_ADS_ACCESS_TOKEN is not set (needs ads_management).');
    process.exit(2);
  }
  if (!AUDIENCE) {
    console.error('ERROR: pass --audience=<id>.');
    process.exit(2);
  }

  const before = await get(AUDIENCE, 'name,subtype,rule,retention_days,delivery_status,approximate_count_lower_bound');
  const oldRule = parseRule(before.rule);
  console.log(`${before.name}  [${before.subtype}]  ${AUDIENCE}`);
  console.log(`  size ${before.approximate_count_lower_bound} (Meta's floor)   ${before.delivery_status ? before.delivery_status.description : ''}`);
  show('before', oldRule);

  if (RESTORE) {
    const saved = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
    console.log(`\n  restoring the rule saved in ${RESTORE}`);
    show('restore', saved.rule);
    if (!EXECUTE) { console.log('\nDry run. Re-run with --execute.'); return; }
    await post(AUDIENCE, { rule: JSON.stringify(saved.rule) });
    const back = parseRule((await get(AUDIENCE, 'rule')).rule);
    show('after', back);
    return;
  }

  if (excludesPurchaseEvent(oldRule)) {
    console.log('\n  SKIP  this audience already excludes the Purchase event; nothing to do.');
    return;
  }

  // Keep the inclusion byte-for-byte. Only the exclusion is wrong.
  const seconds = (oldRule.inclusions.rules[0] && oldRule.inclusions.rules[0].retention_seconds) || 5184000;
  const newRule = { inclusions: oldRule.inclusions, exclusions: buyerExclusion(seconds) };
  console.log('');
  show('after ', newRule);

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute.');
    return;
  }

  const backup = path.join(__dirname, '..', 'build', `audience-${AUDIENCE}-rule-before.json`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, JSON.stringify({ id: AUDIENCE, name: before.name, saved_at: new Date().toISOString(), rule: oldRule }, null, 2));
  console.log(`\n  backup   ${backup}`);

  await post(AUDIENCE, { rule: JSON.stringify(newRule) });

  // Read back from the API, never trust the POST response.
  const after = await get(AUDIENCE, 'rule,delivery_status,approximate_count_lower_bound');
  const got = parseRule(after.rule);
  show('verify', got);

  const inclusionIntact = JSON.stringify(got.inclusions) === JSON.stringify(oldRule.inclusions);
  if (excludesPurchaseEvent(got) && inclusionIntact) {
    console.log(`\n  OK       exclusion is now event-based, inclusion unchanged.`);
    console.log(`  status   ${after.delivery_status ? after.delivery_status.description : '?'}`);
  } else {
    console.log(`\n  FAILED   exclusion event-based: ${excludesPurchaseEvent(got)}; inclusion unchanged: ${inclusionIntact}`);
    console.log(`  restore with: node scripts/meta-fix-audience-buyers.js --audience=${AUDIENCE} --restore=${backup} --execute`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
