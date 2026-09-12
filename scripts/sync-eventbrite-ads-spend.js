#!/usr/bin/env node
/**
 * scripts/sync-eventbrite-ads-spend.js
 *
 * Pulls EVENTBRITE ADS spend -- and the orders and tickets Eventbrite
 * attributes to it -- into the same `ad_spend` collection the Meta and Google
 * syncs write, so the dashboard's cost series and every cost-per-ticket figure
 * stop excluding it.
 *
 * WHY THIS EXISTS
 *
 * Eventbrite Ads has run on every SparkDate event since 2026-06-08: thirteen
 * campaigns, $436.11 and 21 attributed tickets by 2026-09-11, none of it in
 * Firestore. The dashboard's blended CAC and every per-event cost per ticket
 * were understated by roughly 30% the whole time, the same gap Google Ads had
 * until 2026-09-04. reports/CHANNEL_ALTERNATIVES_2026-09-11.md, CORRECTION 2,
 * has the per-campaign figures a first backfill should reproduce.
 *
 * WHERE THE NUMBERS COME FROM -- and why this drives a browser
 *
 * Eventbrite publishes no ads endpoint on eventbriteapi.com/v3. The organizer
 * dashboard is fed by two internal endpoints on www.eventbrite.com:
 *
 *   GET /eb-ads/api/organizations/{orgId}/campaigns/
 *       every campaign: id, name, goal, status (1 live, 3 ended), and ads[]
 *       carrying event_id (the EVENTBRITE event id), start/end, budget_amount.
 *   GET /eb-ads/api/campaigns/{id}/insights/
 *       one row per day per ad: spend, attributed_impressions, attributed_clicks,
 *       attributed_orders, attributed_ticket_sales. The `body` is a JSON STRING.
 *
 * Both answer a signed-in browser session and NOTHING ELSE: tested 2026-09-11,
 * the private OAuth token is refused both as a Bearer header and as ?token=
 * ({"message":"Unauthorized"}), and so is an anonymous request. So this script
 * drives the installed Google Chrome through playwright-core with a persistent
 * profile that a human signs into ONCE (`--login`). The profile lives outside
 * the repo, is never committed, and is the only credential involved. When
 * Eventbrite expires that login the run exits 3 and says so; nothing else
 * breaks, and `--login` again is the whole repair.
 *
 * These endpoints are undocumented and can change without notice. Every
 * failure here is soft by design -- the nightly logs a WARN and moves on.
 *
 * DOCUMENT ID, AND WHY IT IS NOT JUST THE DATE
 *
 * sync-meta-spend.js writes `ad_spend/{YYYY-MM-DD}` with `batch.set`, a
 * WHOLE-DOCUMENT overwrite. Google owns `{date}__google` for that reason and
 * this owns `{date}__eventbrite`. public/admin.html's loadAdSpend() keys the
 * cost series on the `date` FIELD and adds, so a second document for a date
 * accumulates onto the first; byEvent is summed the same way, so per-event
 * cost per ticket becomes correct with no dashboard change. The Meta freshness
 * indicator already filters `source === 'meta'`.
 *
 * byEvent IS ATTRIBUTED, unlike the Google sync. Each insights row carries an
 * ad_id, each ad carries an Eventbrite event_id, and our `events` documents
 * carry `eventbriteEventId` (maintained by scripts/sync-eventbrite.js). Spend
 * whose event has no mapped document lands in `_unattributed`, which the
 * dashboard counts in the day's total and skips per event.
 *
 * Attribution is EVENTBRITE'S. Its model is not documented beyond "last-touch"
 * in the Traffic and Conversion report, and the field is named
 * `attributed_impressions`, so view-through may count. Read attributedTickets
 * the way Meta's attributed purchases are read: the platform's number, never a
 * sale. Firestore `tickets` remain the truth for sales.
 *
 * SETUP (once, on the machine that runs the nightly)
 *   npm install                         # brings in playwright-core
 *   node scripts/sync-eventbrite-ads-spend.js --login
 *       A Chrome window opens on Eventbrite's sign-in page. Sign in as the
 *       organizer. The script polls until it can read the campaign list, then
 *       closes the window. Nothing is typed or stored by the script itself.
 *   node scripts/sync-eventbrite-ads-spend.js --days=all --verify
 *       Prints lifetime totals; compare with CORRECTION 2 of the 09-11 report.
 *   node scripts/sync-eventbrite-ads-spend.js --days=all --execute
 *       First backfill. After that the nightly runs --days=30 --execute --csv.
 *
 * Env
 *   EVENTBRITE_ADS_PROFILE_DIR    where the signed-in Chrome profile lives.
 *                                 Default %LOCALAPPDATA%\SparkDate\eventbrite-ads-profile
 *   EVENTBRITE_ORG_ID             default 3002470694486 (SparkDate's organization)
 *   GOOGLE_APPLICATION_CREDENTIALS  Firestore via the service-account file (this machine)
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *                                 Firestore via inline credentials (CI shape)
 *
 * Usage
 *   node scripts/sync-eventbrite-ads-spend.js                 # dry run, last 30 days
 *   node scripts/sync-eventbrite-ads-spend.js --days=all      # every day on record
 *   node scripts/sync-eventbrite-ads-spend.js --verify        # lifetime totals per campaign and event
 *   node scripts/sync-eventbrite-ads-spend.js --execute       # write ad_spend/{date}__eventbrite
 *   node scripts/sync-eventbrite-ads-spend.js --execute --csv # also drop eventbrite-ads-<today>.csv in Night Tasks
 *   node scripts/sync-eventbrite-ads-spend.js --login         # (re)establish the browser login, headed
 *
 * Exit codes: 0 ok · 1 failure · 2 missing env · 3 Eventbrite login expired (run --login)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'https://www.eventbrite.com';
const ORG = process.env.EVENTBRITE_ORG_ID || '3002470694486';
const PROFILE_DIR = process.env.EVENTBRITE_ADS_PROFILE_DIR ||
  path.join(process.env.LOCALAPPDATA || os.homedir(), 'SparkDate', 'eventbrite-ads-profile');
const REPO = path.resolve(__dirname, '..');
const NIGHT_TASKS = path.join(REPO, 'Business Plan', 'files', 'Night Tasks');
const TZ = 'America/New_York';
const EXIT_LOGIN_EXPIRED = 3;

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const has = (flag) => process.argv.includes(`--${flag}`);

const isoIn = (tz, d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `$${Number(n).toFixed(2)}`;

// ── Pure parts (unit-tested in tests/eventbrite-ads-spend.test.js) ─────────

/** `{date}__eventbrite`, never `{date}`: that id is Meta's and set() overwrites. */
function docId(date) {
  return `${date}__eventbrite`;
}

/**
 * The endpoints wrap their payload in `{ body: ... }`, and the insights body is
 * a JSON string while the campaigns body is an object. Accept every shape,
 * including the bare object, so a format change on Eventbrite's side degrades
 * to "no rows" rather than a crash.
 */
function unwrap(payload) {
  if (payload == null) return null;
  let v = payload;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (v && typeof v === 'object' && 'body' in v) {
    v = v.body;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  }
  return v && typeof v === 'object' ? v : null;
}

function parseCampaigns(payload) {
  const v = unwrap(payload);
  const list = v && Array.isArray(v.campaigns) ? v.campaigns : [];
  // Status lives on the AD (1 live, 3 ended), not on the campaign object; the
  // live payload has no campaign-level status at all. Take the campaign's if
  // one ever appears, else the first ad's.
  const statusOf = (c) => {
    if (c.status != null) return Number(c.status);
    const a = (c.ads || []).find((x) => x && x.status != null);
    return a ? Number(a.status) : null;
  };
  return list.map((c) => ({
    id: Number(c.id),
    name: String(c.name || '(unnamed)'),
    goal: c.goal || null,
    status: statusOf(c),
    ads: (c.ads || []).map((a) => ({
      id: Number(a.id),
      eventId: a.event_id != null ? String(a.event_id) : null,
      start: a.start_date || null,
      end: a.end_date || null,
      budget: a.budget_amount != null ? Number(a.budget_amount) : null,
      status: a.status != null ? Number(a.status) : null,
    })),
  }));
}

function parseInsights(payload) {
  const v = unwrap(payload);
  const rows = v && Array.isArray(v.insights) ? v.insights : [];
  return {
    campaignId: v && v.campaign_id != null ? Number(v.campaign_id) : null,
    cpc: v && v.cpc != null ? Number(v.cpc) : null,
    cpa: v && v.cpa != null ? Number(v.cpa) : null,
    rows: rows.map((r) => ({
      adId: Number(r.ad_id),
      day: String(r.day || '').slice(0, 10),
      spend: Number(r.spend) || 0,
      impressions: Number(r.attributed_impressions) || 0,
      clicks: Number(r.attributed_clicks) || 0,
      orders: Number(r.attributed_orders) || 0,
      tickets: Number(r.attributed_ticket_sales) || 0,
    })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)),
  };
}

/** 401, the JSON the endpoints return when signed out, or a bounce to sign-in. */
function isUnauthorized(status, text) {
  if (status === 401 || status === 403) return true;
  const v = unwrap(text);
  if (v && typeof v.message === 'string' && /unauthori[sz]ed/i.test(v.message)) return true;
  if (typeof text === 'string' && !v && /signin|log in|sign in/i.test(text.slice(0, 4000))) return true;
  return false;
}

/**
 * Turn campaigns + per-campaign insights into one document per day.
 *
 *   ebToOurs   Map<eventbriteEventId, ourEventDocId> from `events.eventbriteEventId`
 *   start/end  YYYY-MM-DD inclusive; either may be null for open-ended
 *
 * Money is accumulated raw and rounded ONCE per day (a day with two campaigns
 * must not round twice). A day with no spend, clicks or tickets across every
 * campaign is not written at all. Campaign ids are prefixed `eb:` so the
 * dashboard's `c.id || c.name` join can never collide with a Meta campaign id.
 */
function groupDays({ campaigns, insightsById, ebToOurs, start = null, end = null }) {
  const adEvent = new Map(); // adId -> eventbrite event id
  const campById = new Map();
  for (const c of campaigns) {
    campById.set(c.id, c);
    for (const a of c.ads) adEvent.set(a.id, a.eventId);
  }
  const lookup = ebToOurs instanceof Map ? ebToOurs : new Map(Object.entries(ebToOurs || {}));

  const byDate = new Map();
  for (const [cid, ins] of Object.entries(insightsById || {})) {
    const c = campById.get(Number(cid)) || { id: Number(cid), name: `(campaign ${cid})`, goal: null, ads: [] };
    for (const r of ins.rows) {
      if (start && r.day < start) continue;
      if (end && r.day > end) continue;
      if (r.spend <= 0 && r.clicks === 0 && r.tickets === 0) continue;

      const ebEventId = adEvent.get(r.adId) || (c.ads.length === 1 ? c.ads[0].eventId : null);
      const ours = ebEventId ? lookup.get(String(ebEventId)) || null : null;

      if (!byDate.has(r.day)) {
        byDate.set(r.day, { date: r.day, total: 0, byEvent: {}, byCampaign: [], impressions: 0, clicks: 0, attributedOrders: 0, attributedTickets: 0 });
      }
      const day = byDate.get(r.day);
      day.total += r.spend;
      day.impressions += r.impressions;
      day.clicks += r.clicks;
      day.attributedOrders += r.orders;
      day.attributedTickets += r.tickets;
      const bucket = ours || '_unattributed';
      day.byEvent[bucket] = (day.byEvent[bucket] || 0) + r.spend;
      day.byCampaign.push({
        id: `eb:${c.id}`,
        ebCampaignId: c.id,
        name: c.name,
        goal: c.goal,
        ebEventId: ebEventId || null,
        eventId: ours,
        spend: round2(r.spend),
        impressions: r.impressions,
        clicks: r.clicks,
        attributedOrders: r.orders,
        attributedTickets: r.tickets,
      });
    }
  }
  for (const day of byDate.values()) {
    day.total = round2(day.total);
    for (const k of Object.keys(day.byEvent)) day.byEvent[k] = round2(day.byEvent[k]);
    day.byCampaign.sort((a, b) => b.spend - a.spend);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Lifetime rollup for --verify: per campaign and per Eventbrite event. */
function totals(campaigns, insightsById) {
  const perCampaign = [];
  const perEvent = new Map();
  let spend = 0, clicks = 0, impressions = 0, orders = 0, tickets = 0;
  for (const c of campaigns) {
    const ins = insightsById[c.id];
    if (!ins) continue;
    const t = ins.rows.reduce((s, r) => ({
      spend: s.spend + r.spend, clicks: s.clicks + r.clicks, impressions: s.impressions + r.impressions,
      orders: s.orders + r.orders, tickets: s.tickets + r.tickets,
    }), { spend: 0, clicks: 0, impressions: 0, orders: 0, tickets: 0 });
    const ebEventId = c.ads.length ? c.ads[0].eventId : null;
    perCampaign.push({ id: c.id, name: c.name, goal: c.goal, status: c.status, ebEventId, ...t, spend: round2(t.spend) });
    const ev = perEvent.get(ebEventId) || { ebEventId, spend: 0, clicks: 0, tickets: 0, campaigns: 0 };
    ev.spend += t.spend; ev.clicks += t.clicks; ev.tickets += t.tickets; ev.campaigns++;
    perEvent.set(ebEventId, ev);
    spend += t.spend; clicks += t.clicks; impressions += t.impressions; orders += t.orders; tickets += t.tickets;
  }
  for (const ev of perEvent.values()) ev.spend = round2(ev.spend);
  return { perCampaign, perEvent: [...perEvent.values()], spend: round2(spend), clicks, impressions, orders, tickets };
}

function toCsv(days, pulledAt) {
  const head = [
    '# ----------------------------------------',
    '# sparkdate-philly',
    '# Eventbrite Ads - spend and attributed sales by day and campaign',
    `# ${days.length ? `${days[0].date}-${days[days.length - 1].date}` : 'no rows'}`,
    `# pulled ${pulledAt} -- source: Eventbrite Ads internal campaign insights (www.eventbrite.com/eb-ads/api), read with a signed-in browser profile`,
    '# NOTE: attributed_* columns are EVENTBRITE\'S attribution (last-touch, view-through possible). Firestore tickets are the sales truth.',
    '# NOTE: our_event_id is the Firestore events document mapped through events.eventbriteEventId; blank means unattributed.',
    '# ----------------------------------------',
    'day,campaign_id,campaign_name,goal,eventbrite_event_id,our_event_id,spend,impressions,clicks,attributed_orders,attributed_tickets',
  ];
  const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const lines = [];
  for (const d of days) {
    for (const c of d.byCampaign) {
      lines.push([d.date, c.ebCampaignId, q(c.name), c.goal || '', c.ebEventId || '', c.eventId || '',
        c.spend.toFixed(2), c.impressions, c.clicks, c.attributedOrders, c.attributedTickets].join(','));
    }
  }
  return head.concat(lines).join('\n') + '\n';
}

// ── Browser ────────────────────────────────────────────────────────────────

async function openContext({ headed = false } = {}) {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('\n✗ playwright-core is not installed. Run `npm install` in this checkout.');
    process.exit(2);
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // `channel: 'chrome'` uses the Google Chrome already on this machine, so no
  // browser download is needed and the profile is an ordinary Chrome profile.
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: !headed,
    viewport: { width: 1280, height: 900 },
  });
}

/** Navigate to a JSON endpoint and hand back status + raw text. */
async function getText(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = resp ? resp.status() : 0;
  let text = '';
  try { text = resp ? await resp.text() : ''; } catch { /* fall through to the DOM */ }
  if (!text) { try { text = await page.evaluate(() => document.body && document.body.innerText); } catch { text = ''; } }
  return { status, text: text || '' };
}

async function login() {
  const minutes = parseInt(arg('wait', '20'), 10);
  console.log(`\nOpening Chrome on Eventbrite's sign-in page.`);
  console.log(`Profile: ${PROFILE_DIR}`);
  console.log('Sign in as the SparkDate organizer. This checks every 5 seconds and closes the window');
  console.log(`once it can read the campaign list (giving up after ${minutes} minutes).`);
  console.log('Nothing is typed or stored by this script.');
  console.log('If "Continue with Google" refuses ("this browser may not be secure"), use the email');
  console.log('option instead: Eventbrite can email a one-time code or link to the organizer address.\n');
  const context = await openContext({ headed: true });
  try {
    const page = context.pages()[0] || await context.newPage();
    // Passkeys cannot work here: an automation-controlled Chrome has no real
    // authenticator behind the Windows Hello prompt, so Eventbrite's passkey
    // sign-in hangs or errors and leaves the page wedged (observed 2026-09-11).
    // Route WebAuthn to a virtual authenticator that holds no credentials, with
    // the prompt UI off: any passkey request fails fast and quietly, and the
    // page falls back to its email-code / password sign-in.
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('WebAuthn.enable', { enableUI: false });
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
      });
      console.log('Passkey prompts are suppressed in this window: use the email code or password option.\n');
    } catch (e) {
      console.log(`(could not suppress passkey prompts: ${e.message}; cancel any passkey dialog and pick the email option)\n`);
    }
    await page.goto(`${BASE}/signin/?referrer=%2Forganizations%2Fmarketing%2Feventbrite-ads`, { waitUntil: 'domcontentloaded' });
    // The probe is a hidden-ish second tab so the sign-in tab is never navigated
    // away from mid-flow; it is brought to the front only on success.
    const probe = await context.newPage();
    await page.bringToFront();
    const deadline = Date.now() + minutes * 60 * 1000;
    let last = { status: 0, text: '' };
    let tick = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        last = await getText(probe, `${BASE}/eb-ads/api/organizations/${ORG}/campaigns/`);
        if (last.status === 200 && parseCampaigns(last.text).length > 0) {
          console.log('Signed in: the campaign list is readable. Closing Chrome.\n');
          return 0;
        }
      } catch (e) { last = { status: 0, text: String(e && e.message) }; }
      if (++tick % 6 === 0) {
        // status 0 = the probe navigation itself failed (a modal dialog such as
        // a passkey prompt blocks navigation until it times out); say so rather
        // than guessing at the sign-in state.
        const state = last.status === 0
          ? `probe could not load: ${String(last.text).slice(0, 80)}`
          : isUnauthorized(last.status, last.text) ? `probe HTTP ${last.status}, not signed in yet`
            : `probe HTTP ${last.status}, signed in but no campaigns parsed`;
        console.log(`  still waiting (${tick * 5}s) — ${state}`);
      }
    }
    console.error(`\n✗ Gave up after ${minutes} minutes without a readable campaign list.`);
    console.error(`  Last probe: HTTP ${last.status}: ${String(last.text).replace(/\s+/g, ' ').slice(0, 200)}`);
    console.error('  The profile is kept, so a completed sign-in is not lost; run --login again to retry.');
    return 1;
  } finally {
    await context.close();
  }
}

async function pull() {
  const context = await openContext({ headed: has('headed') });
  try {
    const page = context.pages()[0] || await context.newPage();
    const list = await getText(page, `${BASE}/eb-ads/api/organizations/${ORG}/campaigns/`);
    if (isUnauthorized(list.status, list.text)) return { loginExpired: true };
    const campaigns = parseCampaigns(list.text);
    if (list.status !== 200 || !campaigns.length) {
      throw new Error(`campaign list: HTTP ${list.status}, ${campaigns.length} campaign(s) parsed. ${list.text.slice(0, 200)}`);
    }
    const insightsById = {};
    for (const c of campaigns) {
      const r = await getText(page, `${BASE}/eb-ads/api/campaigns/${c.id}/insights/`);
      if (isUnauthorized(r.status, r.text)) return { loginExpired: true };
      if (r.status !== 200) {
        console.log(`  WARN: insights for ${c.id} (${c.name}) returned HTTP ${r.status}; skipping it.`);
        continue;
      }
      insightsById[c.id] = parseInsights(r.text);
    }
    return { campaigns, insightsById };
  } finally {
    await context.close();
  }
}

// ── Firestore ──────────────────────────────────────────────────────────────

function firestore({ required }) {
  let admin;
  try { admin = require('firebase-admin'); } catch (e) {
    if (!required) return null;
    console.error(`\n✗ firebase-admin failed to load: ${e.message}`);
    console.error('  Run `npm install` in this checkout (a half-installed @google-cloud/firestore has bitten before).');
    process.exit(2);
  }
  if (!admin.apps.length) {
    let via;
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      via = 'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY';
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'sparkdate-philly',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // This machine: the GA4 service-account file IS the Firebase Admin account.
      via = `GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`;
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || 'sparkdate-philly',
      });
    } else {
      if (!required) return null;
      console.error('\n✗ No Firestore credentials: set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
      process.exit(2);
    }
    console.log(`Firestore auth: ${via}`);
  }
  return admin;
}

async function eventMap(admin) {
  const db = admin.firestore();
  const snap = await db.collection('events').get();
  const map = new Map();
  const names = new Map();
  snap.forEach((d) => {
    const e = d.data();
    if (e.eventbriteEventId) map.set(String(e.eventbriteEventId), d.id);
    names.set(d.id, e.name || e.title || d.id);
  });
  return { map, names };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (has('login')) { process.exitCode = await login(); return; }

  const daysArg = arg('days', '30');
  const end = arg('end', null);
  const start = daysArg === 'all' ? arg('start', null)
    : arg('start', isoIn(TZ, new Date(Date.now() - (parseInt(daysArg, 10) - 1) * 86400000)));
  const EXECUTE = has('execute');

  console.log(`\nEventbrite Ads spend, organization ${ORG}`);
  console.log(`Window ${start || 'beginning'} .. ${end || 'today'}  (dates in ${TZ})`);
  console.log(`Profile ${PROFILE_DIR}\n`);

  const pulled = await pull();
  if (pulled.loginExpired) {
    console.error('✗ Eventbrite login expired or missing for this profile.');
    console.error('  Repair: node scripts/sync-eventbrite-ads-spend.js --login   (opens Chrome; sign in once)\n');
    process.exitCode = EXIT_LOGIN_EXPIRED;
    return;
  }
  const { campaigns, insightsById } = pulled;
  console.log(`${campaigns.length} campaign(s), insights read for ${Object.keys(insightsById).length}.`);

  if (has('verify')) {
    const t = totals(campaigns, insightsById);
    console.log('\ncampaign  status  goal    spend    clicks  orders  tickets  event');
    for (const c of t.perCampaign) {
      console.log(`${String(c.id).padEnd(8)}  ${c.status === 1 ? 'live ' : 'ended'}   ${String(c.goal || '').padEnd(6)}  ${money(c.spend).padStart(8)}  ${String(c.clicks).padStart(6)}  ${String(c.orders).padStart(6)}  ${String(c.tickets).padStart(7)}  ${c.ebEventId || '?'}  ${c.name.slice(0, 40)}`);
    }
    console.log('\nper Eventbrite event');
    for (const e of t.perEvent) {
      const cpt = e.tickets ? money(e.spend / e.tickets) : '—';
      console.log(`  ${String(e.ebEventId || '?').padEnd(14)}  ${money(e.spend).padStart(8)}  ${String(e.clicks).padStart(5)} clicks  ${String(e.tickets).padStart(3)} tickets  ${cpt.padStart(8)}/ticket  (${e.campaigns} campaign${e.campaigns === 1 ? '' : 's'})`);
    }
    console.log(`\nLIFETIME  ${money(t.spend)}  ${t.clicks} clicks  ${t.impressions} impressions  ${t.orders} orders  ${t.tickets} attributed tickets  ${t.tickets ? money(t.spend / t.tickets) : '—'}/ticket`);
    console.log('Reference on 2026-09-11: $436.11, 556 clicks, 21 attributed tickets, $20.77/ticket (13 campaigns).\n');
    return;
  }

  // Event mapping: best effort on a dry run, required for a write.
  let ebToOurs = new Map();
  let names = new Map();
  const admin = firestore({ required: EXECUTE });
  if (admin) {
    try {
      ({ map: ebToOurs, names } = await eventMap(admin));
      console.log(`Mapped ${ebToOurs.size} Eventbrite event id(s) through events.eventbriteEventId.`);
    } catch (e) {
      if (EXECUTE) throw e;
      console.log(`(events not read: ${e.message}; dry run continues with everything unattributed)`);
    }
  } else {
    console.log('(no Firestore credentials; dry run shows Eventbrite event ids only)');
  }

  const days = groupDays({ campaigns, insightsById, ebToOurs, start, end });
  if (!days.length) {
    console.log('\nNo Eventbrite Ads activity in this window. Nothing to write.\n');
    return;
  }

  let total = 0, tickets = 0;
  console.log('\ndate          spend   clicks  tickets  events');
  for (const d of days) {
    total += d.total; tickets += d.attributedTickets;
    const evs = Object.entries(d.byEvent).map(([k, v]) => `${names.get(k) || k}:${money(v)}`).join(', ');
    console.log(`${d.date}  ${money(d.total).padStart(8)}  ${String(d.clicks).padStart(6)}  ${String(d.attributedTickets).padStart(7)}  ${evs.slice(0, 70)}`);
  }
  console.log(`${''.padEnd(12)}  ${money(total).padStart(8)}  ${''.padStart(6)}  ${String(tickets).padStart(7)}  TOTAL over ${days.length} day(s)\n`);

  if (has('csv')) {
    const today = isoIn(TZ);
    const file = path.join(NIGHT_TASKS, `eventbrite-ads-${today}.csv`);
    fs.mkdirSync(NIGHT_TASKS, { recursive: true });
    fs.writeFileSync(file, toCsv(days, new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'), 'utf8');
    console.log(`CSV written: ${file}`);
  }

  if (!EXECUTE) {
    console.log(`Dry run. ${days.length} document(s) would be written to ad_spend/ as {date}__eventbrite.`);
    console.log('Re-run with --execute.\n');
    return;
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  let written = 0;
  for (let i = 0; i < days.length; i += 400) {
    const batch = db.batch();
    for (const d of days.slice(i, i + 400)) {
      batch.set(db.collection('ad_spend').doc(docId(d.date)), {
        ...d, source: 'eventbrite', currency: 'USD', syncedAt: FieldValue.serverTimestamp(),
      });
      written++;
    }
    await batch.commit();
  }
  console.log(`wrote ${written} document(s) to ad_spend/ as {date}__eventbrite`);
  console.log('The admin dashboard reads these directly -- no deploy needed.\n');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\nFAILED: ${e.message}`);
    process.exitCode = process.exitCode || 1;
  });
}

module.exports = { docId, unwrap, parseCampaigns, parseInsights, isUnauthorized, groupDays, totals, toCsv, EXIT_LOGIN_EXPIRED };
