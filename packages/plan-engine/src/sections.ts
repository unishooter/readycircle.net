import type { PlanOverviewContent, PlanRosterContent } from '@readycircle/contracts';
import type { PlanContext } from './types.js';

/**
 * Deterministic section builders. These transcribe database facts from the
 * context -- no inference, no AI -- so the factual backbone of every plan
 * (who is in the Circle, what equipment they have) is always trustworthy.
 */

export function buildOverviewContent(context: PlanContext): PlanOverviewContent {
  return {
    circleName: context.circle.name,
    circleTypeLabel: context.circle.circleTypeLabel,
    areaLabel: context.circle.areaLabel,
    purpose: context.circle.purpose,
    memberCount: context.members.length,
    generatedAt: context.generatedAt,
  };
}

export function buildRosterContent(context: PlanContext): PlanRosterContent {
  return {
    entries: context.members.map((member) => ({
      stationId: member.stationId,
      stationName: member.stationName,
      stationTypeLabel: member.stationTypeLabel,
      operatorName: member.operatorName,
      circleRoleLabel: member.circleRoleLabel,
      capabilities: member.capabilities,
      capabilityLabels: member.capabilityLabels,
      areaLabel: member.areaLabel,
      gridIdentifier: member.gridIdentifier,
      participatesInScheduledChecks: member.participatesInScheduledChecks,
      willingToRelay: member.willingToRelay,
      willingToActAsNetControl: member.willingToActAsNetControl,
      receiveOnly: member.receiveOnly,
    })),
  };
}
