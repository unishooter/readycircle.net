import { eq } from 'drizzle-orm';
import { userIdentities, users, type Database } from '@readycircle/database';
import type { CurrentUser, UpdateCurrentUserInput } from '@readycircle/contracts';

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
    contactEmail: row.contactEmail,
    emailVisibleToCircle: row.emailVisibleToCircle,
    phone: row.phone,
    phoneVisibleToCircle: row.phoneVisibleToCircle,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    addressVisibleToCircle: row.addressVisibleToCircle,
    isAdmin: row.isAdmin,
    authProvider: (identity?.provider as CurrentUser['authProvider']) ?? 'dev',
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateUserProfile(db: Database, userId: string, input: UpdateCurrentUserInput): Promise<void> {
  const fields: Partial<typeof users.$inferInsert> = {};
  if (input.displayName !== undefined) fields.displayName = input.displayName;
  if (input.contactEmail !== undefined) fields.contactEmail = input.contactEmail;
  if (input.phone !== undefined) fields.phone = input.phone;
  if (input.address !== undefined) fields.address = input.address;
  if (input.city !== undefined) fields.city = input.city;
  if (input.state !== undefined) fields.state = input.state;
  if (input.zip !== undefined) fields.zip = input.zip;
  if (input.emailVisibleToCircle !== undefined) fields.emailVisibleToCircle = input.emailVisibleToCircle;
  if (input.phoneVisibleToCircle !== undefined) fields.phoneVisibleToCircle = input.phoneVisibleToCircle;
  if (input.addressVisibleToCircle !== undefined) fields.addressVisibleToCircle = input.addressVisibleToCircle;

  if (Object.keys(fields).length === 0) return;
  await db.update(users).set({ ...fields, updatedAt: new Date() }).where(eq(users.id, userId));
}
