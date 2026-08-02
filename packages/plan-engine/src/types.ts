/**
 * Minimal logging interface so the engine can be driven by the worker's
 * pino logger or a test stub without a hard dependency on either.
 */
export interface EngineLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

import type { Scenario } from '@readycircle/contracts';
import type { RfAnalysisResult } from '@readycircle/domain';

/**
 * Everything the plan generator knows about a Circle, assembled once per
 * generation and persisted to `plan_versions.context_snapshot`. Locations
 * are pre-shaped to the member-visible level (coarse labels only, never
 * coordinates), so nothing downstream -- deterministic sections, the AI
 * prompt, or the stored snapshot -- can leak precise positions. The
 * connectivity results follow the same discipline: the RF engine consumes
 * coordinates upstream and only rounded distances and verdicts land here.
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
  /** The scenario this generation targets (null on legacy snapshots = default 72h preset). */
  scenario: Scenario | null;
  scenarioDescription: string | null;
  repeaters: PlanContextRepeater[];
  /** Attached after the analyzing_connectivity stage; null until then. */
  connectivity: RfAnalysisResult | null;
  generatedAt: string;
}

export interface PlanContextRepeater {
  id: string;
  name: string;
  service: string;
  serviceLabel: string;
  outputFrequencyMhz: number;
  offsetOrInput: string | null;
  tone: string | null;
  areaLabel: string | null;
  status: string;
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
  /** Planned station (status = 'hypothetical'): location only, no gear yet. */
  hypothetical: boolean;
  transmitPowerWatts: number | null;
  antennaType: string | null;
  antennaTypeLabel: string | null;
  antennaHeightFeet: number | null;
  backupPower: string[];
  backupPowerLabels: string[];
  /** Declared repeater access, by repeater name (ids stay internal). */
  repeaterLinks: { repeaterName: string; access: 'rx' | 'rx_tx' }[];
}
