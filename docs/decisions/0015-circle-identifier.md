# 15. Circle Identifier: a display-only public identifier, never a key

## Status

Accepted

## Context

Every Circle already has a UUID primary key, but UUIDs are unusable for the
things people actually do out loud on the radio: reading a Circle's ID over
the air, writing it on a printed roster, or telling a new member "search for
Circle RAV7." The product needed a short, human-readable, unique identifier
per Circle, purely for display and verbal/printed communication -- with a
hard requirement that it never become a second way to reference a Circle
internally (no joins, no foreign keys, no route params), so the existing
primary-key-based data model stays the single source of truth.

## Decision

- **Format: consonant-vowel-consonant-digit (`CVC#`), e.g. `RAV7`.** Consonants
  are drawn from `BCDFGHJKMNPRSTVWXZ`, vowels from `AEIOU`, and the digit from
  `1-9` (`0` is excluded -- easily confused with the letter `O` when read
  aloud or handwritten). This keeps the identifier short (4 characters),
  pronounceable, and free of visually ambiguous characters.
  `CIRCLE_IDENTIFIER_PATTERN` / `circleIdentifierSchema` live in
  `packages/contracts/src/circle.ts` as the single source of truth for the
  regex, shared by the generator's self-check and by Fastify's response
  validation.
- **Generated centrally, server-side only, at creation time.**
  `generateCircleIdentifier` (`packages/domain/src/circle-identifier.ts`) is a
  pure function (injectable `random` source for deterministic tests) called
  exactly once, inside `createCircleRecord`'s transaction
  (`apps/api/src/modules/circles/repository.ts`) -- the single production
  path that creates a circle. Clients never generate or choose it; `zod`'s
  default "strip unknown keys" behavior means a client-supplied
  `circleIdentifier` in a create or update payload is silently dropped before
  it reaches the service layer, which is what makes it read-only with no
  extra validation code.
- **Uniqueness is a real Postgres unique index, with bounded retry on
  collision.** `circles_circle_identifier_idx` (migration
  `0012_circle_identifier.sql`) is the actual guarantee; the generator itself
  has no uniqueness awareness. `isCircleIdentifierCollision`
  (`packages/domain/src/circle-identifier.ts`) recognizes a Postgres `23505`
  violation specifically on that index (checking both the thrown error and
  the `.cause` Drizzle's `postgres-js` driver wraps it in), and
  `createCircleRecord` retries the *entire* transaction -- generate a fresh
  identifier, try again -- up to 10 times before surfacing a `409 Conflict`.
  Retrying the whole transaction (not just the insert) is required because a
  failed statement poisons the current Postgres transaction; there's no safe
  way to catch-and-continue mid-transaction.
- **Staged migration + procedural backfill for existing circles.** Because
  assigning a unique *random* value to every existing row can't be expressed
  as one deterministic `UPDATE` (unlike this codebase's usual staged-migration
  pattern, e.g. `0008`'s `is_admin` backfill), the SQL migration only adds the
  nullable column and the unique index (safe together, since Postgres unique
  indexes permit multiple `NULL`s). The actual backfill and the final
  `SET NOT NULL` run procedurally in `packages/database/src/migrate.ts` via
  `backfillCircleIdentifiers` / `finalizeCircleIdentifierNotNull`
  (`packages/database/src/backfill-circle-identifiers.ts`), reusing the same
  generate-check-retry logic as new-circle creation. Both steps are
  idempotent and safe to rerun, and `finalizeCircleIdentifierNotNull` refuses
  to proceed (throws, rather than silently skipping) if any row is still
  missing an identifier.
- **Never a lookup key.** Route params, joins, and foreign keys continue to
  use the existing UUID `id` exclusively. `circleIdentifier` is exposed
  alongside `id` in `circleResponseSchema` purely for display -- there is no
  "look up a Circle by its identifier" endpoint.
- **Displayed via one shared component, not duplicated markup.**
  `CircleIdentifierBadge` (`apps/web/src/features/circles/`) renders a full
  variant (label + monospace value + copy-to-clipboard button, mirroring
  `InviteCard`'s existing clipboard pattern) on `CircleDetailPage` and
  `CircleEditPage`, and a compact `Circle ID: RAV7` variant on
  `CirclesListPage` and `DashboardPage`'s list rows.

## Consequences

- Every circle, old and new, always has exactly one valid, unique, immutable
  Circle Identifier -- there's no code path that leaves one null or lets a
  user pick/edit it, which is what keeps it safe from ever being mistaken for
  or misused as a key.
- The generator/collision/backfill logic is new infrastructure for this
  codebase (no prior feature needed retry-on-random-collision), but it's
  small, pure, and fully unit-testable with an injectable random source --
  collision and exhausted-retry paths are covered deterministically by
  mocking `generateCircleIdentifier` rather than fighting real Postgres
  collisions in tests.
- The keyspace (18 x 5 x 18 x 9 = 14,580 combinations) is small enough that
  collisions become likely well before the app would ever have that many
  circles; the bounded retry (10 attempts) and `409` fallback are a
  deliberate, visible failure mode rather than an infinite loop or a silent
  duplicate.
