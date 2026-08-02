import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Nets: recurring scheduled on-air check-ins for a Radio Circle, with
 * logged sessions and per-station participation. Upcoming occurrences are
 * computed from the recurrence rule (packages/domain net-occurrences), not
 * stored.
 */

export const netFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly']);
export type NetFrequency = z.infer<typeof netFrequencySchema>;

export const NET_FREQUENCY_LABELS: Record<NetFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

export const netStatusSchema = z.enum(['active', 'archived']);
export type NetStatus = z.infer<typeof netStatusSchema>;

export const netSessionStatusSchema = z.enum(['open', 'closed', 'cancelled']);
export type NetSessionStatus = z.infer<typeof netSessionStatusSchema>;

const timeLocalSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM in 24-hour format');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const netScheduleInputSchema = z.object({
  frequency: netFrequencySchema,
  firstOccursOn: dateSchema,
  timeLocal: timeLocalSchema,
  /** IANA timezone; validated against Intl at the API boundary. */
  timezone: z.string().min(1).max(64),
  durationMinutes: z.number().int().min(5).max(480),
});
export type NetScheduleInput = z.infer<typeof netScheduleInputSchema>;

export const createNetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  channel: z.string().min(1).max(200),
  schedule: netScheduleInputSchema,
  procedure: z.array(z.string().min(1).max(500)).max(20).default([]),
  /** Provenance when pre-filled from a published plan's check-in schedule. */
  sourcePlanVersionId: uuidSchema.optional(),
});
export type CreateNetInput = z.infer<typeof createNetSchema>;

export const updateNetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  channel: z.string().min(1).max(200).optional(),
  schedule: netScheduleInputSchema.optional(),
  procedure: z.array(z.string().min(1).max(500)).max(20).optional(),
});
export type UpdateNetInput = z.infer<typeof updateNetSchema>;

export const netCheckinResponseSchema = z.object({
  id: uuidSchema,
  stationId: uuidSchema,
  stationName: z.string(),
  operatorName: z.string(),
  checkedInAt: z.string(),
  note: z.string().nullable(),
});
export type NetCheckinResponse = z.infer<typeof netCheckinResponseSchema>;

export const netSessionResponseSchema = z.object({
  id: uuidSchema,
  netId: uuidSchema,
  scheduledFor: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: netSessionStatusSchema,
  netControlStationId: uuidSchema.nullable(),
  netControlStationName: z.string().nullable(),
  notes: z.string().nullable(),
  checkins: z.array(netCheckinResponseSchema),
});
export type NetSessionResponse = z.infer<typeof netSessionResponseSchema>;

export const netResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  circleName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  channel: z.string(),
  schedule: z.object({
    frequency: netFrequencySchema,
    frequencyLabel: z.string(),
    firstOccursOn: z.string(),
    timeLocal: z.string(),
    timezone: z.string(),
    durationMinutes: z.number().int(),
  }),
  procedure: z.array(z.string()),
  status: netStatusSchema,
  sourcePlanVersionId: uuidSchema.nullable(),
  /** Next occurrences as UTC ISO instants, computed from the rule. */
  nextOccurrences: z.array(z.string()),
  /** Whether the viewer coordinates the owning Circle. */
  viewerCanManage: z.boolean(),
  /** Whether the viewer may open sessions and record roster check-ins. */
  viewerCanRunSession: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NetResponse = z.infer<typeof netResponseSchema>;

export const netParticipationStatSchema = z.object({
  stationId: uuidSchema,
  stationName: z.string(),
  operatorName: z.string(),
  /** Closed sessions this station checked into, all time. */
  sessionsAttended: z.number().int(),
  /** Attendance rate over the net's last (up to) 10 closed sessions, 0-1. */
  recentAttendanceRate: z.number(),
  /** Consecutive most-recent closed sessions attended. */
  currentStreak: z.number().int(),
});
export type NetParticipationStat = z.infer<typeof netParticipationStatSchema>;

export const netDetailResponseSchema = netResponseSchema.extend({
  /** Recent sessions, newest first. */
  sessions: z.array(netSessionResponseSchema),
  /** Circle stations with any recorded participation, plus zero-rows for active members. */
  participation: z.array(netParticipationStatSchema),
  /** Total number of closed sessions ever run for this net. */
  closedSessionCount: z.number().int(),
});
export type NetDetailResponse = z.infer<typeof netDetailResponseSchema>;

export const openNetSessionSchema = z.object({
  /** Which occurrence this session is for; defaults to now server-side. */
  scheduledFor: z.string().datetime().optional(),
  /** The station acting as net control, when known. */
  netControlStationId: uuidSchema.optional(),
  notes: z.string().max(2000).optional(),
});
export type OpenNetSessionInput = z.infer<typeof openNetSessionSchema>;

export const closeNetSessionSchema = z.object({
  notes: z.string().max(2000).optional(),
});
export type CloseNetSessionInput = z.infer<typeof closeNetSessionSchema>;

export const recordCheckinSchema = z.object({
  stationId: uuidSchema,
  note: z.string().max(500).optional(),
});
export type RecordCheckinInput = z.infer<typeof recordCheckinSchema>;
