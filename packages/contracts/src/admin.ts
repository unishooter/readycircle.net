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

const inviteOnlyAccessSettingSchema = z.object({
  envDefault: z.boolean(),
  override: z.boolean().nullable(),
  effective: z.boolean(),
});

export const platformSettingsResponseSchema = z.object({
  inviteOnlyAccess: inviteOnlyAccessSettingSchema,
});
export type PlatformSettingsResponse = z.infer<typeof platformSettingsResponseSchema>;

export const updatePlatformSettingsSchema = z.object({
  /** `null` clears the override and falls back to the env default. */
  inviteOnlyAccess: z.boolean().nullable(),
});
export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
