import { eq } from 'drizzle-orm';
import { userIdentities, users, type Database } from '@readycircle/database';
import type { CurrentUser } from '@readycircle/contracts';

export async function getCurrentUserById(db: Database, userId: string): Promise<CurrentUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;

  const [identity] = await db
    .select({ provider: userIdentities.provider })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
    .limit(1);

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerified,
    authProvider: (identity?.provider as CurrentUser['authProvider']) ?? 'dev',
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateUserDisplayName(db: Database, userId: string, displayName: string): Promise<void> {
  await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId));
}
