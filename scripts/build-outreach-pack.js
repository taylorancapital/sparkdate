#!/usr/bin/env node
/**
 * scripts/build-outreach-pack.js
 *
 * Builds the paste-ready pack for WOMEN-FACING outreach: the ask to send a
 * local business, the post to put in a community group, and the ticket link
 * with UTMs already attached, per surface per event.
 *
 * Sibling of scripts/build-listing-pack.js and it exists for the same reason:
 * so copy is generated from the event record ONCE instead of being retyped
 * into a browser. Retyping is where the wrong price and the other city's
 * details kept creeping in.
 *
 * WHAT IT WILL NOT DO
 *
 *  - Invent a fact. Everything factual comes from the live event page's
 *    schema.org JSON-LD, the same data a crawler sees.
 *  - State a duration. Round count, minutes per round and minutes per 1-on-1
 *    are all host-settable per event -- see brand.json universal.run_of_show
 *    and the FORMAT note in build-listing-pack.js.
 *  - Write an offer. Comped seats, discounts, revenue share and exclusivity
 *    are Taylor's to state, so the partner ask ships with a bracketed blank
 *    where the offer goes. See _never_offer_terms in women-surfaces.json --
 *    the same mistake was made with venues once already.
 *
 * NO CREDENTIALS, on purpose: it has to run from a worktree, where
 * .env.local does not exist.
 *
 * Usage:
 *   node scripts/build-outreach-pack.js                     # every surface, every event
 *   node scripts/build-outreach-pack.js --event=LX          # one event
 *   node scripts/build-outreach-pack.js --motion=partner    # partner | community
 *   node scripts/build-outreach-pack.js --json
 *   node scripts/build-outreach-pack.js --out=build/outreach-pack.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  SITE_ORIGIN, brand, fetchUpcomingEvents, matchBrandEvent, taggedUrl,
} = require('../lib/listing-links');

const REPO = path.join(__dirname, '..');
const SURFACES = path.join(REPO, 'content', 'women-surfaces.json');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const has = (n) => process.argv.includes(`--${n}`);

const surfaces = () => JSON.parse(fs.readFileSync(SURFACES, 'utf8'));

const fmtDate = (d) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
}).format(d);

const fmtTime = (d) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
}).format(d);

const money = (n) => (Number(n) % 1 === 0 ? `$${Number(n)}` : `$${Number(n).toFixed(2)}`);

// The city, from the event's own structured address, then the brand market.
//
// NEVER a hardcoded default. An earlier draft of this file fell back to
// 'Lancaster', which would have quietly written the wrong city into every
// Philadelphia post -- the same shape of bug as the GA4 "Facebook / facebook"
// mixup, and invisible until someone reads a live post carefully. When the
// city genuinely is not known, the copy drops the phrase instead of guessing.
function cityOf(ev, brandEv) {
  const a = ev.address;
  const fromLd = a && typeof a === 'object' ? a.addressLocality : null;
  if (fromLd) return String(fromLd);
  if (brandEv && brandEv.market) {
    return brandEv.market.charAt(0).toUpperCase() + brandEv.market.slice(1);
  }
  return null;
}

// "a singles night in Lancaster" / "a singles night" -- never "in undefined",
// and never in the wrong city.
const inCity = (city) => (city ? ` in ${city}` : '');

// The venue, or an honest vaguery. Not a fabricated room name.
const venueOf = (ev) => ev.venue || 'a spot in town';

// ── Copy ─────────────────────────────────────────────────────────────────
//
// Written for a reader who has not heard of us and is being told about it by
// someone she trusts. That framing is the whole point of the channel, so the
// copy leads with the trusted party ("your people"), not with us.

function partnerAsk(ev, brandEv, url) {
  const venue = venueOf(ev);
  const city = cityOf(ev, brandEv);
  return [
    `Subject: a local event your people might like — ${fmtDate(ev.start)}`,
    '',
    `Hi — I run SparkDate, a singles night${inCity(city)}. The next one is`,
    `${fmtDate(ev.start)} at ${venue}.`,
    '',
    `I'm reaching out because the people who have the best time at these are the ones who`,
    `come with a friend, and your members already have that. Rather than run more ads at`,
    `strangers, I'd rather it reach women who already trust where they heard about it.`,
    '',
    `Would you be open to sharing it with your people? Happy to make it worth your while —`,
    `[OFFER GOES HERE — Taylor fills this in].`,
    '',
    `Here's the event if you want a look: ${url}`,
    '',
    `Either way, no hard feelings and thanks for reading.`,
    '',
    `— Taylor, SparkDate`,
  ].join('\n');
}

function communityPost(ev, brandEv, url) {
  const venue = venueOf(ev);
  const city = cityOf(ev, brandEv);
  return [
    `Hi all — hoping this is allowed, mods please remove if not.`,
    '',
    `I run a singles night${inCity(city)} and the next one is ${fmtDate(ev.start)}`,
    `at ${venue}, doors ${fmtTime(ev.start)}.`,
    '',
    `It is not a bar crawl and it is not speed dating with a stopwatch. You get a table, an`,
    `icebreaker so nobody has to open cold, and hosts whose job is making sure you are not`,
    `standing on your own. Plenty of people come by themselves — that is the normal case here,`,
    `not the brave one.`,
    '',
    `${money(ev.price)} if anyone fancies it: ${url}`,
    '',
    `Happy to answer anything in the comments.`,
  ].join('\n');
}

// Exported for tests. The Philadelphia branch of cityOf() cannot be exercised
// from live data while every on-sale event is in Lancaster, which is exactly
// when a hardcoded city would go unnoticed.
module.exports = { cityOf, venueOf, inCity, partnerAsk, communityPost };

// ── Main ─────────────────────────────────────────────────────────────────
// Skipped when this file is require()'d by a test.
if (require.main !== module) return;

(async () => {
  const s = surfaces();
  const b = brand();
  const onlyEvent = arg('event', null);
  const onlyMotion = arg('motion', null);

  const events = (await fetchUpcomingEvents()).filter((e) => {
    if (!onlyEvent) return true;
    const be = matchBrandEvent(b, e.id);
    return be && be.key.toLowerCase() === onlyEvent.toLowerCase();
  });

  const live = s.surfaces.filter((x) => {
    if (x.status === 'rejected' || x.status === 'out_of_scope') return false;
    return onlyMotion ? x.motion === onlyMotion : true;
  });

  const rows = [];
  for (const event of events) {
    const brandEv = matchBrandEvent(b, event.id);
    for (const surface of live) {
      if (surface.market && surface.market !== 'any' && brandEv && surface.market !== brandEv.market) continue;
      const medium = surface.motion === 'partner' ? s._utm.medium_partner : s._utm.medium_community;
      const url = taggedUrl(event, brandEv, surface, { medium });
      rows.push({
        event_key: brandEv ? brandEv.key : null,
        event_title: event.name,
        starts: event.start.toISOString(),
        surface_key: surface.key,
        surface_name: surface.name,
        motion: surface.motion,
        audience: surface.audience || 'unknown',
        url: surface.url || null,
        tagged: url,
        copy: surface.motion === 'partner'
          ? partnerAsk(event, brandEv, url)
          : communityPost(event, brandEv, url),
        gotchas: surface.gotchas || [],
      });
    }
  }

  if (has('json')) {
    const out = JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2);
    const dest = arg('out', null);
    if (dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, out); }
    else console.log(out);
    return;
  }

  const L = [];
  L.push('# Women-facing outreach pack');
  L.push('');
  L.push(`Generated ${new Date().toISOString()} from the live event pages. ${rows.length} row(s).`);
  L.push('');
  L.push('## Read this before pasting anything');
  L.push('');
  L.push('- **The partner ask has a blank in it.** `[OFFER GOES HERE]` is deliberate — what');
  L.push('  a business gets in return is Taylor\'s to decide and to say. Do not fill it in.');
  L.push('- **No duration appears anywhere below.** Round count and minutes are host-settable');
  L.push('  per event; two of our own sources disagree. If a reply asks, ask Taylor.');
  L.push('- **A community post goes in only after its rules have been read.** Most local');
  L.push('  groups remove promotion, and the account posting is Taylor\'s personal profile.');
  L.push('- **Every link below is already tagged.** Do not retype one and do not reuse');
  L.push('  another surface\'s link — that is what makes one surface\'s result readable.');
  L.push('');

  if (!rows.length) {
    L.push('_No rows. Either no events are on sale, or `content/women-surfaces.json` has no');
    L.push('surface matching the filters — its `surfaces` array ships with three general-audience');
    L.push('groups and nothing women-specific yet. Run `/women-outreach discover` to populate it._');
  }

  let lastEvent = null;
  for (const r of rows) {
    if (r.event_key !== lastEvent) {
      L.push(`## ${r.event_title} (${r.event_key || 'untagged'})`);
      L.push('');
      lastEvent = r.event_key;
    }
    L.push(`### ${r.surface_name}`);
    L.push('');
    L.push(`- motion: **${r.motion}** · audience: ${r.audience}`);
    if (r.url) L.push(`- surface: ${r.url}`);
    L.push(`- tagged link: ${r.tagged}`);
    if (r.gotchas.length) {
      L.push('- gotchas:');
      for (const g of r.gotchas) L.push(`  - ${g}`);
    }
    L.push('');
    L.push('```');
    L.push(r.copy);
    L.push('```');
    L.push('');
  }

  const out = L.join('\n');
  const dest = arg('out', null);
  if (dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
    console.log(`Wrote ${dest} (${rows.length} rows)`);
  } else {
    console.log(out);
  }
})().catch((err) => {
  console.error('✗ build-outreach-pack failed:', err.message);
  process.exit(1);
});
