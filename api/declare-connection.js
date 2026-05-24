// api/declare-connection.js
//
// A Fire-tier member declares interest in another past-event attendee.
// Previously this was written directly from the browser, meaning a
// signed-in user could spoof `fromUserId` and create intents in
// someone else's name (audit #24).
//
// Server-side path:
//   - Verifies ID token; `fromUserId` is forced to decoded.uid
//   - Verifies the requester actually attended `eventId` (registered)
//   - Verifies the target user exists
//   - Idempotent: re-declaring the same intent is a no-op

const { admin, requireAuth } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let decoded;
  try {
    decoded = await requireAuth(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }
  const fromUserId = decoded.uid;

  const { toUserId, eventId } = req.body || {};
  if (!toUserId || !eventId) {
    return res.status(400).json({ error: 'Missing toUserId or eventId' });
  }
  if (toUserId === fromUserId) {
    return res.status(400).json({ error: "Can't connect to yourself" });
  }

  try {
    // Confirm requester is a Fire member — the feature is tier-gated.
    const meSnap = await db.collection('users').doc(fromUserId).get();
    if (!meSnap.exists) return res.status(404).json({ error: 'User not found' });
    if (meSnap.data().tier !== 'premium') {
      return res.status(403).json({
        error: 'Fire tier required',
        message: 'Connections are a Fire-tier feature. Upgrade to enable.',
      });
    }

    // Confirm requester actually attended the event AND payment confirmed
    // (audit H1: failed/expired/pending_3ds rows must not count as
    // "attended"). Drop the .limit(1) so we don't risk picking a failed
    // row when a later confirmed row also exists for the same user×event.
    const myRegSnap = await db.collection('event_registrations')
      .where('userId', '==', fromUserId)
      .where('eventId', '==', eventId)
      .get();
    if (!myRegSnap.docs.some(d => d.data().status === 'confirmed')) {
      return res.status(403).json({ error: 'You did not attend this event' });
    }

    // Confirm target attended the same event (same status check).
    const theirRegSnap = await db.collection('event_registrations')
      .where('userId', '==', toUserId)
      .where('eventId', '==', eventId)
      .get();
    if (!theirRegSnap.docs.some(d => d.data().status === 'confirmed')) {
      return res.status(404).json({ error: 'That person did not attend this event' });
    }

    // Idempotent: if intent already exists, return success.
    const existing = await db.collection('connection_intents')
      .where('fromUserId', '==', fromUserId)
      .where('toUserId',   '==', toUserId)
      .where('eventId',    '==', eventId)
      .limit(1).get();
    if (!existing.empty) {
      return res.status(200).json({ success: true, intentId: existing.docs[0].id, duplicate: true });
    }

    const ref = await db.collection('connection_intents').add({
      fromUserId,
      toUserId,
      eventId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, intentId: ref.id });
  } catch (err) {
    console.error('[declare-connection] error', err.message);
    return res.status(500).json({ error: 'Could not save connection.' });
  }
};
