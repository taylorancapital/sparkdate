// tests/listing-redirects.test.js
//
// The short links exist because two listing sites silently corrupted long
// UTM query-strings on the first day anyone tried: AllEvents HTML-escaped the
// ampersands (`&amp;utm_source` — page loads, GA4 attributes nothing) and
// Discover Lancaster's 100-character field cap truncated `utm_campaign` and
// `utm_content` off the end. Neither errored. Both produce a link that works
// and reports nothing, which is the worst failure available: the listing
// looks correct forever and the channel reads as dead.
//
// So the redirect is now load-bearing for attribution, and these assert the
// two ways it could quietly stop being so:
//
//   1. vercel.json drifting out of sync with content/listing-sites.json
//   2. the /l/ path outgrowing the field caps that caused the problem

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { shortPath, taggedUrl, campaignFor, recentPastEvents, PAST_EVENT_GRACE_DAYS } from '../lib/listing-links.js';

const REPO = process.cwd();
const vercel = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));
const sites = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'listing-sites.json'), 'utf8'));
const listingRedirects = vercel.redirects.filter((r) => r.source.startsWith('/l/'));

describe('listing short links', () => {
  it('has at least one, so a missing generator run is visible', () => {
    expect(listingRedirects.length).toBeGreaterThan(0);
  });

  it('every destination carries all four UTM parameters', () => {
    for (const r of listingRedirects) {
      const q = new URL(r.destination).searchParams;
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
        expect(q.get(k), `${r.source} is missing ${k}`).toBeTruthy();
      }
      expect(q.get('utm_medium')).toBe('listing');
      expect(q.get('id'), `${r.source} has no event id`).toBeTruthy();
    }
  });

  it('never uses a permanent redirect', () => {
    // An event's destination is not forever, and a 301 is cached by the
    // browser indefinitely — a corrected link would never be seen by anyone
    // who had already clicked the old one.
    for (const r of listingRedirects) expect(r.permanent).toBe(false);
  });

  it('gives every pair a unique source and a unique utm_content', () => {
    const sources = listingRedirects.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);

    // Sharing a utm_content is the 'proof_rsa1' defect that made 11 ads
    // indistinguishable in GA4. content/brand.json bans it by name.
    const contents = listingRedirects.map((r) => new URL(r.destination).searchParams.get('utm_content'));
    expect(new Set(contents).size).toBe(contents.length);
  });

  it('stays under the field caps that caused this', () => {
    for (const r of listingRedirects) {
      const full = `https://sparkdate.date${r.source}`;
      // Discover Lancaster's URL field truncated at 100.
      expect(full.length, `${full} would be truncated`).toBeLessThanOrEqual(100);
      // Nothing an HTML-escaper can corrupt: no &, no =, no ?.
      expect(r.source).toMatch(/^\/l\/[a-z0-9-]+$/);
    }
  });

  it('matches what lib/listing-links.js builds — vercel.json is not hand-edited', () => {
    // The pack tells a human what to paste; vercel.json decides where it
    // goes. If these two ever disagree, the listing is live and wrong.
    for (const r of listingRedirects) {
      const q = new URL(r.destination).searchParams;
      // [a-z0-9]+, not [a-z]+: brand keys carry digits (TL2 is the second
      // Tellus event) and a letters-only pattern returns null here, which
      // fails as an unreadable "object null is not iterable".
      const m = r.source.match(/^\/l\/([a-z0-9]+)-(.+)$/);
      expect(m, `${r.source} is not a well-formed /l/<event>-<site> path`).toBeTruthy();
      const [, eventKey, siteSlug] = m;
      const site = sites.sites.find((x) => x.key.replace(/_/g, '-') === siteSlug);
      expect(site, `${r.source} names a site not in listing-sites.json`).toBeTruthy();
      expect(q.get('utm_source')).toBe(site.utm_source);
      expect(q.get('utm_content')).toBe(`${eventKey}_${site.key}`);
      expect(shortPath({ key: eventKey.toUpperCase() }, site)).toBe(r.source);
    }
  });

  it('builds a campaign key that does not go stale mid-month', () => {
    // The old shape was 'week3_Solution', which was wrong by construction the
    // following month. brand.json's format is {event_key}_{YYYYMM}.
    expect(campaignFor('lx', new Date('2026-09-22T22:30:00Z'))).toBe('lx_202609');
    // A brand key may contain a digit — TL2 is the second Tellus event, and a
    // letters-only assertion here went red the moment its routes were generated.
    expect(campaignFor('tl2', new Date('2026-10-06T22:30:00Z'))).toBe('tl2_202610');
    for (const r of listingRedirects) {
      expect(new URL(r.destination).searchParams.get('utm_campaign')).toMatch(/^[a-z0-9]+_\d{6}$/);
    }
  });

  // A past event's links do not stop mattering when the event ends. On
  // 2026-09-09 a --write deleted all 19 /l/mc-* routes the morning after
  // Marion Court ran, because fetchUpcomingEvents() drops an event the instant
  // its start time passes. Those links were live inside listings on Patch,
  // AllEvents and Nextdoor — which stay up until a human removes them — so
  // every one of them became a 404.
  describe('past events keep their short links', () => {
    const brandEvents = JSON.parse(
      fs.readFileSync(path.join(REPO, 'content', 'brand.json'), 'utf8'),
    ).events;

    it('keeps an event inside the grace window and drops one outside it', () => {
      const now = new Date('2026-09-09T12:00:00Z');
      const b = {
        events: {
          YESTERDAY: { event_id: 'past-recent', date: '2026-09-08' },
          TOMORROW: { event_id: 'upcoming', date: '2026-09-10' },
          ANCIENT: { event_id: 'past-old', date: '2024-01-01' },
          NOID: { date: '2026-09-08' },
        },
      };
      const ids = recentPastEvents(b, now).map((e) => e.id);
      expect(ids).toContain('past-recent');
      expect(ids).not.toContain('upcoming'); // still on the sitemap, not ours to add
      expect(ids).not.toContain('past-old'); // beyond the window
      expect(ids).toHaveLength(1); // the entry with no event_id is skipped
    });

    it('puts the boundary exactly at the grace window', () => {
      const now = new Date('2026-09-09T12:00:00Z');
      const inside = new Date(now.getTime() - (PAST_EVENT_GRACE_DAYS - 1) * 86400000);
      const outside = new Date(now.getTime() - (PAST_EVENT_GRACE_DAYS + 1) * 86400000);
      const day = (d) => d.toISOString().slice(0, 10);
      const b = {
        events: {
          IN: { event_id: 'in', date: day(inside) },
          OUT: { event_id: 'out', date: day(outside) },
        },
      };
      const ids = recentPastEvents(b, now).map((e) => e.id);
      expect(ids).toEqual(['in']);
    });

    it('vercel.json carries routes for EVERY past event still inside the window', () => {
      // Not "at least one": Marion Court alone losing its 19 routes is the
      // whole incident, and an any-past-event-will-do assertion would have
      // stayed green throughout it as long as some other event survived.
      const idsWithRoutes = new Set(
        listingRedirects.map((r) => new URL(r.destination).searchParams.get('id')),
      );
      const expected = recentPastEvents({ events: brandEvents });
      expect(
        expected.length,
        'no past event is inside the grace window, so this test proves nothing — ' +
          'check PAST_EVENT_GRACE_DAYS against the dates in content/brand.json',
      ).toBeGreaterThan(0);

      for (const ev of expected) {
        expect(
          idsWithRoutes.has(ev.id),
          `event ${ev.id} (${ev.start.toISOString().slice(0, 10)}) has no /l/ route. ` +
            'A --write has dropped a past event again; any listing still live on ' +
            'Patch/AllEvents/Nextdoor pointing at it now serves a 404.',
        ).toBe(true);
      }
    });
  });

  it('tags a destination without ever double-tagging it', () => {
    // brand.json: "UTMs live in url_tags OR in the destination link, never
    // both" — an ad carrying both sends two utm_source values.
    const event = { url: 'https://sparkdate.date/event?id=ABC', start: new Date('2026-09-22T22:30:00Z') };
    const site = { key: 'allevents', utm_source: 'allevents' };
    const once = taggedUrl(event, { key: 'LX' }, site, { medium: 'listing' });
    const twice = taggedUrl({ ...event, url: once }, { key: 'LX' }, site, { medium: 'listing' });
    expect(twice).toBe(once);
    expect((twice.match(/utm_source=/g) || []).length).toBe(1);
  });
});
