import { and, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  circles,
  contacts,
  repeaters,
  stationCapabilities,
  stationLocations,
  stationRepeaters,
  stations,
  users,
  type Database,
} from '@readycircle/database';
import {
  ANTENNA_TYPE_LABELS,
  AUTHORIZATION_LABELS,
  BACKUP_POWER_LABELS,
  CIRCLE_ROLE_LABELS,
  CIRCLE_TYPE_LABELS,
  describeScenario,
  EXPERIENCE_LEVEL_LABELS,
  RADIO_CAPABILITY_LABELS,
  REPEATER_SERVICE_LABELS,
  STATION_TYPE_LABELS,
  type CircleRole,
  type LocationPrecision,
  type RepeaterService,
  type Scenario,
} from '@readycircle/contracts';
import {
  analyzeRfReachability,
  shapeStationLocation,
  type RfAnalysisResult,
  type RfConfirmedContact,
  type RfRepeater,
  type RfStation,
  type RfStationRepeaterLink,
} from '@readycircle/domain';
import type { PlanContext, PlanContextMember, PlanContextRepeater } from './types.js';

function label(map: Record<string, string>, key: string | null): string | null {
  if (!key) return null;
  return map[key] ?? key;
}

/**
 * Assembles the full generation context for a Circle: identity, active and
 * planned (hypothetical) member stations with capabilities, RF attributes,
 * roles, repeater directory, and member-visible (shaped) locations. This is
 * the single source of facts for both the deterministic sections and the AI
 * advisory prompt. Connectivity results are attached separately (see
 * `analyzeCircleConnectivity`) so coordinates never pass through here.
 */
export async function buildPlanContext(
  db: Database,
  circleId: string,
  scenario: Scenario | null = null,
): Promise<PlanContext> {
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId)).limit(1);
  if (!circle) {
    throw new Error(`Circle ${circleId} not found.`);
  }

  const memberRows = await db
    .select({
      membershipId: circleMemberships.id,
      station: stations,
      operatorName: users.displayName,
      location: stationLocations,
    })
    .from(circleMemberships)
    .innerJoin(
      stations,
      and(eq(stations.id, circleMemberships.stationId), inArray(stations.status, ['active', 'hypothetical'])),
    )
    .innerJoin(users, eq(users.id, circleMemberships.userId))
    .leftJoin(stationLocations, eq(stationLocations.stationId, stations.id))
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')))
    .orderBy(circleMemberships.joinedAt);

  const stationIds = memberRows.map((row) => row.station.id);
  const membershipIds = memberRows.map((row) => row.membershipId);

  const capabilityRows = stationIds.length
    ? await db
        .select({ stationId: stationCapabilities.stationId, capability: stationCapabilities.capability })
        .from(stationCapabilities)
        .where(inArray(stationCapabilities.stationId, stationIds))
    : [];
  const capabilitiesByStation = new Map<string, string[]>();
  for (const row of capabilityRows) {
    const list = capabilitiesByStation.get(row.stationId) ?? [];
    list.push(row.capability);
    capabilitiesByStation.set(row.stationId, list);
  }

  const roleRows = membershipIds.length
    ? await db
        .select({ membershipId: circleRoleAssignments.membershipId, key: circleRoles.key })
        .from(circleRoleAssignments)
        .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
        .where(inArray(circleRoleAssignments.membershipId, membershipIds))
    : [];
  const roleByMembership = new Map(roleRows.map((row) => [row.membershipId, row.key as CircleRole]));

  const repeaterRows = await db.select().from(repeaters).where(eq(repeaters.circleId, circleId));
  const repeaterNameById = new Map(repeaterRows.map((row) => [row.id, row.name]));

  const linkRows = stationIds.length
    ? await db.select().from(stationRepeaters).where(inArray(stationRepeaters.stationId, stationIds))
    : [];
  const linksByStation = new Map<string, { repeaterName: string; access: 'rx' | 'rx_tx' }[]>();
  for (const row of linkRows) {
    const repeaterName = repeaterNameById.get(row.repeaterId);
    if (!repeaterName) continue;
    const list = linksByStation.get(row.stationId) ?? [];
    list.push({ repeaterName, access: row.access as 'rx' | 'rx_tx' });
    linksByStation.set(row.stationId, list);
  }

  const members: PlanContextMember[] = memberRows.map((row) => {
    const shapedLocation = row.location
      ? shapeStationLocation(
          {
            areaLabel: row.location.areaLabel,
            gridIdentifier: row.location.gridIdentifier,
            precision: row.location.precision as LocationPrecision,
            latitude: row.location.latitude,
            longitude: row.location.longitude,
          },
          false,
        )
      : null;
    const capabilities = capabilitiesByStation.get(row.station.id) ?? [];
    const role = roleByMembership.get(row.membershipId) ?? 'member';
    const backupPower = row.station.backupPower ?? [];

    return {
      stationId: row.station.id,
      stationName: row.station.name,
      stationType: row.station.stationType,
      stationTypeLabel: label(STATION_TYPE_LABELS, row.station.stationType) ?? row.station.stationType,
      operatorName: row.operatorName,
      circleRole: role,
      circleRoleLabel: CIRCLE_ROLE_LABELS[role],
      capabilities,
      capabilityLabels: capabilities.map((c) => label(RADIO_CAPABILITY_LABELS, c) ?? c),
      areaLabel: shapedLocation?.areaLabel ?? null,
      gridIdentifier: shapedLocation?.gridIdentifier ?? null,
      experienceLevel: row.station.experienceLevel,
      experienceLevelLabel: label(EXPERIENCE_LEVEL_LABELS, row.station.experienceLevel),
      authorization: row.station.authorization,
      authorizationLabel: label(AUTHORIZATION_LABELS, row.station.authorization),
      goals: row.station.goals,
      participatesInScheduledChecks: row.station.participatesInScheduledChecks,
      willingToRelay: row.station.willingToRelay,
      willingToActAsNetControl: row.station.willingToActAsNetControl,
      receiveOnly: row.station.receiveOnly,
      hypothetical: row.station.status === 'hypothetical',
      transmitPowerWatts: row.station.transmitPowerWatts,
      antennaType: row.station.antennaType,
      antennaTypeLabel: label(ANTENNA_TYPE_LABELS, row.station.antennaType),
      antennaHeightFeet: row.station.antennaHeightFeet,
      backupPower,
      backupPowerLabels: backupPower.map((value) => label(BACKUP_POWER_LABELS, value) ?? value),
      repeaterLinks: linksByStation.get(row.station.id) ?? [],
    };
  });

  const contextRepeaters: PlanContextRepeater[] = repeaterRows.map((row) => ({
    id: row.id,
    name: row.name,
    service: row.service,
    serviceLabel: label(REPEATER_SERVICE_LABELS, row.service) ?? row.service,
    outputFrequencyMhz: row.outputFrequencyMhz,
    offsetOrInput: row.offsetOrInput,
    tone: row.tone,
    areaLabel: row.areaLabel,
    status: row.status,
  }));

  return {
    circle: {
      id: circle.id,
      name: circle.name,
      circleType: circle.circleType,
      circleTypeLabel: label(CIRCLE_TYPE_LABELS, circle.circleType) ?? circle.circleType,
      areaLabel: circle.areaLabel,
      gridOrLocalityLabel: circle.gridOrLocalityLabel,
      shortDescription: circle.shortDescription,
      purpose: circle.purpose,
    },
    members,
    scenario,
    scenarioDescription: scenario ? describeScenario(scenario) : null,
    repeaters: contextRepeaters,
    connectivity: null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Runs the RF reachability engine over the Circle's stations, repeaters,
 * and declared links. Precise coordinates are read here and consumed by the
 * pure engine; only derived values (rounded distances, verdicts, graph
 * results) leave this function.
 */
export async function analyzeCircleConnectivity(db: Database, circleId: string): Promise<RfAnalysisResult> {
  const memberRows = await db
    .select({ station: stations, location: stationLocations })
    .from(circleMemberships)
    .innerJoin(
      stations,
      and(eq(stations.id, circleMemberships.stationId), inArray(stations.status, ['active', 'hypothetical'])),
    )
    .leftJoin(stationLocations, eq(stationLocations.stationId, stations.id))
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')))
    .orderBy(circleMemberships.joinedAt);

  const stationIds = memberRows.map((row) => row.station.id);

  const capabilityRows = stationIds.length
    ? await db
        .select({ stationId: stationCapabilities.stationId, capability: stationCapabilities.capability })
        .from(stationCapabilities)
        .where(inArray(stationCapabilities.stationId, stationIds))
    : [];
  const capabilitiesByStation = new Map<string, string[]>();
  for (const row of capabilityRows) {
    const list = capabilitiesByStation.get(row.stationId) ?? [];
    list.push(row.capability);
    capabilitiesByStation.set(row.stationId, list);
  }

  const rfStations: RfStation[] = memberRows.map((row) => ({
    id: row.station.id,
    name: row.station.name,
    stationType: row.station.stationType as RfStation['stationType'],
    hypothetical: row.station.status === 'hypothetical',
    capabilities: (capabilitiesByStation.get(row.station.id) ?? []) as RfStation['capabilities'],
    receiveOnly: row.station.receiveOnly,
    transmitPowerWatts: row.station.transmitPowerWatts,
    antennaType: row.station.antennaType as RfStation['antennaType'],
    antennaHeightFeet: row.station.antennaHeightFeet,
    latitude: row.location?.latitude ?? null,
    longitude: row.location?.longitude ?? null,
  }));

  const repeaterRows = await db.select().from(repeaters).where(eq(repeaters.circleId, circleId));
  const rfRepeaters: RfRepeater[] = repeaterRows.map((row) => ({
    id: row.id,
    name: row.name,
    service: row.service as RepeaterService,
    status: row.status as RfRepeater['status'],
    latitude: row.latitude,
    longitude: row.longitude,
  }));

  const linkRows = stationIds.length
    ? await db.select().from(stationRepeaters).where(inArray(stationRepeaters.stationId, stationIds))
    : [];
  const rfLinks: RfStationRepeaterLink[] = linkRows.map((row) => ({
    stationId: row.stationId,
    repeaterId: row.repeaterId,
    access: row.access as RfStationRepeaterLink['access'],
  }));

  const contactRows = stationIds.length
    ? await db.select().from(contacts).where(inArray(contacts.stationId, stationIds))
    : [];
  const rfConfirmedContacts: RfConfirmedContact[] = contactRows.map((row) => ({
    stationAId: row.stationId,
    stationBId: row.counterpartyStationId,
    mode: row.mode as RfConfirmedContact['mode'],
    occurredAt: row.occurredAt.toISOString(),
  }));

  return analyzeRfReachability({
    stations: rfStations,
    repeaters: rfRepeaters,
    links: rfLinks,
    confirmedContacts: rfConfirmedContacts,
  });
}
