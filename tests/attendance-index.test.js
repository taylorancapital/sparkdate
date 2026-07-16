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
