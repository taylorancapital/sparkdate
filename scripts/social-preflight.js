#!/usr/bin/env node
/**
 * scripts/social-preflight.js
 *
 * Answers "is this account actually set up to publish?" before anything tries
 * to. Meta's errors on the publishing path are famously unhelpful -- a missing
 * asset assignment and a missing permission both surface as the same generic
 * "(#10) This endpoint requires the 'pages_read_engagement' permission",
 * pointing at a permission the token may already hold. This separates those
 * cases and names the fix.
 *
 * Read-only. Creates nothing, publishes nothing.
 *
 * Run this FIRST and get it green before trusting the publishers.
 *
 * Env:
 *   META_SOCIAL_ACCESS_TOKEN  system-user token for publishing. Falls back to
 *                             META_ADS_ACCESS_TOKEN so this can report on the
 *                             existing setup before a new token is minted.
 *   META_PAGE_ID              optional -- discovered via the business if unset.
 *   META_BUSINESS_ID          optional -- defaults to the known SparkDate id.
 *   META_IG_USER_ID           optional -- discovered from the Page if unset.
 */

'use strict';

const GRAPH = 'https://graph.facebook.com/v21.0';
const BUSINESS_ID = process.env.META_BUSINESS_ID || '2490071258114152';

// Scopes the publishing path needs, and what each one is for.
const REQUIRED_SCOPES = {
  pages_manage_posts: 'create and schedule posts on the Facebook Page',
  pages_read_engagement: 'read the Page and mint a Page access token',
  pages_show_list: 'find the Page at all',
  instagram_basic: 'see the linked Instagram Business account',
  instagram_content_publish: 'create and publish Instagram media',
  business_management: 'resolve Business-owned assets',
};

const ok = (m) => console.log('  \x1b[32mPASS\x1b[0m  ' + m);
const bad = (m, fix) => { console.log('  \x1b[31mFAIL\x1b[0m  ' + m); if (fix) console.log('        → ' + fix); };
const warn = (m) => console.log('  \x1b[33mWARN\x1b[0m  ' + m);

async function graph(path, token) {
  const url = GRAPH + path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = process.env.META_SOCIAL_ACCESS_TOKEN || process.env.META_ADS_ACCESS_TOKEN;
  let failures = 0;
  const fail = (...a) => { failures++; bad(...a); };

  console.log('\nMeta publishing preflight\n');

  if (!token) {
    fail('No token in META_SOCIAL_ACCESS_TOKEN or META_ADS_ACCESS_TOKEN',
      'Business Settings -> Users -> System Users -> Generate New Token');
    process.exit(1);
  }
  if (process.env.META_SOCIAL_ACCESS_TOKEN) ok('using META_SOCIAL_ACCESS_TOKEN');
  else warn('META_SOCIAL_ACCESS_TOKEN unset -- falling back to META_ADS_ACCESS_TOKEN (the ads token is not expected to carry publishing scopes)');

  // --- token identity and scopes -------------------------------------
  console.log('\ntoken');
  const dbg = await graph('/debug_token?input_token=' + encodeURIComponent(token), token);
  const info = dbg.json && dbg.json.data;
  if (!info) {
    fail('could not introspect the token: ' + JSON.stringify(dbg.json).slice(0, 160));
    process.exit(1);
  }
  if (!info.is_valid) fail('token is not valid', 'regenerate it in Business Settings');
  else ok(`valid ${info.type} token, app ${info.app_id}, expires ${info.expires_at ? new Date(info.expires_at * 1000).toISOString().slice(0, 10) : 'never'}`);

  const scopes = new Set(info.scopes || []);
  console.log('\nscopes');
  for (const [scope, why] of Object.entries(REQUIRED_SCOPES)) {
    if (scopes.has(scope)) ok(`${scope}`);
    else fail(`${scope} missing -- needed to ${why}`,
      'Business Settings -> System Users -> Generate New Token, tick this scope');
  }

  // --- the Page -------------------------------------------------------
  console.log('\nfacebook page');
  let pageId = process.env.META_PAGE_ID;
  if (!pageId) {
    // /me/accounts is unreliable for system-user tokens (the same note is in
    // fetch-meta-insights.js), so resolve through the Business instead.
    const owned = await graph(`/${BUSINESS_ID}/owned_pages?fields=id,name&limit=25`, token);
    const pages = (owned.json && owned.json.data) || [];
    if (pages.length === 1) { pageId = pages[0].id; ok(`discovered Page ${pages[0].name} (${pageId})`); }
    else if (pages.length > 1) { warn(`${pages.length} Pages owned by this Business -- set META_PAGE_ID to pick one: ` + pages.map((p) => `${p.name}=${p.id}`).join(', ')); pageId = pages[0].id; }
    else fail('no Pages resolvable from the Business', 'check META_BUSINESS_ID, or set META_PAGE_ID directly');
  } else ok(`META_PAGE_ID=${pageId}`);

  let pageToken = null;
  if (pageId) {
    // The decisive check. Seeing a Page in owned_pages only proves the
    // Business owns it. Minting a Page token proves the SYSTEM USER is
    // assigned to it with a task -- which is a separate step people miss,
    // and the one that produces the misleading (#10) error.
    const t = await graph(`/${pageId}?fields=access_token,name`, token);
    if (t.json && t.json.access_token) {
      pageToken = t.json.access_token;
      ok(`Page access token minted for "${t.json.name}" -- system user is assigned to the Page`);
    } else {
      const e = (t.json && t.json.error) || {};
      fail(`cannot mint a Page access token: ${(e.message || '').slice(0, 120)}`,
        'Business Settings -> Users -> System Users -> [your system user] -> Add Assets -> Pages -> select the Page -> enable "Manage Page" / Content. Owning the Page in the Business is NOT the same as assigning the system user to it.');
    }
  }

  // --- Instagram -------------------------------------------------------
  console.log('\ninstagram');
  let igId = process.env.META_IG_USER_ID;
  if (!igId && pageId) {
    const probe = await graph(`/${pageId}?fields=instagram_business_account{id,username}`, pageToken || token);
    const ig = probe.json && probe.json.instagram_business_account;
    if (ig) { igId = ig.id; ok(`linked IG Business account @${ig.username || '?'} (${igId})`); }
    else if (probe.json && probe.json.error) fail(`could not read the Page's IG link: ${(probe.json.error.message || '').slice(0, 110)}`, 'usually resolves once the Page assignment and instagram_basic scope are in place');
    else fail('no Instagram Business account linked to this Page',
      'Instagram must be a Business (not Creator or personal) account and linked to the Page in Meta Business Suite');
  } else if (igId) ok(`META_IG_USER_ID=${igId}`);

  if (igId) {
    const me = await graph(`/${igId}?fields=id,username,media_count`, pageToken || token);
    if (me.json && me.json.id) ok(`IG account readable: @${me.json.username} (${me.json.media_count} posts)`);
    else fail(`IG account not readable: ${JSON.stringify(me.json).slice(0, 140)}`,
      'instagram_basic + instagram_content_publish must be on the token, and the IG account assigned to the system user');
  }

  // --- summary ---------------------------------------------------------
  console.log('\n' + '-'.repeat(60));
  if (failures === 0) {
    console.log('All checks passed. Publishing should work.');
    console.log('\nRecord these so the runner does not rediscover them:');
    console.log(`  META_PAGE_ID=${pageId}`);
    if (igId) console.log(`  META_IG_USER_ID=${igId}`);
  } else {
    console.log(`${failures} check(s) failed. Fix these before running the publishers --`);
    console.log('the publishing endpoints report the same generic error for several');
    console.log('different causes, so debugging there is far slower than here.');
  }
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('preflight crashed:', e.message); process.exit(2); });
