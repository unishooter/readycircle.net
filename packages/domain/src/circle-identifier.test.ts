import { describe, expect, it } from 'vitest';
import {
  CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT,
  generateCircleIdentifier,
  isCircleIdentifierCollision,
  isValidCircleIdentifier,
} from './circle-identifier.js';

const PATTERN = /^[BCDFGHJKMNPRSTVWXZ][AEIOU][BCDFGHJKMNPRSTVWXZ][1-9]$/;

describe('generateCircleIdentifier', () => {
  it('always matches the consonant-vowel-consonant-digit pattern', () => {
    for (let i = 0; i < 500; i++) {
      const identifier = generateCircleIdentifier();
      expect(identifier).toMatch(PATTERN);
    }
  });

  it('only uses the approved consonants, vowels, and digits', () => {
    const consonants = new Set('BCDFGHJKMNPRSTVWXZ');
    const vowels = new Set('AEIOU');
    const digits = new Set('123456789');
    for (let i = 0; i < 500; i++) {
      const identifier = generateCircleIdentifier();
      expect(consonants.has(identifier[0]!)).toBe(true);
      expect(vowels.has(identifier[1]!)).toBe(true);
      expect(consonants.has(identifier[2]!)).toBe(true);
      expect(digits.has(identifier[3]!)).toBe(true);
    }
  });

  it('never generates the digit 0', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCircleIdentifier().endsWith('0')).toBe(false);
    }
  });

  it('is always uppercase', () => {
    for (let i = 0; i < 200; i++) {
      const identifier = generateCircleIdentifier();
      expect(identifier).toBe(identifier.toUpperCase());
    }
  });

  it('is deterministic given a stubbed random source', () => {
    // Consonants: 'BCDFGHJKMNPRSTVWXZ' (18 chars) -- index 0 -> 'B', index 17 -> 'Z'.
    // Vowels: 'AEIOU' (5 chars) -- index 0 -> 'A'.
    // Digits: '123456789' (9 chars) -- index 0 -> '1'.
    const values = [0, 0, 0.99, 0];
    let call = 0;
    const stubbedRandom = () => values[call++]!;
    expect(generateCircleIdentifier(stubbedRandom)).toBe('BAZ1');
  });
});

describe('isValidCircleIdentifier', () => {
  it('accepts well-formed identifiers', () => {
    expect(isValidCircleIdentifier('RAV7')).toBe(true);
    expect(isValidCircleIdentifier('TUG8')).toBe(true);
  });

  it('rejects lowercase, wrong length, digit 0, or disallowed letters', () => {
    expect(isValidCircleIdentifier('rav7')).toBe(false);
    expect(isValidCircleIdentifier('RAV70')).toBe(false);
    expect(isValidCircleIdentifier('RAV0')).toBe(false);
    expect(isValidCircleIdentifier('RAO7')).toBe(false); // O is not a valid consonant slot
    expect(isValidCircleIdentifier('AAV7')).toBe(false); // first slot must be a consonant
  });
});

describe('isCircleIdentifierCollision', () => {
  it('returns true only for a 23505 on the Circle Identifier unique index', () => {
    expect(isCircleIdentifierCollision({ code: '23505', constraint_name: CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT })).toBe(
      true,
    );
  });

  it('returns false for a unique violation on a different constraint', () => {
    expect(isCircleIdentifierCollision({ code: '23505', constraint_name: 'circle_memberships_circle_station_idx' })).toBe(
      false,
    );
  });

  it('returns false for a non-unique-violation error', () => {
    expect(isCircleIdentifierCollision({ code: '23503', constraint_name: CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT })).toBe(
      false,
    );
  });

  it('returns false for non-object or null errors', () => {
    expect(isCircleIdentifierCollision(null)).toBe(false);
    expect(isCircleIdentifierCollision('boom')).toBe(false);
    expect(isCircleIdentifierCollision(undefined)).toBe(false);
  });

  it('detects a collision nested one level in `.cause` (Drizzle wraps the raw postgres error there)', () => {
    const wrapped = {
      message: 'Failed query',
      cause: { code: '23505', constraint_name: CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT },
    };
    expect(isCircleIdentifierCollision(wrapped)).toBe(true);
  });

  it('returns false when `.cause` is an unrelated error', () => {
    const wrapped = { message: 'Failed query', cause: { code: '23503' } };
    expect(isCircleIdentifierCollision(wrapped)).toBe(false);
  });
});
