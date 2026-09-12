#!/usr/bin/env node
'use strict';
/**
 * Widen the Loxleys retargeting pool (decision 02, reports/LOXLEYS_LINK_CLICKS_2026-09-11.md).
 *
 * Creates two ENGAGEMENT audiences if they do not exist (Page engagers 365d,
 * Instagram engagers 365d), then sets the retargeting ad set's custom_audiences
 * to: LX site visitors + LX video viewers (already there) + all-site visitors
 * excl. buyers + every-Page-video viewers + Page engagers + IG engagers.
 * Reads everything back.
 *
 * DRY RUN by default. --execute writes. Idempotent: re-running finds the
 * audiences by name and skips the targeting write if it already matches.
 */
const T = process.env.META_ADS_ACCESS_TOKEN; const V = 'v21.0'; const ACCOUNT = 'act_1672342180672647';
const EXECUTE = process.argv.includes('--execute');
const AD_SET = '120250964028400542';
const PAGE_ID = '1139242662602769';
const IG_ID = '17841426630031658';
const KEEP = ['120251194124890542', '120251341306880542']; // LX site visitors, LX video viewers
const ALL_SITE = '120249320696310542'; // "Visited but did not order tickets" (all visitors 60d, excl. Purchase)
// Every video the Page has, 3-second views, 365d -- built for Marion Court but
// broader than Loxleys' own four-reel audience. Reused as the any-video layer.
const ALL_VIDEOS = '120250973173480542';
const RET = 365 * 86400;
const env = (type, id, event) => JSON.stringify({ inclusions: { operator: 'or', rules: [{ event_sources: [{ type, id }], retention_seconds: RET, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: event }] } }] } });
const flat = (event, id) => JSON.stringify([{ event_name: event, object_id: id }]);
const WANT = [
  { name: 'SparkDate Page Engagers 365d', rules: [
    { label: 'flat page_engaged numeric id + subtype ENGAGEMENT', params: { subtype: 'ENGAGEMENT', rule: flat('page_engaged', Number(PAGE_ID)) } },
    { label: 'flat page_engaged numeric id, no subtype', params: { rule: flat('page_engaged', Number(PAGE_ID)) } },
    { label: 'envelope page numeric id + subtype', params: { subtype: 'ENGAGEMENT', rule: env('page', Number(PAGE_ID), 'page_engaged') } },
    { label: 'envelope page numeric id, no subtype', params: { rule: env('page', Number(PAGE_ID), 'page_engaged') } },
  ] },
  { name: 'SparkDate Instagram Engagers 365d', rules: [
    { label: 'flat ig_business_profile_engaged numeric id + subtype ENGAGEMENT', params: { subtype: 'ENGAGEMENT', rule: flat('ig_business_profile_engaged', Number(IG_ID)) } },
    { label: 'flat ig_business_profile_engaged numeric id, no subtype', params: { rule: flat('ig_business_profile_engaged', Number(IG_ID)) } },
    { label: 'envelope ig_business + subtype, event ig_business_profile_engaged', params: { subtype: 'ENGAGEMENT', rule: env('ig_business', Number(IG_ID), 'ig_business_profile_engaged') } },
    { label: 'envelope ig_business no subtype, event ig_business_profile_all', params: { rule: env('ig_business', Number(IG_ID), 'ig_business_profile_all') } },
  ] },
];
async function get(p, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${p}`); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('access_token', T);
  const j = await (await fetch(u)).json(); if (j.error) throw new Error(`${p}: ${JSON.stringify(j.error)}`); return j.data || j;
}
async function post(p, params) {
  const body = new URLSearchParams({ ...params, access_token: T });
  const j = await (await fetch(`https://graph.facebook.com/${V}/${p}`, { method: 'POST', body })).json();
  if (j.error) throw new Error(`${p}: ${JSON.stringify(j.error)}`); return j;
}
(async () => {
  console.log(`lx-widen-retargeting  ${new Date().toISOString()}  ${EXECUTE ? 'EXECUTE' : 'DRY RUN -- nothing will be written'}\n`);
  const existing = await get(`${ACCOUNT}/customaudiences`, { fields: 'id,name,subtype,delivery_status,retention_days', limit: 50 });
  const ids = [];
  for (const w of WANT) {
    const hit = existing.find((a) => a.name === w.name);
    if (hit) { console.log(`  EXISTS  ${hit.id}  "${hit.name}"  ${hit.subtype} ${hit.retention_days}d  status ${hit.delivery_status && hit.delivery_status.code}`); ids.push(hit.id); continue; }
    if (!EXECUTE) { console.log(`  CREATE  "${w.name}"  (tries: ${w.rules.map((r) => r.label).join(' | ')})`); continue; }
    let made = null;
    for (const r of w.rules) {
      try {
        made = await post(`${ACCOUNT}/customaudiences`, { name: w.name, description: 'Widened Loxleys retargeting pool, 2026-09-11 (reports/LOXLEYS_LINK_CLICKS_2026-09-11.md decision 02).', retention_days: '365', prefill: '1', ...r.params });
        console.log(`  CREATED ${made.id}  "${w.name}"  via: ${r.label}`);
        break;
      } catch (e) { console.log(`  rejected: ${r.label} -> ${e.message.slice(120, 330)}`); }
    }
    if (!made) { console.log(`  !!      could not create "${w.name}" -- continuing without it`); continue; }
    const back = await get(made.id, { fields: 'id,name,subtype,retention_days,rule,delivery_status,operation_status' });
    console.log(`          read-back: ${back.subtype} ${back.retention_days}d status ${back.delivery_status && back.delivery_status.code} ${back.delivery_status && back.delivery_status.description} rule=${String(back.rule).slice(0, 160)}`);
    ids.push(made.id);
  }
  for (const id of [ALL_SITE, ALL_VIDEOS]) { const a = existing.find((x) => x.id === id); console.log(`  REUSE   ${id}  "${a && a.name}"  ${a && a.subtype} ${a && a.retention_days}d  status ${a && a.delivery_status && a.delivery_status.code}`); }

  const adset = await get(AD_SET, { fields: 'id,name,effective_status,targeting' });
  const have = (adset.targeting.custom_audiences || []).map((a) => String(a.id)).sort();
  const want = [...KEEP, ALL_SITE, ALL_VIDEOS, ...ids].map(String).sort();
  console.log(`\n  ad set  ${adset.name}  ${adset.effective_status}`);
  console.log(`  BEFORE  ${(adset.targeting.custom_audiences || []).map((a) => a.name).join(' | ')}`);
  console.log(`  WANT    ${want.join(', ')}`);
  if (!EXECUTE) { console.log('\nDry run. Re-run with --execute.'); return; }
  if (have.join(',') === want.join(',')) { console.log('  SKIP    already exactly these audiences'); return; }
  const targeting = { ...adset.targeting, custom_audiences: want.map((id) => ({ id })) };
  await post(AD_SET, { targeting: JSON.stringify(targeting) });
  const after = await get(AD_SET, { fields: 'id,targeting,effective_status' });
  const got = (after.targeting.custom_audiences || []).map((a) => String(a.id)).sort();
  console.log(`  AFTER   ${(after.targeting.custom_audiences || []).map((a) => a.name).join(' | ')}`);
  if (got.join(',') !== want.join(',')) throw new Error(`read-back mismatch: [${got}] vs [${want}]`);
  if (after.targeting.flexible_spec) throw new Error('flexible_spec appeared');
  console.log(`  verified: ${got.length} audiences attached, genders ${JSON.stringify(after.targeting.genders)}, relaxation ${JSON.stringify(after.targeting.targeting_relaxation_types)}, status ${after.effective_status}`);
})().catch((e) => { console.error('\n  x ' + e.message); process.exit(1); });
