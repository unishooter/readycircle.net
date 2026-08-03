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

/**
 * A point on a map, snapped server-side to the center of its containing 1km
 * MGRS grid cell (see `deriveGridIdentifier` in @readycircle/geo) -- clients
 * never submit an MGRS code directly, mirroring the station location
 * pattern (docs/decisions/0009-mgrs-location-capture.md).
 */
export const circleGridLocationInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type CircleGridLocationInput = z.infer<typeof circleGridLocationInputSchema>;

export const circleAreaInputSchema = z.object({
  areaLabel: z.string().min(1).max(120),
  /** Explicit `null` clears a previously-set pin; `undefined` leaves it untouched. */
  gridLocation: circleGridLocationInputSchema.nullable().optional(),
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
    /** Legacy free-text value from before the map picker existed. No longer settable; only present as a display fallback until a coordinator sets a real map pin (see `gridIdentifier`). */
    gridOrLocalityLabel: z.string().nullable(),
    /** Server-derived MGRS 1km grid code from the map-picked location. Null until a coordinator sets a pin. */
    gridIdentifier: z.string().nullable(),
    gridLatitude: z.number().nullable(),
    gridLongitude: z.number().nullable(),
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
