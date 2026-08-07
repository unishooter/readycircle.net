import { z } from 'zod';
import { uuidSchema } from './common.js';
import { connectivityPathTypeSchema } from './plan.js';

/**
 * Contacts: a self-declared log of verified QSOs between two stations in
 * the same Circle. One-sided by design (whoever logs it is the record,
 * mirroring `station_repeaters` observed-truth semantics) -- there is no
 * mutual-confirmation workflow. `mode` reuses `connectivityPathTypeSchema`
 * so a logged contact can stand in directly for an estimated RF path type.
 */

export const contactModeSchema = connectivityPathTypeSchema;
export type ContactMode = z.infer<typeof contactModeSchema>;

export const logContactSchema = z
  .object({
    stationId: uuidSchema,
    counterpartyStationId: uuidSchema,
    /** ISO instant; must not be in the future. */
    occurredAt: z.string().datetime(),
    mode: contactModeSchema,
    /** Optional Circle directory repeater when mode is 'repeater'. */
    repeaterId: uuidSchema.optional(),
    channel: z.string().max(200).optional(),
    /** Simple 1-5 signal-quality rating. */
    signalRating: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000).optional(),
    netSessionId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.repeaterId && value.mode !== 'repeater') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repeaterId'],
        message: 'repeaterId is only allowed when mode is "repeater".',
      });
    }
  });
export type LogContactInput = z.infer<typeof logContactSchema>;

export const contactResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  circleName: z.string(),
  stationId: uuidSchema,
  stationName: z.string(),
  counterpartyStationId: uuidSchema,
  counterpartyStationName: z.string(),
  occurredAt: z.string(),
  mode: contactModeSchema,
  repeaterId: uuidSchema.nullable(),
  repeaterName: z.string().nullable(),
  channel: z.string().nullable(),
  signalRating: z.number().int().nullable(),
  notes: z.string().nullable(),
  netSessionId: uuidSchema.nullable(),
  recordedByUserId: uuidSchema.nullable(),
  recordedByDisplayName: z.string().nullable(),
  /** Whether the viewer may delete this entry (i.e. they logged it). */
  viewerCanDelete: z.boolean(),
  createdAt: z.string(),
});
export type ContactResponse = z.infer<typeof contactResponseSchema>;
