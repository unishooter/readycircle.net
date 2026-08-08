import { z } from 'zod';
import { uuidSchema } from './common.js';
import { contactLocationSchema } from './contact.js';
import { repeaterAccessSchema } from './repeater.js';

/**
 * Station→repeater access checks: "I heard / keyed this machine" (optionally
 * with a note about who was on the other end). Distinct from contacts, which
 * require two Circle stations. Logging a check upserts `station_repeaters`.
 */

export const logRepeaterCheckSchema = z.object({
  stationId: uuidSchema,
  repeaterId: uuidSchema,
  /** ISO instant; must not be in the future. */
  occurredAt: z.string().datetime(),
  access: repeaterAccessSchema,
  counterpartyNote: z.string().max(200).optional(),
  /** Optional Circle station selected as who was heard (free text stays in counterpartyNote). */
  heardStationId: uuidSchema.optional(),
  signalRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
  /**
   * Where the logging station was. Omit to use the station's current home
   * location; `null` stores no snapshot.
   */
  stationLocation: contactLocationSchema.nullable().optional(),
  stationLocationOverridden: z.boolean().optional(),
});
export type LogRepeaterCheckInput = z.infer<typeof logRepeaterCheckSchema>;

export const repeaterCheckResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  stationId: uuidSchema,
  stationName: z.string(),
  repeaterId: uuidSchema,
  repeaterName: z.string(),
  occurredAt: z.string(),
  access: repeaterAccessSchema,
  counterpartyNote: z.string().nullable(),
  heardStationId: uuidSchema.nullable(),
  heardStationName: z.string().nullable(),
  signalRating: z.number().int().nullable(),
  notes: z.string().nullable(),
  stationLocation: contactLocationSchema.nullable(),
  stationLocationOverridden: z.boolean(),
  recordedByUserId: uuidSchema.nullable(),
  recordedByDisplayName: z.string().nullable(),
  /** Logger or Circle coordinator may delete. */
  viewerCanDelete: z.boolean(),
  createdAt: z.string(),
});
export type RepeaterCheckResponse = z.infer<typeof repeaterCheckResponseSchema>;
