import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Plan generation contracts. A plan belongs to a Circle and has immutable
 * published versions (ADR 0005). Section content is stored as typed JSON:
 * the `overview` and `roster` sections are assembled deterministically from
 * Circle data, while the advisory sections (`channel_plan`,
 * `role_assignments`, `check_in_schedule`, `recommendations`) are produced
 * by an AI model constrained to `planAdvisorySchema` via strict structured
 * outputs (ADR 0010).
 */

export const planVersionStatusSchema = z.enum(['generating', 'draft', 'failed', 'published']);
export type PlanVersionStatus = z.infer<typeof planVersionStatusSchema>;

/**
 * Progress marker written by the generation pipeline while a version's
 * status is `generating`, so the polling UI can show which phase is
 * running rather than an indeterminate spinner.
 */
export const planGenerationStageSchema = z.enum(['assembling_context', 'drafting_advisory', 'saving']);
export type PlanGenerationStage = z.infer<typeof planGenerationStageSchema>;

/** Display order of generation stages (for step indicators). */
export const PLAN_GENERATION_STAGE_ORDER: PlanGenerationStage[] = [
  'assembling_context',
  'drafting_advisory',
  'saving',
];

export const PLAN_GENERATION_STAGE_LABELS: Record<PlanGenerationStage, string> = {
  assembling_context: "Gathering your Circle's roster, capabilities, and locations",
  drafting_advisory: 'Planning assistant is drafting channels, roles, and check-ins',
  saving: 'Saving the finished plan sections',
};

export const planSectionKeySchema = z.enum([
  'overview',
  'roster',
  'channel_plan',
  'role_assignments',
  'check_in_schedule',
  'recommendations',
]);
export type PlanSectionKey = z.infer<typeof planSectionKeySchema>;

export const PLAN_SECTION_TITLES: Record<PlanSectionKey, string> = {
  overview: 'Overview',
  roster: 'Station roster',
  channel_plan: 'Channel plan',
  role_assignments: 'Role assignments',
  check_in_schedule: 'Check-in schedule',
  recommendations: 'Recommendations',
};

/** Display order of sections within a rendered plan. */
export const PLAN_SECTION_ORDER: PlanSectionKey[] = [
  'overview',
  'roster',
  'channel_plan',
  'role_assignments',
  'check_in_schedule',
  'recommendations',
];

export const planDocumentFormatSchema = z.enum(['pdf', 'html']);
export type PlanDocumentFormat = z.infer<typeof planDocumentFormatSchema>;

export const planDocumentStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type PlanDocumentStatus = z.infer<typeof planDocumentStatusSchema>;

// ---------------------------------------------------------------------------
// Deterministic section content (assembled from database facts, never AI)
// ---------------------------------------------------------------------------

export const planOverviewContentSchema = z.object({
  circleName: z.string(),
  circleTypeLabel: z.string(),
  areaLabel: z.string(),
  purpose: z.string().nullable(),
  memberCount: z.number().int(),
  generatedAt: z.string(),
});
export type PlanOverviewContent = z.infer<typeof planOverviewContentSchema>;

export const planRosterEntrySchema = z.object({
  stationId: uuidSchema,
  stationName: z.string(),
  stationTypeLabel: z.string(),
  operatorName: z.string(),
  circleRoleLabel: z.string(),
  capabilities: z.array(z.string()),
  capabilityLabels: z.array(z.string()),
  /** Shaped by station privacy rules -- coarse labels only, never coordinates. */
  areaLabel: z.string().nullable(),
  gridIdentifier: z.string().nullable(),
  participatesInScheduledChecks: z.boolean(),
  willingToRelay: z.boolean(),
  willingToActAsNetControl: z.boolean(),
  receiveOnly: z.boolean(),
});
export type PlanRosterEntry = z.infer<typeof planRosterEntrySchema>;

export const planRosterContentSchema = z.object({
  entries: z.array(planRosterEntrySchema),
});
export type PlanRosterContent = z.infer<typeof planRosterContentSchema>;

// ---------------------------------------------------------------------------
// AI advisory section content. Every field is required (nullable rather than
// optional) so the schema converts cleanly to a strict OpenAI Structured
// Outputs JSON schema, which rejects optional properties.
// ---------------------------------------------------------------------------

export const channelPlanEntrySchema = z.object({
  purpose: z.enum(['primary', 'backup', 'monitoring']),
  /** Radio service, e.g. "FRS", "GMRS", "Amateur 2m simplex". */
  service: z.string(),
  /** Human-usable dial setting, e.g. "FRS channel 3 (462.6125 MHz)". */
  channelOrFrequency: z.string(),
  /** Which stations can use this, in plain language. */
  whoCanUse: z.string(),
  notes: z.string().nullable(),
});
export type ChannelPlanEntry = z.infer<typeof channelPlanEntrySchema>;

export const channelPlanContentSchema = z.object({
  narrative: z.string(),
  entries: z.array(channelPlanEntrySchema),
});
export type ChannelPlanContent = z.infer<typeof channelPlanContentSchema>;

export const planRoleAssignmentSchema = z.object({
  role: z.enum(['net_control', 'backup_net_control', 'relay']),
  /** Must reference a station from the roster; validated after generation. */
  stationId: z.string(),
  stationName: z.string(),
  rationale: z.string(),
});
export type PlanRoleAssignment = z.infer<typeof planRoleAssignmentSchema>;

export const roleAssignmentsContentSchema = z.object({
  narrative: z.string(),
  assignments: z.array(planRoleAssignmentSchema),
});
export type RoleAssignmentsContent = z.infer<typeof roleAssignmentsContentSchema>;

export const checkInScheduleContentSchema = z.object({
  narrative: z.string(),
  /** e.g. "Weekly". */
  cadence: z.string(),
  /** e.g. "Sundays at 19:00 local time". */
  dayAndTime: z.string(),
  durationMinutes: z.number().int(),
  /** Ordered net procedure steps. */
  procedure: z.array(z.string()),
});
export type CheckInScheduleContent = z.infer<typeof checkInScheduleContentSchema>;

export const planRecommendationSchema = z.object({
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['info', 'advisory', 'important']),
});
export type PlanRecommendation = z.infer<typeof planRecommendationSchema>;

export const recommendationsContentSchema = z.object({
  narrative: z.string(),
  items: z.array(planRecommendationSchema),
});
export type RecommendationsContent = z.infer<typeof recommendationsContentSchema>;

/** The complete structured output the AI model must produce. */
export const planAdvisorySchema = z.object({
  channelPlan: channelPlanContentSchema,
  roleAssignments: roleAssignmentsContentSchema,
  checkInSchedule: checkInScheduleContentSchema,
  recommendations: recommendationsContentSchema,
});
export type PlanAdvisory = z.infer<typeof planAdvisorySchema>;

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export const createPlanSchema = z.object({
  /** Defaults to "<Circle name> communications plan" when omitted. */
  title: z.string().min(1).max(120).optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const planDocumentResponseSchema = z.object({
  format: planDocumentFormatSchema,
  status: planDocumentStatusSchema,
  errorMessage: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type PlanDocumentResponse = z.infer<typeof planDocumentResponseSchema>;

export const planVersionSummarySchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  versionNumber: z.number().int(),
  status: planVersionStatusSchema,
  /** Set only while status is `generating`; null before pickup and after completion. */
  generationStage: planGenerationStageSchema.nullable(),
  errorMessage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  document: planDocumentResponseSchema.nullable(),
});
export type PlanVersionSummary = z.infer<typeof planVersionSummarySchema>;

export const planSectionResponseSchema = z.object({
  sectionKey: z.string(),
  title: z.string(),
  content: z.unknown(),
  sortOrder: z.number().int(),
});
export type PlanSectionResponse = z.infer<typeof planSectionResponseSchema>;

export const planVersionDetailSchema = planVersionSummarySchema.extend({
  sections: z.array(planSectionResponseSchema),
});
export type PlanVersionDetail = z.infer<typeof planVersionDetailSchema>;

export const planResponseSchema = z.object({
  id: uuidSchema,
  circleId: uuidSchema,
  circleName: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestVersion: planVersionSummarySchema.nullable(),
  /** True when the viewer is a coordinator of the owning Circle. */
  viewerCanManage: z.boolean(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

export const planDetailResponseSchema = planResponseSchema.extend({
  /** Full version history, newest first. */
  versions: z.array(planVersionSummarySchema),
});
export type PlanDetailResponse = z.infer<typeof planDetailResponseSchema>;
