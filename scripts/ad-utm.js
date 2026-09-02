#!/usr/bin/env node
/**
 * scripts/ad-utm.js
 *
 * Builds the `url_tags` string for a Meta ad creative, from the convention in
 * content/brand.json rather than from a literal typed at the call site.
 *
 * WHY THIS EXISTS
 *
 * The convention was already written down -- `paid_template.caption_rules.utm`
 * has the medium, the source macro, and format strings for campaign and
 * content. Nothing computed it. Every script that has ever created a creative
 * typed the finished string by hand, and the account shows what that costs:
 * measured live 2026-09-02, `utm_content=proof_rsa1` sits on THIRTEEN delivered
 * ads holding $554.39 -- 46% of everything the account has ever spent -- across
 * three events and both objectives. Only 14% of lifetime spend carries a
 * utm_content unique to one ad. See reports/AD_ACCOUNT_AUDIT_2026-09-02.md.
 *
 * THE CHECK THAT EXISTED COULD NOT HAVE CAUGHT IT IN TIME
 *
 * scripts/lint-ad-copy.js does raise `utm-content-shared` as an ERROR -- but it
 * runs against LIVE ADS and needs META_ADS_ACCESS_TOKEN, so it cannot gate CI
 * and it only ever speaks after the creative exists. By then the value is
 * frozen: url_tags is settable only at AdCreative CREATION (subcode 1815573).
 * Fixing it costs a new creative and therefore a new dark post, forfeiting the
 * running ad's likes, comments and shares -- which is why the Marion Court tags
 * were left wrong through the event rather than corrected mid-flight.
 *
 * So the enforcement has to happen BEFORE the POST, offline, with no token.
 * That is this module, and tests/ad-utm.test.js is what makes it a CI gate.
 *
 * THE RETARGETING SEGMENT COLLAPSES, AND brand.json DID NOT SAY SO
 *
 * `content_format` reads `{event_key}_{phase_key}_{ad_set_key}_{creative_slug}`
 * -- four segments -- but two of its own four examples are three:
 * `mc_rt_quang`, `mc_rt_scorecards`. There is no contradiction to resolve in
 * the live account's favour, only an unwritten rule: for the retargeting ad set
 * the phase and the audience are the same fact, so it is written once, as `rt`.
 * `mc_retargeting_retargeting_quang` names nothing extra. This module encodes
 * that, and brand.json now states it.
 *
 * CAMPAIGN KEEPS THE EVENT KEY'S CASE; CONTENT LOWERCASES IT
 *
 * Live: `utm_campaign=LX_202609`, `utm_content=lx_prime_female_showup`. That
 * asymmetry is not a bug to tidy -- changing either would split the Loxleys
 * ads already running from the ones built next, in the one field meant to join
 * them. Reproduced deliberately.
 */

'use strict';

const path = require('path');

const BRAND_PATH = path.join(__dirname, '..', 'content', 'brand.json');

// A segment is one lowercase word. No underscores inside a segment -- the
// separator is what makes the value parseable back into its parts, so a
// segment containing one would silently add a field. `day_of` is the phase
// this catches, which is why it maps to `dayof` below.
const SEGMENT = /^[a-z0-9]+$/;

// Phase keys as they appear in a tag. Only the ones an ad can actually be
// built in: `build` and `step` are planning phases with no creative.
const PHASE_TAG = {
  prime: 'prime',
  convert: 'convert',
  close: 'close',
  day_of: 'dayof',
};

function loadBrand(brand) {
  return brand || require(BRAND_PATH);
}

function utmRules(brand) {
  const b = loadBrand(brand);
  const rules = b.paid_template
    && b.paid_template.caption_rules
    && b.paid_template.caption_rules.utm;
  if (!rules) throw new Error('brand.json has no paid_template.caption_rules.utm — nothing to build from');
  return rules;
}

/** `LX_202609` — the event key as brand.json spells it, plus the event's month. */
function utmCampaign(eventKey, brand) {
  const b = loadBrand(brand);
  const ev = (b.events || {})[eventKey];
  if (!ev) {
    throw new Error(`unknown event "${eventKey}" — brand.json knows ${Object.keys(b.events || {}).join(', ')}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) {
    throw new Error(`events.${eventKey}.date is "${ev.date}", not YYYY-MM-DD — cannot derive the campaign month`);
  }
  return `${eventKey}_${ev.date.slice(0, 4)}${ev.date.slice(5, 7)}`;
}

/**
 * `lx_prime_female_showup`, or `mc_rt_quang` for the retargeting ad set.
 * Throws rather than emitting something GA4 cannot split.
 */
function utmContent({ event, phase, adSet, creative }, brand) {
  const b = loadBrand(brand);
  if (!(b.events || {})[event]) {
    throw new Error(`unknown event "${event}" — brand.json knows ${Object.keys(b.events || {}).join(', ')}`);
  }

  const adSetKeys = (b.paid_template.ad_sets || []).map((a) => a.key);
  if (!adSetKeys.includes(adSet)) {
    throw new Error(`unknown ad set "${adSet}" — brand.json knows ${adSetKeys.join(', ')}`);
  }

  if (!creative || !SEGMENT.test(creative)) {
    throw new Error(`creative slug "${creative}" must be lowercase letters and digits, no underscores `
      + '— it is one segment, and a separator inside it invents a field');
  }

  const segments = adSet === 'retargeting'
    // The phase and the audience are the same fact here; say it once.
    ? [event.toLowerCase(), 'rt', creative]
    : [event.toLowerCase(), phaseTag(phase), adSet, creative];

  for (const s of segments) {
    if (!SEGMENT.test(s)) throw new Error(`segment "${s}" is not lowercase snake-safe`);
  }
  return segments.join('_');
}

function phaseTag(phase) {
  const tag = PHASE_TAG[phase];
  if (!tag) {
    throw new Error(`phase "${phase}" carries no creative — taggable phases are ${Object.keys(PHASE_TAG).join(', ')}`);
  }
  return tag;
}

/** The whole `url_tags` value, in the order the live ads carry it. */
function urlTags({ event, phase, adSet, creative }, brand) {
  const rules = utmRules(brand);
  return [
    `utm_source=${rules.source}`,
    `utm_medium=${rules.medium}`,
    `utm_campaign=${utmCampaign(event, brand)}`,
    `utm_content=${utmContent({ event, phase, adSet, creative }, brand)}`,
  ].join('&');
}

/**
 * The `_never_both` rule. Meta APPENDS url_tags to the destination, so a link
 * that already carries UTMs sends two utm_source values in one request and our
 * readers take the first. Six live ads did this.
 */
function assertCleanLink(link) {
  if (!link) return;
  const found = [...String(link).matchAll(/[?&](utm_[a-z]+)=/g)].map((m) => m[1]);
  if (found.length) {
    throw new Error(`destination link carries ${[...new Set(found)].join(', ')} — UTMs belong in url_tags OR the link, `
      + `never both, or the click sends two values for each. Strip them: ${link}`);
  }
}

/**
 * The proof_rsa1 defect itself: two ads that cannot be told apart. Call this
 * on the whole batch before creating ANY creative, so a collision fails with
 * nothing written rather than halfway through.
 */
function assertUniqueContent(ads) {
  const seen = new Map();
  for (const ad of ads) {
    const value = typeof ad === 'string' ? ad : ad.utm_content;
    if (seen.has(value)) {
      throw new Error(`utm_content="${value}" is on more than one ad in this batch — `
        + 'neither could be attributed. Give each creative its own slug.');
    }
    seen.set(value, true);
  }
}

module.exports = { utmCampaign, utmContent, urlTags, assertCleanLink, assertUniqueContent, PHASE_TAG };
