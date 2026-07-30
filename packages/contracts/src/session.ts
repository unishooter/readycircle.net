import { z } from 'zod';
import { currentUserSchema } from './user.js';
import { uuidSchema } from './common.js';

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: currentUserSchema.nullable(),
  devAuthEnabled: z.boolean(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const devLoginRequestSchema = z
  .object({
    userId: uuidSchema.optional(),
    displayName: z.string().min(1).max(80).optional(),
    email: z.string().email().optional(),
  })
  .refine((value) => Boolean(value.userId) || Boolean(value.displayName), {
    message: 'Provide userId to select an existing development user, or displayName to create a new one.',
  });
export type DevLoginInput = z.infer<typeof devLoginRequestSchema>;

export const devUserSummarySchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string().email().nullable(),
  persona: z.string().nullable(),
});
export type DevUserSummary = z.infer<typeof devUserSummarySchema>;
