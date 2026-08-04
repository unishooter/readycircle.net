import { and, eq, isNotNull } from 'drizzle-orm';
import { circleMemberships, stationAprsPositions, stations, type Database } from '@readycircle/database';

export interface AprsPositionRow {
  stationId: string;
  stationName: string;
  callsign: string;
  latitude: number;
  longitude: number;
  symbolTable: string;
  symbolCode: string;
  comment: string | null;
  heardAt: Date;
}

/**
 * Every active member station of the Circle that has both a `callsign`
 * configured and a recorded APRS position -- inner-joining
 * `station_aprs_positions` naturally excludes stations that have never been
 * heard, and `isNotNull(stations.callsign)` stops showing a stale position
 * if the callsign is later cleared from the station.
 */
export async function listAprsPositionsForCircle(db: Database, circleId: string): Promise<AprsPositionRow[]> {
  const rows = await db
    .select({
      stationId: stations.id,
      stationName: stations.name,
      callsign: stations.callsign,
      latitude: stationAprsPositions.latitude,
      longitude: stationAprsPositions.longitude,
      symbolTable: stationAprsPositions.symbolTable,
      symbolCode: stationAprsPositions.symbolCode,
      comment: stationAprsPositions.comment,
      heardAt: stationAprsPositions.heardAt,
    })
    .from(circleMemberships)
    .innerJoin(stations, eq(stations.id, circleMemberships.stationId))
    .innerJoin(stationAprsPositions, eq(stationAprsPositions.stationId, stations.id))
    .where(
      and(
        eq(circleMemberships.circleId, circleId),
        eq(circleMemberships.status, 'active'),
        isNotNull(stations.callsign),
      ),
    );

  return rows.map((row) => ({ ...row, callsign: row.callsign as string }));
}
