// tests/eventbrite-order-id.test.js
//
// Two attendees bought on one Eventbrite order arrived together. That is the
// only way imported data can know it, and until this field was captured the
// seating had no way to sit friends at the same table for 37% of the women who
// come through the door.
//
// The failure mode being pinned here is not "it throws". It is that a party
// key which does not compare equal produces NO error at all — the grouping
// simply stops finding anyone, the seating looks perfectly reasonable, and the
// friends are split. So the type coercion is asserted as hard as the presence.

import { describe, it, expect } from 'vitest';
import { attendeeOrderId } from '../lib/eventbrite.js';

describe('attendeeOrderId', () => {
  it('reads the flat order_id the attendees endpoint returns', () => {
    expect(attendeeOrderId({ order_id: '1234567890' })).toBe('1234567890');
  });

  it('falls back to the expanded order object', () => {
    expect(attendeeOrderId({ order: { id: '99887766' } })).toBe('99887766');
  });

  it('prefers the flat field when both are present', () => {
    expect(attendeeOrderId({ order_id: 'flat', order: { id: 'nested' } })).toBe('flat');
  });

  // Eventbrite has returned this as a number and as a string across API
  // versions. Two attendees on one order, one stored as 12345 and one as
  // "12345", would never group — and nothing would report it.
  it('coerces a numeric id to a string so two attendees on one order match', () => {
    const a = attendeeOrderId({ order_id: 12345 });
    const b = attendeeOrderId({ order_id: '12345' });
    expect(a).toBe('12345');
    expect(a).toBe(b);
  });

  it('is null when the attendee carries no order at all', () => {
    expect(attendeeOrderId({})).toBeNull();
    expect(attendeeOrderId(null)).toBeNull();
    expect(attendeeOrderId(undefined)).toBeNull();
    expect(attendeeOrderId({ order: null })).toBeNull();
  });

  // null, not "", not "null". An empty string is a value that groups every
  // order-less attendee in the room into one enormous fictional party.
  it('is null — never an empty string — for a blank id', () => {
    expect(attendeeOrderId({ order_id: '' })).toBeNull();
    expect(attendeeOrderId({ order_id: null })).toBeNull();
  });

  // Zero is a legitimate id shape and must survive; it is only "" and nullish
  // that mean absent.
  it('keeps a zero id rather than treating it as absent', () => {
    expect(attendeeOrderId({ order_id: 0 })).toBe('0');
  });

  it('groups exactly the attendees who share an order', () => {
    const attendees = [
      { profile: { email: 'dana@example.com' }, order_id: 111 },
      { profile: { email: 'priya@example.com' }, order_id: '111' },
      { profile: { email: 'mel@example.com' }, order_id: 222 },
      { profile: { email: 'ana@example.com' } },
    ];
    const byOrder = new Map();
    attendees.forEach((a) => {
      const k = attendeeOrderId(a);
      if (!k) return;
      if (!byOrder.has(k)) byOrder.set(k, []);
      byOrder.get(k).push(a.profile.email);
    });
    expect([...byOrder.keys()].sort()).toEqual(['111', '222']);
    expect(byOrder.get('111')).toEqual(['dana@example.com', 'priya@example.com']);
    // The attendee with no order is in no party, rather than in a party of
    // everyone else who also has no order.
    expect([...byOrder.values()].flat()).not.toContain('ana@example.com');
  });
});

// The write side. enrollEventbriteOne pulls in the Firebase Admin SDK, so
// rather than stand that up, this asserts the field-shaping rule the writer
// applies — the same "absent means not known" discipline ebFeeCents uses, so
// that a re-import from a source with no order id (the CSV Enroll tab) cannot
// blank out an id a previous Eventbrite sync already stored.
describe('the shape written onto a ticket and registration', () => {
  // Mirrors lib/enroll.js: `const order = ... ? null : String(orderId)` and
  // `...(order !== null ? { orderId: order } : {})`.
  const shape = (orderId) => {
    const order = orderId === undefined || orderId === null || orderId === ''
      ? null : String(orderId);
    return { ...(order !== null ? { orderId: order } : {}) };
  };

  it('writes the field when the caller has an order id', () => {
    expect(shape('1234567890')).toEqual({ orderId: '1234567890' });
    expect(shape(1234567890)).toEqual({ orderId: '1234567890' });
  });

  it('omits the key entirely when the caller has none', () => {
    // Not `{ orderId: null }`. The write is a merge, so writing null would
    // erase an id a previous sync stored; omitting leaves it alone. This is
    // what makes the CSV Enroll tab safe to run over synced attendees.
    expect(shape(undefined)).toEqual({});
    expect(shape(null)).toEqual({});
    expect(shape('')).toEqual({});
    expect(Object.keys(shape(undefined))).toHaveLength(0);
  });
});
