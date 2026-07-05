// lib/utm.js
//
// Centralizes UTM campaign link construction used by:
//   api/cron-send-emails.js  — email nurture sequence CTA links
//
// Browser pages (index.html, lp.html) build UTM links inline via
// simple string concatenation since they can't require() Node modules.
// The UTM scheme they use should mirror EMAIL_CAMPAIGNS below so that
// GA4 attribution is consistent across channels.
//
// UTM scheme for SparkDate:
//   utm_source   = traffic origin (email | organic | social | paid)
//   utm_medium   = channel type  (nurture | direct | cpc | …)
//   utm_campaign = specific send (welcome | day2 | day5 | day14 | day25
//                                 homepage_nav | homepage_hero | early_bird)
//   utm_content  = A/B variant   (optional; omit when not testing)

'use strict';

/**
 * Build a full absolute URL with UTM params appended.
 *
 * @param {string} path       - Absolute URL or path (e.g. "https://sparkdate.date/events" or "/events")
 * @param {string} source     - utm_source  (e.g. "email")
 * @param {string} medium     - utm_medium  (e.g. "nurture")
 * @param {string} campaign   - utm_campaign (e.g. "day5")
 * @param {string} [content]  - utm_content  (optional)
 * @returns {string} Full URL string with UTM params
 */
function buildUtmUrl(path, source, medium, campaign, content) {
  const base = path.startsWith('http') ? path : 'https://sparkdate.date' + path;
  const url = new URL(base);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', campaign);
  if (content) url.searchParams.set('utm_content', content);
  return url.toString();
}

// Pre-built URLs used by the email nurture sequence. Centralising them
// here means a campaign rename or domain change is a one-file edit.
const EMAIL_CAMPAIGNS = {
  welcome: {
    account: buildUtmUrl('/account', 'email', 'nurture', 'welcome'),
    events:  buildUtmUrl('/events',  'email', 'nurture', 'welcome'),
  },
  day2: {
    events: buildUtmUrl('/events', 'email', 'nurture', 'day2'),
  },
  day5: {
    events:         buildUtmUrl('/events',            'email', 'nurture', 'day5'),
    upgradeMid:     buildUtmUrl('/account?tier=mid',  'email', 'nurture', 'day5_upgrade'),
    upgradePremium: buildUtmUrl('/account?tier=premium', 'email', 'nurture', 'day5_upgrade'),
  },
  day14: {
    events: buildUtmUrl('/events', 'email', 'nurture', 'day14'),
  },
  day25: {
    events:         buildUtmUrl('/events',            'email', 'nurture', 'day25'),
    upgradeMid:     buildUtmUrl('/account?tier=mid',  'email', 'nurture', 'day25_upgrade'),
    upgradePremium: buildUtmUrl('/account?tier=premium', 'email', 'nurture', 'day25_upgrade'),
    account:        buildUtmUrl('/account',           'email', 'nurture', 'day25'),
  },
};

module.exports = { buildUtmUrl, EMAIL_CAMPAIGNS };
