// tests/lead-gender-resolve.test.js
//
// scripts/backfill-lead-gender.js stamps `gender` onto `leads` docs — the one
// collection every engagement email reads. One of its decisions can corrupt
// data rather than merely fail, so it lives in an exported pure function and
// is pinned here:
//
//   resolveGenderByEmail()  collapses many ticket/registration records into
//                           one gender per email. An email whose records
//                           DISAGREE is a contradiction; resolving it by
//                           arrival order would let whichever document
//                           Firestore happened to return last decide
//                           someone's segment.
//
// That contradiction is not hypothetical. The door creates a second account
// when its email lookup misses, which is how two of twenty attendees at Good
// Good ended up double-recorded — see
// reports/EVENT_DEBRIEF_GOOD_GOOD_2026-08-31.md.
//
// The blank test (hasGender) is covered in tests/gender-backfill.test.js and
// is not duplicated here; this file only covers the resolver.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveGenderByEmail } = require('../scripts/backfill-lead-gender.js');

const rec = (email, gender, source = 'registration') => ({ email, gender, source });

describe('resolveGenderByEmail — one gender per email', () => {
  it('resolves the straightforward case', () => {
    const { byEmail } = resolveGenderByEmail([
      rec('mel@example.com', 'woman'),
      rec('chase@example.com', 'man'),
    ]);
    expect(byEmail.get('mel@example.com').gender).toBe('woman');
    expect(byEmail.get('chase@example.com').gender).toBe('man');
  });

  it('normalises the email, because that is the join key', () => {
    // Lead docs store a lowercased email. Matching on the raw one would
    // silently fill nothing for anyone who typed a capital letter.
    const { byEmail } = resolveGenderByEmail([rec('  MiXeD@Example.COM ', 'woman')]);
    expect(byEmail.has('mixed@example.com')).toBe(true);
  });

  it('normalises the gender spelling through normalizeGender', () => {
    // Records reach us as "Female"/"F"/"woman" depending on which path wrote
    // them; the segment has to be one spelling.
    const { byEmail } = resolveGenderByEmail([
      rec('a@b.com', 'Female'),
      rec('c@d.com', 'Male'),
    ]);
    expect(byEmail.get('a@b.com').gender).toBe('woman');
    expect(byEmail.get('c@d.com').gender).toBe('man');
  });

  it('keeps a repeat buyer whose records agree, and remembers both sources', () => {
    const { byEmail, conflicts } = resolveGenderByEmail([
      rec('same@example.com', 'woman', 'registration'),
      rec('same@example.com', 'woman', 'ticket'),
    ]);
    expect(byEmail.get('same@example.com').gender).toBe('woman');
    expect([...byEmail.get('same@example.com').sources].sort()).toEqual(['registration', 'ticket']);
    expect(conflicts.size).toBe(0);
  });

  it('REFUSES an email whose records disagree, rather than picking one', () => {
    const { byEmail, conflicts } = resolveGenderByEmail([
      rec('dup@example.com', 'man'),
      rec('dup@example.com', 'woman'),
    ]);
    expect(byEmail.has('dup@example.com')).toBe(false);
    expect([...conflicts]).toEqual(['dup@example.com']);
  });

  it('refuses regardless of which order the contradiction arrives in', () => {
    // The failure this guards against is order-dependence itself, so both
    // orders must reach the same answer.
    const forward = resolveGenderByEmail([rec('d@e.com', 'woman'), rec('d@e.com', 'man')]);
    const reverse = resolveGenderByEmail([rec('d@e.com', 'man'), rec('d@e.com', 'woman')]);
    expect(forward.byEmail.has('d@e.com')).toBe(false);
    expect(reverse.byEmail.has('d@e.com')).toBe(false);
  });

  it('does not let a third agreeing record rescue a contradicted email', () => {
    // Two-against-one is still a contradiction. A majority vote here would be
    // exactly the guess this function exists to refuse.
    const { byEmail, conflicts } = resolveGenderByEmail([
      rec('x@y.com', 'woman'),
      rec('x@y.com', 'man'),
      rec('x@y.com', 'woman'),
    ]);
    expect(byEmail.has('x@y.com')).toBe(false);
    expect(conflicts.has('x@y.com')).toBe(true);
  });

  it('ignores records with no recognisable gender without calling it a conflict', () => {
    // "Prefer not to say" is not a disagreement with 'woman' — it is silence.
    // Treating it as a conflict would strip a real answer off the record.
    const { byEmail, conflicts } = resolveGenderByEmail([
      rec('q@r.com', 'woman'),
      rec('q@r.com', 'Prefer not to say'),
      rec('q@r.com', null),
      rec('q@r.com', ''),
    ]);
    expect(byEmail.get('q@r.com').gender).toBe('woman');
    expect(conflicts.size).toBe(0);
  });

  it('ignores records with no email to join on', () => {
    const { byEmail } = resolveGenderByEmail([
      rec('', 'woman'),
      rec(null, 'man'),
      rec('   ', 'woman'),
    ]);
    expect(byEmail.size).toBe(0);
  });

  it('handles no input at all', () => {
    for (const input of [[], null, undefined]) {
      const { byEmail, conflicts } = resolveGenderByEmail(input);
      expect(byEmail.size).toBe(0);
      expect(conflicts.size).toBe(0);
    }
  });

  it('never invents a gender for an email it never saw', () => {
    // The whole point of the blank column: a lead with no ticket history stays
    // unknown. Anything else would be inferring gender from a name.
    const { byEmail } = resolveGenderByEmail([rec('known@example.com', 'woman')]);
    expect(byEmail.has('newsletter-only@example.com')).toBe(false);
  });
});

describe('importing the backfill script', () => {
  it('needs no Firebase credentials', () => {
    // The script's runner is behind a require.main guard precisely so this
    // test can import it. If someone moves admin.initializeApp back to the
    // top level, this file stops being able to run at all.
    expect(typeof resolveGenderByEmail).toBe('function');
  });
});
