import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  db: Database;
  client: postgres.Sql;
  close: () => Promise<void>;
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const client = postgres(connectionString, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

/**
 * Lightweight liveness check used by `/health/ready`. Deliberately avoids
 * touching application tables so readiness never depends on migrations
 * having been run against a schema version the health check itself
 * understands.
 */
export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
