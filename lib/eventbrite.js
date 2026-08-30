// lib/eventbrite.js
//
// The one place that knows how to walk Eventbrite's continuation-token
// pagination and how an email is normalized for enrollment matching. Both
// counters that answer "is this attendee enrolled here?" — the 6-hour sync
// (scripts/sync-eventbrite.js) and the dashboard's live-count endpoint
// (api/eventbrite-live.js) — import from here, because the moment their
// rules drift apart the dashboard grows phantom "+N unsynced" badges. That
// drift is the bug that created this file; change matching semantics here,
// nowhere else.

'use strict';

const EB = 'https://www.eventbriteapi.com/v3';

// One spelling for every email comparison: trim + lowercase. Firestore
// ticket emails and EB attendee profile emails both pass through this
// before being compared.
const normalizeEmail = (s) => String(s || '').toLowerCase().trim();

// Fetch every page of an EB list endpoint. `timeoutMs` caps EACH page
// request (serverless callers need it); pass 0 for no timeout (the Actions
// sync, where a slow page is fine and an abort would waste the run).
async function ebGetAll(path, listKey, token, { timeoutMs = 8000 } = {}) {
  const out = [];
  let continuation = null;
  do {
    const url = `${EB}${path}${path.includes('?') ? '&' : '?'}token=${token}` +
      (continuation ? `&continuation=${continuation}` : '');
    const r = await fetch(url, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Eventbrite ${r.status} on ${path}: ${body.slice(0, 200)}`);
    }
    const page = await r.json();
    out.push(...(page[listKey] || []));
    continuation = page.pagination && page.pagination.has_more_items ? page.pagination.continuation : null;
  } while (continuation);
  return out;
}

module.exports = { EB, normalizeEmail, ebGetAll };
