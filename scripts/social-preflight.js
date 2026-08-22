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
 *   TIKTOK_CLIENT_KEY / _CLIENT_SECRET / _REFRESH_TOKEN
 *                             optional -- TikTok checks are skipped if unset.
 */

'use strict';

const TikTokAuth = require('../lib/tiktok-auth');

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
    // Careful: an empty result here does NOT prove the link is missing.
    // Reading instagram_business_account requires the instagram_basic scope,
    // so a token without it gets back nothing at all rather than an error --
    // which reads identically to "no account linked". Do not conclude the
    // Instagram side is broken from this line alone; check Business Settings
    // (Business -> Instagram accounts) before touching anything there.
    else fail('could not see an Instagram account on this Page',
      scopes.has('instagram_basic')
        ? 'the token HAS instagram_basic, so this likely is a real gap -- the account must be a Business (not Creator or personal) account, linked to the Page in Meta Business Suite'
        : 'the token lacks instagram_basic, so this is EXPECTED and proves nothing either way. Set META_IG_USER_ID to skip the lookup, or re-check once that scope is granted');
  } else if (igId) ok(`META_IG_USER_ID=${igId}`);

  if (igId) {
    const me = await graph(`/${igId}?fields=id,username,media_count`, pageToken || token);
    if (me.json && me.json.id) ok(`IG account readable: @${me.json.username} (${me.json.media_count} posts)`);
    else fail(`IG account not readable: ${JSON.stringify(me.json).slice(0, 140)}`,
      'instagram_basic + instagram_content_publish must be on the token, and the IG account assigned to the system user');
  }

  // --- TikTok ----------------------------------------------------------
  //
  // Optional: a run with no TikTok rows does not need any of this, so an
  // unset TikTok is reported and not counted as a failure.
  //
  // What this check is FOR is the audit. Until TikTok approves the app,
  // DIRECT_POST is capped at SELF_ONLY -- a post that "succeeds" and is
  // visible to nobody. creator_info is the only place that state is legible
  // before publishing; the publish call itself just works and posts privately.
  console.log('\nTikTok');
  if (!process.env.TIKTOK_REFRESH_TOKEN && !process.env.TIKTOK_ACCESS_TOKEN) {
    console.log('  \x1b[90mSKIP\x1b[0m  not configured -- TikTok rows will be skipped, other surfaces unaffected');
  } else {
    try {
      const t = await TikTokAuth.getAccessToken(process.env, { log: (m) => m && console.log('        ' + m) });
      if (!t || !t.accessToken) throw new Error('no access token');
      ok('access token obtained');

      const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${t.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      });
      const j = await res.json().catch(() => ({}));
      const d = j.data || {};
      const err = (j.error && j.error.code) || '';

      if (err && err !== 'ok') {
        bad(`creator_info: ${err} -- ${(j.error && j.error.message) || ''}`,
          'the token needs the video.publish scope, and the TikTok account must be linked to this app');
        failures++;
      } else {
        ok(`posting as @${d.creator_username || '?'}`);
        const levels = d.privacy_level_options || [];
        console.log(`        privacy levels allowed: ${levels.join(', ') || '(none reported)'}`);

        const want = process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY';
        const mode = process.env.TIKTOK_POST_MODE || 'UPLOAD_TO_DRAFT';
        if (mode === 'DIRECT_POST' && levels.length && !levels.includes(want)) {
          bad(`TIKTOK_PRIVACY_LEVEL=${want} is not allowed for this account`,
            `pick one of: ${levels.join(', ')}`);
          failures++;
        }
        if (mode === 'DIRECT_POST' && !levels.includes('PUBLIC_TO_EVERYONE')) {
          // The audit state, stated plainly. This is the difference between
          // "TikTok is running" and "TikTok is posting to an empty room".
          warn('PUBLIC_TO_EVERYONE is NOT available -- the app is still unaudited,');
          console.log('        so DIRECT_POST will publish privately and nobody will see it.');
          console.log('        Keep TIKTOK_POST_MODE=UPLOAD_TO_DRAFT until the audit clears.');
        }
        if (d.max_video_post_duration_sec) {
          console.log(`        (video limit ${d.max_video_post_duration_sec}s -- unused; we post photos)`);
        }
      }
    } catch (e) {
      bad(`TikTok auth failed: ${e.message}`,
        'set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REFRESH_TOKEN');
      failures++;
    }
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
