#!/usr/bin/env node
/**
 * scripts/audit-facts.js
 *
 * Cross-checks the FACTS SparkDate states about itself, everywhere it states
 * them, against one canonical record per fact.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-01 an event-listing job turned up four different end times for
 * the same event (Firestore said 9:30, the city pages said 9, careers.html
 * said 9, the social queue said both 9:00 and 8:30 -- the real answer was
 * 8:30), and three mutually exclusive descriptions of the run of show. None
 * of it was caught by any existing check, because every existing check reads
 * ONE surface: lint-content-queue.js reads the queue, lint-ad-copy.js reads
 * the ads, and nothing at all reads the marketing site.
 *
 * A fact that appears on six surfaces has six chances to be wrong and one
 * chance to be noticed. This reads all of them at once and diffs.
 *
 * READ-ONLY. It reports; it does not edit.
 *
 * WHAT IT CANNOT SEE, and therefore does not claim to have checked:
 *   * the Eventbrite listing bodies (needs EVENTBRITE_TOKEN and the listing
 *     text is not exposed by the endpoints lib/eventbrite.js wraps)
 *   * anything on a third-party calendar we have already submitted to
 *   * whether a claim is TRUE -- only whether the surfaces agree. Four
 *     surfaces agreeing on a wrong number still reads as clean here.
 *
 * Usage:
 *   node scripts/audit-facts.js
 *   node scripts/audit-facts.js --json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const BRAND = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'brand.json'), 'utf8'));

const read = (p) => {
  try { return fs.readFileSync(path.join(REPO, p), 'utf8'); } catch { return null; }
};

// Surfaces that make factual claims to the public. admin.html is excluded on
// purpose -- it is staff-facing and its numbers are the SOURCE, not a copy.
const SURFACES = [
  'public/index.html', 'public/lp.html', 'public/events.html', 'public/event.html',
  'public/city.html', 'public/about.html', 'public/careers.html', 'public/signup.html',
  'public/getaways.html',
  ...fs.readdirSync(path.join(REPO, 'public', 'blog'))
    .filter((f) => f.endsWith('.html')).map((f) => `public/blog/${f}`),
  'content/queue.csv',
];

// ── The checks ────────────────────────────────────────────────────────
// Each returns { id, canonical, findings: [{surface, line, text, note}] }.
// A check states its own canonical value and where that value comes from,
// because "which one is right" is the question that cost the most time.

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scan(pattern, note) {
  const out = [];
  for (const s of SURFACES) {
    const body = read(s);
    if (!body) continue;
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
      out.push({
        surface: s,
        line: lineOf(body, m.index),
        text: m[0].replace(/\s+/g, ' ').trim().slice(0, 150),
        note,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

const CHECKS = [];

// 1. End time. The one that started this.
CHECKS.push(() => {
  const canonical = '6:30 PM – 8:30 PM';
  const wrong = scan(
    /.{0,60}6:30\s*(?:PM)?\s*(?:to|-|–|—)\s*9(?::[03]0)?\s*(?:PM)?.{0,40}/i,
    'says the night ends at 9, not 8:30',
  );
  return {
    id: 'end-time',
    canonical,
    source: 'Taylor, 2026-09-01. brand.json events.*.ends now records it.',
    findings: wrong,
    extra: 'ALSO WRONG AT SOURCE: the Firestore event docs carry a 3-hour duration, so /event?id=... publishes endDate 9:30 PM in its schema.org Event JSON-LD. Google reads that. Fixing the copy does not fix the structured data -- the event record has to be edited in /admin.',
  };
});

// 2. Ticket price stated as a flat site-wide number.
CHECKS.push(() => {
  const byEvent = Object.entries(BRAND.events)
    .map(([k, v]) => `${k}=${v.pricing.regular}`).join(', ');
  return {
    id: 'flat-price',
    canonical: `varies by event (${byEvent})`,
    source: 'content/brand.json events.*.pricing.regular',
    findings: scan(
      /.{0,70}(?:tickets?\s+(?:are|will be|at)|reserve your spot[^.]{0,40})\s*\$24\.99.{0,50}/i,
      'states $24.99 as if it were the standing price',
    ),
    extra: 'Philadelphia is the problem case: Good Good Things was $29.99 and Loxleys goes to $29.99 after Sep 7, but the Philly city page and two Philly-targeted blog posts quote $24.99. Understating a price is worse than overstating one -- it is what the buyer will argue about at the door.',
  };
});

// 3. The "no rotation / no timer" family.
CHECKS.push(() => ({
  id: 'format-denial',
  canonical: 'timed rounds at small tables, a game as the icebreaker, men move one table per round, then 5-minute 1-on-1s',
  source: 'public/admin.html chemistry tool (_tableSize, ROUND_CHOICES, _roundMinutes, ONE_ON_ONE_MS); confirmed by Taylor 2026-09-01',
  findings: scan(
    /.{0,70}no\s+(?:bell|forced rotation|rigid rotation|rotation|timer|whistle|scorecard|awkward icebreakers|(?:seven|three)[- ]minute).{0,60}/i,
    'denies a structure the product actually has',
  ),
  extra: 'blog/speed-dating-vs-singles-mixer.html is deliberately EXCLUDED from any fix: its whole thesis is "we are a mixer, not speed dating", so it needs a positioning decision rather than an edit.',
}));

// 4. Capacity.
CHECKS.push(() => ({
  id: 'capacity',
  canonical: '30 seats (spotsTotal on both live events)',
  source: 'GET /api/next-event -> spotsTotal',
  findings: scan(
    /.{0,60}(?:20 to 30 people|under 30 people|thirty people).{0,50}/i,
    'states a capacity',
  ),
  extra: 'Not necessarily wrong -- "20 to 30" and "under 30" are both compatible with a 30-seat room. Listed so the phrasing is a choice rather than an accident, and so it gets revisited if a venue ever seats more.',
}));

// 5. Welcome drink.
CHECKS.push(() => ({
  id: 'welcome-drink',
  canonical: 'UNVERIFIED — no record in the repo',
  source: 'nothing. This claim has no source of truth anywhere in the codebase.',
  findings: scan(/.{0,50}welcome drink.{0,50}/i, 'promises a drink is included'),
  extra: 'Appears on all four city pages, in prose AND inside the FAQ structured data Google surfaces. "At most venues" is doing a lot of work. Whoever knows the venue contracts should confirm it or cut it -- it is the only claim here that costs money at the bar if it is wrong.',
}));

// 6. Name badges. Found by accident while fixing the format claims.
CHECKS.push(() => ({
  id: 'name-badge',
  canonical: 'UNRESOLVED — the site says both',
  source: 'nothing authoritative. Two blog posts contradict each other and no system of record settles it.',
  findings: [
    ...scan(/.{0,50}(?:no name tag|name badge|name tag).{0,50}/i, 'states whether badges are worn'),
  ],
  extra: 'blog/how-same-night-matching-works.html says "get your name badge"; both first-timer guides say "No name tag". brand.json universal.run_of_show currently says badge, but only because it was written from the first of those. Someone who has run an event needs to say which it is -- it is the first thing a guest experiences.',
}));

// 7. Age policy.
CHECKS.push(() => ({
  id: 'age',
  canonical: '21+ with valid ID',
  source: 'public/event.html checkout legal line',
  findings: scan(/.{0,45}\b21\+.{0,45}/i, 'states the age policy'),
  extra: 'Stated at checkout but on few marketing surfaces. Worth adding rather than removing -- a 20-year-old buying a ticket is a refund and a bad first impression.',
}));

// ── Run ───────────────────────────────────────────────────────────────

const results = CHECKS.map((c) => c());

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ generated: new Date().toISOString(), results }, null, 2) + '\n');
} else {
  let total = 0;
  for (const r of results) {
    console.log('\n' + '─'.repeat(72));
    console.log(`${r.id}`);
    console.log(`  canonical: ${r.canonical}`);
    console.log(`  source:    ${r.source}`);
    if (!r.findings.length) {
      console.log('  no occurrences found');
    } else {
      console.log(`  ${r.findings.length} occurrence(s):`);
      for (const f of r.findings) {
        console.log(`    ${f.surface}:${f.line}`);
        console.log(`      ${f.text}`);
      }
    }
    if (r.extra) console.log(`  NOTE: ${r.extra}`);
    total += r.findings.length;
  }
  console.log('\n' + '─'.repeat(72));
  console.log(`${total} occurrence(s) across ${SURFACES.length} surfaces.`);
  console.log('This tool proves surfaces AGREE, never that they are RIGHT.');
}

module.exports = { CHECKS, SURFACES };
