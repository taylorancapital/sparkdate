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
 * WHAT IT WILL NOT DO: invent a fact. Attendance figures, spot counts and
 * run-of-show details are not synthesized. Where the source disagrees with
 * itself the pack prints a warning and omits the claim rather than picking a
 * side -- see FORMAT_DISPUTE below.
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

const REPO = path.join(__dirname, '..');
const BRAND = path.join(REPO, 'content', 'brand.json');
const SITES = path.join(REPO, 'content', 'listing-sites.json');
const SITE_ORIGIN = 'https://sparkdate.date';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};

// ── The one thing the generator must not guess ────────────────────────
// content/brand.json (events.TL.open_issues) records that a live listing
// described the night as "no bell, no rotation, no timer" and calls that
// WRONG -- stating the real run of show ends with 7-minute matched rounds.
// The public blog at /blog/how-same-night-matching-works still says the
// first version. Both are ours and they contradict each other.
//
// A listing description is the exact place that contradiction would harden
// into a promise to a stranger, so the generator writes around it: every
// element both sources agree on is used, the disputed mechanic is omitted,
// and the pack says so at the top. Resolve it in brand.json and on the blog,
// then add the sentence here on purpose.
const FORMAT_DISPUTE = {
  omitted: 'structured rounds vs. open mingling (whether the night ends in timed matched rounds)',
  sources: [
    'content/brand.json events.TL.open_issues -- "7-minute matched rounds LAST"',
    '/blog/how-same-night-matching-works -- "no bell, no forced rotation, no seven-minute timer"',
  ],
};

// ── Fetch the public event record ─────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'sparkdate-listing-pack' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchUpcomingEvents() {
  const xml = await fetchText(`${SITE_ORIGIN}/sitemap.xml`);
  const urls = [...xml.matchAll(/<loc>([^<]*\/event\?id=[^<]*)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  );
  if (!urls.length) throw new Error('sitemap listed no event pages -- is /sitemap.xml healthy?');

  const events = [];
  for (const url of urls) {
    const html = await fetchText(url);
    const m = html.match(
      /<script type="application\/ld\+json" id="event-jsonld">([\s\S]*?)<\/script>/,
    );
    if (!m) {
      console.error(`  ! no JSON-LD on ${url} -- skipped`);
      continue;
    }
    const ld = JSON.parse(m[1].replace(/\\u003c/g, '<'));
    const start = new Date(ld.startDate);
    if (start < new Date()) continue; // past events are not syndicated
    events.push({
      id: new URL(url).searchParams.get('id'),
      url,
      name: ld.name,
      description: ld.description,
      start,
      end: ld.endDate ? new Date(ld.endDate) : null,
      venue: ld.location && ld.location.name,
      address: ld.location && ld.location.address,
      price: ld.offers && Number(ld.offers.price),
      currency: (ld.offers && ld.offers.priceCurrency) || 'USD',
      priceValidUntil: ld.offers && ld.offers.priceValidUntil
        ? new Date(ld.offers.priceValidUntil) : null,
      image: Array.isArray(ld.image) ? ld.image[0] : ld.image,
    });
  }
  events.sort((a, b) => a.start - b.start);
  return events;
}

// ── Join the public record to brand.json ──────────────────────────────
// brand.json holds the event_key (MC, LX) that the UTM campaign is built
// from, plus the market hashtag pool. Match on event_id, never on name --
// names get edited on the live page and the key must survive that.

function matchBrandEvent(brand, eventId) {
  for (const [key, ev] of Object.entries(brand.events || {})) {
    if (ev.event_id === eventId) return { key, ...ev };
  }
  return null;
}

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

// ── UTM ───────────────────────────────────────────────────────────────

function taggedUrl(event, brandEv, site, utmCfg) {
  const key = (brandEv ? brandEv.key : 'evt').toLowerCase();
  const campaign = `${key}_${yyyymm(event.start)}`;
  const u = new URL(event.url);
  u.searchParams.set('utm_source', site.utm_source);
  u.searchParams.set('utm_medium', utmCfg.medium);
  u.searchParams.set('utm_campaign', campaign);
  u.searchParams.set('utm_content', `${key}_${site.key}`);
  return u.toString();
}

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
    `A real-life singles night in ${city}. Show up, meet people face to face over a drink, ` +
    `and privately note who you'd like to see again. Mutual interest becomes a match before ` +
    `you get home — no app to download, no waiting on a reply that never comes. ` +
    `${dateLong(event.start)}, doors ${timeOf(event.start)}. ${money(event.price)}.`;

  const long = [
    `${event.description}`,
    ``,
    `**How the night works.** You check in with a host and get a name badge — there's nothing ` +
    `to download and no profile to fill out at the door. You spend the evening actually talking ` +
    `to people. Near the end you privately note anyone you'd like to see again; it takes under a ` +
    `minute and nobody else sees it. If someone noted you back, that's a match, and you both get ` +
    `it that night rather than after some review period.`,
    ``,
    `**Why it's built this way.** Everyone in the room came out on purpose on a ${fmt(event.start, { weekday: 'long' })} ` +
    `night. That's a filter no dating app has. The awkward part — working out whether it was ` +
    `mutual — is handled quietly for you, so the evening itself stays a normal night out.`,
    ``,
    `**Details.**`,
    `- ${dateLong(event.start)}`,
    `- Doors ${timeOf(event.start)}${event.end ? ` — ${timeOf(event.end)}` : ''}`,
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
  out.push(`> **One claim is deliberately missing from every description below:**`);
  out.push(`> ${FORMAT_DISPUTE.omitted}.`);
  out.push(`> Two of our own sources contradict each other on it:`);
  FORMAT_DISPUTE.sources.forEach((s) => out.push(`> - ${s}`));
  out.push(`> A listing is a promise to a stranger, so the copy is written around it. Settle it`);
  out.push(`> in both places, then add the sentence on purpose.`);
  out.push(``);

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
    out.push(`| When | ${dateLong(event.start)}, ${timeOf(event.start)}${event.end ? `–${timeOf(event.end)}` : ''} ET |`);
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

    out.push(`### Tagged links — one per site`);
    out.push(``);
    out.push(`| Site | Status | Ticket URL to paste |`);
    out.push(`|---|---|---|`);
    for (const site of active) {
      if (site.market && site.market !== 'any' && brandEv && site.market !== brandEv.market) continue;
      out.push(`| ${site.name} | ${site.status} | \`${taggedUrl(event, brandEv, site, utmCfg)}\` |`);
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
    const json = JSON.stringify({ generated: new Date().toISOString(), format_dispute: FORMAT_DISPUTE, events: payload, sites: sites.sites }, null, 2);
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

module.exports = { taggedUrl, buildCopy, matchBrandEvent, fetchUpcomingEvents, FORMAT_DISPUTE };
