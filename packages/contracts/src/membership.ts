import { z } from 'zod';
import { uuidSchema } from './common.js';
import { circleRoleSchema, membershipStatusSchema } from './enums.js';

export const createMembershipSchema = z.object({
  stationId: uuidSchema,
});
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export const updateMembershipSchema = z.object({
  role: circleRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const membershipResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  stationId: uuidSchema,
  stationName: z.string(),
  userId: uuidSchema,
  role: circleRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.string(),
});
export type MembershipResponse = z.infer<typeof membershipResponseSchema>;
