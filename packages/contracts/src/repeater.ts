import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Circle-scoped repeater directory. Any Circle member may add a repeater
 * (members know what they can hear); coordinators may edit and delete any
 * entry. Stations then declare per-repeater access: can hear it (rx) or
 * can both hear and key it up (rx_tx).
 */

export const repeaterServiceSchema = z.enum(['ham', 'gmrs']);
export type RepeaterService = z.infer<typeof repeaterServiceSchema>;
export const REPEATER_SERVICE_LABELS: Record<RepeaterService, string> = {
  ham: 'Amateur (ham)',
  gmrs: 'GMRS',
};

export const repeaterStatusSchema = z.enum(['active', 'offline', 'unverified']);
export type RepeaterStatus = z.infer<typeof repeaterStatusSchema>;
export const REPEATER_STATUS_LABELS: Record<RepeaterStatus, string> = {
  active: 'Active',
  offline: 'Off-air',
  unverified: 'Unverified',
};

export const repeaterAccessSchema = z.enum(['rx', 'rx_tx']);
export type RepeaterAccess = z.infer<typeof repeaterAccessSchema>;
export const REPEATER_ACCESS_LABELS: Record<RepeaterAccess, string> = {
  rx: 'Can hear (RX only)',
  rx_tx: 'Can hear and transmit (RX + TX)',
};

export const createRepeaterSchema = z.object({
  service: repeaterServiceSchema,
  name: z.string().min(1).max(120),
  callsign: z.string().max(20).optional(),
  outputFrequencyMhz: z.number().min(1).max(10000),
  offsetOrInput: z.string().max(40).optional(),
  tone: z.string().max(40).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  areaLabel: z.string().max(120).optional(),
  status: repeaterStatusSchema.default('active'),
  notes: z.string().max(1000).optional(),
});
export type CreateRepeaterInput = z.infer<typeof createRepeaterSchema>;

export const updateRepeaterSchema = z.object({
  service: repeaterServiceSchema.optional(),
  name: z.string().min(1).max(120).optional(),
  callsign: z.string().max(20).nullable().optional(),
  outputFrequencyMhz: z.number().min(1).max(10000).optional(),
  offsetOrInput: z.string().max(40).nullable().optional(),
  tone: z.string().max(40).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  areaLabel: z.string().max(120).nullable().optional(),
  status: repeaterStatusSchema.optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type UpdateRepeaterInput = z.infer<typeof updateRepeaterSchema>;

export const repeaterResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  service: repeaterServiceSchema,
  name: z.string(),
  callsign: z.string().nullable(),
  outputFrequencyMhz: z.number(),
  offsetOrInput: z.string().nullable(),
  tone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  areaLabel: z.string().nullable(),
  source: z.enum(['manual', 'repeaterbook']),
  status: repeaterStatusSchema,
  notes: z.string().nullable(),
  /** Whether the viewer may edit/delete this entry (coordinator, or the member who added it). */
  viewerCanManage: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RepeaterResponse = z.infer<typeof repeaterResponseSchema>;

/**
 * A candidate from the RepeaterBook import search, before the coordinator
 * chooses which to add to the Circle directory.
 */
export const repeaterImportCandidateSchema = z.object({
  externalId: z.string(),
  service: repeaterServiceSchema,
  name: z.string(),
  callsign: z.string().nullable(),
  outputFrequencyMhz: z.number(),
  offsetOrInput: z.string().nullable(),
  tone: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  areaLabel: z.string().nullable(),
  /** Distance from the Circle's centroid, km (null when unlocatable). */
  distanceKm: z.number().nullable(),
  /** Already present in this Circle's directory. */
  alreadyImported: z.boolean(),
});
export type RepeaterImportCandidate = z.infer<typeof repeaterImportCandidateSchema>;

export const importRepeatersSchema = z.object({
  /** externalIds selected from a prior import search. */
  externalIds: z.array(z.string().min(1)).min(1).max(50),
  service: repeaterServiceSchema,
  /** The state the import search returned; selections are re-resolved server-side. */
  state: z.string().min(2).max(60),
});
export type ImportRepeatersInput = z.infer<typeof importRepeatersSchema>;

export const repeaterImportSearchQuerySchema = z.object({
  service: repeaterServiceSchema,
  /** US state name; when omitted the API derives it from the Circle's station area. */
  state: z.string().min(2).max(60).optional(),
  radiusKm: z.coerce.number().min(5).max(400).default(120),
});
export type RepeaterImportSearchQuery = z.infer<typeof repeaterImportSearchQuerySchema>;

export const repeaterImportSearchResponseSchema = z.object({
  /** Whether the server has a RepeaterBook app token configured at all. */
  configured: z.boolean(),
  /** The state the search actually queried (derived or explicit). */
  state: z.string().nullable(),
  candidates: z.array(repeaterImportCandidateSchema),
});
export type RepeaterImportSearchResponse = z.infer<typeof repeaterImportSearchResponseSchema>;

// ---------------------------------------------------------------------------
// Station <-> repeater links
// ---------------------------------------------------------------------------

export const stationRepeaterLinkSchema = z.object({
  repeaterId: uuidSchema,
  access: repeaterAccessSchema,
});
export type StationRepeaterLinkInput = z.infer<typeof stationRepeaterLinkSchema>;

/** Replaces the full set of links for one station. */
export const setStationRepeatersSchema = z.object({
  links: z.array(stationRepeaterLinkSchema).max(100),
});
export type SetStationRepeatersInput = z.infer<typeof setStationRepeatersSchema>;

/** A repeater a station could declare access to (from any of its Circles). */
export const stationRepeaterOptionSchema = z.object({
  repeaterId: uuidSchema,
  name: z.string(),
  service: repeaterServiceSchema,
  outputFrequencyMhz: z.number(),
  tone: z.string().nullable(),
  areaLabel: z.string().nullable(),
  status: repeaterStatusSchema,
  circleId: uuidSchema,
  circleName: z.string(),
});
export type StationRepeaterOption = z.infer<typeof stationRepeaterOptionSchema>;

export const stationRepeaterResponseSchema = z.object({
  repeaterId: uuidSchema,
  access: repeaterAccessSchema,
  repeaterName: z.string(),
  service: repeaterServiceSchema,
  outputFrequencyMhz: z.number(),
  circleId: uuidSchema,
  circleName: z.string(),
});
export type StationRepeaterResponse = z.infer<typeof stationRepeaterResponseSchema>;
