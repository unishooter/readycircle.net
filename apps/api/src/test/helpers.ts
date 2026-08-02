import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@readycircle/config';
import { circles, createDatabase, users, type Database } from '@readycircle/database';
import { buildServer, type BuildServerOptions } from '../server.js';

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  close: () => Promise<void>;
}

export type TestServerOverrides = Pick<BuildServerOptions, 'planJobDispatcher' | 'planDocumentStore'>;

/**
 * Builds a real Fastify app wired to the Postgres database pointed to by
 * `DATABASE_URL` (defaulting to the local docker-compose instance).
 * Integration tests exercise the actual database rather than mocks, per
 * the project's testing requirements; run `pnpm db:migrate` first.
 */
export async function createTestContext(
  envOverrides: Record<string, string> = {},
  serverOverrides: TestServerOverrides = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ENV: 'test',
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgres://readycircle:readycircle_dev_password@localhost:5432/readycircle',
    SESSION_SECRET: 'test-session-secret-not-for-production-use',
    LOG_LEVEL: 'silent',
    DEV_AUTH_ENABLED: 'true',
    ...envOverrides,
  });
  const { db, close } = createDatabase(config.databaseUrl);
  const app = buildServer({ config, db, ...serverOverrides });
  await app.ready();

  return {
    app,
    db,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

export interface TestUser {
  userId: string;
  /** Raw session token value, suitable for `inject({ cookies: { rc_session: sessionToken } })`. */
  sessionToken: string;
}

export async function loginAsNewDevUser(app: FastifyInstance, displayName: string): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/dev-auth/login',
    payload: { displayName },
  });
  if (response.statusCode !== 200) {
    throw new Error(`dev login failed: ${response.statusCode} ${response.body}`);
  }
  const sessionCookie = response.cookies.find((cookie) => cookie.name === 'rc_session');
  if (!sessionCookie) throw new Error('dev login did not return a session cookie');
  const body = response.json<{ user: { id: string } }>();
  return { userId: body.user.id, sessionToken: sessionCookie.value };
}

/** Cascade-deletes a user and everything owned by it, keeping tests self-cleaning. */
export async function deleteTestUser(db: Database, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Cascade-deletes a Circle, including its memberships and invites (via
 * `onDelete: 'cascade'` on `circle_id`). Call this before `deleteTestUser`
 * for any user who created or was invited through this Circle -- otherwise
 * `circle_invitations.invited_by` (intentionally `NOT NULL`, no cascade) can
 * block the user delete.
 */
export async function deleteTestCircle(db: Database, circleId: string): Promise<void> {
  await db.delete(circles).where(eq(circles.id, circleId));
}
