import { describe, expect, it } from 'vitest';
import { buildAprsIsFilter } from './filter.js';

describe('buildAprsIsFilter', () => {
  it('returns null when there are no callsigns', () => {
    expect(buildAprsIsFilter([])).toBeNull();
  });

  it('returns null when every callsign is blank', () => {
    expect(buildAprsIsFilter(['', '   '])).toBeNull();
  });

  it('builds a single-callsign budlist filter', () => {
    expect(buildAprsIsFilter(['ki5abc-9'])).toBe('filter b/KI5ABC-9');
  });

  it('builds a multi-callsign budlist filter, uppercased and trimmed', () => {
    expect(buildAprsIsFilter([' KI5ABC-9 ', 'n0call'])).toBe('filter b/KI5ABC-9/N0CALL');
  });

  it('deduplicates callsigns that only differ by case/whitespace', () => {
    expect(buildAprsIsFilter(['KI5ABC-9', 'ki5abc-9', ' KI5ABC-9'])).toBe('filter b/KI5ABC-9');
  });
});
