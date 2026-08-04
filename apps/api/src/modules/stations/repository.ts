import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  stationCapabilities,
  stationLocations,
  stationPrivacy,
  stations,
  type Database,
} from '@readycircle/database';
import type { CreateStationInput, StationLocationInput, UpdateStationInput } from '@readycircle/contracts';
import { deriveGridIdentifier } from '@readycircle/geo';

export interface FullStationRecord {
  station: typeof stations.$inferSelect;
  location: typeof stationLocations.$inferSelect | null;
  privacy: typeof stationPrivacy.$inferSelect | null;
  capabilities: string[];
}

type JoinedRow = {
  station: typeof stations.$inferSelect;
  location: typeof stationLocations.$inferSelect | null;
  privacy: typeof stationPrivacy.$inferSelect | null;
};

async function attachCapabilities(db: Database, rows: JoinedRow[]): Promise<FullStationRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.station.id);
  const capabilityRows = await db
    .select()
    .from(stationCapabilities)
    .where(inArray(stationCapabilities.stationId, ids));

  const byStation = new Map<string, string[]>();
  for (const row of capabilityRows) {
    const list = byStation.get(row.stationId) ?? [];
    list.push(row.capability);
    byStation.set(row.stationId, list);
  }

  return rows.map((row) => ({ ...row, capabilities: byStation.get(row.station.id) ?? [] }));
}

function baseStationQuery(db: Database) {
  return db
    .select({ station: stations, location: stationLocations, privacy: stationPrivacy })
    .from(stations)
    .leftJoin(stationLocations, eq(stationLocations.stationId, stations.id))
    .leftJoin(stationPrivacy, eq(stationPrivacy.stationId, stations.id));
}

export async function listStationsByOwner(db: Database, ownerId: string): Promise<FullStationRecord[]> {
  const rows = await baseStationQuery(db).where(eq(stations.ownerId, ownerId)).orderBy(desc(stations.createdAt));
  return attachCapabilities(db, rows);
}

export async function getStationById(db: Database, stationId: string): Promise<FullStationRecord | null> {
  const rows = await baseStationQuery(db).where(eq(stations.id, stationId)).limit(1);
  const [row] = rows;
  if (!row) return null;
  const [withCapabilities] = await attachCapabilities(db, [row]);
  return withCapabilities ?? null;
}

/**
 * The stored `gridIdentifier` is always the canonical 1km MGRS "geo fence
 * code" derived from whatever coordinates are on file, independent of the
 * display `precision` -- see docs/decisions/0009-mgrs-location-capture.md.
 * Clients never supply it directly (there's no free-text grid input; see
 * `stationLocationInputSchema`), so it's computed here rather than trusted
 * from input.
 */
function resolveGridIdentifier(location: StationLocationInput): string | null {
  return deriveGridIdentifier(location.latitude, location.longitude);
}

async function upsertGeography(db: Database, stationId: string, latitude?: number, longitude?: number): Promise<void> {
  if (latitude != null && longitude != null) {
    await db.execute(
      sql`update station_locations set geog = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography where station_id = ${stationId}`,
    );
  } else {
    await db.execute(sql`update station_locations set geog = null where station_id = ${stationId}`);
  }
}

export async function createStationRecord(
  db: Database,
  ownerId: string,
  input: CreateStationInput,
): Promise<FullStationRecord> {
  const [station] = await db
    .insert(stations)
    .values({
      ownerId,
      name: input.name,
      stationType: input.stationType,
      status: input.status,
      experienceLevel: input.experienceLevel ?? null,
      authorization: input.authorization ?? null,
      goals: input.goals,
      participatesInScheduledChecks: input.participatesInScheduledChecks,
      willingToRelay: input.willingToRelay,
      willingToActAsNetControl: input.willingToActAsNetControl,
      receiveOnly: input.receiveOnly,
      transmitPowerWatts: input.transmitPowerWatts ?? null,
      antennaType: input.antennaType ?? null,
      antennaHeightFeet: input.antennaHeightFeet ?? null,
      backupPower: input.backupPower,
      callsign: input.callsign ?? null,
    })
    .returning();
  if (!station) throw new Error('Failed to create station.');

  await db.insert(stationLocations).values({
    stationId: station.id,
    areaLabel: input.location.areaLabel ?? null,
    gridIdentifier: resolveGridIdentifier(input.location),
    precision: input.location.precision,
    latitude: input.location.latitude ?? null,
    longitude: input.location.longitude ?? null,
    locationSource: input.location.locationSource ?? 'manual',
  });
  await upsertGeography(db, station.id, input.location.latitude, input.location.longitude);

  await db.insert(stationPrivacy).values({ stationId: station.id, visibility: input.visibility });

  if (input.capabilities.length > 0) {
    await db.insert(stationCapabilities).values(input.capabilities.map((capability) => ({ stationId: station.id, capability })));
  }

  const record = await getStationById(db, station.id);
  if (!record) throw new Error('Failed to load station after creation.');
  return record;
}

export async function updateStationRecord(
  db: Database,
  stationId: string,
  input: UpdateStationInput,
): Promise<FullStationRecord | null> {
  const stationFields: Partial<typeof stations.$inferInsert> = {};
  if (input.name !== undefined) stationFields.name = input.name;
  if (input.stationType !== undefined) stationFields.stationType = input.stationType;
  if (input.experienceLevel !== undefined) stationFields.experienceLevel = input.experienceLevel;
  if (input.authorization !== undefined) stationFields.authorization = input.authorization;
  if (input.goals !== undefined) stationFields.goals = input.goals;
  if (input.participatesInScheduledChecks !== undefined) {
    stationFields.participatesInScheduledChecks = input.participatesInScheduledChecks;
  }
  if (input.willingToRelay !== undefined) stationFields.willingToRelay = input.willingToRelay;
  if (input.willingToActAsNetControl !== undefined) {
    stationFields.willingToActAsNetControl = input.willingToActAsNetControl;
  }
  if (input.receiveOnly !== undefined) stationFields.receiveOnly = input.receiveOnly;
  if (input.status !== undefined) stationFields.status = input.status;
  if (input.transmitPowerWatts !== undefined) stationFields.transmitPowerWatts = input.transmitPowerWatts;
  if (input.antennaType !== undefined) stationFields.antennaType = input.antennaType;
  if (input.antennaHeightFeet !== undefined) stationFields.antennaHeightFeet = input.antennaHeightFeet;
  if (input.backupPower !== undefined) stationFields.backupPower = input.backupPower;
  if (input.callsign !== undefined) stationFields.callsign = input.callsign;

  if (Object.keys(stationFields).length > 0) {
    stationFields.updatedAt = new Date();
    await db.update(stations).set(stationFields).where(eq(stations.id, stationId));
  }

  if (input.location) {
    await db
      .update(stationLocations)
      .set({
        areaLabel: input.location.areaLabel ?? null,
        gridIdentifier: resolveGridIdentifier(input.location),
        precision: input.location.precision,
        latitude: input.location.latitude ?? null,
        longitude: input.location.longitude ?? null,
        locationSource: input.location.locationSource ?? 'manual',
        updatedAt: new Date(),
      })
      .where(eq(stationLocations.stationId, stationId));
    await upsertGeography(db, stationId, input.location.latitude, input.location.longitude);
  }

  if (input.visibility !== undefined) {
    await db
      .update(stationPrivacy)
      .set({ visibility: input.visibility, updatedAt: new Date() })
      .where(eq(stationPrivacy.stationId, stationId));
  }

  if (input.capabilities !== undefined) {
    await db.delete(stationCapabilities).where(eq(stationCapabilities.stationId, stationId));
    if (input.capabilities.length > 0) {
      await db
        .insert(stationCapabilities)
        .values(input.capabilities.map((capability) => ({ stationId, capability })));
    }
  }

  return getStationById(db, stationId);
}

export async function archiveStationRecord(db: Database, stationId: string): Promise<void> {
  await db.update(stations).set({ status: 'archived', updatedAt: new Date() }).where(eq(stations.id, stationId));
}

export interface ViewerStationContext {
  sharesCircle: boolean;
  isCoordinator: boolean;
}

/**
 * Determines whether the viewing user shares a Circle with the target
 * station (through any of the viewer's own stations) and, if so, whether
 * they hold a coordinator role in that shared Circle. Implemented with the
 * query builder (no raw string interpolation) so station IDs and user IDs
 * are always properly parameterized.
 */
export async function getViewerStationContext(
  db: Database,
  stationId: string,
  viewerUserId: string,
): Promise<ViewerStationContext> {
  const targetMembership = alias(circleMemberships, 'target_membership');
  const viewerMembership = alias(circleMemberships, 'viewer_membership');

  const sharedRows = await db
    .select({ membershipId: viewerMembership.id })
    .from(targetMembership)
    .innerJoin(
      viewerMembership,
      and(eq(viewerMembership.circleId, targetMembership.circleId), eq(viewerMembership.status, 'active')),
    )
    .where(
      and(
        eq(targetMembership.stationId, stationId),
        eq(targetMembership.status, 'active'),
        eq(viewerMembership.userId, viewerUserId),
      ),
    );

  if (sharedRows.length === 0) {
    return { sharesCircle: false, isCoordinator: false };
  }

  const membershipIds = sharedRows.map((row) => row.membershipId);
  const coordinatorRows = await db
    .select({ id: circleRoleAssignments.id })
    .from(circleRoleAssignments)
    .innerJoin(circleRoles, eq(circleRoles.id, circleRoleAssignments.roleId))
    .where(and(inArray(circleRoleAssignments.membershipId, membershipIds), eq(circleRoles.key, 'coordinator')));

  return { sharesCircle: true, isCoordinator: coordinatorRows.length > 0 };
}
