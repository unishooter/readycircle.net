import { inArray } from 'drizzle-orm';
import type { AppConfig } from '@readycircle/config';
import { aprsIsConfigSchema, type AprsIsConfig } from '@readycircle/contracts';
import { platformSettings, type Database } from '@readycircle/database';

/** Must match `APRS_IS_SETTING_KEY` in apps/api admin effective-settings. */
const APRS_IS_SETTING_KEY = 'aprs_is';
/** Legacy boolean-only key; still read when `aprs_is` is absent. */
const APRS_ENABLED_SETTING_KEY = 'aprs_enabled';

export function envAprsIsConfig(config: AppConfig): AprsIsConfig {
  return {
    enabled: config.aprsEnabled,
    host: config.aprs.host,
    port: config.aprs.port,
    callsign: config.aprs.callsign,
    passcode: config.aprs.passcode,
  };
}

/**
 * Effective APRS-IS config from platform_settings (admin override) or env
 * defaults. Mirrors apps/api admin effective-settings resolution, including
 * legacy `aprs_enabled` boolean rows.
 */
export async function loadEffectiveAprsIsConfig(db: Database, config: AppConfig): Promise<AprsIsConfig> {
  const rows = await db
    .select()
    .from(platformSettings)
    .where(inArray(platformSettings.key, [APRS_IS_SETTING_KEY, APRS_ENABLED_SETTING_KEY]));

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const blob = byKey.get(APRS_IS_SETTING_KEY);
  if (blob !== undefined) {
    const parsed = aprsIsConfigSchema.safeParse(blob);
    if (parsed.success) return parsed.data;
  }

  const envDefault = envAprsIsConfig(config);
  const legacy = byKey.get(APRS_ENABLED_SETTING_KEY);
  if (typeof legacy === 'boolean') {
    return { ...envDefault, enabled: legacy };
  }
  return envDefault;
}

/** Connection is active when enabled and a login callsign is configured. */
export function isAprsConnectionActive(config: AprsIsConfig): boolean {
  return config.enabled && config.callsign.trim().length > 0;
}

export function aprsConnectionIdentity(config: AprsIsConfig): string {
  return `${config.host}|${config.port}|${config.callsign}|${config.passcode}|${config.enabled}`;
}
