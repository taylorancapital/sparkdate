// tests/two-for-one-gate.test.js
//
// The 2-for-1 is a WOMEN-ONLY promotion. It shipped ungated: any buyer could
// tick the box and take a second seat for free, which turned a targeted offer
// into a permanent site-wide 50% off.
//
// The defect had a tell nobody followed. content/brand.json has carried
// `caption_rules.banned_outside_female_ad_set: ["2-for-1", ...]` for weeks, and
// scripts/lint-ad-copy.js enforces it — so the ADVERTISING was policed while
// the PRODUCT handed the same offer to everyone. A rule about who may be told
// about an offer is not a rule about who may take it.
//
// Both halves are asserted here against the SHIPPED files rather than a copy:
// the server rule in api/purchase-ticket.js, because that is where the free
// seat is actually granted, and the client gate in public/event.html, because
// a male buyer should never see the offer in the first place.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = process.cwd();
const API = fs.readFileSync(path.join(REPO, 'api', 'purchase-ticket.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(REPO, 'public', 'event.html'), 'utf8');
const BRAND = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'brand.json'), 'utf8'));

describe('2-for-1 is women-only — server', () => {
  it('rejects a +1 when the buyer is not a woman', () => {
    // The check must live inside the `if (req.body.plusOne)` block: gating the
    // whole purchase on gender would reject every male ticket sold.
    const block = API.slice(API.indexOf('if (req.body && req.body.plusOne)'));
    const guard = block.slice(0, block.indexOf('plusOne = {'));
    expect(guard).toMatch(/gender !== 'woman'/);
    expect(guard).toMatch(/status\(400\)/);
  });

  it('checks the BUYER gender, not the +1 gender', () => {
    // `po.gender !== 'woman'` would be the wrong rule twice over: it would let
    // a man bring a woman free, and block a woman bringing a man.
    const block = API.slice(API.indexOf('if (req.body && req.body.plusOne)'));
    const guard = block.slice(0, block.indexOf('plusOne = {'));
    const womenOnly = guard.match(/if \((\w+(?:\.\w+)?) !== 'woman'\) \{[\s\S]*?2-for-1/);
    expect(womenOnly, 'no women-only guard found').toBeTruthy();
    expect(womenOnly[1]).toBe('gender');
    expect(womenOnly[1]).not.toBe('po.gender');
  });

  it('still accepts a woman bringing a man', () => {
    // The +1's own gender is unconstrained — the room wants the mix.
    //
    // Asserted precisely, because the obvious pattern is a false positive: the
    // block legitimately contains `po.gender !== 'woman' && po.gender !== 'man'`,
    // which VALIDATES the value rather than restricting it. What must not exist
    // is a `po.gender !== 'woman'` that stands alone as a rejection.
    const block = API.slice(API.indexOf('if (req.body && req.body.plusOne)'));
    const guard = block.slice(0, block.indexOf('plusOne = {'));
    const restrictive = /po\.gender !== 'woman'\s*\)/;
    expect(guard, 'the +1 itself must not be required to be a woman')
      .not.toMatch(restrictive);
    // and the validation line is still there, unchanged
    expect(guard).toMatch(/po\.gender !== 'woman' && po\.gender !== 'man'/);
  });
});

describe('2-for-1 is women-only — client', () => {
  it('ships the toggle hidden rather than visible-by-default', () => {
    // If the default were visible, every male buyer would see the offer for
    // the moment before the script runs — and with JS blocked, permanently.
    expect(PAGE).toMatch(/id="twoForOneToggle"\s+hidden/);
  });

  it('reveals it only for a female buyer', () => {
    expect(PAGE).toMatch(/ticketGender'\)\.value === 'woman'/);
  });

  it('clears a ticked box if the buyer switches away from woman', () => {
    // Otherwise: select woman, tick, select man, submit — the checkbox stays
    // checked and the +1 fields stay populated.
    const fn = PAGE.slice(PAGE.indexOf('function syncTwoForOneVisibility'));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    expect(body).toMatch(/box\.checked = false/);
  });
});

describe('the rule that was only half-enforced', () => {
  it('brand.json still bans the words outside the female ad set', () => {
    // Kept as a live assertion, not a comment: this rule existing while the
    // checkout contradicted it is the whole reason this file was written.
    expect(BRAND.paid_template.caption_rules.banned_outside_female_ad_set)
      .toEqual(expect.arrayContaining(['2-for-1']));
  });
});
