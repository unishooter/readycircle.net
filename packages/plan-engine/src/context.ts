import { and, eq, inArray } from 'drizzle-orm';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  circles,
  stationCapabilities,
  stationLocations,
  stations,
  users,
  type Database,
} from '@readycircle/database';
import {
  AUTHORIZATION_LABELS,
  CIRCLE_ROLE_LABELS,
  CIRCLE_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  RADIO_CAPABILITY_LABELS,
  STATION_TYPE_LABELS,
  type CircleRole,
  type LocationPrecision,
} from '@readycircle/contracts';
import { shapeStationLocation } from '@readycircle/domain';
import type { PlanContext, PlanContextMember } from './types.js';

function label(map: Record<string, string>, key: string | null): string | null {
  if (!key) return null;
  return map[key] ?? key;
}

/**
 * Assembles the full generation context for a Circle: identity, active
 * member stations with capabilities and roles, and member-visible (shaped)
 * locations. This is the single source of facts for both the deterministic
 * sections and the AI advisory prompt.
 */
export async function buildPlanContext(db: Database, circleId: string): Promise<PlanContext> {
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
      and(eq(stations.id, circleMemberships.stationId), eq(stations.status, 'active')),
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
    };
  });

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
    generatedAt: new Date().toISOString(),
  };
}
