// lib/social-publish.js
//
// Pure scheduling/state logic for the social publisher. No network, no
// filesystem -- so the parts that decide WHETHER something publishes can be
// tested directly, which matters more than usual here: the failure mode is
// posting to a live audience, and it is not undoable.
//
// Two properties this module exists to guarantee:
//
//   1. Only APPROVED rows ever publish. A pending row is skipped and
//      reported, never posted. This is the whole safety model -- the human
//      approves a batch, and nothing outside that batch can go out.
//   2. A row publishes at most once. Rows carry their published ids, and a
//      row that already has one for a surface is never re-sent.
//
// The Facebook/Instagram split drives the rest of the design. Facebook
// genuinely schedules (10 minutes to 30 days ahead), so its posts are handed
// over in one batch and Meta holds them. Instagram has no scheduling at all
// and its media containers expire after 24 hours, so an IG post can only be
// created at the moment it should go live -- which is why a runner exists.

'use strict';

const FB_MIN_LEAD_MS = 10 * 60 * 1000;          // Meta rejects sooner than this
const FB_MAX_LEAD_MS = 30 * 24 * 60 * 60 * 1000; // ...and further out than this
const DEFAULT_TZ = 'America/New_York';

// ---------------------------------------------------------------- time

// Convert a wall-clock date+time in a named zone to epoch ms.
//
// Done by asking Intl what a guessed instant looks like in that zone and
// correcting by the difference. The naive alternative -- new Date(
// '2026-09-08T12:30') -- resolves in the RUNNER's timezone, which is UTC on
// GitHub Actions and ET on the user's machine. That discrepancy would post
// every row four hours early in CI and nowhere else, which is exactly the
// kind of bug that only shows up in production.
function zonedToEpoch(dateStr, timeStr, timeZone = DEFAULT_TZ) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  if (!/^\d{2}:\d{2}$/.test(timeStr || '')) return null;

  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const read = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    // hour can come back as "24" at midnight in some ICU versions.
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  };

  // One correction lands it; a second settles DST edges where the first
  // guess falls on the other side of a transition.
  let guess = asUtc - (read(asUtc) - asUtc);
  guess = guess - (read(guess) - asUtc);
  return guess;
}

// ---------------------------------------------------------------- state

const PUBLISHABLE_STATES = new Set(['approved']);
const TERMINAL_STATES = new Set(['posted', 'skipped']);

function parsePublished(row) {
  if (!row.published_ids) return {};
  try {
    return JSON.parse(row.published_ids);
  } catch {
    // A malformed cell must not read as "nothing published yet" -- that
    // would re-post. Surface it as an unusable value instead.
    return { __malformed: String(row.published_ids) };
  }
}

function alreadyPublished(row, surface) {
  const p = parsePublished(row);
  return Boolean(p[surface]);
}

// ---------------------------------------------------------------- selection

function rowSurfaces(row) {
  const platforms = String(row.platforms || '').split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of platforms) {
    if (p === 'fb') out.push('fb');
    else if (p === 'ig') out.push('ig');
    else if (p === 'ig_story') out.push('ig_story');
    else if (p === 'tiktok') out.push('tiktok');
  }
  return out;
}

/**
 * Decide what to do with one row, for one surface, at one instant.
 * Returns { action, reason }. action is one of:
 *   'schedule'  hand to Facebook now with a future publish time
 *   'publish'   create and publish right now (Instagram, TikTok draft)
 *   'skip'      nothing to do, with a reason
 */
function planRow(row, surface, nowMs, opts = {}) {
  const tz = opts.timeZone || DEFAULT_TZ;
  const graceMs = opts.graceMs === undefined ? 6 * 60 * 60 * 1000 : opts.graceMs;

  if (TERMINAL_STATES.has(row.state)) return { action: 'skip', reason: `state=${row.state}` };
  if (!PUBLISHABLE_STATES.has(row.state)) {
    // The safety property. Nothing unapproved leaves this function as
    // anything but a skip.
    return { action: 'skip', reason: `not approved (state=${row.state || 'unset'})` };
  }
  if (row.manual_reason) return { action: 'skip', reason: `manual: ${row.manual_reason}` };
  if (alreadyPublished(row, surface)) return { action: 'skip', reason: 'already published' };
  if (parsePublished(row).__malformed !== undefined) {
    return { action: 'skip', reason: 'published_ids is not valid JSON -- refusing to act' };
  }

  const at = zonedToEpoch(row.date, row.time, tz);
  if (at === null) return { action: 'skip', reason: `unschedulable date/time (${row.date} ${row.time})` };

  const lead = at - nowMs;

  if (surface === 'fb') {
    if (lead > FB_MAX_LEAD_MS) {
      return { action: 'skip', reason: `more than 30 days out -- outside Facebook's scheduling window`, at };
    }
    if (lead >= FB_MIN_LEAD_MS) return { action: 'schedule', at };
    // Inside 10 minutes Facebook refuses a scheduled post, so publish it now
    // if it is still near its slot rather than dropping it.
    if (lead > -graceMs) return { action: 'publish', at, reason: 'inside the 10-minute scheduling floor' };
    return { action: 'skip', reason: 'past its slot', at };
  }

  // Instagram and TikTok cannot schedule. They act only when the moment has
  // arrived, and only within the grace window -- so a runner that was down
  // for an hour still catches up, but one that was down for a week does not
  // suddenly post a fortnight of backlog.
  if (lead > 0) return { action: 'skip', reason: 'not due yet', at };
  if (lead <= -graceMs) return { action: 'skip', reason: `missed by more than ${Math.round(graceMs / 3600000)}h`, at };
  return { action: 'publish', at };
}

/** Every (row, surface) pair with what should happen to it now. */
function planAll(rows, nowMs, opts = {}) {
  const out = [];
  for (const row of rows) {
    for (const surface of rowSurfaces(row)) {
      out.push({ row_id: row.row_id, surface, row, ...planRow(row, surface, nowMs, opts) });
    }
  }
  return out;
}

function recordPublished(row, surface, id) {
  const p = parsePublished(row);
  delete p.__malformed;
  p[surface] = id;
  row.published_ids = JSON.stringify(p);

  // A row is only 'posted' once every surface it targets has an id --
  // otherwise a Facebook success would mark the row done and the Instagram
  // half would never run.
  const done = rowSurfaces(row).every((s) => Boolean(p[s]));
  if (done) row.state = 'posted';
  return row;
}

module.exports = {
  zonedToEpoch, planRow, planAll, rowSurfaces,
  parsePublished, alreadyPublished, recordPublished,
  FB_MIN_LEAD_MS, FB_MAX_LEAD_MS, DEFAULT_TZ,
};
