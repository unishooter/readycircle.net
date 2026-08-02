import type { ConnectivityContent, PlanOverviewContent, PlanRosterContent } from '@readycircle/contracts';
import type { PlanContext } from './types.js';

/**
 * Deterministic section builders. These transcribe database facts from the
 * context -- no inference, no AI -- so the factual backbone of every plan
 * (who is in the Circle, what equipment they have, who can reach whom) is
 * always trustworthy.
 */

export function buildOverviewContent(context: PlanContext): PlanOverviewContent {
  return {
    circleName: context.circle.name,
    circleTypeLabel: context.circle.circleTypeLabel,
    areaLabel: context.circle.areaLabel,
    purpose: context.circle.purpose,
    memberCount: context.members.length,
    generatedAt: context.generatedAt,
    scenarioDescription: context.scenarioDescription,
  };
}

/**
 * Transcribes the RF reachability engine's output. The narrative is
 * assembled from the computed facts (never the AI) so the coverage verdict
 * in a printed plan is always traceable to the deterministic analysis.
 */
export function buildConnectivityContent(context: PlanContext): ConnectivityContent {
  const connectivity = context.connectivity;
  if (!connectivity) {
    throw new Error('Connectivity analysis has not been attached to the context.');
  }

  const total = connectivity.stations.length;
  const located = connectivity.stations.filter((s) => s.hasLocation).length;
  const planned = connectivity.stations.filter((s) => s.hypothetical).length;
  const sentences: string[] = [
    `Analyzed ${total} station${total === 1 ? '' : 's'} (${located} with locations${
      planned > 0 ? `, ${planned} planned` : ''
    }) and ${context.repeaters.length} repeater${context.repeaters.length === 1 ? '' : 's'} in the directory.`,
    connectivity.baselineRelay.summary,
  ];
  if (connectivity.gaps.length > 0) {
    sentences.push(
      `${connectivity.gaps.length} gap${connectivity.gaps.length === 1 ? '' : 's'} identified -- see below.`,
    );
  }

  return {
    narrative: sentences.join(' '),
    baselineRelay: connectivity.baselineRelay,
    stations: connectivity.stations,
    links: connectivity.links,
    gaps: connectivity.gaps,
    repeatersConsidered: connectivity.repeatersConsidered,
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
