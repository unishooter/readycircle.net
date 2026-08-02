import { eq } from 'drizzle-orm';
import { users, type Database } from '@readycircle/database';

export interface AdminUserRow {
  id: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  createdAt: Date;
}

export async function listAllUsers(db: Database): Promise<AdminUserRow[]> {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email, isAdmin: users.isAdmin, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  return rows;
}

export async function getAdminUserRow(db: Database, userId: string): Promise<AdminUserRow | null> {
  const [row] = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email, isAdmin: users.isAdmin, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Count of admins other than `excludeUserId` -- pass the count *before* the change, excluding the account being changed. */
export async function countOtherAdmins(db: Database, excludeUserId: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true));
  return rows.filter((row) => row.id !== excludeUserId).length;
}

export async function setUserIsAdmin(db: Database, userId: string, isAdmin: boolean): Promise<void> {
  await db.update(users).set({ isAdmin, updatedAt: new Date() }).where(eq(users.id, userId));
}
