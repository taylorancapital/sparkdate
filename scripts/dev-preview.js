#!/usr/bin/env node
/**
 * scripts/dev-preview.js
 *
 * Serve THIS checkout's public/ with the live API behind it, so a worktree's
 * page changes can be looked at in a browser before they ship.
 *
 * WHY THIS EXISTS
 *
 * `npx serve public` (the other launch.json entries) serves static files only,
 * so /lp renders its fallback card and nothing that calls /api/* can be
 * exercised. `vercel dev` needs the full env. This is the middle: static files
 * from public/ (resolved relative to this script, so it follows the worktree
 * regardless of the launcher's cwd), the plain rewrites from vercel.json, and
 * GET /api/* proxied to production. Anything that writes -- POST to the
 * purchase, lead or sync endpoints -- is refused with 405 so a preview can
 * never charge a card or create a lead on the live site.
 *
 * Usage:
 *   node scripts/dev-preview.js            # http://localhost:5051
 *   node scripts/dev-preview.js 5060       # another port
 * Or `sparkdate-dev` in .claude/launch.json.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 5051);
const LIVE = process.env.DEV_PREVIEW_UPSTREAM || 'https://sparkdate.date';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Only the literal rewrites (no :params, no /api targets). Enough for /lp,
// /events, /about and friends; the server-rendered routes fall through to
// the proxy below, which is where they live in production anyway.
let rewrites = new Map();
try {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const r of vercel.rewrites || []) {
    if (r.source && r.destination && !r.source.includes(':') && !r.destination.startsWith('/api')) {
      rewrites.set(r.source, r.destination);
    }
  }
} catch (e) {
  console.warn('[dev-preview] could not read vercel.json rewrites:', e.message);
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

async function proxy(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'dev-preview refuses writes: the upstream is production' }));
  }
  try {
    const up = await fetch(LIVE + url.pathname + url.search, { headers: { accept: req.headers.accept || '*/*' } });
    const body = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unreachable', detail: e.message }));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let p = url.pathname;
  if (p.startsWith('/api/')) return proxy(req, res, url);
  if (rewrites.has(p)) p = rewrites.get(p);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return serveFile(res, file);
    // A bare route with no rewrite: try the .html twin, else hand it to production.
    const twin = file + '.html';
    fs.stat(twin, (err2, st2) => {
      if (!err2 && st2.isFile()) return serveFile(res, twin);
      return proxy(req, res, url);
    });
  });
}).listen(PORT, () => {
  console.log(`[dev-preview] serving ${PUBLIC} on http://localhost:${PORT} (GET /api/* -> ${LIVE}, writes refused)`);
});
