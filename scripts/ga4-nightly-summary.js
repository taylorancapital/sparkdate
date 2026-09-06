#!/usr/bin/env node
/**
 * scripts/ga4-nightly-summary.js
 *
 * Computes the STANDING summary of a nightly GA4 pull: traffic, events,
 * revenue, UTM tagging defects, and a coverage ledger of every table on disk.
 *
 * WHY THIS EXISTS
 *
 * The nightly pull grew to 46 tables. The nightly report did not grow with it.
 * The 2026-09-05 report (PR #449) analysed roughly fifteen of them and closed
 * with "the remaining tables were skimmed for anything alarming and none was
 * found, but were not analysed in depth" -- seven tables named, none read.
 * Taylor's complaint, verbatim: the reports "are basically half a page and
 * they really don't have great insights", with no summary of traffic, no
 * summary of events, and nothing about gaps in UTM tagging.
 *
 * A prompt asking for more depth does not fix that, because the failure is not
 * effort -- it is that "what must appear every night" was never written down as
 * anything a run could fail. So it is written down here, as code:
 *
 *   - The standing numbers are COMPUTED, not re-derived by hand each night.
 *     Nobody can quietly skip a section by running out of context.
 *   - Every table in the pull appears in the coverage ledger whether or not
 *     anything interesting is in it, so an unread table is VISIBLE.
 *   - The arithmetic traps that have produced wrong reports here -- the
 *     two non-final days, rolling windows, 'Grand total' rows swept into sums
 *     -- are handled once, correctly, instead of once per night, variously.
 *
 * The analysis still belongs to whoever writes the report. This produces the
 * floor, not the ceiling: the numbers that must be on the page before any
 * interpretation is added.
 *
 * ZERO DEPENDENCIES, ON PURPOSE. The nightly runs in a dedicated clone at
 * ~/source/repos/sparkdate-nightly that has no node_modules and must not grow
 * one. Nothing here may be `require`d beyond node builtins.
 *
 * Usage:
 *   node scripts/ga4-nightly-summary.js                 # newest date set, markdown
 *   node scripts/ga4-nightly-summary.js --date 2026-09-05
 *   node scripts/ga4-nightly-summary.js --json          # machine-readable
 *   node scripts/ga4-nightly-summary.js --dir "<path to Night Tasks>"
 *
 * The Night Tasks folder is gitignored and lives ONLY in the main checkout, so
 * a worktree or the nightly clone reaches it by absolute path. Resolution
 * order: --dir, then $NIGHT_TASKS_DIR, then <repo>/Business Plan/files/Night
 * Tasks, then the main checkout's copy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Locating the pull
// ---------------------------------------------------------------------------

const MAIN_CHECKOUT_NIGHT_TASKS = path.join(
  'C:', 'Users', 'penns', 'source', 'repos', 'sparkdate',
  'Business Plan', 'files', 'Night Tasks'
);

function argOf(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const hasFlag = (n) => process.argv.includes(`--${n}`);

/**
 * A candidate only counts if it actually HOLDS a pull. `Business Plan/` is
 * tracked but `Night Tasks/`'s contents are gitignored, so every worktree has
 * an EMPTY folder at the repo-relative path. Accepting it on existence alone
 * makes a worktree run fail with "no files" while the real pull sits unread in
 * the main checkout — which is a confusing way to say "wrong directory".
 */
function hasPull(dir) {
  try {
    return fs.readdirSync(dir).some((f) => /^ga4-api-.*-\d{4}-\d{2}-\d{2}\.csv$/.test(f));
  } catch { return false; }
}

function resolveDir() {
  const candidates = [
    argOf('dir'),
    process.env.NIGHT_TASKS_DIR,
    path.join(__dirname, '..', 'Business Plan', 'files', 'Night Tasks'),
    MAIN_CHECKOUT_NIGHT_TASKS,
  ].filter(Boolean);
  for (const c of candidates) if (hasPull(c)) return c;
  // An explicit --dir that exists but holds no pull deserves its own message.
  const explicit = argOf('dir') || process.env.NIGHT_TASKS_DIR;
  if (explicit && fs.existsSync(explicit)) {
    throw new Error(`${explicit} exists but contains no ga4-api-*-<date>.csv files.`);
  }
  throw new Error(
    'No GA4 pull found. Tried:\n  ' + candidates.join('\n  ') +
    '\nPass --dir "<path>" or set NIGHT_TASKS_DIR.'
  );
}

/** Newest date that actually has a ga4-api-*-<date>.csv set. */
function newestDate(dir) {
  const dates = new Set();
  for (const f of fs.readdirSync(dir)) {
    const m = /^ga4-api-.*-(\d{4}-\d{2}-\d{2})\.csv$/.exec(f);
    if (m) dates.add(m[1]);
  }
  if (!dates.size) throw new Error(`No ga4-api-*.csv files in ${dir}`);
  return Array.from(dates).sort().pop();
}

// ---------------------------------------------------------------------------
// CSV / stacked-table parsing
// ---------------------------------------------------------------------------

/** Split one CSV line, honouring double-quoted fields with embedded commas. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * One file may stack several tables, each preceded by its own '# ' title block.
 * Returns { comments, sections: [{ title, header, rows }] } where rows are
 * objects keyed by the section's own real header. 'Grand total' rows are
 * separated out -- they are an independent check, never part of a sum.
 */
function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const comments = [];
  const sections = [];
  let cur = null;
  let pendingTitle = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('#')) {
      const body = line.replace(/^#\s?/, '').trim();
      comments.push(body);
      // A title is a '# ' line that is not a rule, a NOTE, or metadata.
      if (body && !/^-+$/.test(body) && !/^NOTE:/i.test(body) &&
          !/^pulled /i.test(body) && !/^\d{8}-\d{8}$/.test(body)) {
        pendingTitle = body;
      }
      cur = null; // a new comment block ends the previous section
      continue;
    }
    if (!cur) {
      cur = { title: pendingTitle || path.basename(file), header: splitCsvLine(line), rows: [], totals: [] };
      sections.push(cur);
      continue;
    }
    const vals = splitCsvLine(line);
    const row = {};
    cur.header.forEach((h, i) => { row[h] = vals[i] === undefined ? '' : vals[i]; });
    // The totals row is NOT shaped like the others: this export writes it with
    // an EMPTY first cell and the literal "Grand total" appended as a TRAILING
    // extra column, past the end of the header. Matching only the first cell
    // (the obvious guess) lets it through as a data row, and it then doubles
    // every total it is summed into. Match the marker anywhere in the line.
    if (vals.some((v) => /^grand\s*total$/i.test(String(v || '').trim()))) cur.totals.push(row);
    else cur.rows.push(row);
  }
  return { comments, sections };
}

const num = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : '—');

// ---------------------------------------------------------------------------
// Load the whole pull
// ---------------------------------------------------------------------------

function loadPull(dir, date) {
  const tables = {};
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('ga4-api-') && f.endsWith(`-${date}.csv`));
  for (const f of files) {
    const key = f.replace(/^ga4-api-/, '').replace(new RegExp(`-${date}\\.csv$`), '');
    const parsed = parseFile(path.join(dir, f));
    tables[key] = {
      file: f,
      comments: parsed.comments,
      sections: parsed.sections,
      // Convenience: most files are a single table.
      rows: parsed.sections.length ? parsed.sections[0].rows : [],
      totals: parsed.sections.length ? parsed.sections[0].totals : [],
      rowCount: parsed.sections.reduce((a, s) => a + s.rows.length, 0),
      read: false,
    };
  }
  return tables;
}

/** Mark a table read for the coverage ledger and return its rows. */
function use(tables, key) {
  const t = tables[key];
  if (!t) return [];
  t.read = true;
  return t.rows;
}
function useAll(tables, key) {
  const t = tables[key];
  if (!t) return [];
  t.read = true;
  return t.sections;
}

/** Window and pull time, read from a file's own '#' header, never the filename. */
function provenance(tables) {
  for (const k of Object.keys(tables)) {
    const c = tables[k].comments || [];
    const window = c.find((l) => /^\d{8}-\d{8}$/.test(l));
    const pulled = c.find((l) => /^pulled /i.test(l));
    if (window || pulled) return { window: window || null, pulled: pulled || null };
  }
  return { window: null, pulled: null };
}

// ---------------------------------------------------------------------------
// The two non-final days
//
// ANALYTICS_METHOD.md section 1: the last TWO dates of any daily series are not
// final. Every daily computation below drops them. This is the single most
// repeated source of wrong conclusions in this repo's report history, and it is
// handled here once so no night has to remember it.
// ---------------------------------------------------------------------------

function closedDates(rows, dateKey = 'date') {
  const ds = Array.from(new Set(rows.map((r) => r[dateKey]).filter((d) => /^\d{8}$/.test(d)))).sort();
  return { closed: ds.slice(0, Math.max(0, ds.length - 2)), excluded: ds.slice(-2) };
}

/**
 * Two DISJOINT trailing 7-day buckets over closed days. Never a rolling window:
 * CLAUDE.md's report guidance calls rolling windows out by name, because two
 * overlapping windows share most of their data and any difference between them
 * reads as a trend that is mostly the same days compared with themselves.
 */
function disjointBuckets(closed) {
  return { recent: closed.slice(-7), prior: closed.slice(-14, -7) };
}

function sumOver(rows, dates, dateKey, fields) {
  const set = new Set(dates);
  const acc = {};
  for (const f of fields) acc[f] = 0;
  for (const r of rows) {
    if (!set.has(r[dateKey])) continue;
    for (const f of fields) acc[f] += num(r[f]);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// UTM hygiene
// ---------------------------------------------------------------------------

/**
 * Sources that are not traffic sources at all -- they are our own site's
 * internal elements and page slugs leaking into utm_source. An internal link
 * carrying utm params starts a NEW GA4 session and OVERWRITES the visitor's
 * real acquisition source, so these rows are not merely untidy: every one of
 * them is a session stolen from whichever channel actually paid for it.
 *
 * Kept as an explicit list rather than inferred, so that adding a legitimate
 * new partner named e.g. "matches" cannot silently start being flagged.
 */
const INTERNAL_SOURCE_TOKENS = [
  'lp', 'matches', 'get_tickets_block', 'sticky_ticket_bar', 'lp_sticky_bar',
  'lp_get_tickets', 'homepage_hero', 'browse_all', 'next_mixer', 'matches_page',
  'day5_browse_all', 'bio', 'weekly',
];

/** Values that are a bug rather than a tag. */
const BROKEN_VALUE_RE = /^(\[object object\]|undefined|null|nan|<[^>]*>|)$/i;

/**
 * The obfuscated-tag cipher, measured on the 2026-09-03 LNP | LancasterOnline
 * newsletter rows: letters a-f shift +1, g-z ROT13, case preserved, digits and
 * punctuation untouched. Verified exactly against three independent strings
 * ("Lancaster | Master List", "EMAIL_CAMPAIGN", "mc_...").
 *
 * DECODING IS AMBIGUOUS, per character. Ciphertext b-g has two pre-images: a
 * hex letter that shifted +1, or a g-z letter that went through ROT13. And the
 * two readings INTERLEAVE inside a single word -- "Ybadbfgfe" needs the hex
 * reading at b,d,f and the ROT13 reading at Y,a,g,f,e to give "Lancaster". So a
 * whole-string "prefer hex" or "prefer ROT13" pass cannot decode it; picking one
 * mode gives "Lonqostsr", which is how a first attempt at this went.
 *
 * Instead: enumerate the readings per alphabetic run (runs are short, and only
 * b-g positions branch) and score each candidate against a word list. Exact,
 * cheap, and it degrades honestly -- when nothing scores, the caller is told the
 * decode is unresolved rather than handed a confident wrong answer.
 */
const COMMON_WORDS = [
  'list', 'master', 'email', 'campaign', 'news', 'daily', 'weekly', 'event',
  'events', 'lancaster', 'philadelphia', 'philly', 'social', 'the', 'and',
  'newsletter', 'promo', 'ticket', 'tickets', 'summer', 'night', 'mixer',
  'sparkdate', 'singles', 'online', 'visit', 'calendar', 'digest', 'update',
];
function readability(s) {
  const low = s.toLowerCase();
  let score = 0;
  for (const w of COMMON_WORDS) if (low.includes(w)) score += w.length * w.length;
  return score;
}

const MAX_BRANCHES = 1 << 14; // 16k candidates per run; runs here are far shorter

function decodeRun(run) {
  // Per position, the set of possible plaintext letters.
  const opts = Array.from(run).map((ch) => {
    const up = ch === ch.toUpperCase() && /[A-Z]/.test(ch);
    const i = ch.toLowerCase().charCodeAt(0) - 97;
    const cands = [];
    if (i >= 1 && i <= 6) cands.push(i - 1);          // a-f shifted +1
    const rot = (i + 13) % 26;
    if (rot >= 6) cands.push(rot);                     // g-z through ROT13
    if (!cands.length) cands.push(i);                  // shouldn't happen; be safe
    return cands.map((c) => {
      const r = String.fromCharCode(97 + c);
      return up ? r.toUpperCase() : r;
    });
  });
  const total = opts.reduce((a, o) => a * o.length, 1);
  if (total > MAX_BRANCHES) return { text: opts.map((o) => o[0]).join(''), score: 0, ambiguous: true };

  let best = null;
  const walk = (idx, acc) => {
    if (idx === opts.length) {
      const score = readability(acc);
      if (!best || score > best.score) best = { text: acc, score };
      return;
    }
    for (const c of opts[idx]) walk(idx + 1, acc + c);
  };
  walk(0, '');
  return { text: best.text, score: best.score, ambiguous: best.score === 0 };
}

/**
 * Decode a whole tag. Returns the best reading plus whether it is trustworthy
 * (at least one run matched a real word) so callers never present a guess as a
 * fact.
 */
function deobfuscate(s) {
  let resolved = 0;
  let totalRuns = 0;
  const text = String(s).replace(/[A-Za-z]+/g, (run) => {
    totalRuns++;
    // A run that ALREADY reads as a word is not ciphertext -- leave it alone.
    // Real tags mix the two ("<obfuscated source> / email"), and decoding the
    // readable half turns "email" into "dznvy".
    const plainScore = readability(run);
    const d = decodeRun(run);
    if (plainScore >= d.score) return run;
    resolved++;
    return d.text;
  });
  return { text, confident: resolved > 0, resolvedRuns: resolved, totalRuns };
}

/**
 * Normalise a source for fragmentation clustering: lowercase, strip a leading
 * "www.", collapse known aliases for the same advertiser. Fragmentation is the
 * defect where ONE advertiser is split across several GA4 rows, so that no row
 * shows what it actually did.
 */
const SOURCE_ALIASES = {
  fb: 'facebook', 'facebook.com': 'facebook', 'm.facebook.com': 'facebook',
  'l.facebook.com': 'facebook', 'eventsmanager.facebook.com': 'facebook',
  ig: 'instagram', 'instagram.com': 'instagram',
  'google ads': 'googleads', googleads: 'googleads', 'google-ads': 'googleads',
  'l.instagram.com': 'instagram',
};
function normSource(src) {
  const s = String(src || '').toLowerCase().trim().replace(/^www\./, '');
  return SOURCE_ALIASES[s] || s;
}
function splitSourceMedium(v) {
  // The utm-ad-detail header warns that the null pair arrives as a bare
  // "(not set)" rather than "(not set) / (not set)", and that it is the single
  // largest row in the file -- a naive split mislabels the biggest bucket.
  const s = String(v || '');
  const i = s.indexOf(' / ');
  if (i === -1) return { source: s, medium: '' };
  return { source: s.slice(0, i), medium: s.slice(i + 3) };
}

function utmHygiene(tables) {
  const traffic = use(tables, 'traffic-by-source');
  const content = use(tables, 'utm-content');
  const adDetail = use(tables, 'utm-ad-detail');
  const firstUser = use(tables, 'first-user-tagging');

  // WHEN a defect last happened, not just that it appears in a 110-day window.
  //
  // Every table above is window-wide, so a tagging bug that was fixed in July
  // looks identical to one that fired last night. That is not hypothetical:
  // `[object Object] / undefined` last produced a session on 2026-07-10 and was
  // then carried as an open action item by SEVEN consecutive nightly reports,
  // because nothing in the data being read could say it had stopped.
  // daily-by-source is the only table that can date a row, so date every row.
  const dbs = tables['daily-by-source'] ? tables['daily-by-source'].rows : [];
  if (tables['daily-by-source']) tables['daily-by-source'].read = true;
  const lastSeen = new Map();
  const firstSeenAt = new Map();
  for (const r of dbs) {
    const s = r.sessionSourceMedium;
    const d = r.date;
    if (!/^\d{8}$/.test(d)) continue;
    if (!lastSeen.has(s) || d > lastSeen.get(s)) lastSeen.set(s, d);
    if (!firstSeenAt.has(s) || d < firstSeenAt.get(s)) firstSeenAt.set(s, d);
  }
  const { closed: dbsClosed } = closedDates(dbs);
  const liveFrom = dbsClosed.slice(-7)[0] || null;   // start of the last closed week
  const staleFrom = dbsClosed.slice(-28)[0] || null; // start of the last closed 4 weeks
  const statusOf = (raw) => {
    const d = lastSeen.get(raw);
    if (!d) return { status: 'unknown', lastSeen: null };
    if (liveFrom && d >= liveFrom) return { status: 'LIVE', lastSeen: d };
    if (staleFrom && d >= staleFrom) return { status: 'stale', lastSeen: d };
    return { status: 'DEAD', lastSeen: d };
  };

  const rows = traffic.map((r) => {
    const { source, medium } = splitSourceMedium(r.sessionSourceMedium);
    return {
      raw: r.sessionSourceMedium,
      source, medium,
      norm: normSource(source),
      sessions: num(r.sessions),
      users: num(r.totalUsers),
      keyEvents: num(r.keyEvents),
      revenue: num(r.totalRevenue),
      ...statusOf(r.sessionSourceMedium),
      firstSeen: firstSeenAt.get(r.sessionSourceMedium) || null,
    };
  });

  // 1. Fragmentation: one normalised source spread over several raw rows.
  const byNorm = new Map();
  for (const r of rows) {
    if (!byNorm.has(r.norm)) byNorm.set(r.norm, []);
    byNorm.get(r.norm).push(r);
  }
  const fragmentation = Array.from(byNorm.entries())
    .filter(([, rs]) => rs.length > 1)
    .map(([norm, rs]) => ({
      source: norm,
      variants: rs.length,
      rows: rs.slice().sort((a, b) => b.sessions - a.sessions),
      sessions: rs.reduce((a, r) => a + r.sessions, 0),
      keyEvents: rs.reduce((a, r) => a + r.keyEvents, 0),
      revenue: rs.reduce((a, r) => a + r.revenue, 0),
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // 2. Internal UTM pollution / self-referral.
  const internal = rows
    .filter((r) => INTERNAL_SOURCE_TOKENS.includes(r.source.toLowerCase()))
    .sort((a, b) => b.sessions - a.sessions);

  // 3. Broken or placeholder values, anywhere they appear.
  const broken = [];
  for (const r of rows) {
    if (BROKEN_VALUE_RE.test(r.source) || BROKEN_VALUE_RE.test(r.medium)) {
      broken.push({ where: 'traffic-by-source', value: r.raw, sessions: r.sessions, keyEvents: r.keyEvents,
        status: r.status, lastSeen: r.lastSeen });
    }
  }
  for (const r of content) {
    const campaign = r.sessionCampaignName || '';
    const c = r.sessionManualAdContent || '';
    if (BROKEN_VALUE_RE.test(campaign) || /^<.*>$/.test(campaign)) {
      broken.push({ where: 'utm-content (campaign)', value: campaign || '(empty string)', sessions: num(r.sessions), keyEvents: num(r.keyEvents) });
    }
    if (c === '') {
      broken.push({ where: 'utm-content (content)', value: '(empty string)', sessions: num(r.sessions), keyEvents: num(r.keyEvents) });
    }
  }
  // Several distinct rows can carry the same defective value (one per campaign,
  // say). Aggregate so the table reads as a defect list rather than a row dump.
  const brokenAgg = new Map();
  for (const b of broken) {
    const k = b.where + ' ' + b.value;
    const prev = brokenAgg.get(k);
    if (prev) { prev.sessions += b.sessions; prev.keyEvents += b.keyEvents; prev.rows++; }
    else brokenAgg.set(k, { ...b, rows: 1 });
  }
  const brokenOut = Array.from(brokenAgg.values()).sort((a, b) => b.sessions - a.sessions);

  // 4. Obfuscated / unreadable tags -- see deobfuscate().
  const obfuscated = [];
  for (const r of rows) {
    if (readability(r.source) > 0) continue;          // already readable
    const d = deobfuscate(r.source);
    if (!d.confident) continue;                        // no reading beats noise
    obfuscated.push({
      raw: r.raw, decoded: d.text, decodedFull: deobfuscate(r.raw).text,
      sessions: r.sessions, users: r.users, keyEvents: r.keyEvents, revenue: r.revenue,
    });
  }
  // The decoded form may ALSO exist as its own plaintext row -- the same channel
  // split across two GA4 rows, so even its session count reads low. Pair them up
  // so the report states the channel's real total rather than the larger half.
  for (const o of obfuscated) {
    const plain = rows.find((r) => r.raw !== o.raw && normSource(r.source) === normSource(o.decoded));
    if (plain) {
      o.plaintextTwin = plain.raw;
      o.twinSessions = plain.sessions;
      o.combinedSessions = o.sessions + plain.sessions;
      o.combinedKeyEvents = o.keyEvents + plain.keyEvents;
    }
  }

  // 5. Campaigns burning sessions for nothing.
  const deadCampaigns = content
    .map((r) => ({
      campaign: r.sessionCampaignName,
      content: r.sessionManualAdContent,
      sessions: num(r.sessions),
      keyEvents: num(r.keyEvents),
      revenue: num(r.totalRevenue),
    }))
    .filter((r) => r.sessions >= 20 && r.keyEvents === 0)
    .sort((a, b) => b.sessions - a.sessions);

  // 6. utm_content shared across campaigns -- brand.json bans this, because a
  //    shared value cannot be split apart again in GA4 afterwards.
  const contentToCampaigns = new Map();
  for (const r of content) {
    const c = r.sessionManualAdContent;
    if (!c || c === '(not set)') continue;
    if (!contentToCampaigns.has(c)) contentToCampaigns.set(c, new Set());
    contentToCampaigns.get(c).add(r.sessionCampaignName);
  }
  const sharedContent = Array.from(contentToCampaigns.entries())
    .filter(([, set]) => set.size > 1)
    .map(([c, set]) => ({ content: c, campaigns: Array.from(set) }))
    .sort((a, b) => b.campaigns.length - a.campaigns.length);

  // 7. Auto-tagging overwriting a manual campaign -- the whole point of the
  //    first-user-tagging file is the rows where the two columns disagree.
  const overwritten = firstUser
    .filter((r) => {
      const a = (r.firstUserCampaignName || '').trim();
      const m = (r.firstUserManualCampaignName || '').trim();
      return a && m && a !== m && m !== '(not set)' && a !== '(not set)';
    })
    .map((r) => ({
      autoTagged: r.firstUserCampaignName,
      manual: r.firstUserManualCampaignName,
      sessions: num(r.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return { rows, fragmentation, internal, broken: brokenOut, obfuscated, deadCampaigns, sharedContent,
    overwritten, adDetailRows: adDetail.length, liveFrom, staleFrom };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// GA4 source values legitimately contain "|" (a list name like
// "Lancaster | Master List"), which silently splits a markdown row into extra
// columns and shifts every number one cell left. Escape it in every cell.
const cell = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|');

function mdTable(headers, rows, aligns) {
  if (!rows.length) return '_(no rows)_\n';
  const al = headers.map((_, i) => (aligns && aligns[i] === 'r' ? '---:' : '---'));
  return [
    '| ' + headers.map(cell).join(' | ') + ' |',
    '| ' + al.join(' | ') + ' |',
    ...rows.map((r) => '| ' + r.map(cell).join(' | ') + ' |'),
  ].join('\n') + '\n';
}

function build(tables, date, dir) {
  const out = [];
  const p = provenance(tables);
  const push = (s) => out.push(s);

  push(`# GA4 nightly standing summary — pull ${date}\n`);
  push(`Computed by \`scripts/ga4-nightly-summary.js\` from ${Object.keys(tables).length} tables in \`${dir}\`.`);
  push(`Window \`${p.window || 'unknown'}\`, ${p.pulled || 'pull time unknown'}.`);
  push(`Every daily figure below EXCLUDES the last two dates in the series (ANALYTICS_METHOD.md §1), and every`);
  push(`period comparison uses two disjoint 7-day buckets, never a rolling window.\n`);

  // ---- TRAFFIC ------------------------------------------------------------
  const daily = use(tables, 'daily-trend');
  const usersDaily = use(tables, 'users-daily');
  const keDaily = use(tables, 'key-events-daily');
  const revDaily = use(tables, 'revenue-daily');
  const { closed, excluded } = closedDates(daily);
  const { recent, prior } = disjointBuckets(closed);

  push(`## 1. Traffic\n`);
  push(`Closed days in series: **${closed.length}** (${closed[0] || '—'} → ${closed[closed.length - 1] || '—'}). ` +
       `Excluded as not final: ${excluded.join(', ') || '—'}.\n`);

  if (recent.length && prior.length) {
    const fields = ['sessions', 'engagedSessions', 'totalUsers'];
    const a = sumOver(daily, recent, 'date', fields);
    const b = sumOver(daily, prior, 'date', fields);
    const au = sumOver(usersDaily, recent, 'date', ['newUsers', 'activeUsers', 'totalPurchasers']);
    const bu = sumOver(usersDaily, prior, 'date', ['newUsers', 'activeUsers', 'totalPurchasers']);
    const ak = sumOver(keDaily, recent, 'date', ['keyEvents']);
    const bk = sumOver(keDaily, prior, 'date', ['keyEvents']);
    const ar = sumOver(revDaily, recent, 'date', ['totalRevenue', 'transactions']);
    const br = sumOver(revDaily, prior, 'date', ['totalRevenue', 'transactions']);
    const delta = (x, y) => (y ? ((x - y) / y >= 0 ? '+' : '') + (((x - y) / y) * 100).toFixed(0) + '%' : '—');

    push(`**Two disjoint closed weeks.** Recent = ${recent[0]}–${recent[recent.length - 1]}; prior = ${prior[0]}–${prior[prior.length - 1]}.\n`);
    push(mdTable(
      ['metric', 'recent 7d', 'prior 7d', 'change'],
      [
        ['sessions', a.sessions, b.sessions, delta(a.sessions, b.sessions)],
        ['engaged sessions', a.engagedSessions, b.engagedSessions, delta(a.engagedSessions, b.engagedSessions)],
        ['engagement rate', pct(a.engagedSessions, a.sessions), pct(b.engagedSessions, b.sessions), ''],
        ['users', a.totalUsers, b.totalUsers, delta(a.totalUsers, b.totalUsers)],
        ['new users', au.newUsers, bu.newUsers, delta(au.newUsers, bu.newUsers)],
        ['purchasers', au.totalPurchasers, bu.totalPurchasers, delta(au.totalPurchasers, bu.totalPurchasers)],
        ['key events', ak.keyEvents, bk.keyEvents, delta(ak.keyEvents, bk.keyEvents)],
        ['transactions', ar.transactions, br.transactions, delta(ar.transactions, br.transactions)],
        ['own-site revenue', money(ar.totalRevenue), money(br.totalRevenue), delta(ar.totalRevenue, br.totalRevenue)],
      ],
      ['', 'r', 'r', 'r']
    ));
    push(`Own-site revenue is NOT business revenue — Eventbrite and Meetup fire no analytics (ANALYTICS_METHOD.md §7).\n`);
  }

  const channels = use(tables, 'channel-groups');
  push(`### Channels\n`);
  push(mdTable(
    ['channel group', 'sessions', 'users', 'key events', 'conv rate', 'revenue'],
    channels.slice(0, 20).map((r) => [
      r.sessionDefaultChannelGroup, num(r.sessions), num(r.totalUsers), num(r.keyEvents),
      pct(num(r.keyEvents), num(r.sessions)), money(num(r.totalRevenue)),
    ]),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));

  const traffic = use(tables, 'traffic-by-source');
  push(`### Top source / medium (window-wide)\n`);
  push(mdTable(
    ['source / medium', 'sessions', 'users', 'key events', 'conv rate', 'revenue'],
    traffic.slice(0, 20).map((r) => [
      r.sessionSourceMedium, num(r.sessions), num(r.totalUsers), num(r.keyEvents),
      pct(num(r.keyEvents), num(r.sessions)), money(num(r.totalRevenue)),
    ]),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));

  const dev = use(tables, 'by-device');
  push(`### Device\n`);
  push(mdTable(
    ['device', 'sessions', 'engaged', 'key events', 'conv rate', 'revenue'],
    dev.map((r) => [r.deviceCategory, num(r.sessions), num(r.engagedSessions), num(r.keyEvents),
      pct(num(r.keyEvents), num(r.sessions)), money(num(r.totalRevenue))]),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));

  const osb = use(tables, 'os-browser');
  push(`### Top OS / browser\n`);
  push(mdTable(
    ['OS', 'browser', 'sessions', 'engaged', 'key events'],
    osb.slice(0, 10).map((r) => [r.operatingSystem, r.browser, num(r.sessions), num(r.engagedSessions), num(r.keyEvents)]),
    ['', '', 'r', 'r', 'r']
  ));

  const cities = use(tables, 'cities');
  push(`### Top cities\n`);
  push(mdTable(
    ['city', 'region', 'sessions', 'users', 'key events', 'revenue'],
    cities.slice().sort((a, b) => num(b.sessions) - num(a.sessions)).slice(0, 12)
      .map((r) => [r.city, r.region, num(r.sessions), num(r.totalUsers), num(r.keyEvents), money(num(r.totalRevenue))]),
    ['', '', 'r', 'r', 'r', 'r']
  ));

  // The suspect (not set)/ZZ bucket, and what the property rate looks like without it.
  const geo = use(tables, 'geo-country-language');
  const suspect = geo.filter((r) => r.continentId === 'ZZ' || r.country === '(not set)');
  if (suspect.length) {
    const sS = suspect.reduce((a, r) => a + num(r.sessions), 0);
    const sK = suspect.reduce((a, r) => a + num(r.keyEvents), 0);
    const allS = geo.reduce((a, r) => a + num(r.sessions), 0);
    const allK = geo.reduce((a, r) => a + num(r.keyEvents), 0);
    push(`### Suspect geography bucket\n`);
    push(`\`(not set)\` / continentId \`ZZ\`: **${sS} sessions, ${sK} key events, ${money(suspect.reduce((a, r) => a + num(r.totalRevenue), 0))}** ` +
         `— a ${pct(sK, sS)} key-event rate against ${pct(allK, allS)} property-wide.`);
    push(`Excluding it, the property-wide key-event rate is **${pct(allK - sK, allS - sS)}**. ` +
         `Consistent with automated traffic; no IP or user-agent evidence has ever been examined, so this is a caveat, not a verdict.\n`);
  }

  const nvr = use(tables, 'new-vs-returning');
  push(`### New vs returning\n`);
  push(mdTable(
    ['cohort', 'sessions', 'users', 'key events', 'revenue', 'revenue / user'],
    nvr.map((r) => [r.newVsReturning || '(blank)', num(r.sessions), num(r.totalUsers), num(r.keyEvents), money(num(r.totalRevenue)),
      num(r.totalUsers) ? money(num(r.totalRevenue) / num(r.totalUsers)) : '—']),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));

  const dayHour = use(tables, 'by-day-hour');
  const topHours = dayHour.slice().sort((a, b) => num(b.sessions) - num(a.sessions)).slice(0, 8);
  const topKeHours = dayHour.slice().sort((a, b) => num(b.keyEvents) - num(a.keyEvents)).slice(0, 8);
  push(`### When traffic arrives, and when it converts\n`);
  push(mdTable(['by sessions', 'sessions', 'key events', '·', 'by key events', 'sessions', 'key events'],
    topHours.map((r, i) => {
      const k = topKeHours[i] || {};
      return [`${r.dayOfWeekName} ${r.hour}:00`, num(r.sessions), num(r.keyEvents), '',
        k.dayOfWeekName ? `${k.dayOfWeekName} ${k.hour}:00` : '', k.sessions ? num(k.sessions) : '', k.keyEvents ? num(k.keyEvents) : ''];
    }),
    ['', 'r', 'r', '', '', 'r', 'r']
  ));

  use(tables, 'weekly-trend');
  use(tables, 'session-quality-daily');

  // ---- EVENTS -------------------------------------------------------------
  push(`## 2. Events\n`);
  const events = use(tables, 'events');
  const keyEventRows = use(tables, 'key-events');
  // Appearing in the key-events table does NOT make an event a key event. That
  // table returns anything carrying an eventValue, so view_item, begin_checkout,
  // add_to_cart and add_payment_info all show up with large values and a
  // keyEvents count of ZERO -- they are funnel events, not conversions. Marking
  // ★ on presence alone (the obvious reading) claims four conversions the
  // property does not have. Only a non-zero keyEvents count counts.
  const keyNames = new Set(keyEventRows.filter((r) => num(r.keyEvents) > 0).map((r) => r.eventName));
  const valueOnly = keyEventRows.filter((r) => num(r.keyEvents) === 0 && num(r.eventValue) > 0);
  push(`**Every event in the property**, ranked. Key events marked ★.\n`);
  push(mdTable(
    ['event', 'count', 'users', 'key event?'],
    events.slice(0, 40).map((r) => [r.eventName, num(r.eventCount), num(r.totalUsers), keyNames.has(r.eventName) ? '★' : '']),
    ['', 'r', 'r', '']
  ));
  push(`### Key events — only ${keyNames.size} events are actually configured as key events\n`);
  push(mdTable(
    ['key event', 'count', 'value', 'revenue'],
    keyEventRows.filter((r) => num(r.keyEvents) > 0)
      .map((r) => [r.eventName, num(r.keyEvents), money(num(r.eventValue)), money(num(r.totalRevenue))]),
    ['', 'r', 'r', 'r']
  ));
  if (valueOnly.length) {
    push(`Carrying an event VALUE but counted as zero key events — funnel steps, not conversions. ` +
         `Any funnel or ROAS reading that treats these as key events is wrong by construction:\n`);
    push(mdTable(
      ['event', 'key events', 'event value'],
      valueOnly.map((r) => [r.eventName, num(r.keyEvents), money(num(r.eventValue))]),
      ['', 'r', 'r']
    ));
  }

  const keBySource = use(tables, 'key-events-by-source');
  push(`### Which channels produce which key events (top 20)\n`);
  push(mdTable(
    ['key event', 'source / medium', 'count', 'value'],
    keBySource.slice(0, 20).map((r) => [r.eventName, r.sessionSourceMedium, num(r.keyEvents), money(num(r.eventValue))]),
    ['', '', 'r', 'r']
  ));

  use(tables, 'events-by-source');
  use(tables, 'attribution-credit');

  // ---- REVENUE ------------------------------------------------------------
  push(`## 3. Revenue and commerce (own-site only)\n`);
  const revSource = use(tables, 'revenue-by-source');
  const revItem = use(tables, 'revenue-by-item');
  const itemsDaily = use(tables, 'items-daily');

  const totalRev = revDaily.reduce((a, r) => a + num(r.totalRevenue), 0);
  const totalTx = revDaily.reduce((a, r) => a + num(r.transactions), 0);
  push(`Window totals: **${money(totalRev)} across ${totalTx} transactions**, AOV ${totalTx ? money(totalRev / totalTx) : '—'}.\n`);
  push(mdTable(
    ['source / medium', 'transactions', 'revenue'],
    revSource.slice(0, 15).map((r) => [r.sessionSourceMedium, num(r.transactions), money(num(r.totalRevenue))]),
    ['', 'r', 'r']
  ));
  push(`### Items\n`);
  push(mdTable(
    ['item', 'viewed', 'added to cart', 'purchased', 'revenue'],
    revItem.map((r) => [r.itemName, num(r.itemsViewed), num(r.itemsAddedToCart), num(r.itemsPurchased), money(num(r.itemRevenue))]),
    ['', 'r', 'r', 'r', 'r']
  ));

  // WHEN each item sold. An ad that started after a ticket was bought cannot
  // have sold it -- this is the exact check that would have caught the spurious
  // "Loxleys has the account's best ROAS" headline before it was published.
  const byItem = new Map();
  for (const r of itemsDaily) {
    const n = r.itemName;
    if (!byItem.has(n)) byItem.set(n, []);
    if (num(r.itemsPurchased) > 0) byItem.get(n).push(`${r.date}×${num(r.itemsPurchased)}`);
  }
  push(`### Sale dates per item — check any ad-credit claim against these\n`);
  push(mdTable(
    ['item', 'dates purchased'],
    Array.from(byItem.entries()).filter(([, d]) => d.length).map(([n, d]) => [n, d.join(', ')])
  ));

  // Additivity: what closes and what does not.
  const revSourceTotal = revSource.reduce((a, r) => a + num(r.totalRevenue), 0);
  const revItemTotal = revItem.reduce((a, r) => a + num(r.itemRevenue), 0);
  const itemsDailyTotal = itemsDaily.reduce((a, r) => a + num(r.itemRevenue), 0);
  push(`### Additivity checks\n`);
  push(mdTable(
    ['check', 'a', 'b', 'gap'],
    [
      ['revenue-by-source vs revenue-daily', money(revSourceTotal), money(totalRev), money(revSourceTotal - totalRev)],
      ['revenue-by-item vs items-daily', money(revItemTotal), money(itemsDailyTotal), money(revItemTotal - itemsDailyTotal)],
      ['revenue-by-item vs transaction total', money(revItemTotal), money(totalRev), money(revItemTotal - totalRev)],
    ],
    ['', 'r', 'r', 'r']
  ));
  push(`A non-zero item-vs-transaction gap is expected here and is the documented 2-for-1 item-count effect (#205), not a new discrepancy.\n`);

  const tx = use(tables, 'transactions');
  const idCount = new Map();
  const idDates = new Map();
  for (const r of tx) {
    const id = r.transactionId;
    idCount.set(id, (idCount.get(id) || 0) + num(r.transactions));
    if (!idDates.has(id)) idDates.set(id, new Set());
    idDates.get(id).add(r.date);
  }
  const reused = Array.from(idCount.entries()).filter(([, c]) => c > 1);
  const spanning = Array.from(idDates.entries()).filter(([, d]) => d.size > 1);
  push(`### transaction_id reuse\n`);
  push(`**${idCount.size} distinct ids** carry **${Array.from(idCount.values()).reduce((a, b) => a + b, 0)} transactions**. ` +
       `${reused.length} ids appear more than once (max ${Math.max(0, ...idCount.values())} on one id); ` +
       `${spanning.length} span more than one date. Open question from PR #200 — counted here, cause not investigated.\n`);

  use(tables, 'audiences');
  use(tables, 'cohort-retention');
  use(tables, 'revenue-daily');

  // ---- UTM HYGIENE --------------------------------------------------------
  push(`## 4. UTM and tagging defects\n`);
  const h = utmHygiene(tables);

  push(`Every defect below is dated. **LIVE** = produced a session in the last closed week (from ${h.liveFrom || '—'}); ` +
       `**stale** = within the last four closed weeks; **DEAD** = older than that and not worth anyone's morning. ` +
       `A window-wide table cannot tell these apart, which is how one dead bug stayed on the action list for seven ` +
       `consecutive reports.\n`);

  push(`### 4a. One advertiser, many rows (fragmentation)\n`);
  push(`Each cluster below is a SINGLE source split across several GA4 rows, so no row shows what it actually did.\n`);
  for (const f of h.fragmentation.slice(0, 6)) {
    const live = f.rows.filter((r) => r.status === 'LIVE');
    push(`**${f.source}** — ${f.variants} variants (${live.length} still live), ${f.sessions} sessions, ` +
         `${f.keyEvents} key events, ${money(f.revenue)} combined:\n`);
    push(mdTable(
      ['raw row', 'sessions', 'key events', 'revenue', 'status', 'last seen'],
      f.rows.map((r) => ['`' + r.raw + '`', r.sessions, r.keyEvents, money(r.revenue), r.status, r.lastSeen || '—']),
      ['', 'r', 'r', 'r', '', '']
    ));
  }

  push(`### 4b. Our own site tagging its own internal links\n`);
  push(`A utm-tagged INTERNAL link starts a new GA4 session and overwrites the visitor's real acquisition source. ` +
       `Every session below was taken from whichever channel actually paid for it.\n`);
  push(mdTable(
    ['row', 'sessions', 'users', 'key events', 'revenue', 'status', 'last seen'],
    h.internal.map((r) => ['`' + r.raw + '`', r.sessions, r.users, r.keyEvents, money(r.revenue), r.status, r.lastSeen || '—']),
    ['', 'r', 'r', 'r', 'r', '', '']
  ));
  const internalLive = h.internal.filter((r) => r.status === 'LIVE');
  push(`Total: **${h.internal.reduce((a, r) => a + r.sessions, 0)} sessions** mis-credited to internal elements ` +
       `across the window, of which **${internalLive.length} row(s) are still live** ` +
       `(${internalLive.reduce((a, r) => a + r.sessions, 0)} sessions). If none is live, this is history: say so and ` +
       `stop carrying it as an action.\n`);

  push(`### 4c. Broken and placeholder values\n`);
  push(mdTable(
    ['where', 'value', 'rows', 'sessions', 'key events', 'status', 'last seen'],
    h.broken.slice(0, 15).map((r) => [r.where, '`' + r.value + '`', r.rows, r.sessions, r.keyEvents,
      r.status || '—', r.lastSeen || '—']),
    ['', '', 'r', 'r', 'r', '', '']
  ));

  if (h.obfuscated.length) {
    push(`### 4d. Obfuscated tags\n`);
    push(`Letters a–f shift +1, g–z ROT13. Ciphertext b–g has two pre-images, so the decode is resolved per word ` +
         `against a word list — treat it as a strong lead, not a fact.\n`);
    push(mdTable(
      ['raw', 'decoded', 'sessions', 'key events', 'revenue', 'same channel, plaintext row'],
      h.obfuscated.map((r) => ['`' + r.raw + '`', '`' + r.decodedFull + '`', r.sessions, r.keyEvents, money(r.revenue),
        r.plaintextTwin ? '`' + r.plaintextTwin + '` (' + r.twinSessions + ')' : '—']),
      ['', '', 'r', 'r', 'r', '']
    ));
    const paired = h.obfuscated.filter((r) => r.plaintextTwin);
    if (paired.length) {
      push(`\nEach paired row is ONE channel appearing twice. Its real totals are the sum: ` +
           paired.map((r) => `**${r.decodedFull.split(' / ')[0]} = ${r.combinedSessions} sessions, ${r.combinedKeyEvents} key events**`).join('; ') +
           `. Reading either row alone understates the channel.\n`);
    }
  }

  push(`### 4e. Campaigns spending sessions and returning nothing (≥20 sessions, 0 key events)\n`);
  push(mdTable(
    ['campaign', 'utm_content', 'sessions'],
    h.deadCampaigns.slice(0, 15).map((r) => [r.campaign, r.content, r.sessions]),
    ['', '', 'r']
  ));

  push(`### 4f. utm_content shared across campaigns\n`);
  push(`\`content/brand.json\` requires utm_content to be unique per ad. A shared value cannot be split apart in GA4 afterwards.\n`);
  push(mdTable(
    ['utm_content', 'campaigns it appears under'],
    h.sharedContent.slice(0, 10).map((r) => ['`' + r.content + '`', r.campaigns.join(', ')])
  ));

  push(`### 4g. Auto-tagging overwriting a manual campaign\n`);
  push(mdTable(
    ['auto-tagged as', 'manual tag it replaced', 'sessions'],
    h.overwritten.slice(0, 10).map((r) => [r.autoTagged, r.manual, r.sessions]),
    ['', '', 'r']
  ));

  // ---- LANDING PAGES AND CONTENT -----------------------------------------
  push(`## 5. Landing pages, content and promotions\n`);
  const landing = use(tables, 'landing-pages');
  push(mdTable(
    ['landing page', 'sessions', 'users', 'key events', 'conv rate', 'revenue'],
    landing.slice(0, 15).map((r) => [r.landingPage, num(r.sessions), num(r.totalUsers), num(r.keyEvents),
      pct(num(r.keyEvents), num(r.sessions)), money(num(r.totalRevenue))]),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));
  const deadPages = landing
    .filter((r) => num(r.sessions) >= 15 && num(r.keyEvents) === 0)
    .sort((a, b) => num(b.sessions) - num(a.sessions));
  push(`### Pages taking real traffic and returning nothing (≥15 sessions, 0 key events)\n`);
  push(mdTable(
    ['landing page', 'sessions', 'users'],
    deadPages.map((r) => [r.landingPage, num(r.sessions), num(r.totalUsers)]),
    ['', 'r', 'r']
  ));
  push(`Open each of these in \`public/\` and name the specific reason — CTA below the fold, no visible path to ` +
       `\`/event\`, message mismatch against the ad that sent them, or a newsletter signup as the only conversion.\n`);

  const pv = use(tables, 'page-views');
  const pvAgg = new Map();
  for (const r of pv) {
    const p = r.pagePath;
    const cur2 = pvAgg.get(p) || { views: 0, sessions: 0, title: r.pageTitle };
    cur2.views += num(r.screenPageViews); cur2.sessions += num(r.sessions);
    pvAgg.set(p, cur2);
  }
  push(`### Pages per session, by path (top 12 by views)\n`);
  push(mdTable(
    ['path', 'views', 'sessions', 'views / session'],
    Array.from(pvAgg.entries()).sort((a, b) => b[1].views - a[1].views).slice(0, 12)
      .map(([p, v]) => [p, v.views, v.sessions, v.sessions ? (v.views / v.sessions).toFixed(2) : '—']),
    ['', 'r', 'r', 'r']
  ));

  const promos = use(tables, 'promotions');
  push(`### Promotions\n`);
  push(mdTable(
    ['promotion', 'slot', 'viewed', 'clicked', 'CTR'],
    promos.map((r) => [r.itemPromotionName, r.itemPromotionCreativeSlot, num(r.itemsViewedInPromotion),
      num(r.itemsClickedInPromotion), pct(num(r.itemsClickedInPromotion), num(r.itemsViewedInPromotion))]),
    ['', '', 'r', 'r', 'r']
  ));
  push(`\`/lp\` is where cold paid traffic lands and the home page is warm and low-volume, so a CTR gap between ` +
       `them is a channel-mix difference before it is a page defect. Promotions CTR is only computable on windows ` +
       `starting 2026-08-28 or later — earlier rows read clicks > views.\n`);

  // Landing page x source. This cross-tab is what makes a dead channel visible:
  // one source landing on the SAME page as a converting source, and returning
  // nothing, is a channel problem, not a page problem — and the comparison is
  // only available here.
  const lbs = use(tables, 'landing-by-source');
  const pairs = lbs.map((r) => ({
    page: r.landingPage,
    source: r.sessionSourceMedium,
    sessions: num(r.sessions),
    users: num(r.totalUsers),
    keyEvents: num(r.keyEvents),
    revenue: num(r.totalRevenue),
  }));
  const deadPairs = pairs.filter((p) => p.sessions >= 20 && p.keyEvents === 0)
    .sort((a, b) => b.sessions - a.sessions);
  push(`### Landing page × source — biggest combinations returning nothing (≥20 sessions, 0 key events)\n`);
  push(mdTable(
    ['landing page', 'source / medium', 'sessions', 'users'],
    deadPairs.slice(0, 15).map((p) => [p.page, p.source, p.sessions, p.users]),
    ['', '', 'r', 'r']
  ));
  // For each dead pair's page, name a source that DID convert on the same page.
  const converters = new Map();
  for (const p of pairs) {
    if (p.keyEvents <= 0) continue;
    const best = converters.get(p.page);
    if (!best || p.keyEvents > best.keyEvents) converters.set(p.page, p);
  }
  const contrasts = deadPairs.slice(0, 8).filter((p) => converters.has(p.page));
  if (contrasts.length) {
    push(`Same page, a source that DOES convert — so the page is not the explanation:\n`);
    push(mdTable(
      ['landing page', 'dead source', 'its sessions', 'converting source', 'its sessions', 'its key events', 'its revenue'],
      contrasts.map((p) => {
        const c = converters.get(p.page);
        return [p.page, p.source, p.sessions, c.source, c.sessions, c.keyEvents, money(c.revenue)];
      }),
      ['', '', 'r', '', 'r', 'r', 'r']
    ));
  }

  // ---- FUNNELS ------------------------------------------------------------
  // GA4 funnel exports carry a RESERVED_TOTAL row per step: that is the total,
  // not a breakdown value, and summing it with the others double-counts.
  push(`## 6. Funnels and checkout\n`);

  const stepOrder = (rows) => Array.from(new Set(rows.map((r) => r.funnelStepName)));
  const renderFunnel = (key, dim, title) => {
    const rows = use(tables, key);
    if (!rows.length) return;
    const steps = stepOrder(rows);
    const totals = steps.map((s) => rows.find((r) => r.funnelStepName === s && r[dim] === 'RESERVED_TOTAL'));
    push(`### ${title}\n`);
    if (totals[0]) {
      const body = steps.map((s, i) => {
        const t = totals[i];
        if (!t) return [s, '—', '—', '—'];
        const prev = i > 0 && totals[i - 1] ? num(totals[i - 1].activeUsers) : null;
        const drop = prev === null ? '' : `−${prev - num(t.activeUsers)}`;
        return [s, num(t.activeUsers), (num(t.funnelStepCompletionRate) * 100).toFixed(1) + '%', drop];
      });
      push(mdTable(['step', 'users', 'step completion', 'lost vs previous'], body, ['', 'r', 'r', 'r']));
      // Largest absolute loss between consecutive steps.
      let worst = null;
      for (let i = 1; i < totals.length; i++) {
        if (!totals[i] || !totals[i - 1]) continue;
        const lost = num(totals[i - 1].activeUsers) - num(totals[i].activeUsers);
        if (!worst || lost > worst.lost) worst = { lost, from: steps[i - 1], to: steps[i] };
      }
      if (worst) push(`Largest single loss: **${worst.lost} users** between \`${worst.from}\` and \`${worst.to}\`.\n`);
    }
    // Breakdown matrix: users per step per dimension value, biggest values only.
    const vals = Array.from(new Set(rows.map((r) => r[dim]).filter((v) => v && v !== 'RESERVED_TOTAL')));
    const firstStep = steps[0];
    const ranked = vals
      .map((v) => ({ v, n: num((rows.find((r) => r.funnelStepName === firstStep && r[dim] === v) || {}).activeUsers) }))
      .sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.v);
    if (ranked.length) {
      push(mdTable(
        ['step', ...ranked],
        steps.map((s) => [s, ...ranked.map((v) => {
          const r = rows.find((x) => x.funnelStepName === s && x[dim] === v);
          return r ? num(r.activeUsers) : 0;
        })]),
        ['', ...ranked.map(() => 'r')]
      ));
    }
  };

  renderFunnel('funnel-by-channel', 'sessionDefaultChannelGroup', 'Purchase funnel by channel');
  renderFunnel('funnel-by-device', 'deviceCategory', 'Purchase funnel by device');
  renderFunnel('funnel-checkout-by-landing-page', 'landingPage', 'Checkout path by landing page');
  renderFunnel('funnel-webview-vs-normal', 'segment', 'Webview vs normal browser');

  const waitlist = use(tables, 'funnel-waitlist-sequence');
  if (waitlist.length) {
    push(`### Waitlist sequence (view_item → generate_lead)\n`);
    push(mdTable(
      ['step', 'users', 'completion', 'abandonments'],
      waitlist.map((r) => [r.funnelStepName, num(r.activeUsers),
        (num(r.funnelStepCompletionRate) * 100).toFixed(1) + '%', num(r.funnelStepAbandonments)]),
      ['', 'r', 'r', 'r']
    ));
  }

  // The two ratios this business scores its checkout on.
  const evCount = new Map(events.map((r) => [r.eventName, num(r.eventCount)]));
  const ratio = (a, b) => (evCount.get(b) ? ((100 * (evCount.get(a) || 0)) / evCount.get(b)).toFixed(1) + '%' : '—');
  push(`### The two checkout ratios\n`);
  push(mdTable(
    ['ratio', 'value', 'numerator', 'denominator'],
    [
      ['add_to_cart ÷ begin_checkout', ratio('add_to_cart', 'begin_checkout'), evCount.get('add_to_cart') || 0, evCount.get('begin_checkout') || 0],
      ['add_payment_info ÷ begin_checkout', ratio('add_payment_info', 'begin_checkout'), evCount.get('add_payment_info') || 0, evCount.get('begin_checkout') || 0],
      ['purchase ÷ begin_checkout', ratio('purchase', 'begin_checkout'), evCount.get('purchase') || 0, evCount.get('begin_checkout') || 0],
    ],
    ['', 'r', 'r', 'r']
  ));
  push(`Benchmarks before the 2026-09-03 form rebuild: 24% paid / 30% all-channel on the first, 10% on the second.\n`);

  const wv = use(tables, 'webview-by-event');
  const wvAgg = new Map();
  for (const r of wv) {
    const seg = r['customEvent:in_app_browser'] || '(not set)';
    const cur3 = wvAgg.get(seg) || {};
    cur3[r.eventName] = num(r.eventCount);
    wvAgg.set(seg, cur3);
  }
  const wvEvents = ['page_view', 'view_item', 'begin_checkout', 'add_to_cart', 'purchase'];
  push(`### In-app browser segment, by event\n`);
  push(mdTable(
    ['segment', ...wvEvents],
    Array.from(wvAgg.entries()).map(([seg, m]) => [seg, ...wvEvents.map((e) => m[e] || 0)]),
    ['', ...wvEvents.map(() => 'r')]
  ));

  const cerr = use(tables, 'checkout-errors');
  const creason = use(tables, 'checkout-error-reasons');
  push(`### Checkout errors\n`);
  push(mdTable(['category', 'events', 'users'],
    cerr.map((r) => [r['customEvent:category'] || '(blank)', num(r.eventCount), num(r.totalUsers)]), ['', 'r', 'r']));
  push(mdTable(['reason', 'events', 'users'],
    creason.map((r) => [r['customEvent:reason'] || '(blank)', num(r.eventCount), num(r.totalUsers)]), ['', 'r', 'r']));
  push(`\`card_incomplete\` was 8 users lifetime historically; it should not grow faster than checkout form views do.\n`);

  // ---- GOOGLE ADS ---------------------------------------------------------
  push(`## 7. Google Ads\n`);
  const gaCost = use(tables, 'google-ads-cost');
  push(mdTable(
    ['campaign', 'cost', 'clicks', 'impressions', 'CPC', 'ROAS'],
    gaCost.map((r) => [r.sessionCampaignName, money(num(r.advertiserAdCost)), num(r.advertiserAdClicks),
      num(r.advertiserAdImpressions), money(num(r.advertiserAdCostPerClick)), num(r.returnOnAdSpend).toFixed(2)]),
    ['', 'r', 'r', 'r', 'r', 'r']
  ));
  const gaNet = use(tables, 'google-ads-by-network');
  push(mdTable(
    ['campaign', 'type', 'network', 'cost', 'clicks', 'impressions'],
    gaNet.map((r) => [r.sessionGoogleAdsCampaignName, r.sessionGoogleAdsCampaignType, r.sessionGoogleAdsAdNetworkType,
      money(num(r.advertiserAdCost)), num(r.advertiserAdClicks), num(r.advertiserAdImpressions)]),
    ['', '', '', 'r', 'r', 'r']
  ));
  const gaCre = use(tables, 'google-ads-creatives');
  push(mdTable(
    ['ad group', 'creative', 'cost', 'clicks', 'impressions'],
    gaCre.map((r) => [r.sessionGoogleAdsAdGroupId, r.sessionGoogleAdsCreativeId, money(num(r.advertiserAdCost)),
      num(r.advertiserAdClicks), num(r.advertiserAdImpressions)]),
    ['', '', 'r', 'r', 'r']
  ));
  const gaDaily = use(tables, 'google-ads-cost-daily');
  const gaClosed = closedDates(gaDaily).closed;
  const gaRecent = gaClosed.slice(-7);
  const gaSpendRecent = gaDaily.filter((r) => gaRecent.includes(r.date)).reduce((a, r) => a + num(r.advertiserAdCost), 0);
  push(`Spend on the last 7 CLOSED days: **${money(gaSpendRecent)}** — ` +
       `${gaSpendRecent > 0 ? 'the account is still accruing cost' : 'the account is dormant'}.\n`);

  const pcs = use(tables, 'paid-cost-vs-sessions');
  const costNoSessions = pcs.filter((r) => num(r.advertiserAdCost) > 0 && num(r.sessions) === 0);
  push(`### Campaigns with recorded cost and zero sessions\n`);
  push(mdTable(
    ['campaign', 'platform', 'source / medium', 'cost', 'sessions'],
    costNoSessions.map((r) => [r.sessionCampaignName, r.sessionSourcePlatform, r.sessionSourceMedium,
      money(num(r.advertiserAdCost)), num(r.sessions)]),
    ['', '', '', 'r', 'r']
  ));

  // ---- NEW SOURCES --------------------------------------------------------
  // daily-by-source is the only table that can date a source's first appearance.
  const dbs = use(tables, 'daily-by-source');
  const firstSeen = new Map();
  for (const r of dbs) {
    const s = r.sessionSourceMedium;
    if (!firstSeen.has(s) || r.date < firstSeen.get(s)) firstSeen.set(s, r.date);
  }
  const { closed: dbsClosed } = closedDates(dbs);
  const cutoff = dbsClosed.slice(-7)[0];
  const brandNew = Array.from(firstSeen.entries())
    .filter(([, d]) => cutoff && d >= cutoff)
    .map(([s, d]) => ({ source: s, first: d, sessions: dbs.filter((r) => r.sessionSourceMedium === s).reduce((a, r) => a + num(r.sessions), 0) }))
    .sort((a, b) => b.sessions - a.sessions);
  push(`### Sources seen for the first time in the last 7 closed days\n`);
  push(`A source appearing here that nobody tagged deliberately is either a new listing going live or a tagging defect.\n`);
  push(mdTable(
    ['source / medium', 'first seen', 'sessions since'],
    brandNew.slice(0, 15).map((r) => [r.source, r.first, r.sessions]),
    ['', '', 'r']
  ));

  // ---- COVERAGE LEDGER ----------------------------------------------------
  // Everything not touched above is named here. An unread table is meant to be
  // visible and uncomfortable, not silently absent.
  push(`## 8. Coverage ledger\n`);
  const keys = Object.keys(tables).sort();
  const unread = keys.filter((k) => !tables[k].read);
  push(`**${keys.length - unread.length} of ${keys.length}** tables are represented in the standing summary above.\n`);
  push(mdTable(
    ['table', 'rows', 'in standing summary'],
    keys.map((k) => [k, tables[k].rowCount, tables[k].read ? 'yes' : '**NO — read it or say why not**']),
    ['', 'r', '']
  ));
  if (unread.length) {
    push(`\nNot yet represented: ${unread.map((u) => '`' + u + '`').join(', ')}.`);
    push(`The report must either analyse each of these or state, per table, why it holds nothing worth saying tonight.\n`);
  }

  return out.join('\n');
}

// ---------------------------------------------------------------------------

function main() {
  const dir = resolveDir();
  const date = argOf('date') || newestDate(dir);
  const tables = loadPull(dir, date);
  if (!Object.keys(tables).length) throw new Error(`No tables for ${date} in ${dir}`);

  if (hasFlag('json')) {
    const md = build(tables, date, dir); // populates .read
    process.stdout.write(JSON.stringify({
      date, dir, markdown: md,
      tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, { rows: v.rowCount, read: v.read }])),
      hygiene: utmHygiene(tables),
    }, null, 2));
    return;
  }
  process.stdout.write(build(tables, date, dir));
}

if (require.main === module) {
  try { main(); } catch (e) {
    process.stderr.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  }
}

module.exports = { parseFile, splitCsvLine, closedDates, disjointBuckets, normSource, splitSourceMedium, deobfuscate, utmHygiene, loadPull };
