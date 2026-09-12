// tests/eventbrite-ads-spend.test.js
//
// Covers the pure half of scripts/sync-eventbrite-ads-spend.js: parsing the two
// internal Eventbrite Ads payloads, detecting a signed-out session, and turning
// per-campaign daily rows into one Firestore document per day.
//
// Four things here are load-bearing:
//
//   1. The doc id is `{date}__eventbrite`, never `{date}`. That id is Meta's,
//      and sync-meta-spend.js writes it with a whole-document set().
//
//   2. The insights `body` arrives as a JSON STRING inside a JSON object, the
//      campaigns `body` as an object. Both shapes, and the bare object, parse.
//
//   3. Spend is attributed per AD through ads[].event_id, then mapped to our
//      event doc through events.eventbriteEventId. Unmapped spend goes to
//      `_unattributed`, which the dashboard counts in the total and skips per
//      event.
//
//   4. A signed-out profile must be recognised from any of the three ways
//      Eventbrite says so, because the nightly turns that into exit 3 and a
//      "run --login" message instead of a crash.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  docId, unwrap, parseCampaigns, parseInsights, isUnauthorized, groupDays, totals, toCsv,
} = require('../scripts/sync-eventbrite-ads-spend.js');

// Captured 2026-09-11 from the live endpoints, trimmed.
const CAMPAIGNS_PAYLOAD = JSON.stringify({
  body: {
    // As on the live payload: status is on the ad, and the campaign carries none.
    campaigns: [
      { organization_id: 3002470694486, goal: 'CLICKS', name: "Sparkdate: The Loxley's Social", id: 474251,
        ads: [{ event_id: 1997508062386, start_date: '2026-08-30T14:12:19', end_date: '2026-09-23T03:58:59', budget_amount: 2, id: 474251, status: 1 }] },
      { organization_id: 3002470694486, goal: 'CLICKS', name: 'SparkDate: Real People, Real Drinks, Real Court', id: 475400,
        ads: [{ event_id: 1997508475622, start_date: '2026-09-02T00:00:00', end_date: '2026-09-09T02:05:23', budget_amount: 7, id: 475400, status: 3 }] },
    ],
  },
});

const insightsPayload = (campaignId, rows, extra = {}) => JSON.stringify({
  body: JSON.stringify({ campaign_id: campaignId, insights: rows, cpc: 0.62, cpm: 0.01, cpa: 9.93, ...extra }),
});
const row = (adId, day, spend, clicks = 0, orders = 0, tickets = 0, impressions = 0) => ({
  ad_id: adId, day: `${day}T00:00:00`, attributed_impressions: impressions, spend,
  attributed_clicks: clicks, attributed_orders: orders, attributed_ticket_sales: tickets,
});

describe('docId', () => {
  it("is namespaced so it can never overwrite Meta's {date} document", () => {
    expect(docId('2026-09-01')).toBe('2026-09-01__eventbrite');
    expect(docId('2026-09-01')).not.toBe('2026-09-01');
    expect(docId('2026-09-01')).not.toBe('2026-09-01__google');
  });
});

describe('unwrap', () => {
  it('accepts the object-body shape, the string-body shape, and a bare object', () => {
    expect(unwrap({ body: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrap({ body: '{"a":1}' })).toEqual({ a: 1 });
    expect(unwrap('{"body":"{\\"a\\":1}"}')).toEqual({ a: 1 });
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
  });
  it('returns null rather than throwing on garbage, so a changed endpoint degrades to no rows', () => {
    expect(unwrap('<html>not json</html>')).toBeNull();
    expect(unwrap({ body: 'nope' })).toBeNull();
    expect(unwrap(null)).toBeNull();
  });
});

describe('parseCampaigns', () => {
  it('reads id, name, goal and each ad with its Eventbrite event id as a string', () => {
    const c = parseCampaigns(CAMPAIGNS_PAYLOAD);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ id: 474251, goal: 'CLICKS' });
    expect(c[0].ads[0]).toMatchObject({ id: 474251, eventId: '1997508062386', budget: 2 });
  });
  it("takes status from the ad when the campaign carries none (the live shape), so a live campaign is not printed as ended", () => {
    const c = parseCampaigns(CAMPAIGNS_PAYLOAD);
    expect(c[0].status).toBe(1);
    expect(c[1].status).toBe(3);
    expect(parseCampaigns('{"body":{"campaigns":[{"id":1,"name":"x","status":3,"ads":[{"id":1,"status":1}]}]}}')[0].status).toBe(3);
  });
  it('yields an empty list for an unexpected payload', () => {
    expect(parseCampaigns('{"body":{}}')).toEqual([]);
    expect(parseCampaigns('oops')).toEqual([]);
  });
});

describe('parseInsights', () => {
  it('parses the string body and keeps only well-formed day rows', () => {
    const p = parseInsights(insightsPayload(474251, [
      row(474251, '2026-09-07', 1.0945, 4, 1, 1, 104),
      { ad_id: 474251, day: 'garbage', spend: 1 },
    ]));
    expect(p.campaignId).toBe(474251);
    expect(p.cpa).toBe(9.93);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toEqual({ adId: 474251, day: '2026-09-07', spend: 1.0945, impressions: 104, clicks: 4, orders: 1, tickets: 1 });
  });
  it('treats a campaign with no rows as zero, not as an error', () => {
    expect(parseInsights('{"body":"{\\"campaign_id\\":453945,\\"insights\\":[],\\"cpc\\":0,\\"cpm\\":0,\\"cpa\\":0}"}').rows).toEqual([]);
  });
});

describe('isUnauthorized', () => {
  it('recognises the 401, the JSON message, and a bounce to the sign-in page', () => {
    expect(isUnauthorized(401, '{"message":"Unauthorized"}')).toBe(true);
    expect(isUnauthorized(200, '{"message":"Unauthorized"}')).toBe(true);
    expect(isUnauthorized(200, '<html><body>Sign in to Eventbrite</body></html>')).toBe(true);
  });
  it('does not flag a real payload', () => {
    expect(isUnauthorized(200, CAMPAIGNS_PAYLOAD)).toBe(false);
    expect(isUnauthorized(200, insightsPayload(474251, [row(474251, '2026-09-07', 1)]))).toBe(false);
  });
});

describe('groupDays', () => {
  const campaigns = parseCampaigns(CAMPAIGNS_PAYLOAD);
  const insightsById = {
    474251: parseInsights(insightsPayload(474251, [
      row(474251, '2026-09-02', 0.8368, 1, 0, 0, 89),
      row(474251, '2026-09-07', 1.0945, 4, 1, 1, 104),
    ])),
    475400: parseInsights(insightsPayload(475400, [
      row(475400, '2026-09-02', 8.5386, 0, 1, 1, 207),
      row(475400, '2026-09-09', 0, 0, 0, 0, 13), // impressions only: not written
    ])),
  };
  const ebToOurs = new Map([['1997508062386', 'KL4onXm7hJbqiwI9quAZ']]); // Loxleys mapped, Marion Court not

  it('makes one document per day, summed across campaigns and rounded once', () => {
    const out = groupDays({ campaigns, insightsById, ebToOurs });
    expect(out.map((d) => d.date)).toEqual(['2026-09-02', '2026-09-07']);
    const sep2 = out[0];
    expect(sep2.total).toBe(9.38); // 0.8368 + 8.5386 = 9.3754 -> one rounding
    expect(sep2.byCampaign).toHaveLength(2);
    expect(sep2.byCampaign[0].name).toMatch(/Real Court/); // sorted by spend, desc
    expect(sep2.clicks).toBe(1);
    expect(sep2.attributedOrders).toBe(1);
    expect(sep2.attributedTickets).toBe(1);
  });

  it('attributes spend to our event through the Eventbrite event id, and the rest to _unattributed', () => {
    const out = groupDays({ campaigns, insightsById, ebToOurs });
    expect(out[0].byEvent).toEqual({ KL4onXm7hJbqiwI9quAZ: 0.84, _unattributed: 8.54 });
    expect(out[1].byEvent).toEqual({ KL4onXm7hJbqiwI9quAZ: 1.09 });
    const lox = out[0].byCampaign.find((c) => c.ebCampaignId === 474251);
    expect(lox.eventId).toBe('KL4onXm7hJbqiwI9quAZ');
    expect(lox.ebEventId).toBe('1997508062386');
  });

  it("prefixes campaign ids with eb: so the dashboard's id join cannot collide with a Meta id", () => {
    const out = groupDays({ campaigns, insightsById, ebToOurs });
    for (const d of out) for (const c of d.byCampaign) expect(c.id).toMatch(/^eb:\d+$/);
  });

  it('skips a day with no spend, clicks or tickets across every campaign', () => {
    const out = groupDays({ campaigns, insightsById, ebToOurs });
    expect(out.find((d) => d.date === '2026-09-09')).toBeUndefined();
  });

  it('honours the window and accepts a plain object for the event map', () => {
    const out = groupDays({ campaigns, insightsById, ebToOurs: { 1997508062386: 'X' }, start: '2026-09-05' });
    expect(out.map((d) => d.date)).toEqual(['2026-09-07']);
    expect(out[0].byEvent).toEqual({ X: 1.09 });
  });

  it('still produces rows for a campaign missing from the list, unattributed', () => {
    const out = groupDays({ campaigns: [], insightsById: { 999: parseInsights(insightsPayload(999, [row(999, '2026-08-01', 2, 1)])) }, ebToOurs });
    expect(out[0].byEvent).toEqual({ _unattributed: 2 });
    expect(out[0].byCampaign[0].name).toBe('(campaign 999)');
  });
});

describe('totals', () => {
  it('rolls lifetime figures up per campaign and per Eventbrite event', () => {
    const campaigns = parseCampaigns(CAMPAIGNS_PAYLOAD);
    const insightsById = {
      474251: parseInsights(insightsPayload(474251, [row(474251, '2026-09-07', 10, 5, 1, 1), row(474251, '2026-09-10', 9.84, 6, 1, 1)])),
      475400: parseInsights(insightsPayload(475400, [row(475400, '2026-09-02', 51, 15, 1, 1)])),
    };
    const t = totals(campaigns, insightsById);
    expect(t.spend).toBe(70.84);
    expect(t.clicks).toBe(26);
    expect(t.tickets).toBe(3);
    expect(t.perEvent.find((e) => e.ebEventId === '1997508062386')).toMatchObject({ spend: 19.84, tickets: 2, campaigns: 1 });
  });
});

describe('toCsv', () => {
  it('writes the Night Tasks header block and one row per campaign per day', () => {
    const campaigns = parseCampaigns(CAMPAIGNS_PAYLOAD);
    const days = groupDays({ campaigns, insightsById: { 474251: parseInsights(insightsPayload(474251, [row(474251, '2026-09-07', 1.0945, 4, 1, 1, 104)])) }, ebToOurs: new Map() });
    const csv = toCsv(days, '2026-09-12 06:00 UTC');
    expect(csv.split('\n')[0]).toBe('# ----------------------------------------');
    expect(csv).toContain('day,campaign_id,campaign_name,goal,eventbrite_event_id,our_event_id,spend,impressions,clicks,attributed_orders,attributed_tickets');
    expect(csv).toContain('2026-09-07,474251,"Sparkdate: The Loxley\'s Social",CLICKS,1997508062386,,1.09,104,4,1,1');
  });
});
