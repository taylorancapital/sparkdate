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
    extra: 'RESOLVED 2026-09-04, verified against the live server-rendered pages: /event?id=... publishes startDate 22:30Z / endDate 00:30Z for both live events, which is 6:30-8:30 PM ET. Correct. This note previously said the Firestore docs carried a 3-hour duration and told the reader to edit the event record in /admin -- that was true before 2026-09-01 and false after, and it survived the fix by four days. What actually fixed it was DEFAULT_EVENT_DURATION_HOURS going 3 -> 2 in lib/next-event.js: NO event doc sets durationHours, so that constant IS the published end time. The check stays, because a 3 there reaches Google.',
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
  canonical: 'three movements -- timed rounds at small tables with a game as the icebreaker and the men moving one table per round, THEN open mingling, THEN 1-on-1s',
  source: 'public/admin.html chemistry tool (_tableSize, ROUND_CHOICES, _roundMinutes, _oneOnOneMinutes); confirmed by Taylor 2026-09-01',
  findings: scan(
    /.{0,70}no\s+(?:bell|forced rotation|rigid rotation|rotation|timer|whistle|scorecard|awkward icebreakers|(?:seven|three)[- ]minute).{0,60}/i,
    'denies a structure the product actually has',
  ),
  extra: 'IMPORTANT NUANCE, confirmed by Taylor 2026-09-01: there IS an open-mingling block between the tables and the 1-on-1s. So "conversations at your own pace" was never invented -- it describes that block accurately and then presents it as the whole evening. The defect was never the phrase; it was the phrase standing alone. Copy that keeps at-your-own-pace AND names it as one movement of three is correct and should not be flagged. UPDATED 2026-09-04: every hit this check now returns is the string "No scorecard", which is TRUE and is the sanctioned contrast with speed dating (run_of_show sequence[0]._name_tags) -- expect them and do not "fix" them. The DENIAL family is gone from public/ entirely: grep for "no bell", "no whistle", "no rotation", "not a rigid rotation", "no timer", "no seven-minute", "no three-minute timer", "no awkward icebreaker" and expect zero. blog/speed-dating-vs-singles-mixer.html is NO LONGER excluded -- Taylor asked for it on 2026-09-04, and its two false claims were rewritten to describe the three movements while keeping the mixer-not-speed-dating thesis intact. Its heading is still "How a singles mixer works instead"; that is the positioning and it stays.',
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

// 5. Free drinks of any kind. RESOLVED: there are none.
CHECKS.push(() => ({
  id: 'free-drink',
  canonical: 'NO free drink, ever. The ticket covers entry and nothing else.',
  source: 'Taylor, 2026-09-01: "We should not under any circumstances be giving out welcome drinks."',
  findings: scan(
    /.{0,60}(?:welcome drink|free drink|drink included|includes a drink|complimentary\s+\w*\s*drink|first drink).{0,50}/i,
    'promises a drink the ticket does not include',
  ),
  extra: 'Was on all four city pages, in prose AND in the FAQ structured data Google surfaces, phrased "includes entry and -- at most venues -- a welcome drink". Removed 2026-09-01. This check stays because the claim is attractive and cheap to retype, and it is the one claim in this audit that a guest can demand at the bar.',
}));

// 6. Segment durations quoted in public copy. There is no safe number.
CHECKS.push(() => ({
  id: 'quoted-duration',
  canonical: 'quote NO duration -- rounds are 2-4 x 10/15/20 min, 1-on-1s are 5/7/10 min, all host-set per event',
  source: 'public/admin.html: ROUND_CHOICES, _roundMinutes, _oneOnOneMinutes',
  findings: scan(
    /.{0,60}(?:five|seven|ten|three|3|5|7|10|15|20)[- ]minute\s+(?:one-on-one|1-on-1|round|seating|table).{0,50}/i,
    'commits to a duration the host chooses on the night',
  ),
  extra: 'This check exists because of a near miss. ONE_ON_ONE_MS was hardcoded at 5 minutes, so the listing copy said "five-minute one-on-ones" and a test asserted it. #379 merged the SAME DAY, made it settable and moved the default to SEVEN -- which would have made every listing already submitted wrong, on calendars that cannot be edited after moderation. A number that is a constant today is a setting tomorrow.',
}));

// 7. Name badges. Found by accident while fixing the format claims.
CHECKS.push(() => ({
  id: 'name-badge',
  canonical: 'name tags ARE used; there is no scorecard',
  source: 'Taylor, 2026-09-01, asked directly.',
  findings: [
    ...scan(/.{0,50}(?:no name tag|name badge|name tag).{0,50}/i, 'states whether badges are worn'),
  ],
  extra: 'RESOLVED 2026-09-01. The two first-timer guides said "No name tag" and were wrong; how-same-night-matching-works.html was right. Occurrences below are expected -- this check now exists to catch a REGRESSION to "no name tag", not to flag the mentions.',
}));

// 8. Age policy.
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
