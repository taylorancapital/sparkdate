// tests/gender-backfill.test.js
//
// scripts/backfill-gender.js rewrites gender across event_registrations,
// tickets and users in production. Two of its decisions can corrupt data
// rather than merely fail, and both live here because the script itself
// requires lib/auth and cannot be imported without live credentials:
//
//   hasGender()      decides whether a record is BLANK. Get it wrong in the
//                    permissive direction and the backfill overwrites a
//                    hand-correction with a value inferred from a ticket
//                    class. Records WERE hand-corrected on 2026-08-30, so
//                    this is not hypothetical.
//
//   genderByEmail()  resolves Eventbrite attendees to one gender per email.
//                    An email appearing under two gendered ticket classes is
//                    a contradiction; resolving it by arrival order would let
//                    whichever record Eventbrite happened to return last
//                    decide someone's seat pool.
//
// The dry-run default is the script's other safety net, but a dry run only
// helps if somebody reads it. These rules hold whether or not anyone does.

import { describe, it, expect } from 'vitest';
import { hasGender, genderByEmail } from '../lib/eventbrite.js';

// `profile` is built LAST so an `extra.profile` override cannot clobber the
// email the join key depends on — which it did on the first run of this file.
const attendee = (email, ticketClass, extra = {}) => {
  const { profile, ...rest } = extra;
  return {
    ticket_class_name: ticketClass,
    ...rest,
    profile: { email, ...(profile || {}) },
  };
};

describe('hasGender — what counts as already set', () => {
  it.each(['woman', 'man', 'Woman', 'Male', '  man  ', 'nonbinary'])(
    '%s is a gender, so the backfill leaves it alone',
    (v) => expect(hasGender(v)).toBe(true),
  );

  it.each([[null], [undefined], [''], ['   ']])('%s is blank', (v) => expect(hasGender(v)).toBe(false));

  it.each(['null', 'undefined', 'NULL', 'Undefined', ' null '])(
    'treats the string %s as blank, not as a value',
    (v) => {
      // A field that has been through JSON, a CSV or a spreadsheet can arrive
      // as the literal text "null". `if (d.gender)` calls that truthy and
      // would skip the record forever.
      expect(hasGender(v)).toBe(false);
    },
  );

  it('never reports blank for something it would be destructive to overwrite', () => {
    // The asymmetry that matters: a false positive here costs one skipped
    // record; a false negative overwrites a human's correction.
    for (const v of ['woman', 'man', 'Prefer not to say', 'other', 'x']) {
      expect(hasGender(v)).toBe(true);
    }
  });
});

describe('genderByEmail — resolving attendees', () => {
  it('maps the real ticket classes', () => {
    const { byEmail } = genderByEmail([
      attendee('Chase@Example.com', 'General Admission - Male'),
      attendee('mel@example.com', 'General Admission - Female'),
    ]);
    expect(byEmail.get('chase@example.com')).toBe('man');
    expect(byEmail.get('mel@example.com')).toBe('woman');
  });

  it('normalises the email, because that is the join key', () => {
    // Our records store a normalized email; matching on the raw one would
    // silently fill nothing for anyone who typed a capital letter.
    const { byEmail } = genderByEmail([attendee('  MiXeD@Example.COM ', 'General Admission - Male')]);
    expect(byEmail.has('mixed@example.com')).toBe(true);
  });

  it('ignores attendees on a non-gendered class', () => {
    const { byEmail } = genderByEmail([attendee('a@b.com', 'General Admission')]);
    expect(byEmail.size).toBe(0);
  });

  it('ignores attendees with no email to join on', () => {
    const { byEmail } = genderByEmail([
      { profile: {}, ticket_class_name: 'General Admission - Male' },
      { ticket_class_name: 'General Admission - Female' },
    ]);
    expect(byEmail.size).toBe(0);
  });

  it('refuses an email that appears under both genders', () => {
    // Rather than letting arrival order decide. Reported separately so the
    // script can say so out loud instead of silently dropping someone.
    const { byEmail, conflicts } = genderByEmail([
      attendee('dup@example.com', 'General Admission - Male'),
      attendee('dup@example.com', 'General Admission - Female'),
    ]);
    expect(byEmail.has('dup@example.com')).toBe(false);
    expect([...conflicts]).toEqual(['dup@example.com']);
  });

  it('keeps a repeat buyer whose classes agree', () => {
    const { byEmail, conflicts } = genderByEmail([
      attendee('same@example.com', 'General Admission - Male'),
      attendee('same@example.com', 'General Admission - Male'),
    ]);
    expect(byEmail.get('same@example.com')).toBe('man');
    expect(conflicts.size).toBe(0);
  });

  it('prefers an explicit profile gender over the ticket class', () => {
    const { byEmail } = genderByEmail([
      attendee('x@example.com', 'General Admission - Male', { profile: { gender: 'Female' } }),
    ]);
    expect(byEmail.get('x@example.com')).toBe('woman');
  });

  it.each([[[]], [null], [undefined]])('survives %s rather than throwing', (input) => {
    const { byEmail, conflicts } = genderByEmail(input);
    expect(byEmail.size).toBe(0);
    expect(conflicts.size).toBe(0);
  });
});
