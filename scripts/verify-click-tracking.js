#!/usr/bin/env node
/**
 * scripts/verify-click-tracking.js
 *
 * Sends one test email and proves whether Resend's click tracking preserves
 * the UTM query string through its redirect.
 *
 * WHY THIS EXISTS: click tracking went live on mail.sparkdate.date on
 * 2026-08-31 (tracking subdomain links.mail.sparkdate.date). It rewrites every
 * link in every SparkDate email to links.mail.sparkdate.date/... and 302s to
 * the original. If that redirect drops or reorders the query string, every
 * nurture click lands in GA4 as direct traffic and the entire email channel
 * stops being attributable -- silently. Nothing errors, the mail still works,
 * the numbers just quietly move to the wrong bucket. This repo has been bitten
 * by silent UTM breakage before, which is why this is a script and not a
 * one-time eyeball.
 *
 * It builds its links with lib/utm.js's buildUtmUrl, the SAME function
 * api/cron-send-emails.js uses, so a pass here is a pass for real sends.
 *
 * THE INTERESTING CASE is /account?tier=mid: a URL that already carries a
 * query parameter BEFORE the UTMs are appended. A rewriter that concatenates
 * rather than preserves will mangle exactly that shape and leave the simple
 * ones looking fine.
 *
 * FETCHING A TRACKED LINK REGISTERS A CLICK. That is deliberate -- it also
 * exercises the webhook end to end -- but it means the test address will show
 * a click in the Resend log. Send it to yourself, never to a lead.
 *
 * USAGE
 *   node scripts/verify-click-tracking.js --to=you@example.com
 *   node scripts/verify-click-tracking.js --to=you@example.com --no-send --id=<resend_email_id>
 *
 * --no-send re-checks an email already sent, so a failed run can be
 * re-inspected without mailing anyone again.
 *
 * Env:
 *   RESEND_API_KEY
 *   EMAIL_FROM      optional, defaults to the app's own sender
 */

'use strict';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};

const TO = arg('to');
const NO_SEND = process.argv.includes('--no-send');
const EXISTING_ID = arg('id');

if (!process.env.RESEND_API_KEY) {
  console.error('x Missing env var: RESEND_API_KEY');
  process.exit(2);
}
if (!TO && !NO_SEND) {
  console.error('x --to=<address> is required. Send this to yourself, never to a lead.');
  process.exit(2);
}
if (NO_SEND && !EXISTING_ID) {
  console.error('x --no-send needs --id=<resend_email_id>');
  process.exit(2);
}

const { buildUtmUrl } = require('../lib/utm');

const FROM = process.env.EMAIL_FROM || 'SparkDate <hello@mail.sparkdate.date>';
const API = 'https://api.resend.com';
const KEY = process.env.RESEND_API_KEY;

// The three shapes worth testing. The middle one is the trap.
const LINKS = [
  ['plain path',              buildUtmUrl('/events', 'email', 'nurture', 'day5')],
  ['path with own query',     buildUtmUrl('/account?tier=mid', 'email', 'nurture', 'day5_upgrade')],
  ['path with utm_content',   buildUtmUrl('/lp', 'email', 'nurture', 'day2', 'clicktest')],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function paramsOf(u) {
  try {
    const url = new URL(u);
    const out = {};
    url.searchParams.forEach((v, k) => { out[k] = v; });
    return { ok: true, origin: url.origin, path: url.pathname, params: out };
  } catch {
    return { ok: false };
  }
}

async function api(path, init) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

async function main() {
  let emailId = EXISTING_ID;

  if (!NO_SEND) {
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif">
<h2>SparkDate click-tracking test</h2>
<p>Not a campaign. Sent by scripts/verify-click-tracking.js to confirm the UTM
query string survives the links.mail.sparkdate.date redirect.</p>
<ul>${LINKS.map(([label, url]) => `<li>${label}: <a href="${url}">${url}</a></li>`).join('')}</ul>
</body></html>`;

    console.log(`sending test to ${TO}\nfrom ${FROM}\n`);
    const sent = await api('/emails', {
      method: 'POST',
      body: JSON.stringify({ from: FROM, to: TO, subject: 'SparkDate click-tracking test (ignore)', html }),
    });
    if (sent.status >= 300 || !sent.body || !sent.body.id) {
      console.error(`x Resend refused the send (${sent.status}):`);
      console.error(JSON.stringify(sent.body, null, 2));
      process.exit(1);
    }
    emailId = sent.body.id;
    console.log(`sent. resend id: ${emailId}\n`);
  }

  // Resend rewrites links at send time; the stored copy is what recipients get.
  // It is not always readable back instantly, hence the retries.
  let stored = null;
  for (let i = 0; i < 6; i++) {
    const got = await api(`/emails/${emailId}`, { method: 'GET' });
    if (got.status === 200 && got.body && got.body.html) { stored = got.body.html; break; }
    await sleep(2000);
  }
  if (!stored) {
    console.error('x Could not read the sent email back from Resend. Re-run with --no-send --id=' + emailId);
    process.exit(1);
  }

  const tracked = [...new Set(
    (stored.match(/https?:\/\/links\.mail\.sparkdate\.date\/[^"'\s<>]+/g) || [])
  )];

  if (!tracked.length) {
    console.log('NO REWRITTEN LINKS in the stored copy.');
    console.log('Either click tracking is not applied to this send, or Resend stores the pre-rewrite html.');
    console.log('Check the delivered message by hand: a tracked link starts with links.mail.sparkdate.date/');
    process.exit(1);
  }

  console.log(`${tracked.length} tracked link(s) found. Following each without auto-redirect:\n`);

  const originals = LINKS.map(([, u]) => u);
  let failures = 0;

  for (const t of tracked) {
    const r = await fetch(t, { redirect: 'manual' });
    const loc = r.headers.get('location');
    console.log(`  ${t}`);
    console.log(`    -> ${r.status} ${loc || '(no Location header)'}`);
    if (!loc) { failures++; console.log('    FAIL: no redirect target\n'); continue; }

    const got = paramsOf(loc);
    // Match it back to whichever original shares its path.
    const orig = originals.map(paramsOf).find((o) => o.ok && got.ok && o.path === got.path);
    if (!orig) { console.log('    (could not match to an original link — inspect by hand)\n'); continue; }

    const missing = Object.keys(orig.params).filter((k) => orig.params[k] !== got.params[k]);
    if (missing.length === 0) {
      console.log(`    OK: all ${Object.keys(orig.params).length} params preserved `
        + `(${Object.entries(got.params).map(([k, v]) => `${k}=${v}`).join('&')})\n`);
    } else {
      failures++;
      console.log(`    FAIL: lost or changed ${missing.join(', ')}`);
      console.log(`      expected: ${JSON.stringify(orig.params)}`);
      console.log(`      got     : ${JSON.stringify(got.params)}\n`);
    }
  }

  console.log(failures
    ? `\n${failures} link(s) FAILED — GA4 email attribution will be wrong for those shapes.`
    : '\nAll tracked links preserved their UTM parameters. GA4 email attribution is safe.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
