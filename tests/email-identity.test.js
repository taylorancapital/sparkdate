// tests/email-identity.test.js
//
// Coverage for lib/email-identity.js — the "are these two emails the same
// person" rule the door check-in flow uses before creating an account. A
// regression here either splits one attendee into two accounts (inflated
// roster, split match list) or, much worse, merges two different people and
// hands one stranger's phone number to another on a mutual match.
//
// The specific cases named below are real duplicates pulled from production
// rosters, not invented examples.

import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  sameEmailIdentity,
  emailLookupVariants,
} from '../lib/email-identity.js';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  SomeName42@Gmail.com ')).toBe('somename42@gmail.com');
  });

  it('collapses Apple alias domains onto one identity', () => {
    // Sam Rivera, live on two events: mac.com on the Eventbrite ticket,
    // me.com at the door.
    expect(normalizeEmail('samrivera@mac.com')).toBe('samrivera@icloud.com');
    expect(normalizeEmail('samrivera@me.com')).toBe('samrivera@icloud.com');
    expect(normalizeEmail('samrivera@icloud.com')).toBe('samrivera@icloud.com');
  });

  it('leaves non-Apple domains alone', () => {
    expect(normalizeEmail('someone@gmail.com')).toBe('someone@gmail.com');
    expect(normalizeEmail('someone@yahoo.com')).toBe('someone@yahoo.com');
  });

  it('does NOT fold Gmail dots or +tags (deliberate — false merges are worse)', () => {
    expect(normalizeEmail('a.b@gmail.com')).not.toBe(normalizeEmail('ab@gmail.com'));
    expect(normalizeEmail('a+evt@gmail.com')).not.toBe(normalizeEmail('a@gmail.com'));
  });

  it('returns a harmless value for unparseable input instead of throwing', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail('not-an-email')).toBe('not-an-email');
    expect(normalizeEmail('@nolocal.com')).toBe('@nolocal.com');
    expect(normalizeEmail('nodomain@')).toBe('nodomain@');
  });
});

describe('sameEmailIdentity', () => {
  it('matches the real case-only duplicate (Rose)', () => {
    expect(sameEmailIdentity('somename42@gmail.com', 'SomeName42@gmail.com')).toBe(true);
  });

  it('matches the real Apple-alias duplicate (Luke)', () => {
    expect(sameEmailIdentity('samrivera@me.com', 'samrivera@mac.com')).toBe(true);
  });

  it('matches the real case-only duplicate (Casey)', () => {
    expect(sameEmailIdentity('dotted.7.name@gmail.com', 'Dotted.7.Name@gmail.com')).toBe(true);
  });

  it('does not match two genuinely different people', () => {
    expect(sameEmailIdentity('first.alias@gmail.com', 'first.real@gmail.com')).toBe(false);
  });

  it('does not match same local part on unrelated domains', () => {
    expect(sameEmailIdentity('luke@gmail.com', 'luke@yahoo.com')).toBe(false);
  });

  it('never matches on empty/unparseable input', () => {
    expect(sameEmailIdentity('', '')).toBe(false);
    expect(sameEmailIdentity(null, null)).toBe(false);
    expect(sameEmailIdentity('', 'someone@gmail.com')).toBe(false);
  });
});

describe('emailLookupVariants', () => {
  it('returns just the lowercased address for a normal domain (one lookup, common path)', () => {
    expect(emailLookupVariants('Someone@Gmail.com')).toEqual(['someone@gmail.com']);
  });

  it('returns every Apple alias so an exact-match store can still find the account', () => {
    const v = emailLookupVariants('samrivera@me.com');
    expect(v[0]).toBe('samrivera@me.com'); // input form tried first
    expect(v).toContain('samrivera@mac.com');
    expect(v).toContain('samrivera@icloud.com');
    expect(v.length).toBe(3);
  });

  it('does not duplicate the input when it is already the canonical alias', () => {
    const v = emailLookupVariants('samrivera@icloud.com');
    expect(v.length).toBe(3);
    expect(new Set(v).size).toBe(3);
  });

  it('returns an empty list for unparseable input', () => {
    expect(emailLookupVariants('')).toEqual([]);
    expect(emailLookupVariants(null)).toEqual([]);
    expect(emailLookupVariants('junk')).toEqual([]);
  });
});
