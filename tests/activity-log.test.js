// tests/activity-log.test.js
//
// Coverage for lib/activity-log.js — the REAL "attended" activity-feed
// write, which must only ever fire at door check-in or via the post-event
// cron pass (never at ticket-purchase time — that was the bug: the feed
// could show "X attended [future event]" before the event happened).

import { describe, it, expect } from 'vitest';
import { logEventAttended, logTicketEnrolled, lockId } from '../lib/activity-log.js';

// Minimal Firestore-like db: an in-memory map keyed by "collection/docId",
// plus an `activity` array collecting every .add() call so tests can assert
// on what would have been written to the feed.
function mockDb() {
  const locks = new Map();
  const activity = [];
  // logTicketEnrolled addresses `activity` by a deterministic doc id rather
  // than .add(), so the mock has to serve both shapes off the one collection.
  const activityDocs = new Map();
  return {
    _locks: locks,
    _activity: activity,
    _activityDocs: activityDocs,
    collection(name) {
      if (name === 'activity') {
        return {
          add: async (data) => { activity.push(data); return { id: `act_${activity.length}` }; },
          doc: (id) => ({
            get: async () => ({ exists: activityDocs.has(id), data: () => activityDocs.get(id) }),
            set: async (data) => { activityDocs.set(id, data); },
          }),
        };
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

// The other half of the feed: a ticket that arrived through lib/enroll.js
// (Eventbrite, Meetup, a manual import, a comp) rather than web checkout.
// Until this existed, `activity` had exactly one ticket writer and the feed
// showed direct sales only — with Eventbrite at roughly half of all volume.
describe('logTicketEnrolled', () => {
  const base = {
    ticketId: 'eb_uid1_evt1', uid: 'uid1', email: 'a@example.com', name: 'Aaron',
    eventId: 'evt1', eventName: 'Rooftop Mixer', amountCents: 2500,
    channel: 'eventbrite_import',
  };

  it('writes a ticket_purchased entry under a ticket-derived doc id', async () => {
    const db = mockDb();
    const result = await logTicketEnrolled(db, FieldValue, base);
    expect(result.logged).toBe(true);
    expect(db._activityDocs.get('tix_eb_uid1_evt1')).toMatchObject({
      type: 'ticket_purchased',
      userId: 'uid1',
      userEmail: 'a@example.com',
      userName: 'Aaron',
      details: {
        eventName: 'Rooftop Mixer',
        channel: 'eventbrite_import',
        isComp: false,
        eventId: 'evt1',
        ticketId: 'eb_uid1_evt1',
      },
    });
  });

  it('converts cents to the dollars the feed renderer formats', async () => {
    const db = mockDb();
    await logTicketEnrolled(db, FieldValue, { ...base, amountCents: 3249 });
    expect(db._activityDocs.get('tix_eb_uid1_evt1').details.amount).toBe(32.49);
  });

  it('is a no-op on a re-run for the same ticket — the sync re-reads a 45-day window every 6h', async () => {
    const db = mockDb();
    await logTicketEnrolled(db, FieldValue, base);
    const second = await logTicketEnrolled(db, FieldValue, { ...base, amountCents: 9999 });
    expect(second).toEqual({ logged: false, reason: 'already_logged' });
    expect(db._activityDocs.size).toBe(1);
    // The first write stands; a repeat must not restate the sale at a new price.
    expect(db._activityDocs.get('tix_eb_uid1_evt1').details.amount).toBe(25);
  });

  it('refuses without a ticketId — there would be no idempotency key', async () => {
    const db = mockDb();
    expect(await logTicketEnrolled(db, FieldValue, { ...base, ticketId: undefined }))
      .toEqual({ logged: false, reason: 'missing ticketId' });
    expect(db._activityDocs.size).toBe(0);
  });

  it('marks a comp so the feed does not call a free seat a purchase', async () => {
    const db = mockDb();
    await logTicketEnrolled(db, FieldValue, { ...base, ticketId: 'comp_uid1_evt1', channel: 'comp', isComp: true, amountCents: 0 });
    expect(db._activityDocs.get('tix_comp_uid1_evt1').details).toMatchObject({ isComp: true, amount: 0, channel: 'comp' });
  });

  it('stamps a caller-supplied createdAt, so a backfill lands at the original sale date', async () => {
    const db = mockDb();
    const when = new Date('2026-07-15T18:00:00Z');
    await logTicketEnrolled(db, FieldValue, { ...base, createdAt: when });
    expect(db._activityDocs.get('tix_eb_uid1_evt1').createdAt).toBe(when);
  });

  it('falls back to a server timestamp when the caller has no date (the live enrollment path)', async () => {
    const db = mockDb();
    await logTicketEnrolled(db, FieldValue, base);
    expect(db._activityDocs.get('tix_eb_uid1_evt1').createdAt).toBe('FAKE_SERVER_TIMESTAMP');
  });

  it('defaults a missing channel to direct rather than inventing a marketplace', async () => {
    const db = mockDb();
    await logTicketEnrolled(db, FieldValue, { ...base, channel: undefined });
    expect(db._activityDocs.get('tix_eb_uid1_evt1').details.channel).toBe('direct');
  });

  it('treats two tickets for the same person at different events as separate sales', async () => {
    const db = mockDb();
    const a = await logTicketEnrolled(db, FieldValue, base);
    const b = await logTicketEnrolled(db, FieldValue, { ...base, ticketId: 'eb_uid1_evt2', eventId: 'evt2' });
    expect(a.logged).toBe(true);
    expect(b.logged).toBe(true);
    expect(db._activityDocs.size).toBe(2);
  });
});
