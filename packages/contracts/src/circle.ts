import { z } from 'zod';
import { uuidSchema } from './common.js';
import { circleRoleSchema, circleTypeSchema, memberSharingPolicySchema, recordStatusSchema } from './enums.js';

/**
 * Format for the short, human-readable public "Circle Identifier"
 * (consonant-vowel-consonant-digit, e.g. "RAV7"). Digit `0` is excluded
 * because it's easily confused with the letter `O` when read aloud.
 */
export const CIRCLE_IDENTIFIER_PATTERN = /^[BCDFGHJKMNPRSTVWXZ][AEIOU][BCDFGHJKMNPRSTVWXZ][1-9]$/;
export const circleIdentifierSchema = z
  .string()
  .regex(CIRCLE_IDENTIFIER_PATTERN, 'Must be a 4-character Circle Identifier, e.g. RAV7.');

export const circleAreaInputSchema = z.object({
  areaLabel: z.string().min(1).max(120),
  gridOrLocalityLabel: z.string().max(120).optional(),
});
export type CircleAreaInput = z.infer<typeof circleAreaInputSchema>;

export const createCircleSchema = z.object({
  circleType: circleTypeSchema,
  name: z.string().min(1).max(100),
  shortDescription: z.string().max(280).optional(),
  purpose: z.string().max(2000).optional(),
  area: circleAreaInputSchema,
  isPrivate: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  memberSharingPolicy: memberSharingPolicySchema.default('coordinators_only'),
  creatorStationId: uuidSchema,
});
export type CreateCircleInput = z.infer<typeof createCircleSchema>;

export const updateCircleSchema = z.object({
  circleType: circleTypeSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  shortDescription: z.string().max(280).optional(),
  purpose: z.string().max(2000).optional(),
  area: circleAreaInputSchema.optional(),
  isPrivate: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  memberSharingPolicy: memberSharingPolicySchema.optional(),
  status: recordStatusSchema.optional(),
});
export type UpdateCircleInput = z.infer<typeof updateCircleSchema>;

export const circleResponseSchema = z.object({
  id: uuidSchema,
  circleType: circleTypeSchema,
  circleTypeLabel: z.string(),
  name: z.string(),
  /** Short, human-readable public identifier for display/verbal use only -- see `circles.circleIdentifier` in packages/database for why it must never be treated as a key. */
  circleIdentifier: circleIdentifierSchema,
  shortDescription: z.string().nullable(),
  purpose: z.string().nullable(),
  area: z.object({
    areaLabel: z.string(),
    gridOrLocalityLabel: z.string().nullable(),
  }),
  isPrivate: z.boolean(),
  requiresApproval: z.boolean(),
  memberSharingPolicy: memberSharingPolicySchema,
  status: recordStatusSchema,
  memberCount: z.number().int(),
  coordinatorCount: z.number().int(),
  viewerRole: circleRoleSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CircleResponse = z.infer<typeof circleResponseSchema>;
