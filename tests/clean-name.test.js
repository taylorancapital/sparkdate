// tests/clean-name.test.js
//
// On 2026-08-30 two live Eventbrite signups arrived with their names wrapped
// in Python bytes-literal syntax:
//
//   b'Jordan' b'Reyes'          jordanreyes@yahoo.com
//   b'Alexis' b'Moore' amoore88@comcast.net
//
// JavaScript has no `b'...'` spelling, so nothing in this codebase produced
// it — it was already that way in Eventbrite's attendee profile. What WAS ours
// is that enrollEventbriteOne splits the name on whitespace and passes
// nameParts[0] to ebWelcomeHTML, so both of them received a welcome email
// addressed to "b'Jordan'" and "b'Alexis'".
//
// The risk in fixing this is over-stripping. A name mangled by an
// over-eager sanitiser is worse than one mangled by the bug, because the bug
// is at least obvious. So the rule is deliberately narrow — an ENTIRE
// whitespace token that is a complete bytes literal — and most of the cases
// below exist to prove the things it must NOT touch.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanName } from '../lib/eventbrite.js';

afterEach(() => vi.restoreAllMocks());

describe('cleanName — the names that broke', () => {
  it.each([
    ["b'Jordan' b'Reyes'", 'Jordan Reyes'],
    ["b'Alexis' b'Moore'", 'Alexis Moore'],
  ])('unwraps %s', (raw, want) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName(raw)).toBe(want);
  });

  it('unwraps double-quoted bytes literals too', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName('b"Jordan" b"Reyes"')).toBe('Jordan Reyes');
  });

  it('handles a partly-corrupted name', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName("b'Jordan' Reyes")).toBe('Jordan Reyes');
  });

  it('warns when it strips, so a recurrence is visible in the sync log', () => {
    // Silent repair would hide an upstream corruption that is still running.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanName("b'Jordan' b'Reyes'");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('Jordan Reyes');
  });

  it('says nothing when there is nothing to strip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanName('Jordan Reyes');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('cleanName — names it must NOT touch', () => {
  it.each([
    // The whole point of anchoring the pattern to a complete token.
    ["B'Elanna Torres", "B'Elanna Torres"],   // apostrophe, no closing quote
    ["b'Elanna Torres", "b'Elanna Torres"],   // same, lowercase
    ["O'Brien", "O'Brien"],                   // never even considered
    ["Jordan O'Reyes", "Jordan O'Reyes"],
    ['Brian Reyes', 'Brian Reyes'],             // leading b, ordinary name
    ['Bob', 'Bob'],
    ["Ni'ihau b'aal", "Ni'ihau b'aal"],       // b'aal has no closing quote
    ['', ''],
  ])('leaves %s alone', (raw, want) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName(raw)).toBe(want);
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves a bytes literal embedded in a longer token alone', () => {
    // Only a WHOLE token is unwrapped; this is not the failure mode observed
    // and stripping inside a token would be guesswork.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName("xb'Jordan'")).toBe("xb'Jordan'");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('cleanName — shape', () => {
  it('collapses whitespace and trims, as the old inline code did', () => {
    expect(cleanName('  Jordan   Reyes  ')).toBe('Jordan Reyes');
  });

  it.each([[null, ''], [undefined, ''], [12345, '12345']])('coerces %s safely', (raw, want) => {
    expect(cleanName(raw)).toBe(want);
  });

  it('drops a token that unwraps to nothing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanName("b'' Reyes")).toBe('Reyes');
  });
});
