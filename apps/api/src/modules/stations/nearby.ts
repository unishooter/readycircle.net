import { sql } from 'drizzle-orm';
import type { Database } from '@readycircle/database';

export interface FindNearbyStationsOptions {
  latitude: number;
  longitude: number;
  /** Search radius in meters. */
  radiusMeters: number;
  limit?: number;
}

export interface NearbyStation {
  stationId: string;
  distanceMeters: number;
}

/**
 * Groundwork for a future "find nearby" feature -- not wired to any route
 * yet. Uses the GIST index on `station_locations.geog` (see the
 * `station_locations_geog_gist_idx` migration) via `ST_DWithin`, which can
 * use the index to prune candidates before computing exact distances,
 * unlike a naive `ST_Distance(...) < radius` scan.
 *
 * Only considers active stations with a stored coordinate; callers are
 * responsible for applying any further visibility/authorization filtering
 * to the returned station IDs before exposing them to a viewer -- this
 * function has no notion of who's asking.
 */
export async function findNearbyStations(
  db: Database,
  { latitude, longitude, radiusMeters, limit = 50 }: FindNearbyStationsOptions,
): Promise<NearbyStation[]> {
  const origin = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
  const rows = await db.execute<{ station_id: string; distance_meters: number }>(sql`
    select sl.station_id as station_id, ST_Distance(sl.geog, ${origin}) as distance_meters
    from station_locations sl
    inner join stations s on s.id = sl.station_id
    where s.status = 'active'
      and sl.geog is not null
      and ST_DWithin(sl.geog, ${origin}, ${radiusMeters})
    order by distance_meters asc
    limit ${limit}
  `);

  return rows.map((row) => ({
    stationId: row.station_id,
    distanceMeters: Number(row.distance_meters),
  }));
}
