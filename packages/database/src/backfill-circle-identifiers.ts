import { and, eq, isNull, sql } from 'drizzle-orm';
import { generateCircleIdentifier, isCircleIdentifierCollision } from '@readycircle/domain';
import type { Database } from './client.js';
import { circles } from './schema/index.js';

const MAX_ATTEMPTS_PER_ROW = 10;

export interface BackfillResult {
  updated: number;
}

/**
 * Assigns a unique Circle Identifier to every circle that doesn't have one
 * yet. Safe to re-run: rows that already have an identifier are left
 * untouched, and a second run over an already-backfilled table reports
 * `updated: 0`. Runs after migration 0012 has added the nullable column +
 * unique index, since assigning a unique random value per row needs the
 * same generate-check-retry logic used for new circles (not a single
 * deterministic SQL statement).
 */
export async function backfillCircleIdentifiers(db: Database): Promise<BackfillResult> {
  const rows = await db.select({ id: circles.id }).from(circles).where(isNull(circles.circleIdentifier));

  let updated = 0;
  for (const row of rows) {
    let assigned = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ROW; attempt++) {
      try {
        await db
          .update(circles)
          .set({ circleIdentifier: generateCircleIdentifier() })
          .where(and(eq(circles.id, row.id), isNull(circles.circleIdentifier)));
        assigned = true;
        updated += 1;
        break;
      } catch (error) {
        if (isCircleIdentifierCollision(error) && attempt < MAX_ATTEMPTS_PER_ROW) continue;
        // Fail visibly rather than silently skipping a record -- a stuck
        // backfill should stop the migration, not leave a null behind.
        throw error;
      }
    }
    if (!assigned) {
      throw new Error(`Failed to assign a Circle Identifier to circle ${row.id} after ${MAX_ATTEMPTS_PER_ROW} attempts.`);
    }
  }

  return { updated };
}

/**
 * Locks in `NOT NULL` on `circle_identifier` once every row has one.
 * Throws (rather than skipping) if any row is still missing an identifier,
 * so a broken backfill can never be silently finalized. Idempotent: running
 * this against an already-`NOT NULL` column is a Postgres no-op.
 */
export async function finalizeCircleIdentifierNotNull(db: Database): Promise<void> {
  const [row] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM circles WHERE circle_identifier IS NULL`,
  );
  const remaining = Number(row?.count ?? 0);
  if (remaining > 0) {
    throw new Error(`Cannot finalize circle_identifier NOT NULL: ${remaining} circle(s) still lack one.`);
  }
  await db.execute(sql`ALTER TABLE circles ALTER COLUMN circle_identifier SET NOT NULL`);
}
