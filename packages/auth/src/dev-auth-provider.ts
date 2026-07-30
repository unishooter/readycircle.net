import { eq } from 'drizzle-orm';
import { userIdentities, users, type Database } from '@readycircle/database';
import type { DevLoginInput, DevUserSummary } from '@readycircle/contracts';

/**
 * Development-only authentication. Lets a developer pick one of the seeded
 * users or create a new one instantly, with no external identity provider
 * involved. The API layer is responsible for refusing to register this
 * provider's routes unless `config.devAuth.enabled` is true (see
 * `@readycircle/config#loadConfig`, which itself refuses to enable this in
 * production without an explicit unsafe override).
 */
export class DevAuthProvider {
  readonly name = 'dev' as const;

  constructor(private readonly db: Database) {}

  async listUsers(): Promise<DevUserSummary[]> {
    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        devPersona: users.devPersona,
      })
      .from(users)
      .innerJoin(userIdentities, eq(userIdentities.userId, users.id))
      .where(eq(userIdentities.provider, 'dev'));

    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      persona: row.devPersona,
    }));
  }

  async loginOrCreate(input: DevLoginInput): Promise<{ userId: string }> {
    if (input.userId) {
      const [existing] = await this.db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!existing) {
        throw new Error('Development user not found.');
      }
      return { userId: existing.id };
    }

    if (!input.displayName) {
      throw new Error('displayName is required to create a new development user.');
    }

    const [created] = await this.db
      .insert(users)
      .values({
        displayName: input.displayName,
        email: input.email ?? null,
        emailVerified: false,
        devPersona: 'Created via development login',
      })
      .returning();

    if (!created) throw new Error('Failed to create development user.');

    await this.db.insert(userIdentities).values({
      userId: created.id,
      provider: 'dev',
      providerSubject: created.id,
      providerEmail: created.email,
      emailVerified: false,
    });

    return { userId: created.id };
  }
}
