// api/declare-connection.js
//
// Post-event matching: an attendee signals which other attendees from a past
// event they'd like to see again ("I clicked with them"). When two attendees
// pick each other it's a mutual match, and we email both their contact info —
// the "that night at 9pm… if they tell us the same about you, we exchange your
// contact info" promise on /about.
//
// Open to ALL confirmed ticket-holders. (Memberships are paused; this is the
// core post-event value attendees paid for, not a Fire-tier upsell.)
//
// GET  /api/declare-connection
//   → the caller's MOST RECENT past event, with its co-attendees + per-
//     attendee match state (stacking every event someone's ever attended
//     read as confusing, not complete — see handleGet). Runs with the Admin
//     SDK because firestore.rules forbid a browser from reading other users'
//     docs or others' event_registrations (a non-admin client cannot
//     assemble this list itself).
//
// POST /api/declare-connection  { toUserId, eventId }
//   → records a one-directional "like". `fromUserId` is forced to the verified
//     token uid (a client can't spoof it; audit #24). Idempotent. When the
//     reverse like already exists the pair is mutual → email BOTH their contact
//     exactly once, guarded by a `matches/{eventId}_{sortedPair}` create-lock.

const { Resend } = require('resend');
const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { esc, getNextEventForCity } = require('../lib/next-event');
const { verifyMatchToken } = require('../lib/profile-link');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const resend = new Resend(process.env.RESEND_API_KEY);

// "Sarah M." — first name + last initial, never the full surname.
// After the data-model consolidation, event_registrations is the source of
// truth for attendance and carries a `name` field; some users docs (check-in
// or imported accounts) have no `firstName`. Pass the reg `name` as
// `fallbackFull` so a present name is never lost just because it lives on the
// reg doc instead of the user doc.
function shortName(u, fallbackFull) {
  if (u && u.firstName) {
    return u.firstName + (u.lastName ? ' ' + u.lastName.charAt(0) + '.' : '');
  }
  const parts = String(fallbackFull || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) {
    return parts[0] + (parts[1] ? ' ' + parts[1].charAt(0) + '.' : '');
  }
  return 'Member';
}

// Has this user a CONFIRMED record for the event in EITHER collection?
// event_registrations covers check-ins / enrolled guests; tickets covers native
// buyers whose registration row may be missing or dirty. Used as an ADVISORY
// signal only — see the POST handler: a missing record logs a warning but never
// blocks, because messy check-in can leave a real attendee without a clean row,
// and the mutual-match requirement is what actually protects contact info.
async function attendedEvent(uid, eventId) {
  const [regs, tks] = await Promise.all([
    db.collection('event_registrations').where('userId', '==', uid).where('eventId', '==', eventId).get(),
    db.collection('tickets').where('firebaseUid', '==', uid).where('eventId', '==', eventId).get(),
  ]);
  return regs.docs.some(d => d.data().status === 'confirmed')
      || tks.docs.some(d => d.data().status === 'confirmed');
}

// ── It's-a-match email ───────────────────────────────────────────────
// Phone is the agreed contact to exchange; fall back to email, then to a
// graceful "reconnect at the next event" when neither is on file.
function reachLineFor(u) {
  if (u.phone) return esc(u.phone);
  if (u.email) return esc(u.email);
  return 'No direct contact on file yet — reconnect at the next event.';
}

// The referral link below points at the homepage, not /events — index.html
// captures an incoming ?ref= param into localStorage (sparkdate_ref) so it's
// still attributed at checkout; events.html has no equivalent capture logic.
function matchEmailHTML({ youFirstName, theirName, reachLine, eventName, refUid }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f3f0;margin:0;padding:0;color:#0a0e27}
.container{max-width:600px;margin:0 auto;background:#fff}
.header{background:#0a0e27;padding:36px 30px;text-align:center}
.logo{font-family:Georgia,serif;font-size:30px;font-weight:900;color:#fff}.logo span{color:#ff6b6b}
.content{padding:36px 30px}h1{font-family:Georgia,serif;font-size:24px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;color:#1a1f3a;margin:0 0 16px}
.reach{background:#f5f3f0;border-left:3px solid #ff6b6b;padding:16px 20px;margin:16px 0;font-size:16px;line-height:1.7;color:#0a0e27}
.footer{background:#0a0e27;padding:22px;text-align:center;color:#888;font-size:12px}.footer a{color:#ff6b6b;text-decoration:none}
</style></head><body><div class="container">
<div class="header"><div class="logo">Spark<span>Date</span></div></div>
<div class="content">
<h1>It's a match! 🎉</h1>
<p>${esc(youFirstName)}, you and <strong>${esc(theirName)}</strong> both wanted to stay in touch after ${esc(eventName)}.</p>
<div class="reach">Reach ${esc(theirName)}: <strong>${reachLine}</strong></div>
<p>Go say hi — we'll leave the rest to you. 💫</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:20px;">Know someone who'd love a night like this? <a href="https://sparkdate.date/?ref=${esc(refUid)}" style="color:#ff6b6b;font-weight:600;text-decoration:none;">Send them your invite link →</a></p>
</div>
<div class="footer"><p>SparkDate · Lancaster &amp; Philadelphia · Real people. Real venues.</p>
<p><a href="https://sparkdate.date">sparkdate.date</a></p></div>
</div></body></html>`;
}

// Send the two match emails exactly once. A `matches/{eventId}_{sortedPair}`
// doc written with `.create()` is the lock: whichever invocation wins the
// create sends the emails; a double-submit or both-directions race loses the
// create (ALREADY_EXISTS) and no-ops. Best-effort — never throws, so a mail
// failure can't 500 the POST.
async function notifyMatch(aUid, bUid, eventId) {
  const pair = [aUid, bUid].sort();
  const lockId = `${eventId}_${pair[0]}_${pair[1]}`;
  try {
    await db.collection('matches').doc(lockId).create({
      eventId, users: pair, matchedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 6 || /already exists/i.test(e.message || '')) return; // already notified
    console.error('[declare-connection] match lock failed:', e.message);
    return;
  }
  try {
    const [aSnap, bSnap, evSnap, aRegSnap, bRegSnap] = await Promise.all([
      db.collection('users').doc(aUid).get(),
      db.collection('users').doc(bUid).get(),
      db.collection('events').doc(eventId).get(),
      db.collection('event_registrations').doc(`reg_${aUid}_${eventId}`).get(),
      db.collection('event_registrations').doc(`reg_${bUid}_${eventId}`).get(),
    ]);
    if (!aSnap.exists || !bSnap.exists) return;
    const a = aSnap.data(), b = bSnap.data();
    // Reg `name` is the consolidated source of truth; fall back to it when the
    // users doc has no firstName so the match email isn't impersonal.
    const aRegName = aRegSnap.exists ? aRegSnap.data().name : null;
    const bRegName = bRegSnap.exists ? bRegSnap.data().name : null;
    const aFirst = a.firstName || (aRegName ? String(aRegName).trim().split(/\s+/)[0] : '');
    const bFirst = b.firstName || (bRegName ? String(bRegName).trim().split(/\s+/)[0] : '');
    const eventName = (evSnap.exists && evSnap.data().title) || 'your SparkDate event';
    const sends = [];
    if (a.email) sends.push(resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>', to: a.email,
      subject: `It's a match — say hi to ${bFirst || 'your match'}`,
      html: matchEmailHTML({ youFirstName: aFirst || 'there', theirName: shortName(b, bRegName), reachLine: reachLineFor(b), eventName, refUid: aUid }),
    }));
    if (b.email) sends.push(resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>', to: b.email,
      subject: `It's a match — say hi to ${aFirst || 'your match'}`,
      html: matchEmailHTML({ youFirstName: bFirst || 'there', theirName: shortName(a, aRegName), reachLine: reachLineFor(a), eventName, refUid: bUid }),
    }));
    await Promise.all(sends);
    console.log(`[declare-connection] match notified: ${lockId}`);
  } catch (e) {
    console.error('[declare-connection] match email failed:', e.message);
  }
}

// ── GET: caller's past events + co-attendees + per-attendee match state ──
async function handleGet(req, res, uid) {
  // The caller's own confirmed registrations → unique event ids. Read both
  // event_registrations (check-in / enrolled guests) AND tickets (native
  // buyers) so someone who bought a ticket but never scanned the QR can still
  // see their co-attendees. Dedup by eventId across both collections.
  const [myRegSnap, myTkSnap] = await Promise.all([
    db.collection('event_registrations').where('userId', '==', uid).get(),
    db.collection('tickets').where('firebaseUid', '==', uid).get(),
  ]);
  const myEventIds = [...new Set([
    ...myRegSnap.docs.map(d => d.data()).filter(r => r.status === 'confirmed').map(r => r.eventId),
    ...myTkSnap.docs.map(d => d.data()).filter(t => t.status === 'confirmed').map(t => t.eventId),
  ])];
  if (myEventIds.length === 0) return res.status(200).json({ events: [], nextEvent: await getNextEventForCity(db, '') });

  // Keep only PAST events (date < now) — matching is a post-event action.
  const evDocs = await Promise.all(myEventIds.map(id => db.collection('events').doc(id).get()));
  const now = Date.now();
  const allPastEvents = [];
  for (const d of evDocs) {
    if (!d.exists) continue;
    const e = d.data();
    const dt = e.date && e.date.toDate ? e.date.toDate() : (e.date ? new Date(e.date) : null);
    if (!dt || isNaN(dt.getTime()) || dt.getTime() >= now) continue;
    allPastEvents.push({ id: d.id, title: e.title || 'SparkDate Mixer', date: dt.toISOString(), city: e.city || '' });
  }
  if (allPastEvents.length === 0) return res.status(200).json({ events: [], nextEvent: await getNextEventForCity(db, '') });

  // Show only the MOST RECENT event's matches, not the caller's entire
  // attendance history. Stacking every past event someone's ever been to
  // read as confusing rather than complete — a repeat attendee would see
  // old, already-resolved matching lists mixed in above tonight's fresh
  // one. "Current event" here means the last one they attended.
  const pastEvents = [allPastEvents.sort((a, b) => new Date(b.date) - new Date(a.date))[0]];

  // My outgoing + incoming likes, keyed `${otherUid}_${eventId}`.
  const [outSnap, inSnap] = await Promise.all([
    db.collection('connection_intents').where('fromUserId', '==', uid).get(),
    db.collection('connection_intents').where('toUserId', '==', uid).get(),
  ]);
  const sentSet = new Set(outSnap.docs.map(d => `${d.data().toUserId}_${d.data().eventId}`));
  const recvSet = new Set(inSnap.docs.map(d => `${d.data().fromUserId}_${d.data().eventId}`));

  const events = [];
  for (const ev of pastEvents) {
    // Co-attendees from BOTH collections so a ticket buyer whose registration
    // row is missing/dirty is still visible to everyone else (mirrors the
    // caller-side fix above and the cron's union).
    const [regSnap, tkSnap] = await Promise.all([
      db.collection('event_registrations').where('eventId', '==', ev.id).get(),
      db.collection('tickets').where('eventId', '==', ev.id).get(),
    ]);
    const regs = regSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status === 'confirmed' && r.userId !== uid);

    // uid-backed co-attendees (full profile lookup), deduped across collections.
    const otherIds = [...new Set([
      ...regs.filter(r => r.userId).map(r => r.userId),
      ...tkSnap.docs.map(d => d.data())
        .filter(t => t.status === 'confirmed' && t.firebaseUid && t.firebaseUid !== uid)
        .map(t => t.firebaseUid),
    ])];
    // Null-userId guests (account never finalized) — registration rows only.
    const guestRegs = regs.filter(r => !r.userId);

    // uid → name from the reg doc (source of truth post-consolidation), used as
    // a fallback when the users doc has no firstName.
    const regNameByUid = new Map(regs.filter(r => r.userId && r.name).map(r => [r.userId, r.name]));

    const uDocs = await Promise.all(otherIds.map(id => db.collection('users').doc(id).get()));
    const attendees = [];
    const shownEmails = new Set();
    uDocs.forEach((d) => {
      if (!d.exists) return;
      const u = d.data();
      if (u.email) shownEmails.add(String(u.email).toLowerCase().trim());
      const key = `${d.id}_${ev.id}`;
      const sent = sentSet.has(key), received = recvSet.has(key);
      const matched = sent && received;
      const name = shortName(u, regNameByUid.get(d.id));
      const att = {
        uid: d.id,
        displayName: name,
        age: u.age || null,
        gender: u.gender || null,
        intent: u.intent || null,
        state: matched ? 'matched' : (sent ? 'sent' : (received ? 'received' : 'none')),
      };
      // Reveal contact ONLY on a mutual match (both opted in).
      if (matched) att.contact = { name, phone: u.phone || null, email: u.email || null };
      attendees.push(att);
    });
    // Guests without a finalized account — display-only (state 'info', no pick
    // button, since they have no real uid to match against). Skip any already
    // shown via a uid-backed row (matched by email).
    for (const r of guestRegs) {
      const remail = r.email ? String(r.email).toLowerCase().trim() : '';
      if (remail && shownEmails.has(remail)) continue;
      const parts = (r.name || 'Guest').trim().split(' ');
      const displayName = parts[0] + (parts[1] ? ' ' + parts[1].charAt(0) + '.' : '');
      attendees.push({ uid: r.id, displayName, age: null, gender: r.gender || null, intent: null, state: 'info' });
    }
    events.push({ eventId: ev.id, title: ev.title, date: ev.date, city: ev.city, attendees });
  }

  // Next-event + Getaways promo for the matches page itself — this page has
  // a lot of activity and previously suggested nothing commercial. Reuses
  // the SAME city-aware helper as the matching email's next-event mention
  // (api/cron-send-emails.js) so the fallback behavior (same-city preferred,
  // global next-event otherwise) never drifts between the two surfaces.
  // Keyed off the (single) current event's city. getNextEventForCity fails soft
  // internally (never throws), so no extra guard needed here.
  const nextEvent = await getNextEventForCity(db, pastEvents[0] && pastEvents[0].city);

  return res.status(200).json({ events, nextEvent });
}

// Resolve the calling uid from EITHER a no-login match magic link (?uid=&t=,
// in query or body) OR a Firebase ID token (the logged-in /account path).
// A present-but-invalid magic link is rejected outright (no silent fallthrough).
async function resolveCaller(req) {
  const uid = (req.query && req.query.uid) || (req.body && req.body.uid);
  const t = (req.query && req.query.t) || (req.body && req.body.t);
  if (uid && t) {
    if (verifyMatchToken(String(uid), String(t))) return String(uid);
    const e = new Error('This link is invalid or has expired.');
    e.statusCode = 401;
    throw e;
  }
  const decoded = await requireAuth(req);
  return decoded.uid;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();

  let fromUserId;
  try {
    fromUserId = await resolveCaller(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  if (req.method === 'GET') {
    try {
      return await handleGet(req, res, fromUserId);
    } catch (err) {
      console.error('[declare-connection GET] error', err.message);
      return res.status(500).json({ error: 'Could not load connections.' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { toUserId, eventId } = req.body || {};
  if (!toUserId || !eventId) return res.status(400).json({ error: 'Missing toUserId or eventId' });
  if (toUserId === fromUserId) return res.status(400).json({ error: "Can't connect to yourself" });

  try {
    // Advisory attendance check — never blocks. Messy check-in (cross-event
    // contamination, missed scans, manual enrolls) can leave a real attendee
    // without a clean registration row; rejecting them here is worse than the
    // residual risk, because contact info is only revealed on a MUTUAL match
    // (both must pick each other) — an unverified single pick leaks nothing.
    const [meAttended, themAttended] = await Promise.all([
      attendedEvent(fromUserId, eventId),
      attendedEvent(toUserId, eventId),
    ]);
    if (!meAttended) console.warn(`[declare-connection] caller ${fromUserId} unverified for ${eventId} — allowing (advisory)`);
    if (!themAttended) console.warn(`[declare-connection] target ${toUserId} unverified for ${eventId} — allowing (advisory)`);

    // Idempotent "like" via a deterministic doc id (from_to_event) so a
    // double-tap can't create duplicate intent rows (TOCTOU). create() + the
    // ALREADY_EXISTS no-op preserves the original createdAt (mirrors the
    // matches lock pattern below).
    const intentId = `${fromUserId}_${toUserId}_${eventId}`;
    try {
      await db.collection('connection_intents').doc(intentId)
        .create({ fromUserId, toUserId, eventId, createdAt: FieldValue.serverTimestamp() });
    } catch (e) {
      if (!(e.code === 6 || /already exists/i.test(e.message || ''))) throw e;
    }

    // Mutual? If the reverse like exists, it's a match — notify both once.
    const reverse = await db.collection('connection_intents')
      .where('fromUserId', '==', toUserId).where('toUserId', '==', fromUserId).where('eventId', '==', eventId)
      .limit(1).get();
    const matched = !reverse.empty;
    if (matched) await notifyMatch(fromUserId, toUserId, eventId);

    return res.status(200).json({ success: true, matched });
  } catch (err) {
    console.error('[declare-connection] error', err.message);
    return res.status(500).json({ error: 'Could not save connection.' });
  }
};
