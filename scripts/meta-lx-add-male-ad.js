#!/usr/bin/env node
'use strict';
/**
 * Decision 01 (reports/LOXLEYS_LINK_CLICKS_2026-09-11.md): ADD a second video ad
 * to the male cold ad set. The existing "Loxleys | male | convert video" is left
 * exactly as it is -- replacing it would mint a new dark post and starve the
 * video-viewer audience (memory dont-swap-creatives-under-live-retargeting).
 *
 * Video: the patio facts card already uploaded on 2026-09-08 for LX-RT-PATIO
 * (video 1634620321428923, 5.0s, 4:5), reused -- not re-uploaded. Copy: the
 * legacy caption_templates.male.close template from brand.json, rendered from
 * events.LX. The price is stable now (early bird ended 09-07, $29.99 through
 * the event), so the close copy's {price} is safe for the rest of the run.
 *
 * Request shape copied from scripts/meta-create-lx-sales-campaign.js lines
 * 443-468 (the proven attach path). tracking_specs carries only the pixel at
 * birth; Meta appends the post-level specs itself (the incumbent ad shows six).
 *
 * DRY RUN by default. --execute writes. Idempotent by ad name.
 */
const path = require('path'); // eslint-disable-line no-unused-vars
const REPO = path.join(__dirname, '..');
const brand = require(path.join(REPO, 'content/brand.json'));
const { urlTags, assertCleanLink } = require(path.join(REPO, 'scripts/ad-utm.js'));

const T = process.env.META_ADS_ACCESS_TOKEN; const V = 'v21.0'; const ACCOUNT = 'act_1672342180672647';
const EXECUTE = process.argv.includes('--execute');
const AD_SET = '120251304239850542'; // Loxleys | male | Sales
const PAGE_ID = '1139242662602769';
const IG_USER_ID = '17841426630031658';
const PIXEL_ID = '4390442851170732';
const LINK = 'https://sparkdate.date/lp?eventId=KL4onXm7hJbqiwI9quAZ';
const VIDEO_ID = '1634620321428923';
const IMAGE_HASH = '8b6fad015fe906a21f50dcfd40cbddfc';
const AD_NAME = 'Loxleys | male | close patio video';
const CREATIVE_NAME = 'LX male close 2026-09 patio (video)';

const ev = brand.events.LX;
const d = new Date(ev.date + 'T12:00:00');
const slots = {
  '{event_name}': ev.name,
  '{venue}': ev.venue,
  '{city}': ev.city,
  '{date_long}': d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  '{date_short}': d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  '{doors}': ev.doors,
  '{price}': `$${ev.pricing.regular.toFixed(2)}`,
};
const fill = (s) => Object.entries(slots).reduce((acc, [k, v]) => acc.split(k).join(v), s);
const tpl = brand.paid_template.caption_templates.male.close;
const message = fill(tpl.primary_text);
const headline = fill(tpl.headline);
const description = fill(tpl.description);
for (const [k, v] of Object.entries({ message, headline, description })) if (/\{[a-z_]+\}/.test(v)) throw new Error(`unfilled slot in ${k}: ${v}`);
if (/2-for-1|2 for 1/i.test(message)) throw new Error('2-for-1 copy must never appear in a male ad');
assertCleanLink(LINK);
const url_tags = urlTags({ event: 'LX', phase: 'close', adSet: 'male', creative: 'patio' });

async function get(p, params = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${p}`); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('access_token', T);
  const j = await (await fetch(u)).json(); if (j.error) throw new Error(`${p}: ${JSON.stringify(j.error)}`); return j.data || j;
}
async function post(p, params) {
  const j = await (await fetch(`https://graph.facebook.com/${V}/${p}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: T }) })).json();
  if (j.error) throw new Error(`${p}: ${JSON.stringify(j.error)}`); return j;
}
(async () => {
  console.log(`lx-add-male-ad  ${new Date().toISOString()}  ${EXECUTE ? 'EXECUTE' : 'DRY RUN -- nothing will be written'}\n`);
  const adset = await get(AD_SET, { fields: 'name,effective_status,targeting{genders,age_min,age_max},promoted_object' });
  const ads = await get(`${AD_SET}/ads`, { fields: 'id,name,effective_status', limit: 50 });
  console.log(`  ad set   ${adset.name}  ${adset.effective_status}  genders ${JSON.stringify(adset.targeting.genders)}  pixel ${adset.promoted_object.pixel_id}/${adset.promoted_object.custom_event_type}`);
  for (const a of ads) console.log(`  has ad   ${a.id}  ${a.effective_status}  ${a.name}`);
  const video = await get(VIDEO_ID, { fields: 'id,length,created_time' });
  console.log(`  video    ${video.id}  ${video.length}s  uploaded ${video.created_time}  thumb ${IMAGE_HASH}  [reused, not re-uploaded]`);
  console.log(`\n  new ad   ${AD_NAME}  (ACTIVE on creation; Meta reviews it first)`);
  console.log(`  headline ${headline}`);
  console.log(`  desc     ${description}`);
  console.log(`  message  ${JSON.stringify(message)}`);
  console.log(`  link     ${LINK}`);
  console.log(`  url_tags ${url_tags}`);
  const dup = ads.find((a) => a.name === AD_NAME);
  if (dup) { console.log(`\n  SKIP     ${AD_NAME} already exists as ${dup.id} (${dup.effective_status})`); return; }
  if (!EXECUTE) { console.log('\nDry run. Re-run with --execute.'); return; }

  const creative = await post(`${ACCOUNT}/adcreatives`, {
    name: CREATIVE_NAME,
    object_story_spec: JSON.stringify({ page_id: PAGE_ID, instagram_user_id: IG_USER_ID, video_data: { video_id: VIDEO_ID, image_hash: IMAGE_HASH, message, title: headline, link_description: description, call_to_action: { type: 'LEARN_MORE', value: { link: LINK } } } }),
    url_tags,
  });
  console.log(`\n  creative ${creative.id}`);
  const ad = await post(`${ACCOUNT}/ads`, {
    name: AD_NAME, adset_id: AD_SET, creative: JSON.stringify({ creative_id: creative.id }),
    tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [PIXEL_ID] }]),
    status: 'ACTIVE',
  });
  console.log(`  ad       ${ad.id}  ${AD_NAME}`);
  const back = await get(ad.id, { fields: 'name,status,effective_status,creative{id,url_tags,effective_object_story_id,object_story_spec},tracking_specs,adset_id' });
  const after = await get(`${AD_SET}/ads`, { fields: 'id,name,effective_status', limit: 50 });
  const vd = back.creative.object_story_spec.video_data;
  const checks = [
    ['url_tags', back.creative.url_tags === url_tags, back.creative.url_tags],
    ['video_id', String(vd.video_id) === VIDEO_ID, vd.video_id],
    ['message', vd.message === message, vd.message.split('\n')[0] + ' ...'],
    ['pixel in tracking', (back.tracking_specs || []).some((s) => (s.fb_pixel || []).includes(PIXEL_ID)), `${(back.tracking_specs || []).length} specs`],
    ['in the male ad set', back.adset_id === AD_SET, back.adset_id],
    ['incumbent untouched', after.some((a) => a.name === 'Loxleys | male | convert video' && a.effective_status === 'ACTIVE'), after.map((a) => `${a.name}=${a.effective_status}`).join(' ; ')],
    ['dark post minted', !!back.creative.effective_object_story_id, back.creative.effective_object_story_id],
  ];
  let failed = 0;
  for (const [label, ok, seen] of checks) { console.log(`  ${ok ? 'OK  ' : '!!  '} ${label.padEnd(20)} ${seen}`); if (!ok) failed++; }
  console.log(`  status   ${back.status} / effective ${back.effective_status}`);
  console.log(failed ? `\n  ${failed} check(s) FAILED` : '\n  all checks passed');
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error('\n  x ' + e.message); process.exit(1); });
