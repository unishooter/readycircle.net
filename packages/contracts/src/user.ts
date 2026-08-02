import { z } from 'zod';
import { uuidSchema } from './common.js';

export const currentUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  authProvider: z.enum(['dev', 'google', 'apple', 'email_password']),
  /** Platform-wide admin flag, distinct from Circle coordinator/member roles. */
  isAdmin: z.boolean(),
  createdAt: z.string(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const updateCurrentUserSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
});
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;
