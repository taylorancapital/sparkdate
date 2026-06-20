// api/checkin.js
//
// Door check-in for an event. Admin-operated (the host on an iPad/phone).
// For each attendee it captures email / first name / gender / first-time? /
// photo consent and ENROLLS them into the system so the post-event matching
// works for everyone — native buyers, Eventbrite buyers, and walk-ins alike.
//
// Per submit:
//   1. Find the Firebase Auth user by email; create one if new (passwordless —
//      no email is sent at the door; matching reaches them via a magic link).
//   2. Merge firstTimeAttendee / photoConsent / checkedInAt onto the user doc.
//   3. Upsert an idempotent CONFIRMED event_registration for (uid, eventId) —
//      native buyers already have one (just mark it checked in); never dupe.
//
// Admin-only: requireAdmin verifies the Firebase `admin` custom claim. All
// writes use the Admin SDK (bypasses firestore.rules, which are server-only
// for users/event_registrations).

const crypto = require('crypto');
const { admin, requireAdmin } = require('../lib/auth');
const { applyCors } = require('../lib/cors');

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ error: e.message });
  }

  const body = req.body || {};
  const email = String(body.email || '').toLowerCase().trim();
  const eventId = String(body.eventId || '').trim();
  const eventTitle = String(body.eventTitle || '').trim() || 'SparkDate event';
  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const gender = body.gender === 'woman' || body.gender === 'man' ? body.gender : null;
  const phone = String(body.phone || '').trim().slice(0, 50);
  const firstTime = body.firstTime === true || body.firstTime === 'true';
  const photoConsent = body.photoConsent === true || body.photoConsent === 'true';

  // Minimal email sanity (matching is keyed off a real, reachable address).
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!eventId) return res.status(400).json({ error: 'Missing eventId.' });

  try {
    // 1. Find or create the Firebase Auth user.
    let userRecord = null;
    let createdUser = false;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
    if (!userRecord) {
      userRecord = await admin.auth().createUser({
        email,
        // Throwaway — check-in attendees reach matching via a magic link, not login.
        password: crypto.randomBytes(32).toString('hex'),
        emailVerified: false,
      });
      createdUser = true;
    }
    const uid = userRecord.uid;

    // 2. Upsert the user doc. For a brand-new user, write the full baseline
    //    (mirrors enrollGuestAsMember); for an existing one, only merge the
    //    check-in fields + fill blanks (never clobber a completed profile).
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const checkInFields = {
      firstTimeAttendee: firstTime,
      photoConsent,
      checkedInAt: FieldValue.serverTimestamp(),
      lastCheckedInEventId: eventId,
    };
    if (!userSnap.exists) {
      await userRef.set({
        email,
        firstName,
        lastName: '',
        phone,
        gender,
        tier: 'free',
        stripeCustomerId: null,
        subscriptionId: null,
        subscriptionStatus: null,
        source: 'checkin',
        profileCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
        ...checkInFields,
      });
    } else {
      const existing = userSnap.data();
      const fill = {};
      if (firstName && !existing.firstName) fill.firstName = firstName;
      if (phone && !existing.phone) fill.phone = phone;
      if (gender && !existing.gender) fill.gender = gender;
      await userRef.set({ ...fill, ...checkInFields }, { merge: true });
    }

    // 3. Upsert an idempotent CONFIRMED event_registration for (uid, eventId).
    //    Native buyers already have one → mark checked in, don't duplicate.
    const regSnap = await db.collection('event_registrations')
      .where('userId', '==', uid).where('eventId', '==', eventId).limit(1).get();
    let alreadyRegistered = false;
    if (!regSnap.empty) {
      alreadyRegistered = true;
      await regSnap.docs[0].ref.set({
        status: 'confirmed',
        checkedInAt: FieldValue.serverTimestamp(),
        firstTimeAttendee: firstTime,
        photoConsent,
      }, { merge: true });
    } else {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await db.collection('event_registrations').add({
        userId: uid,
        email,
        name: firstName,
        phone,
        gender,
        eventId,
        eventTitle,
        ticketId: null,
        paymentIntentId: null,
        status: 'confirmed',
        source: 'checkin',
        firstTimeAttendee: firstTime,
        photoConsent,
        month: monthKey,
        checkedInAt: FieldValue.serverTimestamp(),
        registeredAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({ success: true, uid, createdUser, alreadyRegistered });
  } catch (err) {
    console.error('[checkin] error', err.message);
    return res.status(500).json({ error: 'Check-in failed. Try again.' });
  }
};
