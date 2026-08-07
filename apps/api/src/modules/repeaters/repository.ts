import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  circleMemberships,
  circles,
  repeaters,
  stationLocations,
  stationRepeaters,
  stations,
  type Database,
} from '@readycircle/database';
import type { CreateRepeaterInput, UpdateRepeaterInput } from '@readycircle/contracts';

export type RepeaterRow = typeof repeaters.$inferSelect;
export type StationRepeaterRow = typeof stationRepeaters.$inferSelect;

async function upsertGeography(db: Database, repeaterId: string, latitude?: number | null, longitude?: number | null): Promise<void> {
  if (latitude != null && longitude != null) {
    await db.execute(
      sql`update repeaters set geog = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography where id = ${repeaterId}`,
    );
  } else {
    await db.execute(sql`update repeaters set geog = null where id = ${repeaterId}`);
  }
}

export async function listRepeatersForCircle(db: Database, circleId: string): Promise<RepeaterRow[]> {
  return db
    .select()
    .from(repeaters)
    .where(eq(repeaters.circleId, circleId))
    .orderBy(asc(repeaters.service), asc(repeaters.name));
}

export async function listRepeatersForCircles(
  db: Database,
  circleIds: string[],
): Promise<{ repeater: RepeaterRow; circleName: string }[]> {
  if (circleIds.length === 0) return [];
  return db
    .select({ repeater: repeaters, circleName: circles.name })
    .from(repeaters)
    .innerJoin(circles, eq(circles.id, repeaters.circleId))
    .where(inArray(repeaters.circleId, circleIds))
    .orderBy(asc(repeaters.service), asc(repeaters.name));
}

export async function getRepeaterById(db: Database, repeaterId: string): Promise<RepeaterRow | null> {
  const [row] = await db.select().from(repeaters).where(eq(repeaters.id, repeaterId)).limit(1);
  return row ?? null;
}

export interface InsertRepeaterValues extends CreateRepeaterInput {
  source?: 'manual' | 'repeaterbook';
  externalId?: string | null;
}

export async function createRepeaterRecord(
  db: Database,
  circleId: string,
  addedBy: string,
  input: InsertRepeaterValues,
): Promise<RepeaterRow> {
  const [row] = await db
    .insert(repeaters)
    .values({
      circleId,
      service: input.service,
      name: input.name,
      callsign: input.callsign ?? null,
      outputFrequencyMhz: input.outputFrequencyMhz,
      offsetOrInput: input.offsetOrInput ?? null,
      tone: input.tone ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      areaLabel: input.areaLabel ?? null,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      status: input.status,
      notes: input.notes ?? null,
      addedBy,
    })
    .returning();
  if (!row) throw new Error('Failed to create repeater.');
  await upsertGeography(db, row.id, input.latitude, input.longitude);
  return (await getRepeaterById(db, row.id)) as RepeaterRow;
}

export async function updateRepeaterRecord(
  db: Database,
  repeaterId: string,
  input: UpdateRepeaterInput,
): Promise<RepeaterRow | null> {
  const fields: Partial<typeof repeaters.$inferInsert> = {};
  if (input.service !== undefined) fields.service = input.service;
  if (input.name !== undefined) fields.name = input.name;
  if (input.callsign !== undefined) fields.callsign = input.callsign;
  if (input.outputFrequencyMhz !== undefined) fields.outputFrequencyMhz = input.outputFrequencyMhz;
  if (input.offsetOrInput !== undefined) fields.offsetOrInput = input.offsetOrInput;
  if (input.tone !== undefined) fields.tone = input.tone;
  if (input.latitude !== undefined) fields.latitude = input.latitude;
  if (input.longitude !== undefined) fields.longitude = input.longitude;
  if (input.areaLabel !== undefined) fields.areaLabel = input.areaLabel;
  if (input.status !== undefined) fields.status = input.status;
  if (input.notes !== undefined) fields.notes = input.notes;

  if (Object.keys(fields).length > 0) {
    fields.updatedAt = new Date();
    await db.update(repeaters).set(fields).where(eq(repeaters.id, repeaterId));
  }
  if (input.latitude !== undefined || input.longitude !== undefined) {
    const current = await getRepeaterById(db, repeaterId);
    if (current) await upsertGeography(db, repeaterId, current.latitude, current.longitude);
  }
  return getRepeaterById(db, repeaterId);
}

export async function deleteRepeaterRecord(db: Database, repeaterId: string): Promise<void> {
  await db.delete(repeaters).where(eq(repeaters.id, repeaterId));
}

export async function listExternalIdsForCircle(
  db: Database,
  circleId: string,
  service: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ externalId: repeaters.externalId })
    .from(repeaters)
    .where(and(eq(repeaters.circleId, circleId), eq(repeaters.service, service)));
  return new Set(rows.map((r) => r.externalId).filter((id): id is string => id !== null));
}

/**
 * Average coordinates of the Circle's active member stations that have
 * coordinates on file. Used only server-side to center the RepeaterBook
 * import search -- never returned to clients.
 */
export async function getCircleStationCentroid(
  db: Database,
  circleId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const [row] = await db
    .select({
      latitude: sql<number | null>`avg(${stationLocations.latitude})`,
      longitude: sql<number | null>`avg(${stationLocations.longitude})`,
    })
    .from(circleMemberships)
    .innerJoin(stationLocations, eq(stationLocations.stationId, circleMemberships.stationId))
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')));
  if (!row || row.latitude === null || row.longitude === null) return null;
  return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

// ---------------------------------------------------------------------------
// Station <-> repeater links
// ---------------------------------------------------------------------------

export interface StationRepeaterLinkRecord {
  link: StationRepeaterRow;
  repeater: RepeaterRow;
  circleName: string;
}

export async function listLinksForStation(db: Database, stationId: string): Promise<StationRepeaterLinkRecord[]> {
  const rows = await db
    .select({ link: stationRepeaters, repeater: repeaters, circleName: circles.name })
    .from(stationRepeaters)
    .innerJoin(repeaters, eq(repeaters.id, stationRepeaters.repeaterId))
    .innerJoin(circles, eq(circles.id, repeaters.circleId))
    .where(eq(stationRepeaters.stationId, stationId))
    .orderBy(asc(repeaters.name));
  return rows;
}

export async function listLinksForStations(
  db: Database,
  stationIds: string[],
): Promise<StationRepeaterRow[]> {
  if (stationIds.length === 0) return [];
  return db.select().from(stationRepeaters).where(inArray(stationRepeaters.stationId, stationIds));
}

/** Replaces the full link set for a station (simplest correct semantics for a picker UI). */
export async function replaceLinksForStation(
  db: Database,
  stationId: string,
  links: { repeaterId: string; access: 'rx' | 'rx_tx' }[],
): Promise<void> {
  await db.delete(stationRepeaters).where(eq(stationRepeaters.stationId, stationId));
  if (links.length > 0) {
    await db.insert(stationRepeaters).values(
      links.map((link) => ({ stationId, repeaterId: link.repeaterId, access: link.access })),
    );
  }
}

/**
 * Upserts a single station↔repeater link, keeping the stronger access when
 * one already exists (`rx_tx` wins over `rx`). Used by repeater checks.
 */
export async function upsertStationRepeaterAccess(
  db: Database,
  stationId: string,
  repeaterId: string,
  access: 'rx' | 'rx_tx',
): Promise<void> {
  const [existing] = await db
    .select()
    .from(stationRepeaters)
    .where(and(eq(stationRepeaters.stationId, stationId), eq(stationRepeaters.repeaterId, repeaterId)))
    .limit(1);

  const nextAccess = existing?.access === 'rx_tx' || access === 'rx_tx' ? 'rx_tx' : 'rx';
  if (existing) {
    if (existing.access !== nextAccess) {
      await db
        .update(stationRepeaters)
        .set({ access: nextAccess, updatedAt: new Date() })
        .where(eq(stationRepeaters.id, existing.id));
    }
    return;
  }

  await db.insert(stationRepeaters).values({ stationId, repeaterId, access: nextAccess });
}

/** All Circle ids a station belongs to with an active membership. */
export async function listActiveCircleIdsForStation(db: Database, stationId: string): Promise<string[]> {
  const rows = await db
    .select({ circleId: circleMemberships.circleId })
    .from(circleMemberships)
    .where(and(eq(circleMemberships.stationId, stationId), eq(circleMemberships.status, 'active')));
  return rows.map((r) => r.circleId);
}

/** Member stations of a Circle (id + owner), for validating link targets. */
export async function listMemberStationIds(db: Database, circleId: string): Promise<{ stationId: string; ownerId: string }[]> {
  return db
    .select({ stationId: circleMemberships.stationId, ownerId: stations.ownerId })
    .from(circleMemberships)
    .innerJoin(stations, eq(stations.id, circleMemberships.stationId))
    .where(and(eq(circleMemberships.circleId, circleId), eq(circleMemberships.status, 'active')));
}
