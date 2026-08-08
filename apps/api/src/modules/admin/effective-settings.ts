import { eq } from 'drizzle-orm';
import type { AppConfig } from '@readycircle/config';
import { aprsIsConfigSchema, type AprsIsConfig } from '@readycircle/contracts';
import { platformSettings, type Database } from '@readycircle/database';
import { resolveBooleanSetting } from '@readycircle/domain';

export const INVITE_ONLY_ACCESS_SETTING_KEY = 'invite_only_access';
/** Full APRS-IS admin config blob. */
export const APRS_IS_SETTING_KEY = 'aprs_is';
/** Legacy boolean-only key; still read when `aprs_is` is absent. */
export const APRS_ENABLED_SETTING_KEY = 'aprs_enabled';

async function getBooleanOverride(db: Database, key: string): Promise<boolean | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  if (!row) return null;
  return typeof row.value === 'boolean' ? row.value : null;
}

async function setBooleanOverride(
  db: Database,
  key: string,
  override: boolean | null,
  updatedBy: string,
): Promise<void> {
  if (override === null) {
    await db.delete(platformSettings).where(eq(platformSettings.key, key));
    return;
  }
  await db
    .insert(platformSettings)
    .values({ key, value: override, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: override, updatedAt: new Date(), updatedBy },
    });
}

/**
 * Reads the raw admin override for invite-only access, or `null` if no
 * override row exists (i.e. "follow the environment default").
 */
export async function getInviteOnlyAccessOverride(db: Database): Promise<boolean | null> {
  return getBooleanOverride(db, INVITE_ONLY_ACCESS_SETTING_KEY);
}

/** The effective invite-only-access value: admin override if set, else the env default. */
export async function getInviteOnlyAccess(db: Database, config: AppConfig): Promise<boolean> {
  const override = await getInviteOnlyAccessOverride(db);
  return resolveBooleanSetting(config.inviteOnlyAccess, override);
}

export async function setInviteOnlyAccessOverride(
  db: Database,
  override: boolean | null,
  updatedBy: string,
): Promise<void> {
  await setBooleanOverride(db, INVITE_ONLY_ACCESS_SETTING_KEY, override, updatedBy);
}

/** Env-derived APRS-IS defaults used when no admin override is stored. */
export function envAprsIsConfig(config: AppConfig): AprsIsConfig {
  return {
    enabled: config.aprsEnabled,
    host: config.aprs.host,
    port: config.aprs.port,
    callsign: config.aprs.callsign,
    passcode: config.aprs.passcode,
  };
}

function parseAprsIsConfig(value: unknown): AprsIsConfig | null {
  const parsed = aprsIsConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Raw admin APRS override, or `null` to follow env defaults.
 * Migrates a legacy `aprs_enabled` boolean row into a synthesized blob when
 * the new `aprs_is` key is absent.
 */
export async function getAprsIsConfigOverride(db: Database, config: AppConfig): Promise<AprsIsConfig | null> {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, APRS_IS_SETTING_KEY))
    .limit(1);
  if (row) {
    return parseAprsIsConfig(row.value);
  }

  const legacyEnabled = await getBooleanOverride(db, APRS_ENABLED_SETTING_KEY);
  if (legacyEnabled === null) return null;
  return { ...envAprsIsConfig(config), enabled: legacyEnabled };
}

/** Effective APRS-IS config: admin override if set, else env defaults. */
export async function getAprsIsConfig(db: Database, config: AppConfig): Promise<AprsIsConfig> {
  const override = await getAprsIsConfigOverride(db, config);
  return override ?? envAprsIsConfig(config);
}

/**
 * Feature gate for the Circle live map / positions API: enabled and a
 * non-empty login callsign (same practical gate as the worker connecting).
 */
export async function getAprsEnabled(db: Database, config: AppConfig): Promise<boolean> {
  const effective = await getAprsIsConfig(db, config);
  return effective.enabled && effective.callsign.trim().length > 0;
}

export async function setAprsIsConfigOverride(
  db: Database,
  override: AprsIsConfig | null,
  updatedBy: string,
): Promise<void> {
  // Clear legacy boolean key whenever the new blob is written or cleared.
  await db.delete(platformSettings).where(eq(platformSettings.key, APRS_ENABLED_SETTING_KEY));

  if (override === null) {
    await db.delete(platformSettings).where(eq(platformSettings.key, APRS_IS_SETTING_KEY));
    return;
  }

  await db
    .insert(platformSettings)
    .values({ key: APRS_IS_SETTING_KEY, value: override, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: override, updatedAt: new Date(), updatedBy },
    });
}
