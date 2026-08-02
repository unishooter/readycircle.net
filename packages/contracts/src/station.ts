import { z } from 'zod';
import { uuidSchema } from './common.js';
import {
  antennaTypeSchema,
  authorizationSchema,
  backupPowerSchema,
  experienceLevelSchema,
  locationPrecisionSchema,
  radioCapabilitySchema,
  stationGoalSchema,
  stationStatusSchema,
  stationTypeSchema,
  stationVisibilitySchema,
} from './enums.js';

/**
 * How a station's coordinates were captured. Purely informational --
 * intended for future confidence-weighting in AI/nearby-query use, not
 * currently used for authorization or validation. Defaults to 'manual' for
 * callers (e.g. seed data) that don't specify it.
 */
export const locationSourceSchema = z.enum(['manual', 'map_click', 'geocode_search']);
export type LocationSource = z.infer<typeof locationSourceSchema>;

export const stationLocationInputSchema = z.object({
  areaLabel: z.string().max(120).optional(),
  /**
   * There is no free-text grid input: `gridIdentifier` is always derived
   * server-side as a 1km MGRS code from `latitude`/`longitude` (see
   * `@readycircle/geo`'s `deriveGridIdentifier`) and returned in
   * `stationLocationResponseSchema` -- it is never accepted from clients.
   */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  precision: locationPrecisionSchema,
  locationSource: locationSourceSchema.optional(),
});
export type StationLocationInput = z.infer<typeof stationLocationInputSchema>;

/**
 * RF attributes feeding the connectivity/gear-check analysis. All optional:
 * unknown values fall back to conservative defaults by station type in the
 * RF reachability engine.
 */
const stationRfFields = {
  transmitPowerWatts: z.number().int().min(1).max(1500).optional(),
  antennaType: antennaTypeSchema.optional(),
  antennaHeightFeet: z.number().int().min(0).max(500).optional(),
  backupPower: z.array(backupPowerSchema).default([]),
};

export const createStationSchema = z
  .object({
    name: z.string().min(1).max(80),
    stationType: stationTypeSchema,
    /**
     * 'hypothetical' creates a planned station: location required, but no
     * capabilities/experience/authorization needed yet -- gear-up plans
     * analyze what to buy for it.
     */
    status: z.enum(['active', 'hypothetical']).default('active'),
    location: stationLocationInputSchema,
    capabilities: z.array(radioCapabilitySchema).default([]),
    experienceLevel: experienceLevelSchema.optional(),
    authorization: authorizationSchema.optional(),
    goals: z.array(stationGoalSchema).default([]),
    participatesInScheduledChecks: z.boolean().default(false),
    willingToRelay: z.boolean().default(false),
    willingToActAsNetControl: z.boolean().default(false),
    receiveOnly: z.boolean().default(false),
    visibility: stationVisibilitySchema.default('private'),
    ...stationRfFields,
  })
  .superRefine((value, ctx) => {
    if (value.status === 'hypothetical') return;
    if (value.capabilities.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities'],
        message: 'Select at least one radio capability',
      });
    }
    if (!value.experienceLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['experienceLevel'],
        message: 'Experience level is required',
      });
    }
    if (!value.authorization) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authorization'],
        message: 'Authorization is required',
      });
    }
  });
export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  stationType: stationTypeSchema.optional(),
  location: stationLocationInputSchema.optional(),
  capabilities: z.array(radioCapabilitySchema).optional(),
  experienceLevel: experienceLevelSchema.optional(),
  authorization: authorizationSchema.optional(),
  goals: z.array(stationGoalSchema).optional(),
  participatesInScheduledChecks: z.boolean().optional(),
  willingToRelay: z.boolean().optional(),
  willingToActAsNetControl: z.boolean().optional(),
  receiveOnly: z.boolean().optional(),
  visibility: stationVisibilitySchema.optional(),
  status: stationStatusSchema.optional(),
  transmitPowerWatts: z.number().int().min(1).max(1500).nullable().optional(),
  antennaType: antennaTypeSchema.nullable().optional(),
  antennaHeightFeet: z.number().int().min(0).max(500).nullable().optional(),
  backupPower: z.array(backupPowerSchema).optional(),
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
  status: stationStatusSchema,
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
  transmitPowerWatts: z.number().nullable(),
  antennaType: antennaTypeSchema.nullable(),
  antennaHeightFeet: z.number().nullable(),
  backupPower: z.array(backupPowerSchema),
  isOwner: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StationResponse = z.infer<typeof stationResponseSchema>;
