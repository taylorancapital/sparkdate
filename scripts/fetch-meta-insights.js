#!/usr/bin/env node
/**
 * scripts/fetch-meta-insights.js
 *
 * Read-only. Pulls Meta Ads campaign-level performance (spend, clicks,
 * results, cost-per-result) via the Marketing API's Insights endpoint and
 * drops it into the same "Night Tasks" folder the GA4 exports are manually
 * saved to, so the nightly Cowork review picks it up as just another input
 * file alongside them.
 *
 * Run this yourself before the nightly task fires — same manual step as
 * exporting the GA4 CSVs. The scheduled task only sees files already sitting
 * in that folder; it does not fetch anything itself and holds no Meta token.
 *
 * Needs its OWN token — this does not ride along on the Conversions API one.
 * Verified against Meta's Access Token Debugger: the token the CAPI setup
 * wizard mints carries only `read_ads_dataset_quality`, which is enough to
 * send events to a dataset but cannot read Insights. Reading campaign
 * performance requires `ads_read` (or `ads_management`), so generate a
 * separate system-user token with that scope and put it in
 * META_ADS_ACCESS_TOKEN, leaving the working CAPI token untouched.
 *
 * The CSV opens with a `# <since>-<until>` date-range header line matching the
 * convention GA4's own exports use, since the nightly review identifies each
 * file's reporting window by reading exactly that line.
 *
 * Usage:
 *   node scripts/fetch-meta-insights.js                   # yesterday -> Night Tasks/
 *   node scripts/fetch-meta-insights.js --days=7          # last 7 days
 *   node scripts/fetch-meta-insights.js --out=other.csv   # write somewhere else
 *   node scripts/fetch-meta-insights.js --no-file         # print only, write nothing
 *
 * Env vars:
 *   META_ADS_ACCESS_TOKEN   required — system-user token carrying ads_read (or
 *                           ads_management). Falls back to
 *                           META_CAPI_ACCESS_TOKEN only so an existing setup
 *                           keeps running; that token will fail here unless it
 *                           happens to carry an ads scope of its own.
 *   META_AD_ACCOUNT_ID      optional — e.g. "act_1234567890". If unset, the
 *                           script looks up accounts the token can see via
 *                           /me/adaccounts and auto-picks when there's only
 *                           one, or prints the list when there's more. That
 *                           lookup is unreliable for system-user tokens, so
 *                           setting this explicitly is the safer path.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = 'v21.0';

// Where the nightly Cowork review looks for its input files. Resolved from
// this script's own location so it lands in the right place no matter which
// directory the script is invoked from.
const NIGHT_TASKS_DIR = path.join(__dirname, '..', 'Business Plan', 'files', 'Night Tasks');

const need = (k) => {
  if (!process.env[k]) {
    console.error(`✗ Missing env var: ${k}`);
    process.exit(2);
  }
  return process.env[k];
};

// Prefer a dedicated ads-scoped token. The CAPI token is accepted as a
// fallback so an existing setup doesn't break outright, but it is not
// expected to work: the one Meta's CAPI wizard mints carries only
// read_ads_dataset_quality, which cannot read Insights.
const accessToken = process.env.META_ADS_ACCESS_TOKEN || need('META_CAPI_ACCESS_TOKEN');

function parseArgs(argv) {
  const out = { days: 1, out: null, noFile: false };
  for (const arg of argv) {
    const daysMatch = arg.match(/^--days=(\d+)$/);
    const outMatch = arg.match(/^--out=(.+)$/);
    if (daysMatch) out.days = parseInt(daysMatch[1], 10);
    else if (outMatch) out.out = outMatch[1];
    else if (arg === '--no-file') out.noFile = true;
  }
  return out;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

async function graphGet(path, params) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? body.error.message : `HTTP ${res.status}`;
    const code = body.error ? body.error.code : res.status;

    // Meta reports a missing ads scope as if it were an ad-account ownership
    // problem ("Ad account owner has NOT grant..."), which sends you into
    // Business Settings reassigning assets that were never the issue. The
    // token itself is what's short a scope — say so, and name the one-step
    // check that settles it.
    if (/ads_management or ads_read/i.test(msg)) {
      throw new Error(
        `Meta API error (${code}): ${msg}\n\n` +
        `Despite the wording, this is usually the TOKEN's scopes, not the ad\n` +
        `account's assignments. Paste the token into\n` +
        `https://developers.facebook.com/tools/debug/accesstoken/ and read the\n` +
        `"Scopes" row: reading Insights needs ads_read (or ads_management).\n` +
        `A token minted by the Conversions API wizard carries only\n` +
        `read_ads_dataset_quality and can never work here.\n\n` +
        `Fix: Business Settings → System Users → (your user) → Generate New\n` +
        `Token, check ads_read, then set it as META_ADS_ACCESS_TOKEN. Leave\n` +
        `META_CAPI_ACCESS_TOKEN alone — CAPI is working and uses a different scope.`
      );
    }

    throw new Error(`Meta API error (${code}): ${msg}`);
  }
  return body;
}

async function resolveAdAccountId() {
  if (process.env.META_AD_ACCOUNT_ID) return process.env.META_AD_ACCOUNT_ID;

  console.log('META_AD_ACCOUNT_ID not set — looking up accessible ad accounts...');

  // /me/adaccounts is the fragile step, not the useful one. For a system-user
  // token /me resolves to the system user itself, and Meta commonly answers
  // this edge with "(#200) Missing Permissions" even when the token can read
  // the ad account's insights perfectly well. So a discovery failure must not
  // kill the run — it just means we can't guess, and the caller should say
  // which account they want.
  let accounts;
  try {
    const body = await graphGet('me/adaccounts', { fields: 'id,name', access_token: accessToken });
    accounts = body.data || [];
  } catch (err) {
    throw new Error(
      `Could not list ad accounts (${err.message}).\n\n` +
      `This lookup is unreliable for system-user tokens and is not required.\n` +
      `Set the account id explicitly and re-run — that skips this call entirely:\n\n` +
      `  $env:META_AD_ACCOUNT_ID = "act_<your-id>"\n\n` +
      `Find <your-id> in the Ads Manager URL (…?act=1234567890…), or in the\n` +
      `account dropdown at the top-left of Ads Manager.\n\n` +
      `If it still fails after that, the ad account itself is not assigned to\n` +
      `the system user: Business Settings → System Users → (your user) →\n` +
      `Add Assets → Ad Accounts. To see exactly which scopes the token really\n` +
      `carries, paste it into https://developers.facebook.com/tools/debug/accesstoken/`
    );
  }

  if (accounts.length === 0) {
    throw new Error(
      'No ad accounts are accessible to this token. Check that the system user ' +
      'has been granted access to the ad account in Business Settings, not just ' +
      'the pixel/dataset.'
    );
  }
  if (accounts.length === 1) {
    console.log(`Auto-selected the only account: ${accounts[0].name} (${accounts[0].id})`);
    return accounts[0].id;
  }

  const list = accounts.map((a) => `  ${a.id}  ${a.name}`).join('\n');
  throw new Error(
    `Found ${accounts.length} accessible ad accounts — set META_AD_ACCOUNT_ID to ` +
    `one of these and re-run:\n${list}`
  );
}

async function fetchInsights(adAccountId, since, until) {
  const rows = [];
  let path = `${adAccountId}/insights`;
  let params = {
    level: 'campaign',
    fields: 'campaign_name,adset_name,spend,impressions,clicks,cpc,actions,cost_per_action_type',
    time_range: JSON.stringify({ since, until }),
    access_token: accessToken,
  };

  for (;;) {
    const body = await graphGet(path, params);
    rows.push(...(body.data || []));
    const next = body.paging && body.paging.next;
    if (!next) break;
    // paging.next is already a full URL with its own query string —
    // hand it to graphGet as-is by stripping the graph host/version prefix
    // it already has its own access_token, so no need to pass params again.
    const nextUrl = new URL(next);
    path = nextUrl.pathname.replace(/^\/(v[\d.]+\/)?/, '');
    params = Object.fromEntries(nextUrl.searchParams);
  }

  return rows;
}

function summarizeActions(actions) {
  if (!actions || actions.length === 0) return '(none)';
  return actions.map((a) => `${a.action_type}=${a.value}`).join(', ');
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log('No campaign activity in this date range.');
    return;
  }
  for (const r of rows) {
    console.log(`• ${r.campaign_name || '(unnamed campaign)'}${r.adset_name ? ` / ${r.adset_name}` : ''}`);
    console.log(`    spend: $${r.spend || '0.00'}   impressions: ${r.impressions || 0}   clicks: ${r.clicks || 0}   cpc: $${r.cpc || '0.00'}`);
    console.log(`    actions: ${summarizeActions(r.actions)}`);
  }
}

function writeCsv(rows, outPath, since, until) {
  const header = ['campaign_name', 'adset_name', 'spend', 'impressions', 'clicks', 'cpc', 'actions'];
  const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

  // Leading `#` metadata lines mirror GA4's own CSV exports — the nightly
  // review reads the `# <since>-<until>` line to establish each file's
  // reporting window, so this file needs to carry one in the same shape.
  const lines = [
    `# ${since.replace(/-/g, '')}-${until.replace(/-/g, '')}`,
    '# source: Meta Marketing API (Insights, level=campaign)',
    header.join(','),
  ];
  for (const r of rows) {
    lines.push([
      r.campaign_name,
      r.adset_name,
      r.spend,
      r.impressions,
      r.clicks,
      r.cpc,
      summarizeActions(r.actions),
    ].map(escape).join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${rows.length} row(s) to ${outPath}`);
}

(async () => {
  const { days, out, noFile } = parseArgs(process.argv.slice(2));

  const until = new Date();
  until.setDate(until.getDate() - 1); // yesterday, so a same-day partial day never shows as a suspicious dip
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));

  console.log('────────────────────────────────────────────────────');
  console.log(`Meta Ads Insights: ${ymd(since)} to ${ymd(until)}`);
  console.log('────────────────────────────────────────────────────');

  const adAccountId = await resolveAdAccountId();
  const rows = await fetchInsights(adAccountId, ymd(since), ymd(until));

  console.log('');
  printTable(rows);

  // Default destination is the Night Tasks folder, so the plain no-argument
  // run puts the file exactly where the nightly review will find it without
  // anyone having to remember the path.
  if (!noFile) {
    const outPath = out || path.join(NIGHT_TASKS_DIR, `meta-insights-${ymd(until)}.csv`);
    writeCsv(rows, outPath, ymd(since), ymd(until));
  }

  console.log('────────────────────────────────────────────────────');
  // No explicit process.exit() here: fetch's underlying socket handles can
  // still be settling right after the last request resolves, and forcing an
  // immediate exit while that's in flight crashes Node natively on Windows
  // (UV_HANDLE_CLOSING assertion). Letting the event loop drain naturally
  // avoids it; the process exits on its own once nothing is left pending.
})().catch((e) => {
  console.error('✗ error:', e.message);
  process.exitCode = 1;
});
