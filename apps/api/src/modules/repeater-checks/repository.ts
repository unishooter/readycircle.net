import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  circles,
  repeaterChecks,
  repeaters,
  stationLocations,
  stations,
  users,
  type Database,
} from '@readycircle/database';

export interface RepeaterCheckRow {
  id: string;
  circleId: string;
  stationId: string;
  stationName: string;
  repeaterId: string;
  repeaterName: string;
  occurredAt: Date;
  access: string;
  counterpartyNote: string | null;
  heardStationId: string | null;
  heardStationName: string | null;
  signalRating: number | null;
  notes: string | null;
  stationLatitude: number | null;
  stationLongitude: number | null;
  stationLocationOverridden: boolean;
  recordedByUserId: string | null;
  recordedByDisplayName: string | null;
  createdAt: Date;
}

export interface InsertRepeaterCheckInput {
  circleId: string;
  stationId: string;
  repeaterId: string;
  occurredAt: Date;
  access: string;
  counterpartyNote: string | null;
  heardStationId: string | null;
  signalRating: number | null;
  notes: string | null;
  stationLatitude: number | null;
  stationLongitude: number | null;
  stationLocationOverridden: boolean;
  recordedByUserId: string;
}

const heardStation = alias(stations, 'heard_station');

function selectCheckQuery(db: Database) {
  return db
    .select({
      check: repeaterChecks,
      stationName: stations.name,
      repeaterName: repeaters.name,
      heardStationName: heardStation.name,
      recordedByDisplayName: users.displayName,
    })
    .from(repeaterChecks)
    .innerJoin(circles, eq(circles.id, repeaterChecks.circleId))
    .innerJoin(stations, eq(stations.id, repeaterChecks.stationId))
    .innerJoin(repeaters, eq(repeaters.id, repeaterChecks.repeaterId))
    .leftJoin(heardStation, eq(heardStation.id, repeaterChecks.heardStationId))
    .leftJoin(users, eq(users.id, repeaterChecks.recordedByUserId));
}

function toRow(row: {
  check: typeof repeaterChecks.$inferSelect;
  stationName: string;
  repeaterName: string;
  heardStationName: string | null;
  recordedByDisplayName: string | null;
}): RepeaterCheckRow {
  return {
    id: row.check.id,
    circleId: row.check.circleId,
    stationId: row.check.stationId,
    stationName: row.stationName,
    repeaterId: row.check.repeaterId,
    repeaterName: row.repeaterName,
    occurredAt: row.check.occurredAt,
    access: row.check.access,
    counterpartyNote: row.check.counterpartyNote,
    heardStationId: row.check.heardStationId,
    heardStationName: row.heardStationName,
    signalRating: row.check.signalRating,
    notes: row.check.notes,
    stationLatitude: row.check.stationLatitude,
    stationLongitude: row.check.stationLongitude,
    stationLocationOverridden: row.check.stationLocationOverridden,
    recordedByUserId: row.check.recordedByUserId,
    recordedByDisplayName: row.recordedByDisplayName,
    createdAt: row.check.createdAt,
  };
}

export async function getStationCoords(
  db: Database,
  stationId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const [row] = await db
    .select({ latitude: stationLocations.latitude, longitude: stationLocations.longitude })
    .from(stationLocations)
    .where(eq(stationLocations.stationId, stationId))
    .limit(1);
  if (!row || row.latitude == null || row.longitude == null) return null;
  return { latitude: row.latitude, longitude: row.longitude };
}

export async function insertRepeaterCheck(db: Database, input: InsertRepeaterCheckInput): Promise<string> {
  const [row] = await db
    .insert(repeaterChecks)
    .values({
      circleId: input.circleId,
      stationId: input.stationId,
      repeaterId: input.repeaterId,
      occurredAt: input.occurredAt,
      access: input.access,
      counterpartyNote: input.counterpartyNote,
      heardStationId: input.heardStationId,
      signalRating: input.signalRating,
      notes: input.notes,
      stationLatitude: input.stationLatitude,
      stationLongitude: input.stationLongitude,
      stationLocationOverridden: input.stationLocationOverridden,
      recordedByUserId: input.recordedByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to log repeater check.');
  return row.id;
}

export async function getRepeaterCheckById(db: Database, checkId: string): Promise<RepeaterCheckRow | null> {
  const [row] = await selectCheckQuery(db).where(eq(repeaterChecks.id, checkId)).limit(1);
  return row ? toRow(row) : null;
}

export async function listRepeaterChecksByCircle(db: Database, circleId: string): Promise<RepeaterCheckRow[]> {
  const rows = await selectCheckQuery(db)
    .where(eq(repeaterChecks.circleId, circleId))
    .orderBy(desc(repeaterChecks.occurredAt));
  return rows.map(toRow);
}

export async function deleteRepeaterCheck(db: Database, checkId: string): Promise<void> {
  await db.delete(repeaterChecks).where(eq(repeaterChecks.id, checkId));
}

export async function getLatestCheckForStationRepeater(
  db: Database,
  stationId: string,
  repeaterId: string,
): Promise<RepeaterCheckRow | null> {
  const [row] = await selectCheckQuery(db)
    .where(and(eq(repeaterChecks.stationId, stationId), eq(repeaterChecks.repeaterId, repeaterId)))
    .orderBy(desc(repeaterChecks.occurredAt))
    .limit(1);
  return row ? toRow(row) : null;
}
