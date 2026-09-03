// tests/two-for-one-gate.test.js
//
// The 2-for-1 is offered to EVERY buyer and only ADVERTISED to women.
//
// History, because this rule has flipped twice in one day and the code is the
// only place the decision survives:
//
//   - content/brand.json has carried `caption_rules.banned_outside_female_ad_set`
//     for weeks: the WORDS "2-for-1" may not appear outside the female ad set.
//     scripts/lint-ad-copy.js enforces it. That is a marketing rule.
//   - On 2026-09-02 a session read that rule as a product rule, gated the
//     offer to women in api/purchase-ticket.js and hid the toggle for men on
//     public/event.html -- while public/events.html, the dialog paid traffic
//     lands in, kept showing it to everyone and let men fill in a +1 only to
//     be refused with a generic error at submit.
//   - Later the same day Taylor reversed it: the offer is for everyone, and
//     only the advertising is aimed at women. Gender-conditioned pricing at a
//     place of public accommodation is the riskier legal shape; the product
//     treats every buyer alike.
//
// So the invariants are now: no gender guard on the +1 server-side, the toggle
// visible on every checkout surface, and the COPY rule in brand.json intact.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = process.cwd();
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');
const API = read('api', 'purchase-ticket.js');
const EVENT = read('public', 'event.html');
const EVENTS = read('public', 'events.html');
const LP = read('public', 'lp.html');
const BRAND = JSON.parse(read('content', 'brand.json'));

const plusOneGuard = () => {
  const block = API.slice(API.indexOf('if (req.body && req.body.plusOne)'));
  return block.slice(0, block.indexOf('plusOne = {'));
};

describe('2-for-1 is open to every buyer — server', () => {
  it('has a +1 block to inspect', () => {
    expect(API).toContain('if (req.body && req.body.plusOne)');
  });

  it('does not reject a +1 on the buyer gender', () => {
    // The 2026-09-02 gate was `if (gender !== 'woman') { return res.status(400)`.
    // A guard on the buyer's gender must not come back in any spelling.
    // `po.gender !== 'woman' && po.gender !== 'man'` is the +1 VALUE check and
    // must stay; what may not exist is a bare `gender !== ...` rejection on
    // the buyer. Hence the lookbehind.
    const guard = plusOneGuard();
    expect(guard).not.toMatch(/(?<!po\.)gender !== 'woman'\s*\)/);
    expect(guard).not.toMatch(/(?<!po\.)gender !== 'man'\s*\)/);
    expect(guard).not.toMatch(/women only/i);
  });

  it('still validates the +1 fields and gender value', () => {
    const guard = plusOneGuard();
    expect(guard).toMatch(/Missing \+1 fields/);
    expect(guard).toMatch(/po\.gender !== 'woman' && po\.gender !== 'man'/);
  });
});

describe('2-for-1 is open to every buyer — every checkout surface', () => {
  it('event.html ships the toggle visible, not hidden by default', () => {
    expect(EVENT).toMatch(/id="twoForOneToggle"/);
    expect(EVENT).not.toMatch(/id="twoForOneToggle"\s+hidden/);
  });

  it('event.html never hides it by gender', () => {
    const fn = EVENT.slice(EVENT.indexOf('function syncTwoForOneVisibility'));
    const body = fn.slice(0, fn.indexOf('\n        }'));
    expect(body).not.toMatch(/=== 'woman'/);
    expect(body).not.toMatch(/hidden = !/);
  });

  it('the /events dialog offers it to everyone', () => {
    expect(EVENTS).toMatch(/id="modalTwoForOne"/);
    expect(EVENTS).not.toMatch(/modalTwoForOne[^\n]*hidden/);
  });

  it('the /lp inline checkout offers it too', () => {
    expect(LP).toMatch(/id="lpTwo"/);
  });
});

describe('the marketing rule stands', () => {
  it('brand.json still bans the words outside the female ad set', () => {
    expect(BRAND.paid_template.caption_rules.banned_outside_female_ad_set)
      .toEqual(expect.arrayContaining(['2-for-1']));
  });

  it('and says, in its own notes, that checkout honours the offer for everyone', () => {
    const female = BRAND.paid_template.ad_sets.find((s) => s.key === 'female');
    expect(female._offer_restriction).toMatch(/every buyer/i);
    expect(BRAND.paid_template.caption_templates.female._offer_line_note).toMatch(/every buyer/i);
  });
});
