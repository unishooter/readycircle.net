import { CIRCLE_IDENTIFIER_PATTERN } from '@readycircle/contracts';

const CONSONANTS = 'BCDFGHJKMNPRSTVWXZ';
const VOWELS = 'AEIOU';
const DIGITS = '123456789'; // no 0 -- easily confused with the letter O when read aloud

/**
 * Name of the Postgres unique index enforcing Circle Identifier uniqueness.
 * Kept here (rather than only in the migration/schema) so the repository
 * and backfill retry logic can precisely detect a collision on *this*
 * constraint and never accidentally swallow an unrelated unique-violation.
 */
export const CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT = 'circles_circle_identifier_idx';

/**
 * Generates a random, human-readable Circle Identifier of the form
 * consonant-vowel-consonant-digit (e.g. "RAV7"). This is a *display-only*
 * public identifier -- see the `circleIdentifier` column comment in
 * packages/database for why it must never be used as a join key.
 *
 * `random` is injectable so tests can exercise deterministic sequences
 * (including forced collisions) without mocking global `Math.random`.
 */
export function generateCircleIdentifier(random: () => number = Math.random): string {
  const pick = (charset: string) => charset[Math.floor(random() * charset.length)]!;
  return `${pick(CONSONANTS)}${pick(VOWELS)}${pick(CONSONANTS)}${pick(DIGITS)}`;
}

export function isValidCircleIdentifier(value: string): boolean {
  return CIRCLE_IDENTIFIER_PATTERN.test(value);
}

interface PostgresErrorShape {
  code?: string;
  constraint_name?: string;
  cause?: unknown;
}

function matchesCircleIdentifierViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const pgError = error as PostgresErrorShape;
  return pgError.code === '23505' && pgError.constraint_name === CIRCLE_IDENTIFIER_UNIQUE_CONSTRAINT;
}

/**
 * Detects a Postgres unique-violation (`23505`) specifically on the Circle
 * Identifier index, so retry loops in the repository and backfill routine
 * only ever retry on an actual identifier collision -- any other error
 * (including unrelated unique violations) propagates immediately.
 *
 * Drizzle's `postgres-js` driver wraps the raw `postgres` package error
 * (which carries `code`/`constraint_name`) in its own error's `.cause`, so
 * this checks both the error itself and one level of `.cause`.
 */
export function isCircleIdentifierCollision(error: unknown): boolean {
  if (matchesCircleIdentifierViolation(error)) return true;
  if (typeof error === 'object' && error !== null) {
    return matchesCircleIdentifierViolation((error as PostgresErrorShape).cause);
  }
  return false;
}
