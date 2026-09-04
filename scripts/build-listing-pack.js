#!/usr/bin/env node
/**
 * scripts/build-listing-pack.js
 *
 * Builds the paste-ready pack for syndicating live events onto free event
 * listing sites: per-site title, short and long commentary, and the ticket
 * link with UTMs already attached.
 *
 * It exists so the copy is generated from the event record ONCE instead of
 * being retyped into eight forms. Retyping is where the wrong price and the
 * other city's hashtags kept creeping in -- the same failure that produced
 * scripts/build-campaign-export.js, one surface over.
 *
 * NO CREDENTIALS. Events come from the public sitemap plus each event page's
 * schema.org JSON-LD -- the same data a crawler sees. That is deliberate:
 * this has to run from a worktree, where .env.local does not exist, and the
 * listing copy must say exactly what the public page says.
 *
 * WHAT IT WILL NOT DO: invent a fact. Attendance figures and spot counts are
 * not synthesized, and the copy states the SHAPE of the night but never any
 * duration -- round count, minutes per round and minutes per 1-on-1 are all
 * settings the host picks per event. See FORMAT_NOTE below.
 *
 * Usage:
 *   node scripts/build-listing-pack.js                  # all upcoming events
 *   node scripts/build-listing-pack.js --event=LX       # one, by brand.json key
 *   node scripts/build-listing-pack.js --site=allevents # one site's rows only
 *   node scripts/build-listing-pack.js --json           # machine-readable
 *   node scripts/build-listing-pack.js --out=build/listing-pack.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  shortPath, SITE_ORIGIN, fetchUpcomingEvents, matchBrandEvent, taggedUrl,
} = require('../lib/listing-links');

const REPO = path.join(__dirname, '..');
const BRAND = path.join(REPO, 'content', 'brand.json');
const SITES = path.join(REPO, 'content', 'listing-sites.json');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};

// ── The format of the night ───────────────────────────────────────────
// SETTLED 2026-09-01. There is an icebreaker and there is a timer. The
// authority is the shipped chemistry tool in public/admin.html, not prose:
// balanced tables of ~6, 2-4 seatings of 10/15/20 minutes (default 4 x 15)
// with the men rotating one table per seating, then 1-on-1s of 5/7/10 minutes
// (default 7) that never repeat a pair. brand.json universal.run_of_show
// carries the record.
//
// The copy below deliberately states NO DURATION AT ALL. Every segment length
// is a per-event setting the host picks on the night, so a listing that names
// one commits a stranger to a number nobody has chosen yet -- and a listing
// cannot be edited once a calendar has moderated it. It says the SHAPE, which
// is fixed, and leaves every number to the host.
//
// The 1-on-1s used to be the one safe exception: ONE_ON_ONE_MS was hardcoded
// at five minutes, so the first version of this file printed "five-minute
// one-on-ones". #379 (merged 2026-09-01, the same day) made it settable and
// moved the default to SEVEN, which turned that sentence false in every
// listing already carrying it. There is no safe exception now.
//
// Several places on the live site still say the opposite ("no bell, no forced
// rotation, no seven-minute timer" / "no rotation and no timer"). They are
// listed in SITE_COPY_DEFECTS and printed with the pack, because a listing
// that describes the real format while the site denies it is a worse state
// than either one alone.
const FORMAT_NOTE = {
  settled: '2026-09-01, against public/admin.html',
  shape: 'doors and drinks → timed rounds at small tables, with a game as the icebreaker and the men moving one table each round → OPEN MINGLING → 1-on-1s → private interest notes → same-night matches. Three movements: structured, free, then paired.',
  omitted: 'the round count, the minutes per round, or the minutes per 1-on-1 (all three are per-event host settings)',
  _icebreaker: 'The game IS the tables, not a warm-up before them. Confirmed by Taylor 2026-09-01 after an earlier version of this file got it the other way round.',
};

// Surfaces on sparkdate.date that DENY the format above. Empty is the correct
// state: a listing that describes the real night while the site contradicts it
// is worse than either alone, which is why this list prints with every pack.
//
// Cleared 2026-09-04. All seven original entries are resolved -- two had been
// fixed earlier and were still listed here (how-same-night-matching-works.html
// now describes the game AT the tables; event.html now says the host "runs the
// icebreaker and keeps the rounds moving"), and the rest were fixed in that
// pass, along with public/lp.html which stated "drinks, then an icebreaker,
// then conversations" and was never on this list at all.
//
// NOTE the line numbers in the original entries had drifted and pointed at the
// wrong lines. If you add an entry, quote the offending TEXT -- a grep for the
// phrase survives an edit above it, a line number does not.
//
// Re-populate from a grep for the denial family: "no bell", "no whistle",
// "no rotation", "no forced rotation", "no rigid rotation", "no timer",
// "no seven-minute", "no three-minute", "no awkward icebreaker", plus any
// stated duration for a round or a 1-on-1.
const SITE_COPY_DEFECTS = [];

// Event fetching, brand-key matching and UTM tagging all live in
// lib/listing-links.js, shared with scripts/build-listing-redirects.js.
// Two builders producing the same URL independently is the defect this
// whole branch exists to stop repeating.

// ── Formatting ────────────────────────────────────────────────────────

const TZ = 'America/New_York';
const fmt = (d, opts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).format(d);

const dateLong = (d) => fmt(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const dateShort = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (d) => fmt(d, { hour: 'numeric', minute: '2-digit' });
const ymd = (d) => fmt(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2');
const yyyymm = (d) => ymd(d).slice(0, 7).replace('-', '');
const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// ── The commentary ────────────────────────────────────────────────────
// Three lengths because the forms want three lengths: a one-line teaser, a
// short blurb for a calendar grid, and a full description. All three are
// built from the same facts so they cannot drift apart.

function buildCopy(event, brandEv) {
  const city = (event.address && event.address.addressLocality) || '';
  const region = (event.address && event.address.addressRegion) || '';
  const where = [event.venue, city && `${city}${region ? ', ' + region : ''}`]
    .filter(Boolean).join(' — ');

  // Several venues have no real street address in Firestore -- streetAddress
  // is literally "Lancaster, PA 17602". Printing it after the city produces
  // "Lancaster, PA (Lancaster, PA 17602)". Only show it when it adds something.
  const street = (event.address && event.address.streetAddress) || '';
  const streetIsRedundant = !street || !/^\d/.test(street.trim());
  const wherefull = streetIsRedundant ? where : `${where} (${street})`;

  // END TIME: brand.json wins over the live page. The two AGREE as of
  // 2026-09-04 -- both say 8:30 PM, verified against the server-rendered
  // /event?id=... JSON-LD -- so this override currently changes nothing.
  //
  // It stays because of what it was written for. Before 2026-09-01 the
  // published endDate was 9:30 PM (DEFAULT_EVENT_DURATION_HOURS was 3, and
  // no event doc sets durationHours, so that constant is the published end
  // time). Reading the live page here would have printed the wrong hour onto
  // a moderated listing that cannot be edited afterwards. A listing site is
  // the one surface where being wrong is permanent, so it takes the
  // canonical record rather than the rendered one, agreement or not.
  // See reports/FACT_AUDIT_2026-09-01.md section 1.
  const endsFromBrand = brandEv && brandEv.ends;
  const endsFromPage = event.end ? timeOf(event.end) : null;
  const ends = endsFromBrand || endsFromPage;

  const earlyBird = event.priceValidUntil && event.priceValidUntil > new Date()
    ? event.priceValidUntil : null;

  // What the price BECOMES is the only urgency a listing can honestly carry,
  // and it lives in brand.json, not on the public page. Omit the clause
  // entirely when brand.json has no regular price to rise to -- an unbacked
  // "price goes up soon" is exactly the kind of invented fact the brand doc
  // bans.
  const regular = brandEv && brandEv.pricing && brandEv.pricing.regular;
  const risesTo = earlyBird && regular && regular > event.price ? regular : null;

  const title = event.name;

  const teaser =
    `${dateShort(event.start)} · ${event.venue}, ${city} · ${money(event.price)} — ` +
    `an in-person singles night where you find out the same evening who liked you back.`;

  const short =
    `A real-life singles night in ${city}. Timed rounds at small tables with a game to break ` +
    `the ice and the men moving along each round, then open mingling once you already know ` +
    `the room, then one-on-ones. At the end you privately note who you'd like to see ` +
    `again, and mutual interest becomes a match before you get home. ` +
    `${dateLong(event.start)}, doors ${timeOf(event.start)}. ${money(event.price)}.`;

  const long = [
    `${event.description}`,
    ``,
    // Name tags confirmed by Taylor 2026-09-01, settling a contradiction
    // between the blog and the two first-timer guides. See
    // reports/FACT_AUDIT_2026-09-01.md section 5.
    `**How the night works.** You check in with a host and get a name tag — there's nothing ` +
    `to download and no profile to fill out at the door. The evening runs in three movements.` +
    `

First, you're seated at a small table with a game to play — that's the icebreaker, so ` +
    `nobody has to invent an opening line cold — and the men move one table along each round, ` +
    `which means every round is a genuinely new set of people.` +
    `

Then the structure drops away and it's open mingling: go where you want, talk to whoever ` +
    `you want, for as long as it's working. By that point you've already met most of the room, ` +
    `so nobody is starting cold — which is the part a bar full of strangers never gets right.` +
    `

Last, one-on-ones with the people you haven't already sat with.` +
    `

Near the end you privately note anyone you'd like to see again; it takes under a minute ` +
    `and nobody else sees it. If someone noted you back, that's a match, and you both get it ` +
    `that night rather than after some review period.`,
    ``,
    `**Why it's built this way.** Everyone in the room came out on purpose on a ${fmt(event.start, { weekday: 'long' })} ` +
    `night. That's a filter no dating app has. The structure does the hard part — you never ` +
    `have to work out how to start or end a conversation — and the other awkward part, finding ` +
    `out whether it was mutual, is handled quietly for you afterwards.`,
    ``,
    `**Details.**`,
    `- ${dateLong(event.start)}`,
    `- Doors ${timeOf(event.start)}${ends ? ` — ${ends}` : ''}`,
    `- ${wherefull}`,
    `- ${money(event.price)} per ticket` +
      (earlyBird
        ? ` — this price holds through ${dateLong(earlyBird)}${risesTo ? `, then ${money(risesTo)}` : ''}`
        : ''),
    `- 21+ with valid ID`,
    ``,
    `Tickets and full details: {URL}`,
  ].join('\n');

  return { title, teaser, short, long };
}

// ── Render ────────────────────────────────────────────────────────────

function renderMarkdown(events, sites, utmCfg, brand) {
  const out = [];
  const today = ymd(new Date());

  out.push(`# SparkDate — free event-listing pack`);
  out.push(``);
  out.push(`Generated ${today} by \`scripts/build-listing-pack.js\`. Regenerate rather than`);
  out.push(`editing — prices and dates come from the live event pages and go stale here.`);
  out.push(``);
  out.push(`> **The format of the night**, settled ${FORMAT_NOTE.settled}:`);
  out.push(`> ${FORMAT_NOTE.shape}.`);
  out.push(`> The copy states that shape but not ${FORMAT_NOTE.omitted} — a moderated listing`);
  out.push(`> cannot be edited afterwards, so it must not commit the host to a number.`);
  out.push(``);
  if (SITE_COPY_DEFECTS.length) {
    out.push(`> ⚠ **The live site still contradicts this in ${SITE_COPY_DEFECTS.length} place${SITE_COPY_DEFECTS.length === 1 ? '' : 's'}.**`);
    out.push(`> These listings will describe the real format while sparkdate.date denies it:`);
    SITE_COPY_DEFECTS.forEach((d) => out.push(`> - ${d}`));
    out.push(``);
  }

  const active = sites.sites.filter((s) => s.status === 'active' || s.status === 'not_pursued' || s.status === 'dormant');

  for (const event of events) {
    const brandEv = matchBrandEvent(brand, event.id);
    const copy = buildCopy(event, brandEv);
    const key = brandEv ? brandEv.key : '??';
    const pool = (brandEv && brandEv.hashtag_pool) || [];

    out.push(`---`);
    out.push(``);
    out.push(`## ${event.name}`);
    out.push(``);
    out.push(`| | |`);
    out.push(`|---|---|`);
    out.push(`| Event key | \`${key}\`${brandEv ? '' : ' — **not in brand.json**, add it'} |`);
    const endsB = brandEv && brandEv.ends;
    const endsP = event.end ? timeOf(event.end) : null;
    out.push(`| When | ${dateLong(event.start)}, ${timeOf(event.start)}${endsB || endsP ? `–${endsB || endsP}` : ''} ET |`);
    if (endsB && endsP && endsB !== endsP) {
      out.push(`| | ⚠ the live event page says it ends at **${endsP}**. brand.json says **${endsB}** and that is what the copy above uses. They should agree — check \`DEFAULT_EVENT_DURATION_HOURS\` in \`lib/next-event.js\` first, then whether this event doc has set \`durationHours\` and overridden it. The page's schema.org endDate is what Google reads. |`);
    }
    out.push(`| Where | ${event.venue}${event.address && event.address.streetAddress ? `, ${event.address.streetAddress}` : ''} |`);
    const reg = brandEv && brandEv.pricing && brandEv.pricing.regular;
    const inEB = event.priceValidUntil && event.priceValidUntil > new Date();
    out.push(
      `| Price | ${money(event.price)}` +
      (inEB ? ` through ${dateLong(event.priceValidUntil)}` : '') +
      (inEB && reg && reg > event.price ? `, then ${money(reg)}` : '') + ` |`,
    );
    out.push(`| Canonical page | ${event.url} |`);
    out.push(`| Image | ${event.image} |`);
    out.push(``);

    const lead = Math.floor((event.start - new Date()) / 86400000);
    out.push(`**${lead} days out.**`);
    const blocked = active.filter(
      (s) => s.constraints && s.constraints.lead_time_days && lead < s.constraints.lead_time_days,
    );
    if (blocked.length) {
      out.push(``);
      blocked.forEach((s) =>
        out.push(`> ⚠ **${s.name}** wants ${s.constraints.lead_time_days} days' notice and this event is ${lead} out. ` +
          `Submit anyway if it is close, but expect it may not clear moderation — and get the NEXT event in on time.`),
      );
    }
    out.push(``);

    out.push(`### Title (paste as-is)`);
    out.push('```');
    out.push(copy.title);
    out.push('```');
    out.push(``);
    out.push(`### One-line teaser (${copy.teaser.length} chars)`);
    out.push('```');
    out.push(copy.teaser);
    out.push('```');
    out.push(``);
    out.push(`### Short description (${copy.short.length} chars)`);
    out.push('```');
    out.push(copy.short);
    out.push('```');
    out.push(``);
    out.push(`### Full description`);
    out.push(`Replace \`{URL}\` with the per-site tagged link from the table below.`);
    out.push('```');
    out.push(copy.long);
    out.push('```');
    out.push(``);
    if (pool.length) {
      out.push(`### Tags / keywords (from brand.json)`);
      out.push(pool.map((h) => h.replace(/^#/, '')).join(', '));
      out.push(``);
    }

    out.push(`### Ticket links — PASTE THE SHORT ONE`);
    out.push(``);
    out.push(`> Use the \`/l/\` link. It exists because listing sites mangle long`);
    out.push(`> query-strings without erroring: AllEvents HTML-escaped the ampersands`);
    out.push(`> (\`&amp;utm_source\` — page loads, GA4 sees nothing) and Discover`);
    out.push(`> Lancaster's 100-character field cap truncated \`utm_campaign\` and`);
    out.push(`> \`utm_content\` off the end. Both were found the hard way on 2026-09-01.`);
    out.push(`> The short link has nothing to escape and nothing to truncate.`);
    out.push(``);
    out.push(`| Site | Status | Paste this | Resolves to |`);
    out.push(`|---|---|---|---|`);
    for (const site of active) {
      if (site.market && site.market !== 'any' && brandEv && site.market !== brandEv.market) continue;
      const long = taggedUrl(event, brandEv, site, utmCfg);
      const short = `${SITE_ORIGIN}${shortPath(brandEv, site)}`;
      out.push(`| ${site.name} | ${site.status} | \`${short}\` | \`${long}\` |`);
    }
    out.push(``);
  }

  out.push(`---`);
  out.push(``);
  out.push(`## Sites, and what to do about each`);
  out.push(``);
  out.push(`| Site | Status | Cost | Submit at |`);
  out.push(`|---|---|---|---|`);
  for (const s of sites.sites) {
    out.push(`| ${s.name} | ${s.status} | ${s.cost || '—'} | ${s.submit_url ? s.submit_url : '—'} |`);
  }
  out.push(``);
  for (const s of sites.sites) {
    if (!s.gotchas && !s.rejected_reason && !s.why_now) continue;
    out.push(`### ${s.name} — ${s.status}`);
    if (s.why_now) out.push(`${s.why_now}`);
    if (s.rejected_reason) out.push(`${s.rejected_reason}`);
    if (s.reconsider_if) out.push(``, `*Reconsider if:* ${s.reconsider_if}`);
    if (s.constraints) {
      out.push(``);
      Object.entries(s.constraints).forEach(([k, v]) => out.push(`- **${k}:** ${v}`));
    }
    if (s.gotchas) {
      out.push(``);
      s.gotchas.forEach((g) => out.push(`- ${g}`));
    }
    out.push(``);
  }

  return out.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const brand = JSON.parse(fs.readFileSync(BRAND, 'utf8'));
  const sites = JSON.parse(fs.readFileSync(SITES, 'utf8'));
  const utmCfg = sites._utm;

  console.error('Reading live events from the public sitemap…');
  let events = await fetchUpcomingEvents();
  if (!events.length) {
    console.error('No upcoming events on sale. Nothing to syndicate.');
    process.exit(0);
  }

  const only = arg('event');
  if (only && only !== true) {
    events = events.filter((e) => {
      const b = matchBrandEvent(brand, e.id);
      return b && b.key.toLowerCase() === String(only).toLowerCase();
    });
    if (!events.length) {
      console.error(`No upcoming event with brand key "${only}".`);
      process.exit(1);
    }
  }
  console.error(`  ${events.length} upcoming event(s): ${events.map((e) => e.name).join('; ')}`);

  const siteFilter = arg('site');
  if (siteFilter && siteFilter !== true) {
    sites.sites = sites.sites.filter((s) => s.key === siteFilter);
    if (!sites.sites.length) {
      console.error(`No site with key "${siteFilter}" in content/listing-sites.json.`);
      process.exit(1);
    }
  }

  if (arg('json')) {
    const payload = events.map((e) => {
      const b = matchBrandEvent(brand, e.id);
      return {
        event_key: b ? b.key : null,
        ...e,
        copy: buildCopy(e, b),
        links: Object.fromEntries(
          sites.sites
            .filter((s) => s.submit_url)
            .map((s) => [s.key, taggedUrl(e, b, s, utmCfg)]),
        ),
      };
    });
    const json = JSON.stringify({ generated: new Date().toISOString(), format_note: FORMAT_NOTE, site_copy_defects: SITE_COPY_DEFECTS, events: payload, sites: sites.sites }, null, 2);
    const outJson = arg('out');
    if (outJson && outJson !== true) {
      fs.mkdirSync(path.dirname(outJson), { recursive: true });
      fs.writeFileSync(outJson, json);
      console.error(`Wrote ${outJson}`);
    } else {
      process.stdout.write(json + '\n');
    }
    return;
  }

  const md = renderMarkdown(events, sites, utmCfg, brand);
  const out = arg('out');
  if (out && out !== true) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
    console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(md + '\n');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { taggedUrl, buildCopy, matchBrandEvent, fetchUpcomingEvents, FORMAT_NOTE, SITE_COPY_DEFECTS };
