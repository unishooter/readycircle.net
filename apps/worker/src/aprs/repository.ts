import { isNotNull, sql } from 'drizzle-orm';
import { stationAprsPositions, stations, type Database } from '@readycircle/database';
import type { ParsedAprsPosition } from '@readycircle/aprs';
import type { CallsignMap } from './aprs-is-listener.js';

/** Every configured station callsign (uppercase, as stored), mapped to its stationId. */
export async function loadCallsignMap(db: Database): Promise<CallsignMap> {
  const rows = await db
    .select({ id: stations.id, callsign: stations.callsign })
    .from(stations)
    .where(isNotNull(stations.callsign));

  const map: CallsignMap = new Map();
  for (const row of rows) {
    if (row.callsign) map.set(row.callsign.toUpperCase(), row.id);
  }
  return map;
}

export interface UpsertAprsPositionInput {
  stationId: string;
  position: ParsedAprsPosition;
  rawLine: string;
  /** The packet's own timestamp when parseable, otherwise the time it was received. */
  heardAt: Date;
}

/**
 * Upserts the station's single latest APRS-derived position row (mirrors
 * `station_locations`'s "one row per station" shape). The raw
 * ST_SetSRID/ST_MakePoint update is a separate statement, matching the
 * existing pattern for geography columns elsewhere in this codebase (see
 * `apps/api/src/modules/stations/repository.ts`'s `upsertGeography`).
 */
export async function upsertStationAprsPosition(db: Database, input: UpsertAprsPositionInput): Promise<void> {
  const { stationId, position, rawLine, heardAt } = input;
  const fields = {
    sourceCallsign: position.sourceCallsign,
    latitude: position.latitude,
    longitude: position.longitude,
    symbolTable: position.symbolTable,
    symbolCode: position.symbolCode,
    comment: position.comment,
    heardAt,
    rawPacket: rawLine,
    updatedAt: new Date(),
  };

  await db
    .insert(stationAprsPositions)
    .values({ stationId, ...fields })
    .onConflictDoUpdate({ target: stationAprsPositions.stationId, set: fields });

  await db.execute(
    sql`update station_aprs_positions set geog = ST_SetSRID(ST_MakePoint(${position.longitude}, ${position.latitude}), 4326)::geography where station_id = ${stationId}`,
  );
}
