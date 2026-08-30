// lib/eventbrite.js
//
// The one place that knows how to walk Eventbrite's continuation-token
// pagination, how an email is normalized for enrollment matching, and how a
// failed Eventbrite request is retried. All three counters that answer "is
// this attendee enrolled here?" — the 6-hour sync (scripts/sync-eventbrite.js)
// and the dashboard's live-count endpoint (api/eventbrite-live.js) — import
// from here, because the moment their rules drift apart the dashboard grows
// phantom "+N unsynced" badges. That drift is the bug that created this file;
// change matching semantics here, nowhere else.

'use strict';

const EB = 'https://www.eventbriteapi.com/v3';

// One spelling for every email comparison: trim + lowercase. Firestore
// ticket emails and EB attendee profile emails both pass through this
// before being compared.
const normalizeEmail = (s) => String(s || '').toLowerCase().trim();

// Python's repr() of a bytes object, e.g. b'Chase'. On 2026-08-30 two live
// Eventbrite signups landed as `b'Chase' b'Nash'` and `b'Christopher'
// b'McElroy'`. JavaScript has no such spelling, so nothing in this codebase
// can produce it -- it arrives already corrupted in Eventbrite's attendee
// profile. Propagating it, however, IS ours: enrollEventbriteOne splits the
// name on whitespace and hands nameParts[0] to the welcome email, so those two
// people were greeted as "b'Chase'" and "b'Christopher'".
//
// Unwrapped per whitespace token, and only when the ENTIRE token is a bytes
// literal. B'Elanna keeps her apostrophe (no closing quote), O'Brien is never
// considered, and a name that merely contains b'...' inside a longer token is
// left alone. A real name is never spelled this way, so the false-positive
// surface is nil -- and a wrongly-stripped name would be worse than the bug.
const BYTES_LITERAL = /^b(['"])([\s\S]*)\1$/;

function cleanName(raw) {
  const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);
  let changed = false;
  const out = tokens.map((tok) => {
    const m = BYTES_LITERAL.exec(tok);
    if (!m) return tok;
    changed = true;
    return m[2];
  }).filter(Boolean);
  // Logged, not silent: if this keeps firing, the corruption upstream is
  // ongoing and somebody should look at where those Eventbrite attendee
  // records are being created.
  if (changed) {
    console.warn(`[enroll] stripped bytes-literal wrapper from name: ${JSON.stringify(raw)} -> ${JSON.stringify(out.join(' '))}`);
  }
  return out.join(' ');
}

// Gender, as Eventbrite actually spells it, reduced to the two values the rest
// of the system understands. Until now enroll.js accepted ONLY 'woman'/'man',
// so a ticket class or answer reading "Male" normalised to null and the buyer
// arrived with no gender at all -- which is exactly what happened to the two
// 2026-08-30 signups, and why the gender column was blank on a pair of tickets
// that were explicitly sold as male.
//
// ORDER MATTERS, and not for the reason it looks. The \b guards already stop
// /male/ matching inside "Female" (no word boundary between "Fe" and "male"),
// but the female patterns are tested first anyway: this is the one bug in this
// function that would silently file every woman as a man, and belt-and-braces
// is cheap next to that.
const GENDER_PATTERNS = [
  [/\b(?:female|woman|women|f|w)\b/i, 'woman'],
  [/\b(?:male|man|men|m)\b/i, 'man'],
];

function normalizeGender(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  for (const [re, out] of GENDER_PATTERNS) if (re.test(s)) return out;
  // Unrecognised stays null rather than guessing. seatFields() treats
  // anything that is not 'woman' as the men's pool on legacy gender-split
  // events, so a wrong guess here is a wrongly-allocated seat.
  return null;
}

// Where a gender might be hiding on an Eventbrite attendee, in descending
// order of how explicitly it was asked for.
//
// Each source is NORMALISED BEFORE BEING ACCEPTED, which is the whole point of
// the loop: an earlier source that answers something unusable -- a profile
// field reading "Prefer not to say", a gender question answered "Other" --
// must not shadow a usable answer further down. Returning the first non-empty
// raw value, as this did until 2026-08-30, does exactly that.
function attendeeGender(a) {
  a = a || {};
  const sources = [
    // 1. The profile field. Eventbrite only fills it when the order form
    //    collects it, which for these listings it does not.
    a.profile && a.profile.gender,
    // 2. Any custom question with "gender" in its text.
    ...(a.answers || [])
      .filter((ans) => /gender/i.test((ans && ans.question) || ''))
      .map((ans) => ans && ans.answer),
    // 3. The ticket class. SparkDate sells "General Admission - Male" and
    //    "General Admission - Female", so with no gender question on the form
    //    this is the ONLY record of which pool a buyer belongs to -- and it
    //    was ignored until 2026-08-30, which is why two tickets sold
    //    explicitly as male arrived with the gender column blank. A
    //    non-gendered class ("General Admission") yields null and changes
    //    nothing.
    a.ticket_class_name,
  ];
  for (const src of sources) {
    const g = normalizeGender(src);
    if (g) return g;
  }
  return null;
}

// Statuses worth trying again. 403 is on this list because of a real failure:
// on 2026-08-30 three sync runs inside 35 minutes had the middle one die on
// `403 on /users/me/organizations/` whose body was an HTML error page, not
// Eventbrite's usual JSON error envelope. An HTML 403 from a JSON API is an
// edge/WAF response — rate limiting wearing a permission error's status code —
// and the run four minutes later succeeded on the same token. Retrying costs a
// genuinely-forbidden request about a second and a half; not retrying cost a
// whole sync.
//
// 401/404/400 are deliberately absent: those are answers, not weather.
const RETRYABLE = new Set([403, 408, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One Eventbrite request, retried on transient failures.
 *
 * `label` rather than the URL in error messages ON PURPOSE: every Eventbrite
 * URL carries `token=<secret>` in its query string, and an error is the one
 * string most likely to end up in a log, an issue, or a screenshot.
 *
 * `retries` is the number of RETRIES, not attempts — 2 means up to three
 * requests. Callers under a function duration cap should lower it; see
 * api/eventbrite-live.js, which has 30s for the whole route.
 */
async function ebFetch(url, { label = '', timeoutMs = 8000, retries = 2, retryBaseMs = 500 } = {}) {
  let lastError;
  for (let attempt = 0; ; attempt++) {
    let res = null;
    let err = null;
    let waitMs = null;

    try {
      res = await fetch(url, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);
    } catch (e) {
      // Network failure or an aborted timeout. Always transient by nature —
      // there is no response to inspect, so there is nothing to call permanent.
      err = e;
    }

    if (res && res.ok) return res;

    if (res) {
      const body = await res.text().catch(() => '');
      err = new Error(`Eventbrite ${res.status} on ${label}: ${body.slice(0, 200)}`);
      err.status = res.status;
      // A permanent status fails now rather than three times more slowly.
      if (!RETRYABLE.has(res.status)) throw err;
      // Eventbrite sends Retry-After on some 429s. Honour it, but cap it: a
      // long one would otherwise park a serverless request past its own cap.
      const after = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
      if (Number.isFinite(after) && after > 0) waitMs = Math.min(after * 1000, 10000);
    }

    lastError = err;
    if (attempt >= retries) throw lastError;
    await sleep(waitMs != null ? waitMs : retryBaseMs * Math.pow(2, attempt));
  }
}

// Fetch every page of an EB list endpoint. `timeoutMs` caps EACH page
// request (serverless callers need it); pass 0 for no timeout (the Actions
// sync, where a slow page is fine and an abort would waste the run).
// `retries`/`retryBaseMs` are handed to ebFetch per page.
async function ebGetAll(path, listKey, token, { timeoutMs = 8000, retries = 2, retryBaseMs = 500 } = {}) {
  const out = [];
  let continuation = null;
  do {
    const url = `${EB}${path}${path.includes('?') ? '&' : '?'}token=${token}` +
      (continuation ? `&continuation=${continuation}` : '');
    const r = await ebFetch(url, { label: path, timeoutMs, retries, retryBaseMs });
    const page = await r.json();
    out.push(...(page[listKey] || []));
    continuation = page.pagination && page.pagination.has_more_items ? page.pagination.continuation : null;
  } while (continuation);
  return out;
}

module.exports = { EB, normalizeEmail, cleanName, normalizeGender, attendeeGender, ebFetch, ebGetAll, RETRYABLE };
