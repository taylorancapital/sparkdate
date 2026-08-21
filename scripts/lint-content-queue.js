#!/usr/bin/env node
/**
 * scripts/lint-content-queue.js
 *
 * Turns the brand source-of-truth doc from prose a human re-checks per post
 * into checks that fail a build. Every rule here corresponds to a real rule in
 * content/brand.json, and most of them correspond to a mistake that has
 * already shipped or been caught by hand.
 *
 * The headline case: Philly/Rittenhouse hashtags on a Lancaster event. That
 * has now happened twice (MC-2, corrected 8/19; LX-26, still wrong). It is a
 * copy-paste error that care does not prevent and a set-difference does.
 *
 * Errors fail the build. Warnings report and do not -- the split is
 * deliberate: an error means a post would say something FALSE or misattribute
 * itself, a warning means work is outstanding (art not drawn yet, two posts
 * competing for a day) that a human needs to judge rather than a script.
 *
 * Usage:
 *   node scripts/lint-content-queue.js
 *   node scripts/lint-content-queue.js --json
 *   node scripts/lint-content-queue.js --warnings-as-errors
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../lib/content-queue');

const REPO = path.join(__dirname, '..');
const QUEUE = path.join(REPO, 'content', 'queue.csv');
const BRAND = path.join(REPO, 'content', 'brand.json');
const PREPARED_ASSETS = path.join(REPO, 'public', 'social');

function lint(rows, brand, opts = {}) {
  const findings = [];
  const add = (severity, row_id, check, message) =>
    findings.push({ severity, row_id, check, message });

  const bannedRes = (brand.universal.banned_facts || []).map((b) => ({
    ...b, re: new RegExp(b.pattern, 'i'),
  }));
  const pulled = brand.universal.pulled_images || [];
  const sourceByPlatform = brand.universal.utm.source_by_platform || {};

  const seenUtmContent = new Map();
  const feedByDate = new Map();

  for (const row of rows) {
    const id = row.row_id || '(no row_id)';
    const events = Q.rowEvents(row);
    const platforms = Q.rowPlatforms(row);
    const schedulable = Q.isSchedulable(row);

    // --- structural ---------------------------------------------------
    if (!events.length) add('error', id, 'events', 'no event key -- cannot resolve hashtags, prices, or links');
    for (const key of events) {
      if (!brand.events[key]) add('error', id, 'events', `unknown event key "${key}" (not in brand.json)`);
    }

    // --- hashtags belong to this row's market(s) ------------------------
    // The check that catches MC-2 and LX-26.
    if (events.length) {
      const allowed = Q.allowedHashtags(brand, events);
      const offenders = Q.rowHashtags(row).filter((h) => !allowed.has(h.toLowerCase()));
      if (offenders.length) {
        const markets = [...new Set(events.map((k) => (brand.events[k] || {}).market).filter(Boolean))];
        add('error', id, 'hashtag-market',
          `${offenders.join(' ')} not in the ${markets.join('/')} pool for ${events.join('+')}`);
      }
    }

    // --- banned facts ---------------------------------------------------
    const prose = [row.caption, row.caption_x].filter(Boolean).join('\n');
    for (const b of bannedRes) {
      if (b.re.test(prose)) add('error', id, 'banned-fact', `${b.id}: ${b.description.split('.')[0]}`);
    }

    // --- consent: pulled images must never appear -----------------------
    const assets = Q.rowAssets(row);
    for (const a of assets) {
      const hit = pulled.find((p) => a.toUpperCase().includes(p.toUpperCase()));
      if (hit) add('error', id, 'pulled-image', `${a} references ${hit}, which is pulled from every use`);
    }

    // --- prices match this event's actual pricing -----------------------
    // $24.99 is Marion Court's regular price AND Loxley's early-bird price.
    if (events.length) {
      const allowedP = Q.allowedPrices(brand, events);
      if (allowedP.size) {
        const bad = [...new Set(Q.pricesInText(row.caption))].filter((p) => !allowedP.has(p));
        if (bad.length) {
          add('error', id, 'price',
            `caption names $${bad.join(', $')} but ${events.join('+')} sells at $${[...allowedP].join(', $')}`);
        }
      }
    }

    // --- links carry the right utm_source for their surface -------------
    // Both links point at the same landing page, so the wrong one does not
    // 404 -- it silently misattributes the click. Nothing surfaces that but
    // this check.
    const linkChecks = [['fb', row.link_fb], ['ig', row.link_ig]];
    for (const [platform, url] of linkChecks) {
      if (!url) continue;
      const want = sourceByPlatform[platform];
      const m = url.match(/utm_source=([^&\s]+)/);
      if (!m) add('error', id, 'utm-source', `link_${platform} has no utm_source`);
      else if (m[1] !== want) add('error', id, 'utm-source', `link_${platform} carries utm_source=${m[1]}, expected ${want}`);
    }
    if (schedulable && platforms.includes('fb') && !row.link_fb) {
      add('warning', id, 'link-missing', 'posts to Facebook but has no link_fb');
    }
    if (schedulable && platforms.includes('ig') && !row.link_ig) {
      add('warning', id, 'link-missing', 'posts to Instagram but has no link_ig (bio link)');
    }

    // --- utm_content is unique per row ----------------------------------
    // Was proof_rsa1 on all 45 rows, which made per-post attribution
    // impossible in GA4 (blocker #24).
    if (row.utm_content) {
      if (seenUtmContent.has(row.utm_content)) {
        add('error', id, 'utm-content',
          `utm_content="${row.utm_content}" is also used by ${seenUtmContent.get(row.utm_content)} -- GA4 cannot tell these posts apart`);
      } else seenUtmContent.set(row.utm_content, id);
    } else if (schedulable) {
      add('error', id, 'utm-content', 'no utm_content -- this post will not be individually attributable');
    }

    // --- assets ----------------------------------------------------------
    if (schedulable) {
      if (!assets.length) {
        add('warning', id, 'asset-missing', `no artwork yet (${row.format || 'unknown format'})`);
      } else {
        for (const a of assets) {
          const prepared = path.join(PREPARED_ASSETS, a.replace(/\.png$/i, '.jpg'));
          if (!fs.existsSync(path.join(PREPARED_ASSETS, a)) && !fs.existsSync(prepared)) {
            add('warning', id, 'asset-unprepared', `${a} not yet in public/social/ -- run prep-social-assets`);
          }
        }
      }
      if (!/^\d{2}:\d{2}$/.test(row.time || '')) {
        add('warning', id, 'time-unparseable',
          `time "${row.time}" is not HH:MM -- a scheduler cannot place this post`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) {
        add('error', id, 'date', `date "${row.date}" is not YYYY-MM-DD`);
      }
    }

    // --- day collisions ---------------------------------------------------
    if (schedulable && Q.isFeedPost(row) && row.date) {
      if (!feedByDate.has(row.date)) feedByDate.set(row.date, []);
      feedByDate.get(row.date).push(row);
    }
  }

  // Two feed posts on one day is a judgment call, not automatically wrong --
  // different cities and audiences can justify it (blocker #21). Two at the
  // SAME time is not a judgment call.
  for (const [date, group] of feedByDate) {
    if (group.length < 2) continue;
    const times = group.map((r) => `${r.row_id}@${r.time || '??'}`).join(', ');
    const byTime = new Map();
    let clash = false;
    for (const r of group) {
      if (r.time && byTime.has(r.time)) clash = true;
      if (r.time) byTime.set(r.time, r.row_id);
    }
    add(clash ? 'error' : 'warning', group[0].row_id, 'day-collision',
      `${group.length} feed posts on ${date}: ${times}${clash ? ' -- two share a slot' : ''}`);
  }

  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const strict = args.includes('--warnings-as-errors');

  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const { rows } = Q.parseCsv(fs.readFileSync(QUEUE, 'utf8'));
  const findings = lint(rows, brand);

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  if (asJson) {
    console.log(JSON.stringify({ rows: rows.length, errors, warnings }, null, 2));
  } else {
    const byCheck = new Map();
    for (const f of findings) {
      if (!byCheck.has(f.check)) byCheck.set(f.check, []);
      byCheck.get(f.check).push(f);
    }
    for (const [check, list] of [...byCheck].sort()) {
      const sev = list[0].severity === 'error' ? 'ERROR  ' : 'warning';
      console.log(`\n${sev} ${check} (${list.length})`);
      for (const f of list) console.log(`   ${f.row_id.padEnd(11)} ${f.message}`);
    }
    console.log(`\n${rows.length} rows -- ${errors.length} error(s), ${warnings.length} warning(s)`);
  }

  process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
}

if (require.main === module) main();

module.exports = { lint };
