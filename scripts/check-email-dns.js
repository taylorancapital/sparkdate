#!/usr/bin/env node
/**
 * scripts/check-email-dns.js
 *
 * Answers "can sparkdate.date actually send and receive mail?" without
 * needing an inbox, an API key, or the Cloudflare dashboard.
 *
 * Written because the failure it checks for is completely silent from the
 * inside: the app reported every send as successful while the domain had no
 * MX record at all, so every reply and every inbound message bounced at the
 * sender's end. Nothing in the logs, the dashboard, or the app showed it.
 *
 * Uses node:dns/promises — no dependency. Queries a public resolver directly
 * so a stale local cache cannot report an old answer.
 *
 * Usage:
 *   node scripts/check-email-dns.js
 *   node scripts/check-email-dns.js --json
 *
 * Exits non-zero while anything REQUIRED is missing, so it works as a gate.
 * See docs/EMAIL_RUNBOOK.md for how to fix each finding.
 */

'use strict';

const { Resolver } = require('node:dns/promises');

const ROOT = process.env.EMAIL_DOMAIN || 'sparkdate.date';
const SEND = process.env.EMAIL_SEND_DOMAIN || `mail.${ROOT}`;

const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;

async function mx(name) {
  try { return await resolver.resolveMx(name); } catch { return []; }
}
async function txt(name) {
  try { return (await resolver.resolveTxt(name)).map((c) => c.join('')); } catch { return []; }
}

async function main() {
  const asJson = process.argv.includes('--json');
  const findings = [];
  const add = (severity, check, domain, ok, detail) =>
    findings.push({ severity, check, domain, ok, detail });

  // --- inbound: can anyone email us at all? -----------------------------
  // This is the one that loses leads. Without MX on the root, every address
  // the site advertises hard bounces.
  const rootMx = await mx(ROOT);
  add('required', 'MX (inbound mail)', ROOT, rootMx.length > 0,
    rootMx.length
      ? rootMx.map((r) => `${r.exchange} (${r.priority})`).join(', ')
      : 'NO MX — every address at this domain rejects mail. Enable Cloudflare Email Routing.');

  // --- outbound authentication -------------------------------------------
  const sendTxt = await txt(SEND);
  const sendSpf = sendTxt.find((t) => t.startsWith('v=spf1'));
  add('required', 'SPF (sending domain)', SEND, Boolean(sendSpf),
    sendSpf || 'NO SPF — mail is far more likely to be filtered as spam. Add the record Resend shows for this domain.');

  const dkim = await txt(`resend._domainkey.${SEND}`);
  add('required', 'DKIM', `resend._domainkey.${SEND}`, dkim.length > 0,
    dkim.length ? `present (${dkim[0].slice(0, 28)}…)` : 'NO DKIM — Resend will not be able to sign mail.');

  // --- bounce handling ----------------------------------------------------
  // SES uses an MX on the sending domain for bounces and complaints. Absent,
  // bounce data is degraded — which is how a dead address stays unnoticed.
  const sendMx = await mx(SEND);
  add('recommended', 'MX (bounce handling)', SEND, sendMx.length > 0,
    sendMx.length
      ? sendMx.map((r) => `${r.exchange} (${r.priority})`).join(', ')
      : 'no MX — Resend/SES bounce and complaint handling is degraded.');

  // --- root SPF -----------------------------------------------------------
  // Cloudflare Email Routing adds one when enabled; its absence is a decent
  // proxy for "routing was never switched on".
  const rootTxt = await txt(ROOT);
  const rootSpf = rootTxt.find((t) => t.startsWith('v=spf1'));
  add('recommended', 'SPF (root)', ROOT, Boolean(rootSpf),
    rootSpf || 'no SPF on the root domain.');

  // --- DMARC --------------------------------------------------------------
  const dmarc = (await txt(`_dmarc.${ROOT}`)).find((t) => t.startsWith('v=DMARC1'));
  add('optional', 'DMARC', `_dmarc.${ROOT}`, Boolean(dmarc),
    dmarc || 'no DMARC. Add p=none first and read reports before tightening.');

  if (asJson) {
    console.log(JSON.stringify({ root: ROOT, send: SEND, findings }, null, 2));
  } else {
    console.log(`\nEmail DNS — ${ROOT} (sending via ${SEND})\n`);
    for (const f of findings) {
      const mark = f.ok ? G('PASS') : (f.severity === 'required' ? R('FAIL') : Y('warn'));
      console.log(`  ${mark}  ${f.check.padEnd(24)} ${f.detail}`);
    }
    const failed = findings.filter((f) => !f.ok && f.severity === 'required');
    console.log('');
    console.log(failed.length
      ? `${failed.length} required check(s) failing — see docs/EMAIL_RUNBOOK.md`
      : 'All required checks pass. Send a real test message to confirm delivery.');
    console.log('');
  }

  process.exit(findings.some((f) => !f.ok && f.severity === 'required') ? 1 : 0);
}

main().catch((e) => { console.error('check failed:', e.message); process.exit(2); });
