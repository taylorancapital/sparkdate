// tests/normalize-gender.test.js
//
// Two live Eventbrite signups on 2026-08-30 arrived with no gender at all,
// despite both being sold as male tickets. Two independent causes, either of
// which alone was enough:
//
//   1. scripts/sync-eventbrite.js looked for gender in exactly two places —
//      profile.gender, and a custom question matching /gender/i. SparkDate
//      sells GENDERED TICKET CLASSES, so when the order form asks nothing, the
//      ticket class is the only record of which pool a buyer belongs to. It
//      was ignored.
//   2. lib/enroll.js accepted an allowlist of exactly ['woman','man'], so
//      Eventbrite's own "Male"/"Female" spellings normalised to null.
//
// The dangerous failure mode in fixing this is not "no gender" — it is the
// WRONG gender, because seatFields() treats anything that is not 'woman' as
// the men's pool on legacy gender-split events. /male/ matching inside
// "Female" would file every woman as a man, silently, and the imbalance the
// dashboard reports would be actively wrong rather than merely absent. That
// case is the first test below and the reason the female patterns are tested
// first.

import { describe, it, expect } from 'vitest';
import { normalizeGender, attendeeGender } from '../lib/eventbrite.js';

describe('normalizeGender — female must never be read as male', () => {
  it.each(['Female', 'female', 'FEMALE', 'Female Ticket', 'Female - Early Bird', 'FREE FEMALE TICKET'])(
    '%s is a woman, not a man',
    (raw) => expect(normalizeGender(raw)).toBe('woman'),
  );
});

describe('normalizeGender — the spellings Eventbrite actually uses', () => {
  it.each([
    ['Male', 'man'],
    ['male', 'man'],
    ['Man', 'man'],
    ['Men', 'man'],
    ['M', 'man'],
    ['Male Ticket', 'man'],
    ['Woman', 'woman'],
    ['Women', 'woman'],
    ['W', 'woman'],
    ['F', 'woman'],
    // THE REAL TICKET CLASSES on these listings, confirmed 2026-08-30. Note
    // "General Admission" contains an m; without the \b anchors the male
    // pattern's bare `m` alternative matches it and files every buyer,
    // including every woman, as a man.
    ['General Admission - Male', 'man'],
    ['General Admission - Female', 'woman'],
  ])('%s -> %s', (raw, want) => expect(normalizeGender(raw)).toBe(want));
});

describe('normalizeGender — null rather than a guess', () => {
  it.each([
    ['General Admission'],
    ['Early Bird'],
    ['VIP'],
    ['Standard'],
    ['2-for-1'],
    [''],
    ['   '],
    [null],
    [undefined],
    ['nonbinary'],
    ['prefer not to say'],
  ])('%s has no gender in it', (raw) => expect(normalizeGender(raw)).toBeNull());

  it('does not find a gender inside an unrelated word', () => {
    // Without \b these would match: "woMEN" is fine, but "Mango"/"Female"
    // style substring hits are what turn a null into a wrong answer.
    expect(normalizeGender('Mango Lassi Package')).toBeNull();
    expect(normalizeGender('Management Table')).toBeNull();
    expect(normalizeGender('Performance Seat')).toBeNull();
  });
});

describe('normalizeGender — shape', () => {
  it('always answers in the vocabulary seatFields expects', () => {
    // seatFields() compares === 'woman'; anything else lands in the men's
    // pool on legacy events, so the output vocabulary is load-bearing.
    for (const raw of ['Female', 'Male', 'General Admission', null]) {
      const out = normalizeGender(raw);
      expect(out === 'woman' || out === 'man' || out === null).toBe(true);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeGender('  fEmAlE  ')).toBe('woman');
  });
});

describe('attendeeGender — reading a real Eventbrite attendee', () => {
  it.each([
    ['General Admission - Male', 'man'],
    ['General Admission - Female', 'woman'],
  ])('takes the gender off the %s ticket class', (cls, want) => {
    // The listings ask no gender question, so the ticket class is the only
    // record of it. Ignoring it is what left both 2026-08-30 buyers blank.
    expect(attendeeGender({ ticket_class_name: cls })).toBe(want);
  });

  it('leaves an ungendered class alone', () => {
    expect(attendeeGender({ ticket_class_name: 'General Admission' })).toBeNull();
  });

  it('prefers an explicit profile field over the ticket class', () => {
    expect(attendeeGender({
      profile: { gender: 'Female' },
      ticket_class_name: 'General Admission - Male',
    })).toBe('woman');
  });

  it('prefers a gender question over the ticket class', () => {
    expect(attendeeGender({
      answers: [{ question: 'Your gender?', answer: 'Female' }],
      ticket_class_name: 'General Admission - Male',
    })).toBe('woman');
  });

  it('falls through a source that answers something unusable', () => {
    // The precedence bug: returning the first NON-EMPTY raw value let
    // "Prefer not to say" in the profile shadow a perfectly good ticket
    // class. Each source is normalised before it is accepted.
    expect(attendeeGender({
      profile: { gender: 'Prefer not to say' },
      ticket_class_name: 'General Admission - Male',
    })).toBe('man');
    expect(attendeeGender({
      answers: [{ question: 'Gender', answer: 'Other' }],
      ticket_class_name: 'General Admission - Female',
    })).toBe('woman');
  });

  it.each([[{}], [null], [undefined], [{ profile: {} }], [{ answers: [] }]])(
    'answers null for %s rather than throwing',
    (a) => expect(attendeeGender(a)).toBeNull(),
  );

  it('ignores a non-gender question', () => {
    expect(attendeeGender({
      answers: [{ question: 'Dietary requirements', answer: 'Female friendly' }],
      ticket_class_name: 'General Admission',
    })).toBeNull();
  });
});
