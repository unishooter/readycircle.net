import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, users, type Database } from '@readycircle/database';
import { findOrCreateUserByProviderIdentity } from './identity-mapping.js';

/**
 * Exercises real Postgres, per this project's integration-test convention
 * (see `apps/api/src/test/helpers.ts`) -- run `pnpm db:migrate` first.
 */
describe('findOrCreateUserByProviderIdentity', () => {
  let db: Database;
  let close: () => Promise<void>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    const connectionString =
      process.env.DATABASE_URL ?? 'postgres://readycircle:readycircle_dev_password@localhost:5432/readycircle';
    ({ db, close } = createDatabase(connectionString));
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await close();
  });

  it('creates a new user on first sign-in', async () => {
    const providerSubject = randomUUID();
    const { userId, isNewUser } = await findOrCreateUserByProviderIdentity(db, {
      provider: 'google',
      providerSubject,
      providerEmail: `${providerSubject}@example.com`,
      emailVerified: true,
      displayName: 'New Google User',
    });
    createdUserIds.push(userId);
    expect(isNewUser).toBe(true);
  });

  it('returns the same user for a repeat sign-in with the same provider identity', async () => {
    const providerSubject = randomUUID();
    const first = await findOrCreateUserByProviderIdentity(db, {
      provider: 'google',
      providerSubject,
      providerEmail: `${providerSubject}@example.com`,
      emailVerified: true,
      displayName: 'Repeat Sign-in User',
    });
    createdUserIds.push(first.userId);

    const second = await findOrCreateUserByProviderIdentity(db, {
      provider: 'google',
      providerSubject,
      providerEmail: `${providerSubject}@example.com`,
      emailVerified: true,
      displayName: 'Repeat Sign-in User',
    });

    expect(second.userId).toBe(first.userId);
    expect(second.isNewUser).toBe(false);
  });

  it('links a new provider identity to an existing user by verified email', async () => {
    const sharedEmail = `${randomUUID()}@example.com`;

    const viaGoogle = await findOrCreateUserByProviderIdentity(db, {
      provider: 'google',
      providerSubject: randomUUID(),
      providerEmail: sharedEmail,
      emailVerified: true,
      displayName: 'Shared Email User',
    });
    createdUserIds.push(viaGoogle.userId);
    expect(viaGoogle.isNewUser).toBe(true);

    const viaEmailPassword = await findOrCreateUserByProviderIdentity(db, {
      provider: 'email_password',
      providerSubject: randomUUID(),
      providerEmail: sharedEmail,
      emailVerified: true,
      displayName: 'Shared Email User',
    });

    expect(viaEmailPassword.userId).toBe(viaGoogle.userId);
    expect(viaEmailPassword.isNewUser).toBe(false);
  });

  it('does not link by an unverified email, to avoid account takeover via a spoofed address', async () => {
    const sharedEmail = `${randomUUID()}@example.com`;

    const first = await findOrCreateUserByProviderIdentity(db, {
      provider: 'google',
      providerSubject: randomUUID(),
      providerEmail: sharedEmail,
      emailVerified: true,
      displayName: 'Verified Owner',
    });
    createdUserIds.push(first.userId);

    // A different identity claiming the same address, but unverified, must
    // not attach to the existing account. Since `users.email` is unique
    // and only ever holds verified addresses, this creates a distinct user
    // with no email recorded rather than colliding with the existing one.
    const second = await findOrCreateUserByProviderIdentity(db, {
      provider: 'email_password',
      providerSubject: randomUUID(),
      providerEmail: sharedEmail,
      emailVerified: false,
      displayName: 'Unverified Claimant',
    });
    createdUserIds.push(second.userId);

    expect(second.userId).not.toBe(first.userId);
    expect(second.isNewUser).toBe(true);

    const [secondUserRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, second.userId));
    expect(secondUserRow?.email).toBeNull();
  });
});
