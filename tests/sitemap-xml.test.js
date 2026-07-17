// tests/sitemap-xml.test.js
//
// Coverage for lib/sitemap-xml.js — the pure renderer behind the dynamic
// /sitemap.xml (api/next-event.js ?render=sitemap). The caller filters
// which events belong (upcoming only); this module must render whatever
// it's given without producing invalid XML, "Invalid Date" lastmods, or
// dropped static pages.

import { describe, it, expect } from 'vitest';
import { buildSitemapXml, xmlEscape, STATIC_PATHS, SITE } from '../lib/sitemap-xml.js';

describe('buildSitemapXml', () => {
  it('renders every static path with no lastmod', () => {
    const xml = buildSitemapXml([]);
    for (const p of STATIC_PATHS) {
      expect(xml).toContain(`<loc>${SITE}${p}</loc>`);
    }
    expect(xml).not.toContain('<lastmod>');
    // Exactly one <url> per static path, no strays.
    expect(xml.match(/<url>/g)).toHaveLength(STATIC_PATHS.length);
  });

  it('is a well-formed urlset document', () => {
    const xml = buildSitemapXml([{ id: 'evt1' }]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength(xml.match(/<\/url>/g).length);
  });

  it('appends event URLs with a date-only lastmod', () => {
    const xml = buildSitemapXml([
      { id: 'abc123', lastmod: new Date('2026-07-01T15:30:00Z') },
    ]);
    expect(xml).toContain(
      `<url><loc>${SITE}/event?id=abc123</loc><lastmod>2026-07-01</lastmod></url>`
    );
  });

  it('omits lastmod when missing or invalid instead of rendering garbage', () => {
    const xml = buildSitemapXml([
      { id: 'noLastmod' },
      { id: 'badLastmod', lastmod: new Date('nonsense') },
      { id: 'stringLastmod', lastmod: '2026-07-01' },
    ]);
    expect(xml).toContain(`<loc>${SITE}/event?id=noLastmod</loc></url>`);
    expect(xml).toContain(`<loc>${SITE}/event?id=badLastmod</loc></url>`);
    expect(xml).toContain(`<loc>${SITE}/event?id=stringLastmod</loc></url>`);
    expect(xml).not.toContain('Invalid');
    expect(xml).not.toContain('<lastmod>');
  });

  it('skips rows without an id and tolerates null/undefined input', () => {
    expect(buildSitemapXml(null)).toBe(buildSitemapXml([]));
    expect(buildSitemapXml([null, {}, { lastmod: new Date() }])).toBe(buildSitemapXml([]));
  });

  it('URL-encodes and XML-escapes hostile event ids', () => {
    // Firestore auto-ids are alphanumeric, but ids can be admin-chosen —
    // a stray & or quote must not break the XML or the URL.
    const xml = buildSitemapXml([{ id: 'a&b "c" <d>' }]);
    // encodeURIComponent handles the URL layer…
    expect(xml).toContain('/event?id=a%26b%20%22c%22%20%3Cd%3E');
    // …so no raw specials survive into the XML body.
    const body = xml.slice(xml.indexOf('<urlset'));
    expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
});

describe('xmlEscape', () => {
  it('escapes the five XML specials and stringifies nullish input', () => {
    expect(xmlEscape('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
    expect(xmlEscape(null)).toBe('');
    expect(xmlEscape(undefined)).toBe('');
    expect(xmlEscape(42)).toBe('42');
  });
});
