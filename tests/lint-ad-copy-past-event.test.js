// tests/lint-ad-copy-past-event.test.js
//
// Pins the escalation boundary of lint-ad-copy.js's `past-event` check.
//
// The check exists to catch money burning on a night that already happened,
// and it judged that on `effective_status: ACTIVE` alone. That status means
// "nobody paused it", not "it is running" -- delivery stops at the AD SET's
// end_time, and nobody archives a campaign once its event is over. So three
// Tellus campaigns that stopped delivering on 2026-08-26 and had spent $0
// since were still being reported as errors four days later.
//
// Five permanent errors for something costing nothing is precisely how a
// linter trains people to ignore it, which lint-ad-copy.js's own header
// argues against. These tests exist so the boundary cannot drift back: an ad
// that CAN still deliver against a past event stays an error, and one that
// cannot is a warning.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lint } = require('../scripts/lint-ad-copy.js');
const brand = require('../content/brand.json');

const TL = '8E9WZTat32JyoUjWuIE7';   // Tellus, 2026-08-26 -- in the past
const LX = 'KL4onXm7hJbqiwI9quAZ';   // Loxleys, 2026-09-22 -- in the future
const TODAY = '2026-08-30';

/** Minimal servable video ad pointed at one event. */
const adFor = (eventId, { status = 'ACTIVE', endTime = null, name = 'test ad' } = {}) => ({
  name,
  effective_status: status,
  ...(endTime ? { adset: { end_time: endTime } } : {}),
  creative: {
    id: '1',
    url_tags: 'utm_source={{site_source_name}}&utm_medium=paid_social&utm_content=test_only',
    object_story_spec: {
      video_data: {
        message: 'Doors 6:30 PM.',
        call_to_action: { type: 'LEARN_MORE', value: { link: `https://sparkdate.date/lp?eventId=${eventId}` } },
      },
    },
  },
});

const pastEvent = (ads) => lint(ads, brand, TODAY).filter((f) => f.check === 'past-event');

describe('past-event severity', () => {
  it('is an ERROR when an ACTIVE ad can still deliver against a finished event', () => {
    const [f] = pastEvent([adFor(TL, { endTime: '2026-09-30T12:00:00-0400' })]);
    expect(f).toBeDefined();
    expect(f.severity).toBe('error');
  });

  it('is an ERROR when an ACTIVE ad has no end_time at all — open-ended delivery', () => {
    const [f] = pastEvent([adFor(TL)]);
    expect(f.severity).toBe('error');
  });

  it('drops to a warning once the ad set end_time has passed', () => {
    const [f] = pastEvent([adFor(TL, { endTime: '2026-08-26T23:59:00-0400' })]);
    expect(f.severity).toBe('warning');
    expect(f.message).toMatch(/no longer delivering/);
  });

  it('stays a warning for a paused ad, end_time or not', () => {
    const [f] = pastEvent([adFor(TL, { status: 'PAUSED', endTime: '2026-09-30T12:00:00-0400' })]);
    expect(f.severity).toBe('warning');
  });

  it('says nothing at all about an event still in the future', () => {
    expect(pastEvent([adFor(LX)])).toHaveLength(0);
  });
});
