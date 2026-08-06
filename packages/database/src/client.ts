import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  createRdsPasswordCache,
  parsePostgresEndpoint,
  type RdsConnectionConfig,
  type RdsPasswordCache,
} from '@readycircle/aws';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  db: Database;
  client: postgres.Sql;
  close: () => Promise<void>;
  /**
   * Clears the Secrets Manager password cache (SM mode only). Call after a
   * password-authentication failure so the next connection fetches a fresh
   * secret. No-op / undefined in static DATABASE_URL mode.
   */
  invalidateCredentials?: () => void;
}

/** Postgres SQLSTATE for invalid_password / password authentication failed. */
const PASSWORD_AUTH_FAILURE_CODE = '28P01';

export function isPasswordAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === PASSWORD_AUTH_FAILURE_CODE) return true;
  if (typeof candidate.message !== 'string') return false;
  return candidate.message.toLowerCase().includes('password authentication failed');
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const client = postgres(connectionString, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

export interface ManagedDatabaseOptions {
  /** Static URL mode (local/dev). Mutually exclusive with secretArn in practice. */
  connectionString?: string | null;
  /** Secrets Manager ARN for the RDS-managed credential JSON. */
  secretArn?: string | null;
  /** AWS region for the Secrets Manager client. Required when secretArn is set. */
  region?: string;
  /** Injectable cache for tests. */
  passwordCache?: RdsPasswordCache;
  /** Pool size. Defaults to 10 (1 for migrations when overridden). */
  max?: number;
  /** Connection max lifetime in seconds so idle sockets recycle after rotation. */
  maxLifetimeSeconds?: number;
}

/**
 * Creates a database handle from either a static `DATABASE_URL` or an
 * RDS-managed Secrets Manager secret. SM mode uses an async password
 * callback, TLS (`ssl: 'require'`), and a short-lived password cache with
 * `invalidateCredentials` so callers can recover after RDS rotation.
 *
 * Note: we intentionally do not Proxy-wrap the postgres.js client. Drizzle
 * relies on chainable helpers like `client.unsafe(...).values()`; wrapping
 * thenables strips those methods and breaks SELECTs.
 */
export async function createManagedDatabase(options: ManagedDatabaseOptions): Promise<DatabaseHandle> {
  const secretArn = options.secretArn?.trim() || null;
  const connectionString = options.connectionString?.trim() || null;

  if (secretArn) {
    if (!options.region && !options.passwordCache) {
      throw new Error('createManagedDatabase: region is required when secretArn is set.');
    }
    const endpointFallback = connectionString ? parsePostgresEndpoint(connectionString) : null;
    const cache =
      options.passwordCache ??
      createRdsPasswordCache({
        secretArn,
        region: options.region as string,
        endpointFallback,
      });
    const initial = await cache.getConnectionConfig();
    return createSecretsManagerDatabase(initial, cache, {
      max: options.max ?? 10,
      maxLifetimeSeconds: options.maxLifetimeSeconds ?? 20 * 60,
    });
  }

  if (!connectionString) {
    throw new Error(
      'createManagedDatabase: set connectionString or secretArn (DATABASE_URL or DATABASE_SECRET_ARN).',
    );
  }

  const client = postgres(connectionString, { max: options.max ?? 10 });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

function createSecretsManagerDatabase(
  initial: RdsConnectionConfig,
  cache: RdsPasswordCache,
  pool: { max: number; maxLifetimeSeconds: number },
): DatabaseHandle {
  const client = postgres({
    host: initial.host,
    port: initial.port,
    database: initial.database,
    username: initial.username,
    password: () => cache.getPassword(),
    max: pool.max,
    // Recycle connections periodically so rotated credentials are picked up
    // without waiting for an auth failure on a long-lived socket.
    max_lifetime: pool.maxLifetimeSeconds,
    ssl: 'require',
  });
  const db = drizzle(client, { schema });

  return {
    db,
    client,
    close: () => client.end({ timeout: 5 }),
    invalidateCredentials: () => cache.invalidate(),
  };
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
