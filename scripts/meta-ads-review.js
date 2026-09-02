#!/usr/bin/env node
/**
 * scripts/meta-ads-review.js
 *
 * Read-only. Dumps EVERY ad the account has ever run -- active, paused,
 * finished, archived -- with the copy it carried, the audience it was aimed
 * at, and what it did, lifetime and split by gender. The point is a review
 * of past ads by a human, not a dashboard: "what have we said, to whom, and
 * which of it brought women".
 *
 * Why gender is the pivot: the events need a balanced room, and the memory
 * files record male-skewed nights (Good Good ran 16 men to 4 ticketed women).
 * Meta's own breakdown is the only per-ad gender signal we have -- GA4 has
 * no gender, and a ticket doc's gender arrives at checkout, after the ad.
 * Note what the breakdown can and cannot say: spend, impressions, clicks and
 * landing-page views by gender are solid; purchases by gender are Meta's
 * ATTRIBUTED conversions, a stricter measure than sales, and small numbers.
 *
 * Reads both places an ad carries UTMs (the link itself and creative
 * url_tags) -- see memory utm-process-map. Never compares creative video_id
 * to audience object ids (memory meta-video-rendition-ids).
 *
 * Reads each ad's own tracking_specs, because that -- not the campaign
 * objective and not the pixel firing on the site -- decides whether the ad can
 * report a purchase at all. The "Pixel in tracking" section at the top of the
 * markdown is the first thing to read: an ad missing from the dataset shows 0
 * purchases whatever it actually sold.
 *
 * Usage:
 *   node scripts/meta-ads-review.js                    # writes build/meta-ads-review-<date>.{json,md}
 *   node scripts/meta-ads-review.js --md=path --json=path
 *   node scripts/meta-ads-review.js --account=act_123
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  required, ads_read scope (same token the nightly uses)
 *   META_AD_ACCOUNT_ID     optional, defaults to the SparkDate account
 */

'use strict';

const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = 'v21.0';
const TOKEN = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('ERROR: META_ADS_ACCESS_TOKEN is not set (needs ads_read).');
  process.exit(2);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const ACCOUNT = args.account || process.env.META_AD_ACCOUNT_ID || 'act_1672342180672647';
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_JSON = args.json || path.join(__dirname, '..', 'build', `meta-ads-review-${TODAY}.json`);
const OUT_MD = args.md || path.join(__dirname, '..', 'build', `meta-ads-review-${TODAY}.md`);

async function graphGet(edge, params) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${edge}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? `${body.error.message} (code ${body.error.code})` : `HTTP ${res.status}`;
    throw new Error(`Meta API: ${msg} on ${edge}`);
  }
  return body;
}

// Follow paging.next until exhausted. The insights edge pages too.
async function graphAll(edge, params) {
  const rows = [];
  let body = await graphGet(edge, params);
  for (;;) {
    rows.push(...(body.data || []));
    const next = body.paging && body.paging.next;
    if (!next) break;
    const res = await fetch(next);
    body = await res.json();
    if (body.error) throw new Error(`Meta API paging: ${body.error.message}`);
  }
  return rows;
}

// Every status Meta will return; without the filter, archived ads are hidden.
const ALL_STATUSES = [
  'ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'PENDING_REVIEW', 'DISAPPROVED',
  'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED',
  'IN_PROCESS', 'WITH_ISSUES',
];

const AD_FIELDS = [
  'id', 'name', 'status', 'effective_status', 'created_time', 'updated_time',
  'tracking_specs',
  'campaign{id,name,objective,status,start_time,stop_time}',
  'adset{id,name,status,effective_status,start_time,end_time,daily_budget,lifetime_budget,optimization_goal,destination_type,promoted_object,targeting}',
  'creative{id,name,title,body,url_tags,thumbnail_url,object_story_spec,asset_feed_spec}',
].join(',');

const INSIGHT_FIELDS = [
  'ad_id', 'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks',
  'ctr', 'cpc', 'cpm', 'actions', 'cost_per_action_type', 'date_start', 'date_stop',
].join(',');

// The action types worth a column. Meta names the same thing several ways
// depending on objective and pixel setup; take the first present.
const ACTION_KEYS = {
  link_clicks: ['link_click'],
  lpv: ['landing_page_view'],
  add_to_cart: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkout: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  purchases: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  leads: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  video_3s: ['video_view'],
  thruplay: ['video_thruplay_watched_actions'],
  post_engagement: ['post_engagement'],
};

function pick(actions, keys) {
  if (!Array.isArray(actions)) return 0;
  for (const k of keys) {
    const hit = actions.find((a) => a.action_type === k);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

function metrics(row) {
  const m = {
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: Number(row.reach) || 0,
    frequency: Number(row.frequency) || 0,
    clicks: Number(row.clicks) || 0,
    inline_link_clicks: Number(row.inline_link_clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: Number(row.cpm) || 0,
  };
  for (const [k, keys] of Object.entries(ACTION_KEYS)) m[k] = pick(row.actions, keys);
  m.cost_per_lpv = m.lpv ? m.spend / m.lpv : null;
  m.cost_per_purchase = m.purchases ? m.spend / m.purchases : null;
  return m;
}

// Pull the human-readable copy out of whichever creative shape Meta used.
function creativeText(c) {
  if (!c) return { kind: 'none' };
  const oss = c.object_story_spec || {};
  const afs = c.asset_feed_spec || null;
  const out = { kind: 'unknown', creative_id: c.id, creative_name: c.name || null, url_tags: c.url_tags || null,
    thumbnail_url: c.thumbnail_url || null };
  if (oss.video_data) {
    const v = oss.video_data;
    out.kind = 'video';
    out.primary_text = v.message || null;
    out.headline = v.title || null;
    out.description = v.link_description || null;
    out.cta = v.call_to_action ? v.call_to_action.type : null;
    out.link = v.call_to_action && v.call_to_action.value ? v.call_to_action.value.link : null;
    out.video_id = v.video_id || null;
  } else if (oss.link_data) {
    const l = oss.link_data;
    out.kind = l.child_attachments ? 'carousel' : 'link';
    out.primary_text = l.message || null;
    out.headline = l.name || null;
    out.description = l.description || null;
    out.cta = l.call_to_action ? l.call_to_action.type : null;
    out.link = l.link || null;
    if (l.child_attachments) out.cards = l.child_attachments.map((x) => ({ headline: x.name, description: x.description, link: x.link }));
  } else if (afs) {
    out.kind = 'dynamic';
    out.primary_text = (afs.bodies || []).map((b) => b.text).join(' | ') || null;
    out.headline = (afs.titles || []).map((t) => t.text).join(' | ') || null;
    out.description = (afs.descriptions || []).map((d) => d.text).join(' | ') || null;
    out.cta = (afs.call_to_action_types || [])[0] || null;
    out.link = (afs.link_urls || []).map((u) => u.website_url).join(' | ') || null;
  } else if (c.body || c.title) {
    out.kind = 'legacy';
    out.primary_text = c.body || null;
    out.headline = c.title || null;
  }
  return out;
}

// Whether THIS ad can report a pixel conversion at all. An ad counts pixel
// events only if its own tracking_specs name the dataset -- the pixel firing on
// the site is not enough, and neither is the campaign objective (memory
// meta-pixel-is-per-ad-tracking). Ads Manager leaves it off "(Traffic)" ads it
// builds; scripts/meta-create-lx-prime-ads.js sets it at creation.
//
// This is REPORTING, not delivery. The ad set's optimization_goal and
// promoted_object decide who Meta shows the ad to; tracking_specs only decides
// what gets counted back. An ad with no pixel here reports landing_page_view
// and nothing after it, so its 0 purchases means "cannot count", not "no sales".
function pixelTracking(specs) {
  if (!Array.isArray(specs)) return { pixels: [], has_pixel: false, action_types: [] };
  const pixels = [];
  const kinds = [];
  for (const s of specs) {
    for (const id of [].concat(s.fb_pixel || [])) {
      const v = String(id);
      if (!pixels.includes(v)) pixels.push(v);
    }
    for (const a of [].concat(s['action.type'] || [])) if (!kinds.includes(a)) kinds.push(a);
  }
  return { pixels, has_pixel: pixels.length > 0, action_types: kinds };
}

// What the ad SET optimises toward -- the other half of the pair. A Traffic set
// optimising LINK_CLICKS has no promoted_object, which is why attaching a pixel
// to its ads buys measurement and not delivery.
function promotedSummary(po) {
  if (!po) return null;
  const bits = [];
  if (po.pixel_id) bits.push(`pixel ${po.pixel_id}`);
  if (po.custom_event_type) bits.push(po.custom_event_type);
  if (po.page_id) bits.push(`page ${po.page_id}`);
  if (po.object_store_url) bits.push('app');
  return bits.length ? bits.join(' / ') : null;
}

function targetingSummary(t) {
  if (!t) return {};
  const g = t.genders || [];
  const gender = g.length === 0 ? 'all' : g.map((x) => (x === 1 ? 'men' : x === 2 ? 'women' : String(x))).join('+');
  const geo = t.geo_locations || {};
  const places = []
    .concat((geo.cities || []).map((c) => `${c.name}${c.radius ? ` +${c.radius}${c.distance_unit || 'mi'}` : ''}`))
    .concat((geo.custom_locations || []).map((c) => `${c.name || `${c.latitude},${c.longitude}`} +${c.radius}${c.distance_unit || 'mi'}`))
    .concat((geo.regions || []).map((r) => r.name))
    .concat(geo.countries || []);
  const interests = [];
  for (const fs of t.flexible_spec || []) for (const i of fs.interests || []) interests.push(i.name);
  const audiences = (t.custom_audiences || []).map((a) => a.name || a.id);
  const excluded = (t.excluded_custom_audiences || []).map((a) => a.name || a.id);
  return {
    gender,
    age: `${t.age_min || '?'}-${t.age_max || '?'}`,
    places,
    interests,
    custom_audiences: audiences,
    excluded_audiences: excluded,
    platforms: t.publisher_platforms || [],
    advantage_audience: t.targeting_automation ? t.targeting_automation.advantage_audience : undefined,
  };
}

function utmsOf(text) {
  const out = {};
  const sources = [text.link, text.url_tags].filter(Boolean);
  for (const s of sources) {
    const q = s.includes('?') ? s.slice(s.indexOf('?') + 1) : s;
    for (const pair of q.split('&')) {
      const [k, v] = pair.split('=');
      if (k && /^utm_/.test(k) && !(k in out)) out[k] = decodeURIComponent(v || '');
    }
  }
  return out;
}

(async () => {
  console.log(`Account ${ACCOUNT}, Graph ${GRAPH_VERSION}`);
  const ads = await graphAll(`${ACCOUNT}/ads`, {
    fields: AD_FIELDS,
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ALL_STATUSES }]),
    limit: 200,
  });
  console.log(`  ${ads.length} ads (all statuses)`);

  const lifetime = await graphAll(`${ACCOUNT}/insights`, { level: 'ad', fields: INSIGHT_FIELDS, date_preset: 'maximum', limit: 500 });
  const byGender = await graphAll(`${ACCOUNT}/insights`, { level: 'ad', fields: INSIGHT_FIELDS, date_preset: 'maximum', breakdowns: 'gender', limit: 500 });
  const last7 = await graphAll(`${ACCOUNT}/insights`, { level: 'ad', fields: 'ad_id,spend,impressions', date_preset: 'last_7d', limit: 500 });
  console.log(`  insights: ${lifetime.length} ads with delivery, ${byGender.length} gender rows, ${last7.length} with spend in the last 7 days`);

  const life = new Map(lifetime.map((r) => [r.ad_id, r]));
  const gen = new Map();
  for (const r of byGender) {
    if (!gen.has(r.ad_id)) gen.set(r.ad_id, {});
    gen.get(r.ad_id)[r.gender] = metrics(r);
  }
  const recent = new Map(last7.map((r) => [r.ad_id, Number(r.spend) || 0]));

  const records = ads.map((ad) => {
    const text = creativeText(ad.creative);
    const l = life.get(ad.id);
    return {
      id: ad.id,
      name: ad.name,
      status: ad.status,
      effective_status: ad.effective_status,
      created: ad.created_time,
      campaign: ad.campaign ? { id: ad.campaign.id, name: ad.campaign.name, objective: ad.campaign.objective, status: ad.campaign.status } : null,
      adset: ad.adset ? {
        id: ad.adset.id, name: ad.adset.name, status: ad.adset.effective_status,
        start: ad.adset.start_time, end: ad.adset.end_time,
        daily_budget: ad.adset.daily_budget ? Number(ad.adset.daily_budget) / 100 : null,
        lifetime_budget: ad.adset.lifetime_budget ? Number(ad.adset.lifetime_budget) / 100 : null,
        optimization_goal: ad.adset.optimization_goal,
        promoted_object: promotedSummary(ad.adset.promoted_object),
        targeting: targetingSummary(ad.adset.targeting),
      } : null,
      tracking: pixelTracking(ad.tracking_specs),
      creative: text,
      utms: utmsOf(text),
      delivered: !!l,
      window: l ? `${l.date_start}..${l.date_stop}` : null,
      lifetime: l ? metrics(l) : null,
      by_gender: gen.get(ad.id) || null,
      spend_last_7d: recent.get(ad.id) || 0,
    };
  });

  records.sort((a, b) => (b.lifetime ? b.lifetime.spend : 0) - (a.lifetime ? a.lifetime.spend : 0));

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ pulled_at: new Date().toISOString(), account: ACCOUNT, ads: records }, null, 2));

  // ---- markdown ------------------------------------------------------------
  const money = (n) => (n == null ? '-' : `$${n.toFixed(2)}`);
  const int = (n) => (n == null ? '-' : String(Math.round(n)));
  const pct = (n) => (n == null ? '-' : `${n.toFixed(2)}%`);
  const q = (s) => (s == null ? '' : String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' / '));

  const md = [];
  md.push(`# Meta ads, every one the account has run`);
  md.push('');
  md.push(`Pulled ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from \`${ACCOUNT}\` via Graph ${GRAPH_VERSION}. ` +
    `${records.length} ads, ${records.filter((r) => r.delivered).length} with any delivery. Lifetime window is Meta's maximum (37 months). ` +
    `Purchases are Meta-ATTRIBUTED conversions, not sales. Gender is Meta's own inference on the person served.`);
  md.push('');

  // Which ads are blind. This is the check that used to be done by hand, ad by
  // ad, and it is the one to read first: an ad with no pixel in its tracking
  // cannot report a cart, a checkout or a purchase, so nothing below it scores.
  const blind = records.filter((r) => r.delivered && !r.tracking.has_pixel);
  md.push('## Pixel in tracking');
  md.push('');
  if (blind.length === 0) {
    md.push(`Every delivered ad carries a pixel in its \`tracking_specs\`. Purchase counts below mean what they say.`);
  } else {
    const blindSpend = blind.reduce((s, r) => s + r.lifetime.spend, 0);
    md.push(`**${blind.length} of ${records.filter((r) => r.delivered).length} delivered ads carry NO pixel in \`tracking_specs\`**, ` +
      `holding ${money(blindSpend)} of lifetime spend. They report \`landing_page_view\` and nothing after it: ` +
      `a 0 in their Purch column means "cannot count", not "did not happen".`);
    md.push('');
    md.push('| Ad | Ad set optimises for | Spend | LPV | Last 7 days |');
    md.push('|---|---|---:|---:|---:|');
    for (const r of blind.sort((a, b) => b.lifetime.spend - a.lifetime.spend)) {
      md.push(`| ${q(r.name)} | ${r.adset ? r.adset.optimization_goal : '-'}${r.adset && r.adset.promoted_object ? ` (${q(r.adset.promoted_object)})` : ''} | ${money(r.lifetime.spend)} | ${int(r.lifetime.lpv)} | ${money(r.spend_last_7d)} |`);
    }
    md.push('');
    md.push('Attaching the pixel changes what these ads **report**, not who Meta shows them to — ' +
      'delivery follows the ad set\'s `optimization_goal`. Expect measurement, not lift.');
  }
  md.push('');

  // Summary table
  md.push('## Every ad, by lifetime spend');
  md.push('');
  md.push('| Ad | Campaign | Status | Aimed at | Pixel | Spend | Impr | Reach | Link clicks | LPV | Purch | $/LPV | Women share of spend | Women share of LPV |');
  md.push('|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of records) {
    const L = r.lifetime;
    const g = r.by_gender || {};
    const f = g.female, spendW = f ? f.spend : 0, lpvW = f ? f.lpv : 0;
    const tgt = r.adset ? `${r.adset.targeting.gender} ${r.adset.targeting.age}` : '-';
    const px = r.tracking.has_pixel ? 'yes' : '**NO**';
    md.push(`| ${q(r.name)} | ${q(r.campaign ? r.campaign.name : '')} | ${r.effective_status}${r.adset && r.adset.end ? ` (set ends ${r.adset.end.slice(0, 10)})` : ''}${r.spend_last_7d ? ' spending' : ''} | ${tgt} | ${px} | ${L ? money(L.spend) : '-'} | ${L ? int(L.impressions) : '-'} | ${L ? int(L.reach) : '-'} | ${L ? int(L.link_clicks) : '-'} | ${L ? int(L.lpv) : '-'} | ${L ? int(L.purchases) : '-'} | ${L ? money(L.cost_per_lpv) : '-'} | ${L && L.spend ? pct((spendW / L.spend) * 100) : '-'} | ${L && L.lpv ? pct((lpvW / L.lpv) * 100) : '-'} |`);
  }
  md.push('');

  // Per-ad detail
  md.push('## Ad by ad: copy, audience, results by gender');
  md.push('');
  for (const r of records) {
    md.push(`### ${r.name}`);
    md.push('');
    md.push(`- **Campaign:** ${r.campaign ? `${r.campaign.name} (${r.campaign.objective}, ${r.campaign.status})` : '-'}`);
    md.push(`- **Ad set:** ${r.adset ? `${r.adset.name} (${r.adset.status}; ${r.adset.start ? r.adset.start.slice(0, 10) : '?'} to ${r.adset.end ? r.adset.end.slice(0, 10) : 'open'}; ${r.adset.daily_budget != null ? `$${r.adset.daily_budget}/day` : r.adset.lifetime_budget != null ? `$${r.adset.lifetime_budget} lifetime` : 'budget at campaign'}; goal ${r.adset.optimization_goal}${r.adset.promoted_object ? `, optimising ${r.adset.promoted_object}` : ''})` : '-'}`);
    if (r.adset) {
      const t = r.adset.targeting;
      md.push(`- **Audience:** ${t.gender}, ${t.age}; ${t.places.join('; ') || 'no geo'}${t.interests.length ? `; interests: ${t.interests.join(', ')}` : ''}${t.custom_audiences.length ? `; custom: ${t.custom_audiences.join(', ')}` : ''}${t.excluded_audiences.length ? `; excluding: ${t.excluded_audiences.join(', ')}` : ''}${t.advantage_audience != null ? `; advantage+ audience ${t.advantage_audience ? 'ON' : 'off'}` : ''}`);
    }
    md.push(`- **Ad status:** ${r.effective_status}; created ${r.created ? r.created.slice(0, 10) : '?'}; delivery ${r.window || 'none'}; last 7 days ${money(r.spend_last_7d)}`);
    md.push(`- **Pixel in tracking:** ${r.tracking.has_pixel
      ? `yes — ${r.tracking.pixels.join(', ')}${r.tracking.action_types.length ? ` (${r.tracking.action_types.join(', ')})` : ''}`
      : '**no** — this ad cannot report a cart, a checkout or a purchase'}`);
    const c = r.creative;
    md.push(`- **Format:** ${c.kind}${c.cta ? `, CTA ${c.cta}` : ''}`);
    if (c.primary_text) md.push(`- **Primary text:** ${q(c.primary_text)}`);
    if (c.headline) md.push(`- **Headline:** ${q(c.headline)}`);
    if (c.description) md.push(`- **Description:** ${q(c.description)}`);
    if (c.cards) for (const card of c.cards) md.push(`  - card: ${q(card.headline)} / ${q(card.description)}`);
    if (c.link) md.push(`- **Link:** ${q(c.link)}`);
    if (c.url_tags) md.push(`- **url_tags:** ${q(c.url_tags)}`);
    const u = r.utms;
    if (Object.keys(u).length) md.push(`- **UTMs seen by GA4:** ${Object.entries(u).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    if (r.lifetime) {
      md.push('');
      md.push('| Gender | Spend | Impr | Reach | Link clicks | CTR | CPC | LPV | $/LPV | Add to cart | Checkout | Purch | Leads |');
      md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
      const rows = Object.entries(r.by_gender || {}).sort((a, b) => b[1].spend - a[1].spend);
      for (const [gname, m] of rows) {
        md.push(`| ${gname} | ${money(m.spend)} | ${int(m.impressions)} | ${int(m.reach)} | ${int(m.link_clicks)} | ${pct(m.ctr)} | ${money(m.cpc)} | ${int(m.lpv)} | ${money(m.cost_per_lpv)} | ${int(m.add_to_cart)} | ${int(m.checkout)} | ${int(m.purchases)} | ${int(m.leads)} |`);
      }
      const L = r.lifetime;
      md.push(`| **all** | ${money(L.spend)} | ${int(L.impressions)} | ${int(L.reach)} | ${int(L.link_clicks)} | ${pct(L.ctr)} | ${money(L.cpc)} | ${int(L.lpv)} | ${money(L.cost_per_lpv)} | ${int(L.add_to_cart)} | ${int(L.checkout)} | ${int(L.purchases)} | ${int(L.leads)} |`);
    } else {
      md.push('- **Results:** never delivered');
    }
    md.push('');
  }

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
})().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
