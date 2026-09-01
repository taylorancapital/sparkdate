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
 *   node scripts/verify-click-tracking.js --no-send --id=<resend_email_id>
 *   node scripts/verify-click-tracking.js --link='https://links.mail.sparkdate.date/...'
 *
 * --no-send re-checks an email already sent, so a failed run can be
 * re-inspected without mailing anyone again.
 *
 * --link is the fallback when Resend will not hand back the rendered html --
 * because the API key is send-only (403) or the endpoint omits it. Copy any
 * link out of the delivered email and pass it here. Needs NO API key and
 * sends nothing; it just follows the redirect and reports what survived.
 *
 * Env:
 *   RESEND_API_KEY  not needed for --link
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

// --link only follows a URL, so it needs neither a key nor a recipient.
const LINK_ONLY = process.argv.some((a) => a.startsWith('--link='));

// Argument validation runs only when this is the program, not when a test
// imports it. At module scope these process.exit(2) calls killed the importing
// process before a single assertion ran, which is why the redirect logic had no
// tests despite being the part most likely to be wrong.
function checkArgs() {
  if (!LINK_ONLY && !process.env.RESEND_API_KEY) {
    console.error('x Missing env var: RESEND_API_KEY');
    console.error('  (or pass --link=<tracked url> to check a link from a delivered email instead)');
    process.exit(2);
  }
  if (!LINK_ONLY && !TO && !NO_SEND) {
    console.error('x --to=<address> is required. Send this to yourself, never to a lead.');
    process.exit(2);
  }
  if (NO_SEND && !EXISTING_ID) {
    console.error('x --no-send needs --id=<resend_email_id>');
    process.exit(2);
  }
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

// `base` matters: a Location header is allowed to be relative ("/lp?utm=..."),
// and new URL() throws on those. Parsing it against the URL we requested turns
// a relative redirect into something comparable instead of something that
// looks, wrongly, like a destination with no parameters at all.
function paramsOf(u, base) {
  try {
    const url = base ? new URL(u, base) : new URL(u);
    const out = {};
    url.searchParams.forEach((v, k) => { out[k] = v; });
    // hostname, not origin: origin carries the scheme AND any explicit port, so
    // an endsWith() host comparison against it silently fails on anything not
    // served from the default port. It happens to work for the real tracker on
    // 443 and fails for every test server, which is a bad way round.
    return { ok: true, origin: url.origin, hostname: url.hostname, path: url.pathname, params: out };
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

// The host Resend rewrites links to. A link that is not on it was never
// click-tracked, and cannot answer the question this script asks.
const TRACKING_HOST = 'links.mail.sparkdate.date';

// Some trackers serve a bot-check interstitial to a default fetch agent and the
// real 302 to a browser. Asking as a browser removes that as an explanation for
// a chain that does not reach the destination.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const MAX_HOPS = 10;

/**
 * Walk a redirect chain to its end, printing each hop, and return the final URL.
 *
 * Handles the two ways a click tracker moves you on:
 *   - a 3xx with a Location header, and
 *   - a 200 whose BODY carries the redirect, as <meta http-equiv="refresh">
 *     or a `location.href = "..."` assignment. Trackers use the HTML form to
 *     run a script before forwarding, and a header-only reader sees that as
 *     "no redirect target" -- indistinguishable, wrongly, from a dead link.
 *
 * A relative Location is resolved against the URL it came from; `new URL()`
 * throws on those otherwise, which would look like a mangled destination
 * rather than a perfectly ordinary relative redirect.
 */
async function followChain(start, { trackerHost = TRACKING_HOST, log = console.log } = {}) {
  let cur = start;
  for (let hop = 1; hop <= MAX_HOPS; hop++) {
    let r;
    try {
      r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': UA } });
    } catch (e) {
      return { url: cur, error: `network error on hop ${hop}: ${e.message}` };
    }
    let next = r.headers.get('location');
    let via = 'Location';
    const onTracker = (() => {
      const p = paramsOf(cur);
      return p.ok && p.hostname.endsWith(trackerHost);
    })();

    // Body-sniffing is confined to the TRACKER's own pages, and this is not
    // caution for its own sake -- an earlier version of this loop scanned every
    // page and matched `location.href = "intent://..."` inside sparkdate.date's
    // webview-escape script, which is conditional code that had not run. It
    // then "followed" that phantom hop to intent://, failed to fetch it, and
    // would have reported a live attribution failure. A regex cannot tell
    // conditional JS from an interstitial; the host it is served from can.
    if (!next && r.status === 200 && onTracker) {
      const body = await r.text().catch(() => '');
      const meta = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i);
      const js = body.match(/(?:location\.(?:href|replace)\s*(?:=|\()\s*)["']([^"']+)["']/i);
      if (meta) { next = meta[1]; via = 'meta refresh'; }
      else if (js) { next = js[1]; via = 'js redirect'; }
    }

    // Landed on a real destination. That is the answer -- following our own
    // site's internal navigation further would tell us nothing about the
    // tracker and risks wandering off into app-scheme URLs.
    if (!next && !onTracker && hop > 1) {
      log(`    hop${hop}: ${r.status} (destination reached)`);
      return { url: cur };
    }

    if (!next) {
      log(`    hop${hop}: ${r.status} (final)`);
      return { url: cur };
    }
    const resolved = new URL(next, cur).toString();
    log(`    hop${hop}: ${r.status} via ${via} -> ${resolved}`);
    cur = resolved;
  }
  return { url: cur, error: `still redirecting after ${MAX_HOPS} hops` };
}

// Follow one tracked link and report what survived. Shared by --link and the
// full run, so both answer the question the same way.
//
// Returns 'pass' | 'fail' | 'untracked'. 'untracked' is deliberately NOT a
// failure: it means the input was the wrong kind of URL, and reporting that as
// "UTMs did not survive" is a false alarm about live attribution -- which is
// exactly what this printed the first time somebody pasted a destination URL
// instead of a rewritten one.
async function checkLink(t, originals) {
  console.log(`  ${t}`);

  const self = paramsOf(t);
  // Not a URL at all. Worth its own branch because the commonest way to get
  // here is pasting the placeholder out of the instructions rather than a real
  // link, and the bare fetch error for that ("Failed to parse URL from
  // <paste the tracked link...>") reads like a bug in the script.
  if (!self.ok) {
    console.log('    NOT A URL — nothing was checked.');
    console.log('    Paste the actual link from the delivered email, quoted, e.g.');
    console.log(`      --link='https://${TRACKING_HOST}/CL0/https%3A%2F%2Fsparkdate.date%2F...'\n`);
    return 'untracked';
  }
  if (!self.hostname.endsWith(TRACKING_HOST)) {
    console.log(`    NOT A TRACKED LINK — host is ${self.origin.replace(/^https?:\/\//, '')}, expected ${TRACKING_HOST}`);
    console.log('    This is the destination, not the rewritten link. Two ways that happens:');
    console.log('      1. it was copied from the email SOURCE (or from a chat/PR) rather than');
    console.log('         from the delivered message — copy the href out of the received mail;');
    console.log('      2. click tracking did not rewrite this send at all, which IS a finding.');
    console.log('    Check the delivered email: a rewritten link starts with');
    console.log(`    https://${TRACKING_HOST}/\n`);
    return 'untracked';
  }

  // Follow the WHOLE chain, not the first hop.
  //
  // This read one Location header and judged the answer on it. That is only
  // correct if the tracker redirects straight to the destination, and a click
  // tracker is entitled to take more than one hop -- a consent or bot-check
  // interstitial, a region redirect, or simply tracker -> tracker -> target.
  // On any of those the first Location is another tracking URL carrying no
  // UTMs, and the old code reported "UTM parameters did NOT survive" about a
  // link whose destination it never actually looked at. Same false-alarm shape
  // as #368: the script's own narrow view reported as a live attribution
  // failure.
  //
  // Every hop is printed, because when this does fail the chain IS the
  // diagnosis -- it says which host dropped them.
  const final = await followChain(t);
  if (final.error) { console.log(`    FAIL: ${final.error}\n`); return 'fail'; }
  if (final.url === t) { console.log('    FAIL: no redirect target\n'); return 'fail'; }

  // Ended still on the tracker. That is not "the UTMs were dropped" -- it is
  // "we never reached a destination to check", and calling it an attribution
  // failure would be the #368 mistake again. Usually a bot check that a real
  // click would clear.
  const end = paramsOf(final.url);
  if (end.ok && end.hostname.endsWith(TRACKING_HOST)) {
    console.log(`    INCONCLUSIVE — the chain never left ${TRACKING_HOST}, so no`);
    console.log('    destination was reached and nothing was proved either way.');
    console.log('    Usually an interstitial or bot check that a real click clears.');
    console.log('    Click the link in the delivered mail and paste the address bar into --link=\n');
    return 'untracked';
  }

  const got = end;
  const orig = originals.map((o) => paramsOf(o)).find((o) => o.ok && got.ok && o.path === got.path);
  if (!orig) {
    // Unknown shape (a real campaign link, say). Fall back to asserting the
    // three params GA4 actually needs are present and non-empty.
    const need = ['utm_source', 'utm_medium', 'utm_campaign'];
    const absent = need.filter((k) => !got.ok || !got.params[k]);
    if (absent.length) { console.log(`    FAIL: missing ${absent.join(', ')}\n`); return 'fail'; }
    console.log(`    OK: ${need.map((k) => `${k}=${got.params[k]}`).join('&')}`);
    console.log('    (not one of this script\'s own links, so checked for the GA4 params only)\n');
    return 'pass';
  }

  const missing = Object.keys(orig.params).filter((k) => orig.params[k] !== got.params[k]);
  if (missing.length === 0) {
    console.log(`    OK: all ${Object.keys(orig.params).length} params preserved `
      + `(${Object.entries(got.params).map(([k, v]) => `${k}=${v}`).join('&')})\n`);
    return 'pass';
  }
  console.log(`    FAIL: lost or changed ${missing.join(', ')}`);
  console.log(`      expected: ${JSON.stringify(orig.params)}`);
  console.log(`      got     : ${JSON.stringify(got.params)}\n`);
  return 'fail';
}

async function main() {
  // --link: verify a single tracked link copied out of a delivered email.
  // Needs no API key scope beyond nothing at all, and is the fallback when
  // Resend will not return the rendered html.
  const ONE_LINK = arg('link');
  if (ONE_LINK) {
    console.log('following one tracked link (no email sent):\n');
    const verdict = await checkLink(ONE_LINK, LINKS.map(([, u]) => u));
    console.log(
      verdict === 'pass' ? 'UTM parameters survived the redirect. GA4 email attribution is safe.'
      : verdict === 'untracked' ? 'INCONCLUSIVE — that was not a tracked link, so nothing was tested. See above.'
      : 'UTM parameters did NOT survive. GA4 will log these clicks as direct traffic.');
    // exitCode, not exit(): an abrupt exit while undici still holds the socket
    // trips a libuv assertion on Windows and prints a scary line after a
    // perfectly good result.
    // 'untracked' exits 2 — not a pass, but not evidence of broken
    // attribution either. Distinct so a CI or a wrapper can tell them apart.
    process.exitCode = verdict === 'pass' ? 0 : verdict === 'untracked' ? 2 : 1;
    return;
  }

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
  //
  // The failure here USED TO BE opaque -- "could not read it back" and nothing
  // else -- which is useless, because the three causes need three different
  // responses and one of them is not an error at all:
  //   403  the API key is send-only. Resend keys are scoped "Full access" or
  //        "Sending access", and a rotated key very often comes back as the
  //        latter. Sending works, reading does not.
  //   404  not retrievable yet, or retention has dropped it.
  //   200 without an `html` field -- the send is fine and this check simply
  //        cannot be automated; fall back to a link from the inbox.
  // So report what actually came back.
  let stored = null;
  let last = null;
  for (let i = 0; i < 6; i++) {
    const got = await api(`/emails/${emailId}`, { method: 'GET' });
    last = got;
    if (got.status === 200 && got.body && got.body.html) { stored = got.body.html; break; }
    // A 403 will not fix itself by waiting.
    if (got.status === 403) break;
    await sleep(2000);
  }
  if (!stored) {
    console.error(`x Could not read the sent email back. Last response: HTTP ${last && last.status}`);
    const body = last && last.body;
    if (body && typeof body === 'object') {
      console.error(`  body: ${JSON.stringify(body).slice(0, 400)}`);
      if (last.status === 200 && !body.html) {
        console.error('\n  The send SUCCEEDED and the key is valid — Resend just does not return the');
        console.error('  rendered html here, so the rewritten links cannot be read back automatically.');
        console.error('  Open the delivered email, copy one link (it starts with');
        console.error('  https://links.mail.sparkdate.date/) and check where it redirects.');
      }
    } else if (last && last.status === 403) {
      console.error('\n  403 means this API key can send but not read. That is Resend\'s');
      console.error('  "Sending access" scope. Either issue a Full-access key for this check,');
      console.error('  or verify by hand from a link in the delivered email.');
    }
    console.error(`\n  Re-run the read alone with:  --no-send --id=${emailId}`);
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
    if ((await checkLink(t, originals)) === 'fail') failures++;
  }

  console.log(failures
    ? `\n${failures} link(s) FAILED — GA4 email attribution will be wrong for those shapes.`
    : '\nAll tracked links preserved their UTM parameters. GA4 email attribution is safe.');
  process.exitCode = failures ? 1 : 0;
}

if (require.main === module) {
  checkArgs();
  main().catch((e) => { console.error(`x ${e.message}`); process.exit(1); });
}

module.exports = { followChain, paramsOf, TRACKING_HOST, MAX_HOPS };
