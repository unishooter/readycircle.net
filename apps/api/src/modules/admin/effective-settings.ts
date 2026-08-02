import { eq } from 'drizzle-orm';
import type { AppConfig } from '@readycircle/config';
import { platformSettings, type Database } from '@readycircle/database';
import { resolveInviteOnlyAccess } from '@readycircle/domain';

export const INVITE_ONLY_ACCESS_SETTING_KEY = 'invite_only_access';

/**
 * Reads the raw admin override for invite-only access, or `null` if no
 * override row exists (i.e. "follow the environment default").
 */
export async function getInviteOnlyAccessOverride(db: Database): Promise<boolean | null> {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, INVITE_ONLY_ACCESS_SETTING_KEY))
    .limit(1);
  if (!row) return null;
  return typeof row.value === 'boolean' ? row.value : null;
}

/** The effective invite-only-access value: admin override if set, else the env default. */
export async function getInviteOnlyAccess(db: Database, config: AppConfig): Promise<boolean> {
  const override = await getInviteOnlyAccessOverride(db);
  return resolveInviteOnlyAccess(config.inviteOnlyAccess, override);
}

export async function setInviteOnlyAccessOverride(
  db: Database,
  override: boolean | null,
  updatedBy: string,
): Promise<void> {
  if (override === null) {
    await db.delete(platformSettings).where(eq(platformSettings.key, INVITE_ONLY_ACCESS_SETTING_KEY));
    return;
  }
  await db
    .insert(platformSettings)
    .values({ key: INVITE_ONLY_ACCESS_SETTING_KEY, value: override, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: override, updatedAt: new Date(), updatedBy },
    });
}
