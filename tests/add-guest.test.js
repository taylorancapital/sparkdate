// tests/add-guest.test.js
//
// Covers the post-purchase +1 path:
//   1. the token (lib/add-guest.js) — forgery, cross-replay, namespacing
//   2. the targeting rule — who the pre-event email renders a link for
//   3. the two source-level invariants that are easy to "tidy" back into bugs
//
// No Firestore here. The endpoint's own writes need the emulator; what is
// tested is everything that can be reasoned about without one.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

beforeAll(() => {
  // Both helpers resolve the secret at call time, so setting it here is
  // enough — that late resolution is itself deliberate (see lib/unsubscribe.js).
  process.env.UNSUBSCRIBE_SECRET = 'test-secret-not-a-real-one';
});

describe('lib/add-guest token', () => {
  it('round-trips a token it just signed', async () => {
    const { makeAddGuestUrl, parseToken, verifySignature } = await import('../lib/add-guest.js');
    const url = makeAddGuestUrl('tkt_123', 'Her@Example.com');
    const raw = decodeURIComponent(new URL(url).searchParams.get('token'));
    const parsed = parseToken(raw);
    expect(parsed.ticketId).toBe('tkt_123');
    expect(verifySignature('tkt_123', 'Her@Example.com', parsed.sig)).toBe(true);
  });

  it('is case-insensitive on the email, because stored casing varies', async () => {
    const { makeAddGuestUrl, parseToken, verifySignature } = await import('../lib/add-guest.js');
    const raw = decodeURIComponent(
      new URL(makeAddGuestUrl('tkt_123', 'HER@EXAMPLE.COM')).searchParams.get('token'));
    expect(verifySignature('tkt_123', 'her@example.com', parseToken(raw).sig)).toBe(true);
  });

  it('rejects a signature replayed onto a different ticket', async () => {
    const { makeAddGuestUrl, parseToken, verifySignature } = await import('../lib/add-guest.js');
    const raw = decodeURIComponent(
      new URL(makeAddGuestUrl('tkt_123', 'her@example.com')).searchParams.get('token'));
    const { sig } = parseToken(raw);
    expect(verifySignature('tkt_OTHER', 'her@example.com', sig)).toBe(false);
  });

  it('rejects a signature replayed with a different email', async () => {
    const { makeAddGuestUrl, parseToken, verifySignature } = await import('../lib/add-guest.js');
    const raw = decodeURIComponent(
      new URL(makeAddGuestUrl('tkt_123', 'her@example.com')).searchParams.get('token'));
    expect(verifySignature('tkt_123', 'someone.else@example.com', parseToken(raw).sig)).toBe(false);
  });

  it('is namespaced away from the unsubscribe token, which shares the secret', async () => {
    // Both sign an `<id>.<email>` pair with the same secret. Without the
    // 'addguest.' prefix an unsubscribe link would be a valid add-guest link
    // for the doc whose id happened to match.
    const addGuest = await import('../lib/add-guest.js');
    const unsub = await import('../lib/unsubscribe.js');
    const agRaw = decodeURIComponent(
      new URL(addGuest.makeAddGuestUrl('id_1', 'a@b.com')).searchParams.get('token'));
    const unsubRaw = decodeURIComponent(
      new URL(unsub.makeUnsubscribeUrl('id_1', 'a@b.com')).searchParams.get('token'));
    expect(addGuest.parseToken(agRaw).sig).not.toBe(unsub.parseToken(unsubRaw).sig);
    expect(addGuest.verifySignature('id_1', 'a@b.com', unsub.parseToken(unsubRaw).sig)).toBe(false);
  });

  it('returns null for malformed tokens rather than throwing', async () => {
    const { parseToken } = await import('../lib/add-guest.js');
    for (const bad of ['', null, undefined, 'nodot', '.leadingdot']) {
      expect(parseToken(bad)).toBeNull();
    }
  });

  it('does not throw on a wrong-length signature', async () => {
    // timingSafeEqual throws on a length mismatch — the length guard in
    // verifySignature exists to stop a truncated URL 500ing the endpoint.
    const { verifySignature } = await import('../lib/add-guest.js');
    expect(verifySignature('tkt_123', 'a@b.com', 'tooshort')).toBe(false);
  });
});

describe('pre-event email: who the +1 link is rendered for', () => {
  // Mirrors the three conditions in sendPreEventEmails. Kept as a table so a
  // future change to the rule has to change this list too.
  const shouldGetLink = (r) => r.gender === 'woman' && !!r.ticketId && !r.isPlusOne;

  it('renders for a woman holding a real ticket', () => {
    expect(shouldGetLink({ gender: 'woman', ticketId: 'tkt_1' })).toBe(true);
  });

  it('does not render for a man — advertising is targeted', () => {
    expect(shouldGetLink({ gender: 'man', ticketId: 'tkt_1' })).toBe(false);
  });

  it('does not render when gender is unknown, rather than guessing', () => {
    expect(shouldGetLink({ gender: null, ticketId: 'tkt_1' })).toBe(false);
    expect(shouldGetLink({ ticketId: 'tkt_1' })).toBe(false);
  });

  it('does not render for a check-in registration, which has no ticket', () => {
    expect(shouldGetLink({ gender: 'woman', ticketId: null })).toBe(false);
  });

  it('does not render for a companion — a +1 does not get a +1', () => {
    expect(shouldGetLink({ gender: 'woman', ticketId: 'tkt_1', isPlusOne: true })).toBe(false);
  });
});

describe('source invariants', () => {
  it('api/add-guest.js never reads the TICKET HOLDER\'s gender', () => {
    // The product is open to everyone and only the advertising is targeted.
    // A gender check on the buyer HERE re-creates the product gate that was
    // reversed on 2026-09-02 on legal grounds. If this test fails, read the
    // header of api/add-guest.js before "fixing" it.
    //
    // Asserting on the buyer specifically, not on the word "gender": the
    // endpoint legitimately collects and stores the GUEST's gender (it is a
    // required field, and seatFields() needs it to pick a seat counter). An
    // earlier version of this test banned the word outright and failed on
    // that input whitelist.
    const src = readFileSync(resolve(ROOT, 'api/add-guest.js'), 'utf8');
    const code = src.split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/ctx\.ticket\.gender/);
    expect(code).not.toMatch(/ticket\.gender/);
  });

  it('escapes with new RegExp, never a literal quote in a regex', () => {
    // A literal quote inside a regex breaks Vercel's build-time entrypoint
    // scanner and silently drops the file from the deploy. api/unsubscribe.js
    // carries the same note.
    const src = readFileSync(resolve(ROOT, 'api/add-guest.js'), 'utf8');
    expect(src).toMatch(/new RegExp\('"', 'g'\)/);
    expect(src).not.toMatch(/replace\(\/"\/g/);
  });

  it('the returning-attendee +1 line is gated to women', () => {
    // This line went to every returning attendee, men included, until
    // 2026-09-03 — the one place the 2-for-1 was advertised outside a female
    // audience.
    const src = readFileSync(resolve(ROOT, 'api/cron-send-emails.js'), 'utf8');
    const idx = src.indexOf('+1 comes free');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 500), idx);
    expect(window).toMatch(/u\.gender === 'woman'/);
  });

  it('brand.json still bans the 2-for-1 words outside a female audience', () => {
    // The email rule above is only correct while this is the standing rule.
    const brand = JSON.parse(readFileSync(resolve(ROOT, 'content/brand.json'), 'utf8'));
    const banned = brand.paid_template.caption_rules.banned_outside_female_ad_set;
    expect(banned).toContain('2-for-1');
  });
});
