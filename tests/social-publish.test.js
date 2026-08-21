// tests/social-publish.test.js
//
// Covers lib/social-publish.js (when something publishes) and
// lib/social-requests.js (what gets sent).
//
// This is the module where a bug reaches a live audience and cannot be
// undone, so the safety properties get tested directly rather than inferred:
//
//   * nothing publishes unless state === 'approved'
//   * nothing publishes twice
//   * a malformed published_ids cell fails CLOSED (skip), not open (re-post)
//
// The timezone conversion gets real coverage too. The naive alternative --
// new Date('2026-09-08T12:30') -- resolves in the runner's zone, which is UTC
// on GitHub Actions and ET on the author's laptop. That bug posts everything
// four hours early in CI only, which is the worst place to find it.

import { describe, it, expect } from 'vitest';
import {
  zonedToEpoch, planRow, planAll, rowSurfaces,
  recordPublished, alreadyPublished, FB_MIN_LEAD_MS,
} from '../lib/social-publish.js';
import {
  composeCaption, assetUrls, buildFacebook, buildInstagram, buildTikTok,
} from '../lib/social-requests.js';

const HOUR = 3600000;
const row = (over = {}) => ({
  row_id: 'MC-06', date: '2026-09-08', time: '12:30',
  platforms: 'ig,fb', state: 'approved', published_ids: '',
  caption: 'A night out.', hashtags: '#LancasterDating',
  link_fb: 'https://sparkdate.date/lp?utm_source=Facebook',
  asset_files: 'MC-06.jpg', manual_reason: '', ...over,
});
const at = (iso) => Date.parse(iso);

describe('zonedToEpoch', () => {
  it('resolves a summer time as EDT (UTC-4)', () => {
    expect(new Date(zonedToEpoch('2026-09-08', '12:30')).toISOString()).toBe('2026-09-08T16:30:00.000Z');
  });

  it('resolves a winter time as EST (UTC-5)', () => {
    expect(new Date(zonedToEpoch('2026-01-15', '12:30')).toISOString()).toBe('2026-01-15T17:30:00.000Z');
  });

  it('handles both sides of the spring-forward boundary', () => {
    expect(new Date(zonedToEpoch('2026-03-08', '01:30')).toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(new Date(zonedToEpoch('2026-03-08', '03:00')).toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('handles midnight without an hour-24 wrap', () => {
    expect(new Date(zonedToEpoch('2026-08-21', '00:00')).toISOString()).toBe('2026-08-21T04:00:00.000Z');
  });

  it('returns null for a time range rather than guessing', () => {
    // Live-coverage story rows carry "6:30-9:00 PM". A scheduler cannot place
    // that, and inventing a time would post at the wrong moment.
    expect(zonedToEpoch('2026-09-22', '6:30-9:00 PM')).toBeNull();
    expect(zonedToEpoch('Sept 8', '12:30')).toBeNull();
  });
});

describe('planRow — the approval gate', () => {
  const now = at('2026-09-01T12:00:00Z');

  it('refuses to publish a pending row', () => {
    const p = planRow(row({ state: 'pending' }), 'fb', now);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/not approved/);
  });

  it('refuses a row with no state at all', () => {
    expect(planRow(row({ state: '' }), 'fb', now).action).toBe('skip');
  });

  it('acts on an approved row', () => {
    expect(planRow(row(), 'fb', now).action).toBe('schedule');
  });

  it('never re-acts on a posted row', () => {
    expect(planRow(row({ state: 'posted' }), 'fb', now).action).toBe('skip');
  });

  it('skips a row marked manual', () => {
    const p = planRow(row({ manual_reason: 'sticker Story' }), 'ig_story', now);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/manual/);
  });
});

describe('planRow — idempotency', () => {
  const now = at('2026-09-01T12:00:00Z');

  it('does not re-publish a surface that already has an id', () => {
    const r = row({ published_ids: '{"fb":"123_456"}' });
    expect(planRow(r, 'fb', now).action).toBe('skip');
    // ...but the other surface is still outstanding. Checked at the slot
    // itself, since Instagram is 'not due yet' at any earlier instant.
    const slot = zonedToEpoch('2026-09-08', '12:30');
    expect(planRow(r, 'ig', slot + 60000).action).toBe('publish');
  });

  it('fails CLOSED on a malformed published_ids cell', () => {
    // Treating an unreadable cell as "nothing published yet" would re-post to
    // a live audience. Refusing is the only safe reading.
    const p = planRow(row({ published_ids: '{broken' }), 'fb', now);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/not valid JSON/);
  });
});

describe('planRow — Facebook scheduling window', () => {
  it('schedules a post comfortably in the future', () => {
    expect(planRow(row(), 'fb', at('2026-09-01T12:00:00Z')).action).toBe('schedule');
  });

  it('refuses to schedule beyond 30 days, rather than letting Meta reject it', () => {
    const p = planRow(row(), 'fb', at('2026-07-01T12:00:00Z'));
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/30 days/);
  });

  it('publishes immediately inside the 10-minute scheduling floor', () => {
    // Meta rejects scheduled_publish_time under 10 minutes out. Dropping the
    // post would be worse than posting it a few minutes early.
    const slot = zonedToEpoch('2026-09-08', '12:30');
    const p = planRow(row(), 'fb', slot - FB_MIN_LEAD_MS + 60000);
    expect(p.action).toBe('publish');
  });

  it('skips a slot that has fully passed', () => {
    const slot = zonedToEpoch('2026-09-08', '12:30');
    expect(planRow(row(), 'fb', slot + 12 * HOUR).action).toBe('skip');
  });
});

describe('planRow — Instagram has no scheduling', () => {
  const slot = zonedToEpoch('2026-09-08', '12:30');

  it('waits until the slot arrives', () => {
    const p = planRow(row(), 'ig', slot - 2 * HOUR);
    expect(p.action).toBe('skip');
    expect(p.reason).toBe('not due yet');
  });

  it('publishes once the slot arrives', () => {
    expect(planRow(row(), 'ig', slot + 60000).action).toBe('publish');
  });

  it('catches up within the grace window after an outage', () => {
    expect(planRow(row(), 'ig', slot + 3 * HOUR).action).toBe('publish');
  });

  it('does NOT dump a backlog after a long outage', () => {
    // A runner down for a week must not wake up and post a fortnight at once.
    const p = planRow(row(), 'ig', slot + 48 * HOUR);
    expect(p.action).toBe('skip');
    expect(p.reason).toMatch(/missed by more than/);
  });
});

describe('recordPublished', () => {
  it('keeps the row approved until every surface is done', () => {
    const r = row();
    recordPublished(r, 'fb', 'fb_1');
    expect(r.state).toBe('approved');
    expect(alreadyPublished(r, 'fb')).toBe(true);
    recordPublished(r, 'ig', 'ig_1');
    expect(r.state).toBe('posted');
  });

  it('clears a malformed marker rather than preserving it', () => {
    const r = row({ published_ids: 'garbage' });
    recordPublished(r, 'fb', 'fb_1');
    expect(JSON.parse(r.published_ids)).toEqual({ fb: 'fb_1' });
  });
});

describe('rowSurfaces', () => {
  it('maps platforms to surfaces', () => {
    expect(rowSurfaces({ platforms: 'ig,fb,tiktok' })).toEqual(['ig', 'fb', 'tiktok']);
    expect(rowSurfaces({ platforms: 'ig_story' })).toEqual(['ig_story']);
    expect(rowSurfaces({ platforms: '' })).toEqual([]);
  });
});

describe('planAll', () => {
  it('produces one entry per (row, surface) pair', () => {
    expect(planAll([row(), row({ row_id: 'MC-07' })], at('2026-09-01T12:00:00Z'))).toHaveLength(4);
  });
});

// ------------------------------------------------------------ request shapes

describe('composeCaption', () => {
  it('appends the link on Facebook', () => {
    expect(composeCaption(row(), 'fb')).toContain('utm_source=Facebook');
  });

  it('never puts a link in an Instagram caption', () => {
    // IG captions do not render links. Including the Facebook URL there would
    // not 404 -- it would silently misattribute every click that followed.
    const out = composeCaption(row(), 'ig');
    expect(out).not.toContain('http');
    expect(out).toContain('#LancasterDating');
  });
});

describe('assetUrls routing', () => {
  const mixed = row({ asset_files: 'TL-06_1of2.jpg,TL-06_2of2_story.jpg' });

  it('keeps story frames out of feed posts', () => {
    // A 1080x1920 frame in a Facebook carousel gets cropped and looks broken.
    expect(assetUrls(mixed, 'https://b', 'fb')).toEqual(['https://b/TL-06_1of2.jpg']);
  });

  it('sends only the story frame to a Story', () => {
    expect(assetUrls(mixed, 'https://b', 'ig_story')).toEqual(['https://b/TL-06_2of2_story.jpg']);
  });

  it('falls back to every asset rather than posting nothing', () => {
    expect(assetUrls(row({ asset_files: 'X.jpg' }), 'https://b', 'ig_story')).toEqual(['https://b/X.jpg']);
  });
});

describe('buildFacebook', () => {
  const ctx = { pageId: 'PAGE', baseUrl: 'https://b', scheduledAt: at('2026-09-08T16:30:00Z') };

  it('posts a single image directly to /photos', () => {
    const { steps } = buildFacebook(row(), ctx);
    expect(steps).toHaveLength(1);
    expect(steps[0].url).toContain('/PAGE/photos');
    expect(steps[0].form.published).toBe('false');
  });

  it('sends scheduled_publish_time in SECONDS, not milliseconds', () => {
    // Passing ms schedules the post ~50,000 years out and Meta accepts it.
    const { steps } = buildFacebook(row(), ctx);
    expect(Number(steps[0].form.scheduled_publish_time) * 1000).toBe(ctx.scheduledAt);
    // Guard the magnitude too: a millisecond value would still satisfy a
    // loose check but schedules the post ~50,000 years out.
    expect(String(steps[0].form.scheduled_publish_time)).toHaveLength(10);
  });

  it('uploads carousel images unpublished, then attaches them to a feed post', () => {
    const { steps } = buildFacebook(row({ asset_files: 'a.jpg,b.jpg,c.jpg' }), ctx);
    expect(steps).toHaveLength(4);
    expect(steps.slice(0, 3).every((s) => s.collectId && s.form.published === 'false')).toBe(true);
    // Staged uploads must NOT carry a schedule -- only the feed post does.
    expect(steps.slice(0, 3).every((s) => !s.form.scheduled_publish_time)).toBe(true);
    expect(steps[3].url).toContain('/feed');
    expect(steps[3].attachCollectedAs).toBe('attached_media');
  });

  it('publishes immediately when no schedule time is given', () => {
    const { steps } = buildFacebook(row(), { ...ctx, scheduledAt: null });
    expect(steps[0].form.published).toBe('true');
  });

  it('throws rather than posting an empty carousel', () => {
    expect(() => buildFacebook(row({ asset_files: '' }), ctx)).toThrow(/no assets/);
  });
});

describe('buildInstagram', () => {
  const ctx = { igUserId: 'IG', baseUrl: 'https://b' };

  it('creates a container then publishes it', () => {
    const { steps } = buildInstagram(row(), ctx);
    expect(steps.map((s) => s.name)).toEqual(['container', 'publish']);
    expect(steps[0].poll).toBe(true);
    expect(steps[1].attachCollectedAs).toBe('creation_id');
  });

  it('builds children, then a CAROUSEL parent, then publishes', () => {
    const { steps } = buildInstagram(row({ asset_files: 'a.jpg,b.jpg,c.jpg' }), ctx);
    expect(steps.map((s) => s.name)).toEqual(['child_1', 'child_2', 'child_3', 'carousel', 'publish']);
    // Children carry no caption; only the parent does.
    expect(steps[0].form.caption).toBeUndefined();
    expect(steps[0].form.is_carousel_item).toBe('true');
    expect(steps[3].form.media_type).toBe('CAROUSEL');
    expect(steps[3].replacesCollected).toBe(true);
  });

  it('refuses a carousel over Instagram’s 10-item limit', () => {
    const files = Array.from({ length: 11 }, (_, i) => `s${i}.jpg`).join(',');
    expect(() => buildInstagram(row({ asset_files: files }), ctx)).toThrow(/cap at 10/);
  });

  it('uses media_type=STORIES for a story', () => {
    const { steps } = buildInstagram(row({ asset_files: 'a_story.jpg' }), { ...ctx, isStory: true });
    expect(steps[0].form.media_type).toBe('STORIES');
  });
});

describe('buildTikTok', () => {
  const ctx = { baseUrl: 'https://b' };

  it('defaults to draft mode, which needs no audit', () => {
    const { steps } = buildTikTok(row(), ctx);
    expect(steps[0].json.post_mode).toBe('MEDIA_UPLOAD');
    expect(steps[0].json.media_type).toBe('PHOTO');
    expect(steps[0].json.source_info.source).toBe('PULL_FROM_URL');
  });

  it('switches to DIRECT_POST only when asked', () => {
    expect(buildTikTok(row(), { ...ctx, mode: 'DIRECT_POST' }).steps[0].json.post_mode).toBe('DIRECT_POST');
  });

  it('truncates the title to TikTok’s 150-char limit', () => {
    const long = 'x'.repeat(400);
    expect(buildTikTok(row({ caption: long, caption_x: '' }), ctx).steps[0].json.post_info.title).toHaveLength(150);
  });

  it('refuses more than 35 images', () => {
    const files = Array.from({ length: 36 }, (_, i) => `s${i}.jpg`).join(',');
    expect(() => buildTikTok(row({ asset_files: files }), ctx)).toThrow(/cap at 35/);
  });
});
