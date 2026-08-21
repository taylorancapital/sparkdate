// tests/attendance-index.test.js
//
// Regression coverage for lib/attendance-index.js. This is the exact logic
// that broke email nurture delivery: a confirmed ticket for an UPCOMING
// event was being treated as "already attended," which silently and
// permanently excluded brand-new ticket buyers from the day2/5/14/25
// nurture sequence in api/cron-send-emails.js (they're the intended
// audience for it — first-timer education before the event they haven't
// been to yet).

import { describe, it, expect } from 'vitest';
import { buildAttendanceIndex } from '../lib/attendance-index.js';

const DAY = 86400000;
const NOW = Date.now();
const past = (days) => new Date(NOW - days * DAY);
const future = (days) => new Date(NOW + days * DAY);

describe('buildAttendanceIndex', () => {
  it('treats a confirmed registration for a PAST event as attended', () => {
    const events = [{ id: 'evt_past', date: past(10) }];
    const registrations = [{ email: 'Past@Example.com', userId: 'u1', name: 'Past Attendee', eventId: 'evt_past' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendedEmails.has('past@example.com')).toBe(true);
    expect(idx.pastAttendeeUids.has('u1')).toBe(true);
  });

  it('does NOT treat a confirmed registration for an UPCOMING event as attended (regression case)', () => {
    const events = [{ id: 'evt_future', date: future(20) }];
    const registrations = [{ email: 'newbuyer@example.com', userId: 'u2', name: 'New Buyer', eventId: 'evt_future' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendedEmails.has('newbuyer@example.com')).toBe(false);
    expect(idx.pastAttendeeUids.has('u2')).toBe(false);
    // ...but it DOES suppress the buy-a-ticket pitches: they hold a ticket.
    expect(idx.registeredUpcomingEmails.has('newbuyer@example.com')).toBe(true);
  });

  it('a past-event registration does not enter registeredUpcomingEmails', () => {
    const events = [{ id: 'evt_past', date: past(10) }];
    const registrations = [{ email: 'past@example.com', userId: 'u1', eventId: 'evt_past' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.registeredUpcomingEmails.has('past@example.com')).toBe(false);
  });

  it('marks a uid as registered for the next event when eventId matches', () => {
    const nextEvent = { id: 'evt_next' };
    const events = [{ id: 'evt_next', date: future(5) }];
    const registrations = [{ email: 'x@example.com', userId: 'u3', eventId: 'evt_next' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, nextEvent);
    expect(idx.registeredForNextUids.has('u3')).toBe(true);
  });

  it('does not mark registeredForNextUids when there is no next event', () => {
    const events = [{ id: 'evt_next', date: future(5) }];
    const registrations = [{ email: 'x@example.com', userId: 'u3', eventId: 'evt_next' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.registeredForNextUids.size).toBe(0);
  });

  it('a person can be both a past attendee and registered for the next event', () => {
    const nextEvent = { id: 'evt_next' };
    const events = [{ id: 'evt_past', date: past(30) }, { id: 'evt_next', date: future(5) }];
    const registrations = [
      { email: 'repeat@example.com', userId: 'u4', name: 'Repeat', eventId: 'evt_past' },
      { email: 'repeat@example.com', userId: 'u4', name: 'Repeat', eventId: 'evt_next' },
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, nextEvent);
    expect(idx.pastAttendeeUids.has('u4')).toBe(true);
    expect(idx.registeredForNextUids.has('u4')).toBe(true);
    // Still correctly "attended" overall via the past registration, even
    // though they also have a separate upcoming one — and the upcoming
    // ticket independently lands them in the pitch-suppression set.
    expect(idx.attendedEmails.has('repeat@example.com')).toBe(true);
    expect(idx.registeredUpcomingEmails.has('repeat@example.com')).toBe(true);
  });

  it('builds nameByEmail and attendeeNameByUid on first write, ignoring blank names', () => {
    const events = [{ id: 'evt_past', date: past(10) }];
    const registrations = [
      { email: 'named@example.com', userId: 'u5', name: 'First Name', eventId: 'evt_past' },
      { email: 'named@example.com', userId: 'u5', name: 'Second Name', eventId: 'evt_past' },
      { email: 'noname@example.com', userId: 'u6', name: '', eventId: 'evt_past' },
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.nameByEmail.get('named@example.com')).toBe('First Name');
    expect(idx.attendeeNameByUid.get('u5')).toBe('First Name');
    expect(idx.nameByEmail.has('noname@example.com')).toBe(false);
  });

  it('ignores registrations with no eventId match to any known event (treated as not-past)', () => {
    const events = [{ id: 'evt_past', date: past(10) }];
    const registrations = [{ email: 'orphan@example.com', userId: 'u7', eventId: 'evt_deleted' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendedEmails.has('orphan@example.com')).toBe(false);
    expect(idx.pastAttendeeUids.has('u7')).toBe(false);
    // Orphaned regs suppress nothing in either direction.
    expect(idx.registeredUpcomingEmails.has('orphan@example.com')).toBe(false);
  });

  it('handles an empty registrations/events list', () => {
    const idx = buildAttendanceIndex([], [], NOW, null);
    expect(idx.attendedEmails.size).toBe(0);
    expect(idx.registeredUpcomingEmails.size).toBe(0);
    expect(idx.pastAttendeeUids.size).toBe(0);
    expect(idx.registeredForNextUids.size).toBe(0);
  });
});

// attendanceCountByUid — how many DISTINCT past events someone has attended.
// Exists so the returning-attendee invite can say "round two" vs "you're a
// regular" instead of staying round-agnostic. The double-registration case is
// the one that matters: production data contains a person holding two
// registrations for a single event, and counting rows rather than distinct
// events would call them a returning attendee on their first night.
describe('buildAttendanceIndex — attendance count', () => {
  it('counts one past event as one, not once per registration row', () => {
    const events = [{ id: 'evt_a', date: past(10) }];
    const registrations = [
      { email: 'dup@example.com', userId: 'u1', eventId: 'evt_a' },
      { email: 'dup@example.com', userId: 'u1', eventId: 'evt_a' }, // duplicate row, same event
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.get('u1')).toBe(1);
  });

  it('counts two distinct past events as two', () => {
    const events = [{ id: 'evt_a', date: past(30) }, { id: 'evt_b', date: past(10) }];
    const registrations = [
      { email: 'rep@example.com', userId: 'u2', eventId: 'evt_a' },
      { email: 'rep@example.com', userId: 'u2', eventId: 'evt_b' },
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.get('u2')).toBe(2);
    expect(idx.attendedEventIdsByUid.get('u2').size).toBe(2);
  });

  it('does NOT let an upcoming registration inflate the count', () => {
    const events = [{ id: 'evt_past', date: past(10) }, { id: 'evt_soon', date: future(5) }];
    const registrations = [
      { email: 'mix@example.com', userId: 'u3', eventId: 'evt_past' },
      { email: 'mix@example.com', userId: 'u3', eventId: 'evt_soon' },
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.get('u3')).toBe(1);
  });

  it('leaves a first-time upcoming buyer out of the count entirely', () => {
    const events = [{ id: 'evt_soon', date: future(5) }];
    const registrations = [{ email: 'new@example.com', userId: 'u4', eventId: 'evt_soon' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.has('u4')).toBe(false);
    expect(idx.attendanceCountByUid.get('u4')).toBeUndefined();
  });

  it('ignores registrations with no userId (nothing to key a count on)', () => {
    const events = [{ id: 'evt_a', date: past(10) }];
    const registrations = [{ email: 'guest@example.com', userId: null, eventId: 'evt_a' }];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.size).toBe(0);
    // ...but the email still counts as attended, for nurture suppression.
    expect(idx.attendedEmails.has('guest@example.com')).toBe(true);
  });

  it('keeps counts independent per uid', () => {
    const events = [{ id: 'evt_a', date: past(30) }, { id: 'evt_b', date: past(10) }];
    const registrations = [
      { email: 'a@example.com', userId: 'uA', eventId: 'evt_a' },
      { email: 'a@example.com', userId: 'uA', eventId: 'evt_b' },
      { email: 'b@example.com', userId: 'uB', eventId: 'evt_b' },
    ];
    const idx = buildAttendanceIndex(registrations, events, NOW, null);
    expect(idx.attendanceCountByUid.get('uA')).toBe(2);
    expect(idx.attendanceCountByUid.get('uB')).toBe(1);
  });
});
