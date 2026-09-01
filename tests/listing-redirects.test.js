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
import { shortPath, taggedUrl, campaignFor } from '../lib/listing-links.js';

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
      const [, eventKey, siteSlug] = r.source.match(/^\/l\/([a-z]+)-(.+)$/);
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
    for (const r of listingRedirects) {
      expect(new URL(r.destination).searchParams.get('utm_campaign')).toMatch(/^[a-z]+_\d{6}$/);
    }
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
