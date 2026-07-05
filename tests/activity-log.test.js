// tests/activity-log.test.js
//
// Coverage for lib/activity-log.js — the REAL "attended" activity-feed
// write, which must only ever fire at door check-in or via the post-event
// cron pass (never at ticket-purchase time — that was the bug: the feed
// could show "X attended [future event]" before the event happened).

import { describe, it, expect } from 'vitest';
import { logEventAttended, lockId } from '../lib/activity-log.js';

// Minimal Firestore-like db: an in-memory map keyed by "collection/docId",
// plus an `activity` array collecting every .add() call so tests can assert
// on what would have been written to the feed.
function mockDb() {
  const locks = new Map();
  const activity = [];
  return {
    _locks: locks,
    _activity: activity,
    collection(name) {
      if (name === 'activity') {
        return { add: async (data) => { activity.push(data); return { id: `act_${activity.length}` }; } };
      }
      if (name === 'event_attendance_logged') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: locks.has(id), data: () => locks.get(id) }),
            set: async (data) => { locks.set(id, data); },
          }),
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

const FieldValue = { serverTimestamp: () => 'FAKE_SERVER_TIMESTAMP' };

describe('lockId', () => {
  it('joins uid and eventId', () => {
    expect(lockId('uid1', 'evt1')).toBe('uid1_evt1');
  });
});

describe('logEventAttended', () => {
  it('writes an activity entry and a lock doc on first call', async () => {
    const db = mockDb();
    const result = await logEventAttended(db, FieldValue, {
      uid: 'uid1', email: 'a@example.com', name: 'Aaron', eventId: 'evt1', eventName: 'Rooftop Mixer', method: 'checkin',
    });
    expect(result.logged).toBe(true);
    expect(db._activity).toHaveLength(1);
    expect(db._activity[0]).toMatchObject({
      type: 'event_attended',
      userId: 'uid1',
      userEmail: 'a@example.com',
      userName: 'Aaron',
      details: { eventName: 'Rooftop Mixer' },
    });
    expect(db._locks.get('uid1_evt1')).toMatchObject({ userId: 'uid1', eventId: 'evt1', method: 'checkin' });
  });

  it('is a no-op on a second call for the same uid+eventId (idempotent)', async () => {
    const db = mockDb();
    await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt1', method: 'checkin' });
    const second = await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt1', method: 'post_event_pass' });
    expect(second).toEqual({ logged: false, reason: 'already_logged' });
    expect(db._activity).toHaveLength(1); // still just the one from the first call
  });

  it('lets check-in and the post-event pass race safely — whichever runs first wins', async () => {
    const db = mockDb();
    const checkin = await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt1', method: 'checkin' });
    const postEvent = await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt1', method: 'post_event_pass' });
    expect(checkin.logged).toBe(true);
    expect(postEvent.logged).toBe(false);
    expect(db._activity).toHaveLength(1);
  });

  it('treats different events for the same uid as independent', async () => {
    const db = mockDb();
    const first = await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt1', method: 'checkin' });
    const second = await logEventAttended(db, FieldValue, { uid: 'uid1', eventId: 'evt2', method: 'checkin' });
    expect(first.logged).toBe(true);
    expect(second.logged).toBe(true);
    expect(db._activity).toHaveLength(2);
  });

  it('refuses to log without a uid or eventId (no confirmed registration to attribute it to)', async () => {
    const db = mockDb();
    expect(await logEventAttended(db, FieldValue, { eventId: 'evt1' })).toEqual({ logged: false, reason: 'missing uid/eventId' });
    expect(await logEventAttended(db, FieldValue, { uid: 'uid1' })).toEqual({ logged: false, reason: 'missing uid/eventId' });
    expect(db._activity).toHaveLength(0);
  });
});
