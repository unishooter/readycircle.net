import { z } from 'zod';
import { uuidSchema } from './common.js';
import {
  authorizationSchema,
  experienceLevelSchema,
  locationPrecisionSchema,
  radioCapabilitySchema,
  recordStatusSchema,
  stationGoalSchema,
  stationTypeSchema,
  stationVisibilitySchema,
} from './enums.js';

export const stationLocationInputSchema = z.object({
  areaLabel: z.string().max(120).optional(),
  gridIdentifier: z.string().max(40).optional(),
  /** Optional in development builds only; a production map selector will replace direct entry. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  precision: locationPrecisionSchema,
});
export type StationLocationInput = z.infer<typeof stationLocationInputSchema>;

export const createStationSchema = z.object({
  name: z.string().min(1).max(80),
  stationType: stationTypeSchema,
  location: stationLocationInputSchema,
  capabilities: z.array(radioCapabilitySchema).min(1, 'Select at least one radio capability'),
  experienceLevel: experienceLevelSchema,
  authorization: authorizationSchema,
  goals: z.array(stationGoalSchema).default([]),
  participatesInScheduledChecks: z.boolean().default(false),
  willingToRelay: z.boolean().default(false),
  willingToActAsNetControl: z.boolean().default(false),
  receiveOnly: z.boolean().default(false),
  visibility: stationVisibilitySchema.default('private'),
});
export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  stationType: stationTypeSchema.optional(),
  location: stationLocationInputSchema.optional(),
  capabilities: z.array(radioCapabilitySchema).min(1).optional(),
  experienceLevel: experienceLevelSchema.optional(),
  authorization: authorizationSchema.optional(),
  goals: z.array(stationGoalSchema).optional(),
  participatesInScheduledChecks: z.boolean().optional(),
  willingToRelay: z.boolean().optional(),
  willingToActAsNetControl: z.boolean().optional(),
  receiveOnly: z.boolean().optional(),
  visibility: stationVisibilitySchema.optional(),
  status: recordStatusSchema.optional(),
});
export type UpdateStationInput = z.infer<typeof updateStationSchema>;

export const stationLocationResponseSchema = z.object({
  areaLabel: z.string().nullable(),
  gridIdentifier: z.string().nullable(),
  precision: locationPrecisionSchema,
  /** Only populated for the owner, and only when precision allows it. */
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const stationResponseSchema = z.object({
  id: uuidSchema,
  ownerId: uuidSchema,
  name: z.string(),
  stationType: stationTypeSchema,
  status: recordStatusSchema,
  location: stationLocationResponseSchema,
  capabilities: z.array(radioCapabilitySchema),
  experienceLevel: experienceLevelSchema.nullable(),
  authorization: authorizationSchema.nullable(),
  goals: z.array(stationGoalSchema),
  participatesInScheduledChecks: z.boolean(),
  willingToRelay: z.boolean(),
  willingToActAsNetControl: z.boolean(),
  receiveOnly: z.boolean(),
  visibility: stationVisibilitySchema,
  isOwner: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StationResponse = z.infer<typeof stationResponseSchema>;
