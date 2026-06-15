// api/declare-connection.js
//
// Post-event matching: an attendee signals which other attendees from a past
// event they'd like to see again ("I clicked with them"). When two attendees
// pick each other it's a mutual match, and we email both their contact info —
// the "morning after… if they tell us the same about you, we exchange your
// contact info" promise on /about.
//
// Open to ALL confirmed ticket-holders. (Memberships are paused; this is the
// core post-event value attendees paid for, not a Fire-tier upsell.)
//
// GET  /api/declare-connection
//   → the caller's PAST events with co-attendees + per-attendee match state.
//     Runs with the Admin SDK because firestore.rules forbid a browser from
//     reading other users' docs or others' event_registrations (a non-admin
//     client cannot assemble this list itself).
//
// POST /api/declare-connection  { toUserId, eventId }
//   → records a one-directional "like". `fromUserId` is forced to the verified
//     token uid (a client can't spoof it; audit #24). Idempotent. When the
//     reverse like already exists the pair is mutual → email BOTH their contact
//     exactly once, guarded by a `matches/{eventId}_{sortedPair}` create-lock.

const { Resend } = require('resend');
const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');
const { esc } = require('../lib/next-event');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const resend = new Resend(process.env.RESEND_API_KEY);

// "Sarah M." — first name + last initial, never the full surname.
function shortName(u) {
  return (u.firstName || 'Member') + ' ' + (u.lastName || '').charAt(0) + (u.lastName ? '.' : '');
}

// CONFIRMED registration present for this user? (audit H1: failed / expired /
// pending_3ds rows must not count as "attended".)
function attended(regDocs, userId) {
  return regDocs.some(d => { const r = d.data(); return r.userId === userId && r.status === 'confirmed'; });
}

// ── It's-a-match email ───────────────────────────────────────────────
// Phone is the agreed contact to exchange; fall back to email, then to a
// graceful "reconnect at the next event" when neither is on file.
function reachLineFor(u) {
  if (u.phone) return esc(u.phone);
  if (u.email) return esc(u.email);
  return 'No direct contact on file yet — reconnect at the next event.';
}

function matchEmailHTML({ youFirstName, theirName, reachLine, eventName }) {
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
</div>
<div class="footer"><p>SparkDate · Philadelphia · Real people. Real venues.</p>
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
    const [aSnap, bSnap, evSnap] = await Promise.all([
      db.collection('users').doc(aUid).get(),
      db.collection('users').doc(bUid).get(),
      db.collection('events').doc(eventId).get(),
    ]);
    if (!aSnap.exists || !bSnap.exists) return;
    const a = aSnap.data(), b = bSnap.data();
    const eventName = (evSnap.exists && evSnap.data().title) || 'your SparkDate event';
    const sends = [];
    if (a.email) sends.push(resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>', to: a.email,
      subject: `It's a match — say hi to ${b.firstName || 'your match'}`,
      html: matchEmailHTML({ youFirstName: a.firstName || 'there', theirName: shortName(b), reachLine: reachLineFor(b), eventName }),
    }));
    if (b.email) sends.push(resend.emails.send({
      from: 'SparkDate <hello@mail.sparkdate.date>', to: b.email,
      subject: `It's a match — say hi to ${a.firstName || 'your match'}`,
      html: matchEmailHTML({ youFirstName: b.firstName || 'there', theirName: shortName(a), reachLine: reachLineFor(a), eventName }),
    }));
    await Promise.all(sends);
    console.log(`[declare-connection] match notified: ${lockId}`);
  } catch (e) {
    console.error('[declare-connection] match email failed:', e.message);
  }
}

// ── GET: caller's past events + co-attendees + per-attendee match state ──
async function handleGet(req, res, uid) {
  // The caller's own confirmed registrations → unique event ids (reading your
  // OWN registrations is allowed by the rules, but we use Admin SDK anyway).
  const myRegSnap = await db.collection('event_registrations').where('userId', '==', uid).get();
  const myEventIds = [...new Set(
    myRegSnap.docs.map(d => d.data()).filter(r => r.status === 'confirmed').map(r => r.eventId)
  )];
  if (myEventIds.length === 0) return res.status(200).json({ events: [] });

  // Keep only PAST events (date < now) — matching is a post-event action.
  const evDocs = await Promise.all(myEventIds.map(id => db.collection('events').doc(id).get()));
  const now = Date.now();
  const pastEvents = [];
  for (const d of evDocs) {
    if (!d.exists) continue;
    const e = d.data();
    const dt = e.date && e.date.toDate ? e.date.toDate() : (e.date ? new Date(e.date) : null);
    if (!dt || isNaN(dt.getTime()) || dt.getTime() >= now) continue;
    pastEvents.push({ id: d.id, title: e.title || 'SparkDate Mixer', date: dt.toISOString() });
  }
  if (pastEvents.length === 0) return res.status(200).json({ events: [] });

  // My outgoing + incoming likes, keyed `${otherUid}_${eventId}`.
  const [outSnap, inSnap] = await Promise.all([
    db.collection('connection_intents').where('fromUserId', '==', uid).get(),
    db.collection('connection_intents').where('toUserId', '==', uid).get(),
  ]);
  const sentSet = new Set(outSnap.docs.map(d => `${d.data().toUserId}_${d.data().eventId}`));
  const recvSet = new Set(inSnap.docs.map(d => `${d.data().fromUserId}_${d.data().eventId}`));

  const events = [];
  for (const ev of pastEvents) {
    const regSnap = await db.collection('event_registrations').where('eventId', '==', ev.id).get();
    const otherIds = [...new Set(
      regSnap.docs.map(d => d.data())
        .filter(r => r.status === 'confirmed' && r.userId && r.userId !== uid)
        .map(r => r.userId)
    )];
    const uDocs = await Promise.all(otherIds.map(id => db.collection('users').doc(id).get()));
    const attendees = [];
    uDocs.forEach((d) => {
      if (!d.exists) return;
      const u = d.data();
      const key = `${d.id}_${ev.id}`;
      const sent = sentSet.has(key), received = recvSet.has(key);
      const matched = sent && received;
      const att = {
        uid: d.id,
        displayName: shortName(u),
        age: u.age || null,
        gender: u.gender || null,
        intent: u.intent || null,
        state: matched ? 'matched' : (sent ? 'sent' : (received ? 'received' : 'none')),
      };
      // Reveal contact ONLY on a mutual match (both opted in).
      if (matched) att.contact = { name: shortName(u), phone: u.phone || null, email: u.email || null };
      attendees.push(att);
    });
    events.push({ eventId: ev.id, title: ev.title, date: ev.date, attendees });
  }
  return res.status(200).json({ events });
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }
  const fromUserId = decoded.uid;

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
    // Both parties must have a CONFIRMED registration for this event.
    const [myRegSnap, theirRegSnap] = await Promise.all([
      db.collection('event_registrations').where('userId', '==', fromUserId).where('eventId', '==', eventId).get(),
      db.collection('event_registrations').where('userId', '==', toUserId).where('eventId', '==', eventId).get(),
    ]);
    if (!attended(myRegSnap.docs, fromUserId)) return res.status(403).json({ error: 'You did not attend this event' });
    if (!attended(theirRegSnap.docs, toUserId)) return res.status(404).json({ error: 'That person did not attend this event' });

    // Idempotent insert of my "like".
    const existing = await db.collection('connection_intents')
      .where('fromUserId', '==', fromUserId).where('toUserId', '==', toUserId).where('eventId', '==', eventId)
      .limit(1).get();
    if (existing.empty) {
      await db.collection('connection_intents').add({ fromUserId, toUserId, eventId, createdAt: FieldValue.serverTimestamp() });
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
