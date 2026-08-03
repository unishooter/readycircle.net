import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillCircleIdentifiers, finalizeCircleIdentifierNotNull } from './backfill-circle-identifiers.js';
import { createDatabase, type Database, type DatabaseHandle } from './client.js';
import { circles } from './schema/index.js';

const CIRCLE_IDENTIFIER_PATTERN = /^[BCDFGHJKMNPRSTVWXZ][AEIOU][BCDFGHJKMNPRSTVWXZ][1-9]$/;

/** Bypasses the TS-level `.notNull()` on `circleIdentifier` to simulate a pre-migration row. */
async function insertCircleWithoutIdentifier(db: Database): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    insert into circles (id, circle_type, name, area_label)
    values (${id}, 'neighborhood', 'Backfill Test Circle', 'Test Area')
  `);
  return id;
}

describe('backfillCircleIdentifiers', () => {
  let handle: DatabaseHandle;
  const circleIds: string[] = [];

  beforeAll(async () => {
    handle = createDatabase(
      process.env.DATABASE_URL ?? 'postgres://readycircle:readycircle_dev_password@localhost:5432/readycircle',
    );
    // A fully-migrated DB already has `circle_identifier SET NOT NULL` (the
    // migration's own finalize step). Relax it back to nullable here so this
    // test can recreate the pre-finalize state it's actually exercising --
    // `finalizeCircleIdentifierNotNull` below re-applies it for real,
    // leaving the DB exactly as a real migration run would.
    await handle.db.execute(sql`ALTER TABLE circles ALTER COLUMN circle_identifier DROP NOT NULL`);
  });

  afterAll(async () => {
    for (const id of circleIds) {
      await handle.db.delete(circles).where(eq(circles.id, id));
    }
    await handle.close();
  });

  it('assigns a valid, unique identifier to a circle that lacks one', async () => {
    const id = await insertCircleWithoutIdentifier(handle.db);
    circleIds.push(id);

    const result = await backfillCircleIdentifiers(handle.db);
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const [row] = await handle.db.select().from(circles).where(eq(circles.id, id));
    expect(row?.circleIdentifier).toMatch(CIRCLE_IDENTIFIER_PATTERN);
  });

  it('is a no-op on a second run once every row already has an identifier', async () => {
    const result = await backfillCircleIdentifiers(handle.db);
    expect(result.updated).toBe(0);
  });

  it('finalizes NOT NULL once no circle is missing an identifier, and is idempotent', async () => {
    await expect(finalizeCircleIdentifierNotNull(handle.db)).resolves.toBeUndefined();
    // Re-running against an already-NOT-NULL column is a Postgres no-op.
    await expect(finalizeCircleIdentifierNotNull(handle.db)).resolves.toBeUndefined();
  });
});
