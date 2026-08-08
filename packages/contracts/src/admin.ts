import { z } from 'zod';
import { uuidSchema } from './common.js';

export const adminUserSummarySchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string().email().nullable(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const setUserAdminSchema = z.object({
  isAdmin: z.boolean(),
});
export type SetUserAdminInput = z.infer<typeof setUserAdminSchema>;

const booleanPlatformSettingSchema = z.object({
  envDefault: z.boolean(),
  override: z.boolean().nullable(),
  effective: z.boolean(),
});

/** APRS-IS connection + feature gate stored as one admin-editable blob. */
export const aprsIsConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  /**
   * Worker login identity to APRS-IS. Empty string means "do not connect"
   * even when enabled. Same callsign shape as station MYCALL when set.
   */
  callsign: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[A-Z0-9]{3,7}(-[0-9]{1,2})?$/i.test(value),
      'Enter a valid callsign, e.g. KI5ABC or KI5ABC-9',
    )
    .transform((value) => (value === '' ? '' : value.toUpperCase())),
  passcode: z.string().trim().min(1).max(32),
});
export type AprsIsConfig = z.infer<typeof aprsIsConfigSchema>;

const aprsPlatformSettingSchema = z.object({
  envDefault: aprsIsConfigSchema,
  override: aprsIsConfigSchema.nullable(),
  effective: aprsIsConfigSchema,
});

export const platformSettingsResponseSchema = z.object({
  inviteOnlyAccess: booleanPlatformSettingSchema,
  aprs: aprsPlatformSettingSchema,
});
export type PlatformSettingsResponse = z.infer<typeof platformSettingsResponseSchema>;

export const updatePlatformSettingsSchema = z
  .object({
    /** `null` clears the override and falls back to the env default. */
    inviteOnlyAccess: z.boolean().nullable().optional(),
    /** Full APRS-IS config blob, or `null` to clear override / reset to env defaults. */
    aprs: aprsIsConfigSchema.nullable().optional(),
  })
  .refine((value) => value.inviteOnlyAccess !== undefined || value.aprs !== undefined, {
    message: 'Provide at least one setting to update.',
  });
export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
