// lib/sitemap-xml.js
//
// Pure XML builder for the dynamic sitemap served by api/next-event.js
// (?render=sitemap, rewritten from /sitemap.xml in vercel.json). It
// replaced the hand-maintained public/sitemap.xml, which had two problems:
// it could never list event pages (the site's actual money pages, whose
// links otherwise only exist after client-side Firestore JS runs — i.e.
// invisible to a crawler's first pass), and its hand-typed <lastmod>
// dates drifted months stale, which is worse than no lastmod at all.
//
// Kept dependency-free (no Firestore, no Date.now) so it can be unit
// tested exactly like lib/attendance-index.js — the caller decides which
// events belong in the map; this module only renders them.

const SITE = 'https://sparkdate.date';

// Static, always-indexable pages. Deliberately mirrors the old
// public/sitemap.xml's list. changefreq/priority are dropped (Google
// documents that it ignores both) and static entries carry no lastmod
// (a hardcoded date is a lie the day after it's written).
const STATIC_PATHS = [
  '/',
  '/events',
  '/about',
  '/signup',
  '/philadelphia',
  '/lancaster',
  '/blog',
  '/blog/first-timer-guide',
  '/blog/what-to-wear',
  '/blog/conversation-starters',
  '/blog/first-timer-guide-lancaster',
  '/blog/philly-date-night-spots',
  '/terms',
  '/privacy',
];

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// events: array of { id, lastmod? } where lastmod is a Date (or absent).
// Rows without an id are skipped; an invalid lastmod is omitted rather
// than rendered as "Invalid Date".
function buildSitemapXml(events) {
  const urls = STATIC_PATHS.map(
    (p) => `  <url><loc>${xmlEscape(SITE + p)}</loc></url>`
  );

  for (const ev of events || []) {
    if (!ev || !ev.id) continue;
    const loc = `${SITE}/event?id=${encodeURIComponent(String(ev.id))}`;
    const hasLastmod = ev.lastmod instanceof Date && !isNaN(ev.lastmod.getTime());
    const lastmod = hasLastmod
      ? `<lastmod>${ev.lastmod.toISOString().slice(0, 10)}</lastmod>`
      : '';
    urls.push(`  <url><loc>${xmlEscape(loc)}</loc>${lastmod}</url>`);
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
}

module.exports = { buildSitemapXml, xmlEscape, STATIC_PATHS, SITE };
