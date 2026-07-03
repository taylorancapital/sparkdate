import { describe, it, expect } from 'vitest';
import { resolveLeadName, firstWord } from '../lib/lead-name.js';

describe('firstWord', () => {
  it('returns the first whitespace-delimited word', () => {
    expect(firstWord('Fatima Ahmed')).toBe('Fatima');
    expect(firstWord('  Jo  ')).toBe('Jo');
  });
  it('collapses to empty for blank/nullish input', () => {
    expect(firstWord('')).toBe('');
    expect(firstWord('   ')).toBe('');
    expect(firstWord(null)).toBe('');
    expect(firstWord(undefined)).toBe('');
  });
});

describe('resolveLeadName', () => {
  const map = new Map([['fatima@example.com', 'Fatima Ahmed']]);

  it('prefers the lead\'s own name (first word)', () => {
    expect(resolveLeadName({ name: 'Dana Lee', email: 'fatima@example.com' }, map, 'there')).toBe('Dana');
  });
  it('prefers firstName over name when present', () => {
    expect(resolveLeadName({ firstName: 'Dana', name: 'Ignore Me' }, map, 'there')).toBe('Dana');
  });
  it('falls back to the event_registrations name when the lead has none', () => {
    expect(resolveLeadName({ email: 'Fatima@Example.com' }, map, 'there')).toBe('Fatima');
  });
  it('matches the reg name case-insensitively on email', () => {
    expect(resolveLeadName({ name: '', email: 'FATIMA@EXAMPLE.COM' }, map, 'there')).toBe('Fatima');
  });
  it('uses the supplied fallback when no name is known anywhere', () => {
    expect(resolveLeadName({ email: 'unknown@example.com' }, map, 'there')).toBe('there');
    expect(resolveLeadName({ email: 'unknown@example.com' }, map, 'There')).toBe('There');
  });
  it('is safe when nameByEmail is missing or not a Map', () => {
    expect(resolveLeadName({ email: 'fatima@example.com' }, null, 'there')).toBe('there');
    expect(resolveLeadName({ email: 'fatima@example.com' }, undefined, 'there')).toBe('there');
  });
  it('treats a whitespace-only lead name as empty and falls through', () => {
    expect(resolveLeadName({ name: '   ', email: 'fatima@example.com' }, map, 'there')).toBe('Fatima');
  });
  it('handles a null/empty lead object', () => {
    expect(resolveLeadName(null, map, 'there')).toBe('there');
    expect(resolveLeadName({}, map, 'there')).toBe('there');
  });
});
