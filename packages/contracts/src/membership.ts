import { z } from 'zod';
import { uuidSchema } from './common.js';
import { circleRoleSchema, membershipStatusSchema, stationStatusSchema } from './enums.js';

export const createMembershipSchema = z.object({
  stationId: uuidSchema,
});
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export const updateMembershipSchema = z.object({
  role: circleRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const memberContactSchema = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
});
export type MemberContact = z.infer<typeof memberContactSchema>;

export const membershipResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  stationId: uuidSchema,
  stationName: z.string(),
  /** APRS MYCALL when configured on the station; null otherwise. */
  stationCallsign: z.string().nullable(),
  /** Lets rosters flag planned (hypothetical) stations. */
  stationStatus: stationStatusSchema,
  userId: uuidSchema,
  memberDisplayName: z.string(),
  /** Already shaped server-side: a field is null unless its owner has marked it visible to their Circles. */
  contact: memberContactSchema,
  role: circleRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.string(),
});
export type MembershipResponse = z.infer<typeof membershipResponseSchema>;
