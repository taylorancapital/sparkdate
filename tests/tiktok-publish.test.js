// tests/tiktok-publish.test.js
//
// Covers the Content Posting API rules in lib/tiktok-publish.js.
//
// These are not ordinary validation tests. TikTok's reviewers GRADE this
// behaviour before approving the app, and they probe the server rather than
// the form -- a request the UI would never produce is exactly what gets tried.
// A rejection here costs weeks and is slow to recover from, so each rule gets
// asserted directly instead of being trusted to the page.
//
// The rules come from the integration handoff and from what the portal
// enforces:
//
//   * privacy must be one the creator's account actually allows
//   * no default privacy -- an unset value is a refusal, not a fallback
//   * branded content cannot be posted privately
//   * disclosing commercial content requires saying which kind
//   * a creator who disabled comments/duet/stitch cannot have them re-enabled
//     by this tool

import { describe, it, expect } from 'vitest';
import { validatePost, interactionFlags, MAX_UPLOAD_BYTES } from '../lib/tiktok-publish.js';

const creator = (over = {}) => ({
  privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
  comment_disabled: false,
  duet_disabled: false,
  stitch_disabled: false,
  ...over,
});

const base = (over = {}) => ({
  creator: creator(),
  privacyLevel: 'PUBLIC_TO_EVERYONE',
  mime: 'video/mp4',
  size: 1024,
  ...over,
});

describe('validatePost - privacy', () => {
  it('accepts a well-formed post', () => {
    expect(validatePost(base())).toBeNull();
  });

  it('refuses an unset privacy level rather than defaulting', () => {
    expect(validatePost(base({ privacyLevel: '' }))).toMatch(/must be selected/i);
  });

  it('refuses a privacy level the account does not allow', () => {
    // An unapproved app reports only SELF_ONLY. Sending PUBLIC anyway is the
    // exact request a reviewer tries.
    const c = creator({ privacy_level_options: ['SELF_ONLY'] });
    expect(validatePost(base({ creator: c, privacyLevel: 'PUBLIC_TO_EVERYONE' })))
      .toMatch(/not available for this account/i);
  });

  it('refuses when creator_info carried no options at all', () => {
    expect(validatePost(base({ creator: {} }))).toMatch(/not available/i);
  });
});

describe('validatePost - commercial disclosure', () => {
  it('blocks branded content on a private post', () => {
    expect(validatePost(base({
      privacyLevel: 'SELF_ONLY', discloseCommercial: true, brandedContent: true,
    }))).toMatch(/cannot be set to private/i);
  });

  it('allows your-brand on a private post', () => {
    // Only BRANDED content is restricted; promoting yourself privately is fine.
    expect(validatePost(base({
      privacyLevel: 'SELF_ONLY', discloseCommercial: true, yourBrand: true,
    }))).toBeNull();
  });

  it('refuses disclosure with neither kind chosen', () => {
    expect(validatePost(base({ discloseCommercial: true })))
      .toMatch(/requires Your brand, Branded content, or both/i);
  });

  it('ignores the brand flags when disclosure is off', () => {
    expect(validatePost(base({ discloseCommercial: false, yourBrand: false }))).toBeNull();
  });
});

describe('validatePost - file', () => {
  it('refuses an unsupported type', () => {
    expect(validatePost(base({ mime: 'image/gif' }))).toMatch(/Unsupported file type/i);
  });

  it('refuses an empty file', () => {
    expect(validatePost(base({ size: 0 }))).toMatch(/empty/i);
  });

  it('refuses a file over the serverless body ceiling', () => {
    // Vercel caps the request body, and the file passes through our function.
    // Caught here so it fails with a sentence rather than a platform 413.
    const msg = validatePost(base({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(msg).toMatch(/tops out/i);
    expect(msg).toMatch(/PULL_FROM_URL/);
  });

  it('accepts mov and webm', () => {
    expect(validatePost(base({ mime: 'video/quicktime' }))).toBeNull();
    expect(validatePost(base({ mime: 'video/webm' }))).toBeNull();
  });
});

describe('interactionFlags', () => {
  it('inverts allow into TikTok disable sense', () => {
    expect(interactionFlags(creator(), { allowComment: true, allowDuet: false, allowStitch: true }))
      .toEqual({ disable_comment: false, disable_duet: true, disable_stitch: false });
  });

  it('defaults everything to disabled when nothing was allowed', () => {
    // The toggles start OFF in the UI, so an absent value means off, not on.
    expect(interactionFlags(creator(), {}))
      .toEqual({ disable_comment: true, disable_duet: true, disable_stitch: true });
  });

  it("cannot re-enable what the creator turned off in their own settings", () => {
    const c = creator({ comment_disabled: true, duet_disabled: true, stitch_disabled: true });
    expect(interactionFlags(c, { allowComment: true, allowDuet: true, allowStitch: true }))
      .toEqual({ disable_comment: true, disable_duet: true, disable_stitch: true });
  });

  it('survives a missing creator object', () => {
    expect(interactionFlags(null, { allowComment: true }))
      .toEqual({ disable_comment: false, disable_duet: true, disable_stitch: true });
  });
});
