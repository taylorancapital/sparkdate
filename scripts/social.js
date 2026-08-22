#!/usr/bin/env node
/**
 * scripts/social.js -- the social publishing CLI.
 *
 *   node scripts/social.js plan                     what would publish, and when
 *   node scripts/social.js plan --through=2026-09-08
 *   node scripts/social.js approve --through=2026-09-08
 *   node scripts/social.js unapprove --row=MC-06
 *   node scripts/social.js run                      DRY RUN (default)
 *   node scripts/social.js run --execute            actually publish
 *
 * The safety model, in one line: **only rows in state=approved ever publish.**
 * `plan` shows you a batch, `approve` marks it, `run` acts on nothing else.
 * That is what replaces clicking Publish 35 times without replacing your
 * judgement about what goes out.
 *
 * Dry run is the default for `run` deliberately -- same convention as
 * scripts/merge-duplicate-member.js. You have to mean it.
 *
 * Env (see scripts/social-preflight.js, run that first):
 *   META_SOCIAL_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID
 *   TIKTOK_CLIENT_KEY / _CLIENT_SECRET / _REFRESH_TOKEN
 *                                        optional; TikTok is skipped without them.
 *                                        Access tokens last ~24h, so they are
 *                                        minted per run from the refresh token.
 *   TIKTOK_POST_MODE                     UPLOAD_TO_DRAFT (default) | DIRECT_POST
 *   TIKTOK_PRIVACY_LEVEL                 DIRECT_POST only; SELF_ONLY until audited
 *   SOCIAL_ASSET_BASE_URL                default https://sparkdate.date/social
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');
const P = require('../lib/social-publish');
const R = require('../lib/social-requests');
const TikTokAuth = require('../lib/tiktok-auth');

const QUEUE = path.join(__dirname, '..', 'content', 'queue.csv');
const BASE_URL = process.env.SOCIAL_ASSET_BASE_URL || 'https://sparkdate.date/social';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name) => process.argv.includes(`--${name}`);

const loadQueue = () => Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));
const saveQueue = (rows, columns) => fs.writeFileSync(QUEUE, Q.toCsv(rows, columns), 'utf8');

const fmtWhen = (ms) => (ms ? new Date(ms).toLocaleString('en-US', { timeZone: P.DEFAULT_TZ, dateStyle: 'medium', timeStyle: 'short' }) : '--');

// ------------------------------------------------------------------ plan

function cmdPlan() {
  const { rows } = loadQueue();
  const now = Date.now();
  const through = arg('through');
  const plans = P.planAll(rows, now).filter((p) => !through || p.row.date <= through);

  const act = plans.filter((p) => p.action !== 'skip');
  const skip = plans.filter((p) => p.action === 'skip');

  console.log(`\nWould act on ${act.length} (row, surface) pair(s):\n`);
  for (const p of act) {
    console.log(`  ${p.action.toUpperCase().padEnd(9)} ${p.row_id.padEnd(11)} ${p.surface.padEnd(9)} ${fmtWhen(p.at)}${p.reason ? '  (' + p.reason + ')' : ''}`);
  }

  // Group skips by reason -- 60 individual "not approved" lines is noise.
  const byReason = new Map();
  for (const p of skip) {
    const key = p.reason.replace(/\(.*?\)/, '(…)');
    if (!byReason.has(key)) byReason.set(key, []);
    byReason.get(key).push(p.row_id + '/' + p.surface);
  }
  console.log(`\nSkipping ${skip.length}:`);
  for (const [reason, ids] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ids.length).padStart(3)}  ${reason}`);
    if (ids.length <= 6) console.log(`       ${ids.join(', ')}`);
  }

  const pending = rows.filter((r) => r.state === 'pending').length;
  if (pending) {
    console.log(`\n${pending} row(s) still pending approval. Nothing publishes until you run:`);
    console.log(`   node scripts/social.js approve --through=YYYY-MM-DD`);
  }
  console.log();
}

// --------------------------------------------------------------- approve

function cmdApprove(approving) {
  const { rows, columns } = loadQueue();
  const through = arg('through');
  const one = arg('row');
  if (!through && !one) {
    console.error('Specify --through=YYYY-MM-DD or --row=ID.');
    console.error('Refusing to approve the entire queue on a bare command.');
    process.exit(2);
  }

  const from = approving ? 'pending' : 'approved';
  const to = approving ? 'approved' : 'pending';
  const touched = [];

  // Approving a row whose art does not exist yet schedules a hole in the
  // calendar: Facebook holds a post that can never be filled, and the row
  // looks done in every report. Approve when the content is READY, not when
  // the copy is written.
  const force = flag('force');
  const blocked = [];

  for (const row of rows) {
    if (one && row.row_id !== one) continue;
    if (!one && through && row.date > through) continue;
    if (row.state !== from) continue;
    if (approving && !force && !String(row.asset_files || '').trim()) {
      blocked.push(row.row_id);
      continue;
    }
    row.state = to;
    touched.push(row.row_id);
  }

  if (blocked.length) {
    console.log(`Skipped ${blocked.length} row(s) with no artwork yet: ${blocked.join(', ')}`);
    console.log('Approve them once the art lands, or pass --force if you mean it.');
    console.log('');
  }

  if (!touched.length) { console.log(`Nothing in state=${from} matched.`); return; }
  saveQueue(rows, columns);
  console.log(`${approving ? 'Approved' : 'Un-approved'} ${touched.length} row(s): ${touched.join(', ')}`);
  if (approving) console.log('\nThese will publish at their scheduled times. `run --execute` acts on nothing else.');
}

// ------------------------------------------------------------------- run

async function send(step, collected, token, dry) {
  const headers = {};
  let body;

  if (step.json) {
    const payload = JSON.parse(JSON.stringify(step.json));
    headers['Content-Type'] = 'application/json';
    headers.Authorization = `Bearer ${token}`;
    body = JSON.stringify(payload);
  } else {
    const form = new URLSearchParams({ ...step.form });
    if (step.attachCollectedAs === 'attached_media') {
      collected.forEach((id, i) => form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
    } else if (step.attachCollectedAs === 'children') {
      form.set('children', collected.join(','));
    } else if (step.attachCollectedAs === 'creation_id') {
      form.set('creation_id', collected[collected.length - 1]);
    }
    form.set('access_token', token);
    body = form;
  }

  if (dry) {
    const shown = step.json
      ? JSON.stringify(step.json).slice(0, 220)
      : [...new URLSearchParams(body)].filter(([k]) => k !== 'access_token')
        .map(([k, v]) => `${k}=${String(v).slice(0, 70)}`).join(' ');
    console.log(`      ${step.name.padEnd(12)} ${step.method} ${step.url.replace(R.GRAPH, 'graph')}`);
    console.log(`      ${''.padEnd(12)} ${shown}`);
    return { id: `dry_${step.name}` };
  }

  const res = await fetch(step.url, { method: step.method, headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error || (json.data && json.data.error_code)) {
    const msg = (json.error && json.error.message) || (json.data && json.data.error_message) || JSON.stringify(json).slice(0, 200);
    throw new Error(`${step.name}: ${msg}`);
  }
  return json;
}

// Instagram containers are processed asynchronously; publishing one that is
// still IN_PROGRESS fails. Poll until FINISHED rather than sleeping a fixed
// guess and hoping.
async function waitForContainer(id, token, dry) {
  if (dry) return;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${R.GRAPH}/${id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const j = await res.json().catch(() => ({}));
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') {
      throw new Error(`container ${id} -> ${j.status_code}: ${j.status || ''}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`container ${id} never reached FINISHED`);
}

async function cmdRun() {
  const dry = !flag('execute');
  const { rows, columns } = loadQueue();
  const now = Date.now();

  const ctx = {
    pageId: process.env.META_PAGE_ID,
    igUserId: process.env.META_IG_USER_ID,
    baseUrl: BASE_URL,
    // Drafts until TikTok's audit clears, then flip TIKTOK_POST_MODE to
    // DIRECT_POST. Defaulting the other way would mean every run before
    // approval fails on a permission the app does not have yet.
    mode: process.env.TIKTOK_POST_MODE === 'DIRECT_POST' ? 'DIRECT_POST' : 'UPLOAD_TO_DRAFT',
    privacyLevel: process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
  };
  const systemToken = process.env.META_SOCIAL_ACCESS_TOKEN;
  let metaToken = systemToken;

  const plans = P.planAll(rows, now).filter((p) => p.action !== 'skip');
  if (!plans.length) { console.log('Nothing due.'); return; }

  console.log(`\n${dry ? 'DRY RUN -- nothing will be sent' : 'EXECUTING'}: ${plans.length} item(s)\n`);

  // In a dry run the ids are only cosmetic, but printing graph/undefined/photos
  // looks like a bug and hides a real one. Say it plainly instead.
  if (dry) {
    const missing = [];
    if (!ctx.pageId) missing.push('META_PAGE_ID');
    if (!ctx.igUserId) missing.push('META_IG_USER_ID');
    if (!metaToken) missing.push('META_SOCIAL_ACCESS_TOKEN');
    if (missing.length) {
      console.log(`  note: ${missing.join(', ')} unset -- URLs below show "undefined" in their place.`);
      console.log('        Run `node scripts/social-preflight.js` to resolve and verify them.\n');
    }
  }

  // Facebook refuses an unpublished (i.e. scheduled) post made with a system
  // user token:
  //
  //   (#200) Unpublished posts must be posted to a page as the page itself.
  //
  // Scheduling is the entire point of the Facebook path, so this is not
  // optional. The system user token's job is to MINT a Page access token; the
  // Page token is what actually posts. Instagram publishing runs through the
  // Page's linked IG account and accepts the same token, so both Meta
  // surfaces use it.
  //
  // Minted once per run rather than per item -- it is the same call every
  // time -- and never cached across runs, since a page token's lifetime is
  // not ours to assume.
  if (!dry && systemToken && ctx.pageId && plans.some((p) => p.surface !== 'tiktok')) {
    try {
      const res = await fetch(
        `${R.GRAPH}/${ctx.pageId}?fields=access_token&access_token=${encodeURIComponent(systemToken)}`
      );
      const j = await res.json().catch(() => ({}));
      if (j.access_token) {
        metaToken = j.access_token;
        console.log('  using a Page access token (minted from the system user token)\n');
      } else {
        const msg = (j.error && j.error.message) || JSON.stringify(j).slice(0, 160);
        console.log(`  !! could not mint a Page access token: ${msg}`);
        console.log('     Scheduled Facebook posts will fail. Run scripts/social-preflight.js.\n');
      }
    } catch (e) {
      console.log(`  !! Page token request failed: ${e.message}\n`);
    }
  }

  // TikTok access tokens last about 24 hours, so unlike the Meta tokens this
  // one cannot be read from the environment and trusted. It is derived from
  // the refresh token, once per run, and only when something actually needs
  // it -- an unattended run must not fail on TikTok credentials when the
  // batch is entirely Facebook.
  let tiktokToken = null;
  if (!dry && plans.some((p) => p.surface === 'tiktok')) {
    try {
      const t = await TikTokAuth.getAccessToken(process.env, { log: (m) => console.log(m) });
      tiktokToken = t && t.accessToken;
      if (!tiktokToken) console.log('  !! TikTok credentials unset -- TikTok items will be skipped.\n');
    } catch (e) {
      // Not fatal to the whole batch. Facebook and Instagram are unaffected
      // by TikTok auth, and losing 15 scheduled Meta posts because a TikTok
      // refresh token went stale would be a much worse failure than the one
      // it is reporting.
      console.log(`  !! TikTok auth failed: ${e.message}`);
      console.log('     TikTok items will be skipped; other surfaces continue.\n');
    }
  }

  let done = 0, failed = 0, skipped = 0;

  for (const p of plans) {
    const { row, surface } = p;
    const token = surface === 'tiktok' ? tiktokToken : metaToken;

    if (!dry && !token) {
      console.log(`  SKIP  ${row.row_id} ${surface} -- no token configured`);
      skipped++; continue;
    }
    if (!dry && surface !== 'tiktok' && !ctx.pageId) {
      console.log(`  SKIP  ${row.row_id} ${surface} -- META_PAGE_ID unset`);
      skipped++; continue;
    }

    console.log(`  ${p.action.toUpperCase()} ${row.row_id} ${surface} @ ${fmtWhen(p.at)}`);

    try {
      const built = R.buildFor(surface, row, {
        ...ctx,
        scheduledAt: p.action === 'schedule' ? p.at : null,
      });

      const collected = [];
      let finalId = null;

      for (const step of built.steps) {
        const out = await send(step, collected, token || 'DRY', dry);
        const id = out.id || out.post_id || out.publish_id || (out.data && out.data.publish_id);
        if (step.poll && id) await waitForContainer(id, token, dry);
        if (step.replacesCollected) collected.length = 0;
        if (step.collectId && id) collected.push(id);
        if (step.returns) finalId = id;
      }

      if (!dry) {
        P.recordPublished(row, surface, finalId || 'unknown');
        saveQueue(rows, columns); // persist per item: a crash mid-batch must
                                  // not lose the record of what already went out
      }
      console.log(`      -> ${dry ? '(dry run)' : finalId}`);
      done++;
    } catch (e) {
      console.log(`      !! FAILED: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${done} ok, ${failed} failed, ${skipped} skipped${dry ? '  (dry run -- queue.csv untouched)' : ''}`);
  if (dry) console.log('Re-run with --execute to publish.');
  // process.exit() while a fetch is still settling aborts libuv mid-teardown
  // -- on Windows that surfaces as
  //   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c
  // which looks like a crash in the publisher rather than the failed post it
  // actually is. Setting exitCode lets the loop drain and exits cleanly.
  if (failed) process.exitCode = 1;
}

// ------------------------------------------------------------------ main

const cmd = process.argv[2];
(async () => {
  if (cmd === 'plan') cmdPlan();
  else if (cmd === 'approve') cmdApprove(true);
  else if (cmd === 'unapprove') cmdApprove(false);
  else if (cmd === 'run') await cmdRun();
  else {
    console.log('usage: social.js <plan|approve|unapprove|run> [--through=YYYY-MM-DD] [--row=ID] [--execute]');
    process.exit(2);
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
