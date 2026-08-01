/**
 * Minimal logging interface so the engine can be driven by the worker's
 * pino logger or a test stub without a hard dependency on either.
 */
export interface EngineLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * Everything the plan generator knows about a Circle, assembled once per
 * generation and persisted to `plan_versions.context_snapshot`. Locations
 * are pre-shaped to the member-visible level (coarse labels only, never
 * coordinates), so nothing downstream -- deterministic sections, the AI
 * prompt, or the stored snapshot -- can leak precise positions.
 */
export interface PlanContext {
  circle: {
    id: string;
    name: string;
    circleType: string;
    circleTypeLabel: string;
    areaLabel: string;
    gridOrLocalityLabel: string | null;
    shortDescription: string | null;
    purpose: string | null;
  };
  members: PlanContextMember[];
  generatedAt: string;
}

export interface PlanContextMember {
  stationId: string;
  stationName: string;
  stationType: string;
  stationTypeLabel: string;
  operatorName: string;
  circleRole: 'coordinator' | 'member';
  circleRoleLabel: string;
  capabilities: string[];
  capabilityLabels: string[];
  /** Member-visible location, already shaped by precision rules. */
  areaLabel: string | null;
  gridIdentifier: string | null;
  experienceLevel: string | null;
  experienceLevelLabel: string | null;
  authorization: string | null;
  authorizationLabel: string | null;
  goals: string[];
  participatesInScheduledChecks: boolean;
  willingToRelay: boolean;
  willingToActAsNetControl: boolean;
  receiveOnly: boolean;
}
