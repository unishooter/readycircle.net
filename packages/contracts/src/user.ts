import { z } from 'zod';
import { uuidSchema } from './common.js';

export const currentUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  /** Login/auth-linking address, sourced from the identity provider. Read-only here; never edited via updateCurrentUserSchema. */
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  /**
   * The address shared with fellow Circle members, independent of the login
   * `email` above. Null means "no override set" -- callers should fall back
   * to displaying/using the login email as a live default in that case.
   */
  contactEmail: z.string().email().nullable(),
  /** Whether this member has opted to share each contact field with fellow Circle members. */
  emailVisibleToCircle: z.boolean(),
  phone: z.string().nullable(),
  phoneVisibleToCircle: z.boolean(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  addressVisibleToCircle: z.boolean(),
  authProvider: z.enum(['dev', 'google', 'apple', 'email_password']),
  /** Platform-wide admin flag, distinct from Circle coordinator/member roles. */
  isAdmin: z.boolean(),
  createdAt: z.string(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const updateCurrentUserSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  /** Explicit `null` clears a previously-set value; `undefined` leaves it untouched. */
  contactEmail: z.string().email().max(254).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().trim().length(2).nullable().optional(),
  zip: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit zip code')
    .nullable()
    .optional(),
  emailVisibleToCircle: z.boolean().optional(),
  phoneVisibleToCircle: z.boolean().optional(),
  addressVisibleToCircle: z.boolean().optional(),
});
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;
