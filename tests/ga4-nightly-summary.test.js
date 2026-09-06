// tests/ga4-nightly-summary.test.js
//
// Covers scripts/ga4-nightly-summary.js — the standing summary the nightly GA4
// report is built on.
//
// This is a gate on ARITHMETIC, not on prose. Every case below is a mistake
// that has actually been made against this data set, and each one is silent:
// the report still renders, the numbers are just wrong.
//
//   * The 'Grand total' row in these exports has an EMPTY first cell and the
//     literal marker appended as a TRAILING column past the end of the header.
//     Matching only the first cell — the obvious guess — lets it through as a
//     data row and doubles every total it lands in.
//   * The last TWO dates of any daily series are not final (ANALYTICS_METHOD
//     §1). A comparison that includes them reads processing lag as a collapse.
//   * Period comparisons must use DISJOINT buckets. Two rolling windows share
//     most of their days, so the "change" between them is mostly the same data
//     compared with itself.
//   * view_item / begin_checkout / add_to_cart / add_payment_info appear in the
//     key-events table carrying a large eventValue and a keyEvents count of
//     ZERO. They are funnel steps, not conversions.
//   * One advertiser arrives under many spellings (Facebook / facebook / fb /
//     m.facebook.com), so no single row shows what it did.
//   * Third-party tags arrive obfuscated: letters a–f shift +1, g–z ROT13.
//     Ciphertext b–g has two pre-images and the two readings INTERLEAVE inside
//     one word, so a whole-string "prefer hex" or "prefer ROT13" pass decodes
//     "Ybadbfgfe" to "Lonqostsr" instead of "Lancaster".
//
// Runs offline against fixtures written to a temp dir — no GA4 credentials, no
// Night Tasks folder, nothing CI lacks.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  splitCsvLine, parseFile, closedDates, disjointBuckets,
  normSource, splitSourceMedium, deobfuscate, utmHygiene, loadPull,
} = require('../scripts/ga4-nightly-summary.js');

let dir;

const HEADER = [
  '# ----------------------------------------',
  '# sparkdate-philly',
  '# TITLE_HERE',
  '# 20260519-20260906',
  '# pulled 2026-09-06 06:12 UTC -- source: GA4 Data API, property 536859339',
  '# ----------------------------------------',
].join('\n');

function write(name, title, body) {
  fs.writeFileSync(
    path.join(dir, `ga4-api-${name}-2026-09-06.csv`),
    HEADER.replace('TITLE_HERE', title) + '\n' + body + '\n',
    'utf8'
  );
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ga4sum-'));

  write('traffic-by-source', 'Traffic acquisition - session source / medium',
    [
      'sessionSourceMedium,sessions,totalUsers,keyEvents,totalRevenue',
      'Facebook / paid_social,1610,1482,15,97.47',
      'facebook / paid_social,435,390,5,0',
      'fb / paid_social,209,204,0,0',
      'Ybadbfgfe | Zbfgfe Yvfg / email,129,129,0,0',
      'Lancaster | Master List / email,7,7,0,0',
      'lp / (not set),163,17,1,0',
      'get_tickets_block / (not set),61,6,1,27.49',
      '[object Object] / undefined,36,10,0,0',
      'eventbrite / listing,174,82,23,290.39',
      ',5322,3985,231,1061.12,Grand total',
    ].join('\n'));

  write('utm-content', 'utm_content (sessionManualAdContent) - sessions, key events, revenue',
    [
      'sessionManualAdContent,sessionCampaignName,sessions,keyEvents,totalRevenue',
      'proof_rsa1,Augweek3_lancaster,462,0,0',
      'proof_rsa1,Augweek1_philly,358,0,0',
      'lx_prime_male_noplan,LX_202609,153,0,0',
      '(not set),<campaign-name>,55,41,0',
      ',(not set),44,0,0',
      ',5322,231,1061.12,Grand total',
    ].join('\n'));

  write('first-user-tagging', 'First-user acquisition: auto-tagged vs manual campaign',
    [
      'firstUserSourceMedium,firstUserManualSourceMedium,firstUserCampaignName,firstUserManualCampaignName,firstUserCampaignId,firstUserManualCampaignId,sessions',
      'google / cpc,google / cpc,AutoTagged_Search,week3_Women,111,222,40',
      'google / cpc,google / cpc,(not set),(not set),,,5',
    ].join('\n'));

  write('utm-ad-detail', 'Manual UTM detail',
    ['sessionManualSourceMedium,sessionManualCampaignName,sessionManualAdContent,sessionManualTerm,sessions,keyEvents,totalRevenue,transactions',
     '(not set),(not set),(not set),(not set),791,0,0,0'].join('\n'));

  // daily-by-source is the only table that can DATE a row. Dates below are
  // chosen against a 20260801..20260906 series: the last two days are dropped as
  // non-final, so the last closed day is 20260904 and the live week opens
  // 20260829.
  const daily = ['date,sessionSourceMedium,sessions,engagedSessions,totalUsers,engagementRate'];
  for (let d = 1; d <= 31; d++) {
    daily.push(`202608${String(d).padStart(2, '0')},Facebook / paid_social,10,4,10,0.4`);
  }
  for (let d = 1; d <= 6; d++) {
    daily.push(`202609${String(d).padStart(2, '0')},Facebook / paid_social,10,4,10,0.4`);
  }
  daily.push('20260902,get_tickets_block / (not set),5,1,2,0.2');   // inside the live week
  daily.push('20260904,get_tickets_block / (not set),3,1,1,0.33');
  daily.push('20260820,lp / (not set),20,2,3,0.1');                 // stale, not live
  daily.push('20260710,[object Object] / undefined,36,0,10,0');     // long dead
  write('daily-by-source', 'Daily trend by session source / medium', daily.join('\n'));
});

afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ } });

describe('CSV shape', () => {
  it('keeps a quoted field containing a comma in one cell', () => {
    expect(splitCsvLine('"Sparkdate: Loxley, The",2,3')).toEqual(['Sparkdate: Loxley, The', '2', '3']);
  });

  it('pulls the Grand total row OUT of the data rows even though its first cell is empty', () => {
    const f = path.join(dir, 'ga4-api-traffic-by-source-2026-09-06.csv');
    const { sections } = parseFile(f);
    const s = sections[0];
    expect(s.totals).toHaveLength(1);
    // The marker sits past the end of the header, so it is the VALUES that
    // carry it, not any named column.
    expect(s.rows.some((r) => r.sessions === '5322')).toBe(false);
    const summed = s.rows.reduce((a, r) => a + Number(r.sessions), 0);
    expect(summed).toBe(2824); // not 8146 — the totals row is not a row
  });

  it('reads the window and pull time from the file header, not the filename', () => {
    const { comments } = parseFile(path.join(dir, 'ga4-api-traffic-by-source-2026-09-06.csv'));
    expect(comments).toContain('20260519-20260906');
    expect(comments.some((c) => /^pulled 2026-09-06 06:12 UTC/.test(c))).toBe(true);
  });
});

describe('the two non-final days, and disjoint buckets', () => {
  const rows = [];
  for (let d = 1; d <= 20; d++) rows.push({ date: `202609${String(d).padStart(2, '0')}` });

  it('drops exactly the last two dates', () => {
    const { closed, excluded } = closedDates(rows);
    expect(excluded).toEqual(['20260919', '20260920']);
    expect(closed).toHaveLength(18);
    expect(closed.at(-1)).toBe('20260918');
  });

  it('compares two weeks that share no day at all', () => {
    const { closed } = closedDates(rows);
    const { recent, prior } = disjointBuckets(closed);
    expect(recent).toHaveLength(7);
    expect(prior).toHaveLength(7);
    expect(recent.filter((d) => prior.includes(d))).toEqual([]);
    expect(prior.at(-1) < recent[0]).toBe(true);
  });

  it('does not invent a prior week when the series is too short', () => {
    const { closed } = closedDates(rows.slice(0, 6));
    expect(disjointBuckets(closed).prior).toEqual([]);
  });
});

describe('source parsing', () => {
  it('does not split the bare "(not set)" pair, which is the largest row in the file', () => {
    expect(splitSourceMedium('(not set)')).toEqual({ source: '(not set)', medium: '' });
  });

  it('splits on " / " and leaves a list name containing " | " intact', () => {
    expect(splitSourceMedium('Lancaster | Master List / email'))
      .toEqual({ source: 'Lancaster | Master List', medium: 'email' });
  });

  it('folds one advertiser\'s spellings together', () => {
    for (const s of ['Facebook', 'facebook', 'fb', 'm.facebook.com', 'www.facebook.com']) {
      expect(normSource(s)).toBe('facebook');
    }
    expect(normSource('ig')).toBe('instagram');
  });
});

describe('the obfuscated third-party tag', () => {
  it('decodes the interleaved cipher that a single-mode pass gets wrong', () => {
    // "Lancaster" needs the hex reading at b,d,f and ROT13 at Y,a,g,f,e.
    expect(deobfuscate('Ybadbfgfe').text).toBe('Lancaster');
    expect(deobfuscate('Ybadbfgfe | Zbfgfe Yvfg').text).toBe('Lancaster | Master List');
  });

  it('leaves an already-readable word alone instead of turning "email" into "dznvy"', () => {
    expect(deobfuscate('Ybadbfgfe | Zbfgfe Yvfg / email').text)
      .toBe('Lancaster | Master List / email');
  });

  it('reports no confidence rather than guessing at genuine noise', () => {
    expect(deobfuscate('xqzj').confident).toBe(false);
  });
});

describe('the UTM defect inventory', () => {
  let h;
  beforeAll(() => { h = utmHygiene(loadPull(dir, '2026-09-06')); });

  it('collects one advertiser\'s rows into a single cluster with a real total', () => {
    const fb = h.fragmentation.find((f) => f.source === 'facebook');
    expect(fb.variants).toBe(3);
    expect(fb.sessions).toBe(1610 + 435 + 209);
    expect(fb.keyEvents).toBe(20);
  });

  it('names our own site\'s internal elements appearing as traffic sources', () => {
    const raws = h.internal.map((r) => r.raw);
    expect(raws).toContain('lp / (not set)');
    expect(raws).toContain('get_tickets_block / (not set)');
    expect(raws).not.toContain('eventbrite / listing');
  });

  it('catches the serialised-object source and the unfilled placeholder campaign', () => {
    const vals = h.broken.map((b) => b.value);
    expect(vals).toContain('[object Object] / undefined');
    expect(vals).toContain('<campaign-name>');
  });

  it('pairs an obfuscated row with its own plaintext row so the channel total is right', () => {
    const o = h.obfuscated.find((r) => r.raw.startsWith('Ybadbfgfe'));
    expect(o.decodedFull).toBe('Lancaster | Master List / email');
    expect(o.plaintextTwin).toBe('Lancaster | Master List / email');
    expect(o.combinedSessions).toBe(136); // 129 obfuscated + 7 plaintext
  });

  it('ranks campaigns that spend sessions and return nothing', () => {
    expect(h.deadCampaigns[0]).toMatchObject({ campaign: 'Augweek3_lancaster', sessions: 462, keyEvents: 0 });
  });

  it('flags a utm_content reused across campaigns, which GA4 can never split apart', () => {
    const shared = h.sharedContent.find((s) => s.content === 'proof_rsa1');
    expect(shared.campaigns).toEqual(expect.arrayContaining(['Augweek3_lancaster', 'Augweek1_philly']));
  });

  // The failure this guards: `[object Object] / undefined` last produced a
  // session on 2026-07-10 and was then carried as an open action item by SEVEN
  // consecutive nightly reports, because every table is window-wide and a bug
  // fixed in July looks exactly like one that fired last night.
  it('dates each defect so a fixed bug stops being reported as live', () => {
    const dead = h.broken.find((b) => b.value === '[object Object] / undefined');
    expect(dead.status).toBe('DEAD');
    expect(dead.lastSeen).toBe('20260710');

    const live = h.internal.find((r) => r.raw === 'get_tickets_block / (not set)');
    expect(live.status).toBe('LIVE');
    expect(live.lastSeen).toBe('20260904');

    const stale = h.internal.find((r) => r.raw === 'lp / (not set)');
    expect(stale.status).toBe('stale');
  });

  it('does not call a row live on the strength of the two non-final days', () => {
    // Facebook has rows through 20260906, but 09-05 and 09-06 are not final;
    // its liveness must rest on 20260904 or earlier.
    expect(h.liveFrom).toBe('20260829');
  });

  it('reports auto-tagging overwriting a manual campaign, and ignores the rows that agree', () => {
    expect(h.overwritten).toHaveLength(1);
    expect(h.overwritten[0]).toMatchObject({ autoTagged: 'AutoTagged_Search', manual: 'week3_Women', sessions: 40 });
  });
});
