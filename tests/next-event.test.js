// tests/next-event.test.js
//
// Coverage for lib/next-event.js — the shared "next upcoming event" lookup
// and the inline-styled email card. These power the dynamic event shown in
// every marketing email, so a regression here ships wrong dates/venues to
// real leads.

import { describe, it, expect } from 'vitest';
import { normalizeEvent, getNextEvent, eventCardHtml } from '../lib/next-event.js';

const DAY = 86400000;
const future = (days) => new Date(Date.now() + days * DAY);

// Minimal Firestore-like db whose events come back in the given order
// (getNextEvent relies on orderBy('date','asc'), which we pre-sort here).
function mockDb(events) {
  return {
    collection: () => ({
      orderBy: () => ({
        get: async () => ({ docs: events.map((e) => ({ id: e.id, data: () => e })) }),
      }),
    }),
  };
}

describe('normalizeEvent', () => {
  it('builds human labels from a raw event', () => {
    const ev = normalizeEvent('evt1', {
      title: 'Rooftop Mixer',
      date: future(10),
      time: '6:30 PM',
      venue: 'American Bar & Grill',
      neighborhood: 'Lancaster',
      price: 25,
    });
    expect(ev.title).toBe('Rooftop Mixer');
    expect(ev.venueLabel).toBe('American Bar & Grill, Lancaster');
    expect(ev.priceLabel).toBe('$25');
    expect(ev.timeLabel).toBe('6:30 PM');
    expect(ev.dateLabel).not.toBe('');
    expect(ev.daysAwayLabel).toBe('in 10 days');
    expect(ev.ticketPath).toBe('/event?id=evt1');
  });

  it('labels a free event and tomorrow correctly', () => {
    const ev = normalizeEvent('e2', { date: future(1), price: 0, venue: 'Tavern' });
    expect(ev.priceLabel).toBe('Free');
    expect(ev.daysAwayLabel).toBe('Tomorrow');
  });

  it('falls back to legacy gender-split price', () => {
    const ev = normalizeEvent('e3', { date: future(3), priceMen: 30 });
    expect(ev.priceLabel).toBe('$30');
  });
});

describe('getNextEvent', () => {
  it('returns the soonest upcoming, not-full event', async () => {
    const db = mockDb([
      { id: 'past', date: future(-5), venue: 'Old' },
      { id: 'soon', date: future(4), venue: 'Soon' },
      { id: 'later', date: future(20), venue: 'Later' },
    ]);
    const ev = await getNextEvent(db);
    expect(ev.id).toBe('soon');
  });

  it('skips sold-out events', async () => {
    const db = mockDb([
      { id: 'full', date: future(2), venue: 'Full', status: 'full' },
      { id: 'open', date: future(6), venue: 'Open' },
    ]);
    expect((await getNextEvent(db)).id).toBe('open');
  });

  it('returns null when nothing is upcoming', async () => {
    const db = mockDb([{ id: 'past', date: future(-1) }]);
    expect(await getNextEvent(db)).toBeNull();
  });

  it('fails soft to null if the query throws', async () => {
    const db = { collection: () => ({ orderBy: () => ({ get: async () => { throw new Error('boom'); } }) }) };
    expect(await getNextEvent(db)).toBeNull();
  });
});

describe('eventCardHtml', () => {
  it('renders the event details when given an event', () => {
    const ev = normalizeEvent('e1', { title: 'Mixer', date: future(5), venue: 'Tavern', neighborhood: 'Fishtown', price: 18 });
    const html = eventCardHtml(ev);
    expect(html).toContain('Mixer');
    expect(html).toContain('Tavern, Fishtown');
    expect(html).toContain('$18');
    expect(html).toContain('in 5 days');
    expect(html).not.toContain('undefined');
  });

  it('renders an evergreen fallback (no undefined) when event is null', () => {
    const html = eventCardHtml(null);
    expect(html).toContain('New mixers drop regularly');
    expect(html).not.toContain('undefined');
  });

  it('escapes HTML in admin-entered fields', () => {
    const ev = normalizeEvent('x', { title: '<script>x</script>', date: future(2), venue: 'V' });
    const html = eventCardHtml(ev);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
