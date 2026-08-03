import { z } from 'zod';
import { uuidSchema } from './common.js';

export const currentUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  /** Whether this member has opted to share each contact field with fellow Circle members. */
  emailVisibleToCircle: z.boolean(),
  phone: z.string().nullable(),
  phoneVisibleToCircle: z.boolean(),
  address: z.string().nullable(),
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
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  emailVisibleToCircle: z.boolean().optional(),
  phoneVisibleToCircle: z.boolean().optional(),
  addressVisibleToCircle: z.boolean().optional(),
});
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;
