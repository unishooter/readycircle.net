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
export const planGenerationStageSchema = z.enum([
  'assembling_context',
  'analyzing_connectivity',
  'drafting_advisory',
  'saving',
]);
export type PlanGenerationStage = z.infer<typeof planGenerationStageSchema>;

/** Display order of generation stages (for step indicators). */
export const PLAN_GENERATION_STAGE_ORDER: PlanGenerationStage[] = [
  'assembling_context',
  'analyzing_connectivity',
  'drafting_advisory',
  'saving',
];

export const PLAN_GENERATION_STAGE_LABELS: Record<PlanGenerationStage, string> = {
  assembling_context: "Gathering your Circle's roster, capabilities, and locations",
  analyzing_connectivity: 'Analyzing station-to-station and repeater coverage',
  drafting_advisory: 'Planning assistant is drafting channels, roles, and gear recommendations',
  saving: 'Saving the finished plan sections',
};

export const planSectionKeySchema = z.enum([
  'overview',
  'roster',
  'connectivity',
  'channel_plan',
  'role_assignments',
  'check_in_schedule',
  'gear_recommendations',
  'recommendations',
]);
export type PlanSectionKey = z.infer<typeof planSectionKeySchema>;

export const PLAN_SECTION_TITLES: Record<PlanSectionKey, string> = {
  overview: 'Overview',
  roster: 'Station roster',
  connectivity: 'Connectivity analysis',
  channel_plan: 'Channel plan',
  role_assignments: 'Role assignments',
  check_in_schedule: 'Check-in schedule',
  gear_recommendations: 'Gear recommendations',
  recommendations: 'Recommendations',
};

/** Display order of sections within a rendered plan. */
export const PLAN_SECTION_ORDER: PlanSectionKey[] = [
  'overview',
  'roster',
  'connectivity',
  'channel_plan',
  'role_assignments',
  'check_in_schedule',
  'gear_recommendations',
  'recommendations',
];

// ---------------------------------------------------------------------------
// Scenario: the circumstances a plan version is generated against. Not AI
// output -- chosen by the coordinator (or defaulted) at generation time.
// ---------------------------------------------------------------------------

export const scenarioCircumstanceSchema = z.enum(['power_outage', 'no_cellular', 'no_internet']);
export type ScenarioCircumstance = z.infer<typeof scenarioCircumstanceSchema>;
export const SCENARIO_CIRCUMSTANCE_LABELS: Record<ScenarioCircumstance, string> = {
  power_outage: 'Power outage',
  no_cellular: 'No cellular coverage',
  no_internet: 'No internet',
};

export const scenarioDurationSchema = z.enum(['hours_72', 'week', 'weeks_plus']);
export type ScenarioDuration = z.infer<typeof scenarioDurationSchema>;
export const SCENARIO_DURATION_LABELS: Record<ScenarioDuration, string> = {
  hours_72: 'Up to 72 hours',
  week: 'About a week',
  weeks_plus: 'Multiple weeks or longer',
};

export const scenarioExtentSchema = z.enum(['neighborhood', 'citywide', 'regional', 'statewide']);
export type ScenarioExtent = z.infer<typeof scenarioExtentSchema>;
export const SCENARIO_EXTENT_LABELS: Record<ScenarioExtent, string> = {
  neighborhood: 'Neighborhood',
  citywide: 'Citywide',
  regional: 'Regional',
  statewide: 'Statewide or larger',
};

export const scenarioSchema = z.object({
  /** All stations are assumed affected; check-ins reveal the real extent. */
  circumstances: z.array(scenarioCircumstanceSchema).min(1),
  duration: scenarioDurationSchema,
  extent: scenarioExtentSchema,
  notes: z.string().max(500).nullable(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

/** Versions generated before scenarios existed are treated as this preset. */
export const DEFAULT_SCENARIO: Scenario = {
  circumstances: ['power_outage', 'no_cellular', 'no_internet'],
  duration: 'hours_72',
  extent: 'citywide',
  notes: null,
};

export interface ScenarioPreset {
  id: string;
  label: string;
  scenario: Scenario;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: 'local_72h', label: '72-hour local outage', scenario: DEFAULT_SCENARIO },
  {
    id: 'regional_week',
    label: 'Extended regional disaster (1 week+)',
    scenario: {
      circumstances: ['power_outage', 'no_cellular', 'no_internet'],
      duration: 'weeks_plus',
      extent: 'regional',
      notes: null,
    },
  },
];

/** Human-readable one-liner, used in the overview section and PDF. */
export function describeScenario(scenario: Scenario): string {
  const circumstances = scenario.circumstances
    .map((value) => SCENARIO_CIRCUMSTANCE_LABELS[value].toLowerCase())
    .join(', ');
  return `${SCENARIO_EXTENT_LABELS[scenario.extent]} event: ${circumstances}; lasting ${SCENARIO_DURATION_LABELS[
    scenario.duration
  ].toLowerCase()}.`;
}

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
  /** Human-readable scenario line; absent on pre-scenario versions. */
  scenarioDescription: z.string().nullable().optional(),
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
// Deterministic connectivity section (computed by the RF reachability
// engine, never by the AI). Only rounded distances and verdicts appear
// here -- station coordinates are consumed upstream and never stored.
// ---------------------------------------------------------------------------

export const connectivityVerdictSchema = z.enum(['likely', 'marginal', 'unlikely', 'unknown']);
export type ConnectivityVerdict = z.infer<typeof connectivityVerdictSchema>;
export const CONNECTIVITY_VERDICT_LABELS: Record<ConnectivityVerdict, string> = {
  likely: 'Likely',
  marginal: 'Marginal',
  unlikely: 'Unlikely',
  unknown: 'Unknown',
};

export const connectivityPathTypeSchema = z.enum(['simplex', 'repeater', 'satellite', 'mesh']);
export type ConnectivityPathType = z.infer<typeof connectivityPathTypeSchema>;
export const CONNECTIVITY_PATH_TYPE_LABELS: Record<ConnectivityPathType, string> = {
  simplex: 'Direct (simplex)',
  repeater: 'Via repeater',
  satellite: 'Satellite',
  mesh: 'Mesh network',
};

export const connectivityStationSummarySchema = z.object({
  stationId: uuidSchema,
  stationName: z.string(),
  hypothetical: z.boolean(),
  hasLocation: z.boolean(),
  /** Count of other stations reachable by any likely path. */
  reachableStationCount: z.number().int(),
  /** 'connected' | 'edge' (exactly one likely path) | 'isolated' | 'unknown' (no location). */
  role: z.enum(['connected', 'edge', 'isolated', 'unknown']),
  notes: z.array(z.string()),
});
export type ConnectivityStationSummary = z.infer<typeof connectivityStationSummarySchema>;

export const connectivityLinkSchema = z.object({
  fromStationId: uuidSchema,
  fromStationName: z.string(),
  toStationId: uuidSchema,
  toStationName: z.string(),
  /** Best available path between the pair. */
  pathType: connectivityPathTypeSchema,
  verdict: connectivityVerdictSchema,
  /** Rounded to whole km; null when either side lacks a location. */
  distanceKm: z.number().nullable(),
  /** Repeater name when pathType is 'repeater'. */
  viaRepeaterName: z.string().nullable(),
  detail: z.string().nullable(),
});
export type ConnectivityLink = z.infer<typeof connectivityLinkSchema>;

export const connectivityContentSchema = z.object({
  narrative: z.string(),
  /** The baseline test: can at least one station relay to every edge station and back? */
  baselineRelay: z.object({
    pass: z.boolean(),
    summary: z.string(),
    /** Stations able to serve as the relay hub, when the test passes. */
    hubStationNames: z.array(z.string()),
  }),
  stations: z.array(connectivityStationSummarySchema),
  links: z.array(connectivityLinkSchema),
  /** Identified coverage holes / gaps, in plain language. */
  gaps: z.array(z.string()),
  /** Repeaters considered in the analysis, by name with service label. */
  repeatersConsidered: z.array(z.string()),
});
export type ConnectivityContent = z.infer<typeof connectivityContentSchema>;

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

export const gearRecommendationSchema = z.object({
  /** Station name from the roster, or null for Circle-wide recommendations. */
  stationName: z.string().nullable(),
  /** The connectivity gap or scenario need this addresses. */
  gap: z.string(),
  /** Generic gear class only (e.g. "50 W GMRS mobile with base antenna at ~20 ft"), never brand/model. */
  recommendation: z.string(),
  priority: z.enum(['essential', 'recommended', 'nice_to_have']),
});
export type GearRecommendation = z.infer<typeof gearRecommendationSchema>;

export const GEAR_PRIORITY_LABELS: Record<GearRecommendation['priority'], string> = {
  essential: 'Essential',
  recommended: 'Recommended',
  nice_to_have: 'Nice to have',
};

export const gearRecommendationsContentSchema = z.object({
  narrative: z.string(),
  items: z.array(gearRecommendationSchema),
});
export type GearRecommendationsContent = z.infer<typeof gearRecommendationsContentSchema>;

/** The complete structured output the AI model must produce. */
export const planAdvisorySchema = z.object({
  channelPlan: channelPlanContentSchema,
  roleAssignments: roleAssignmentsContentSchema,
  checkInSchedule: checkInScheduleContentSchema,
  gearRecommendations: gearRecommendationsContentSchema,
  recommendations: recommendationsContentSchema,
});
export type PlanAdvisory = z.infer<typeof planAdvisorySchema>;

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export const createPlanSchema = z.object({
  /** Defaults to "<Circle name> communications plan" when omitted. */
  title: z.string().min(1).max(120).optional(),
  /** Defaults to the 72-hour-outage preset when omitted. */
  scenario: scenarioSchema.optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const regeneratePlanSchema = z.object({
  scenario: scenarioSchema.optional(),
});
export type RegeneratePlanInput = z.infer<typeof regeneratePlanSchema>;

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
  /** Null for versions generated before scenarios existed (treated as the default preset). */
  scenario: scenarioSchema.nullable(),
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
