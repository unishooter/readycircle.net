import { forward, inverse, toPoint } from 'mgrs';

/**
 * 1km MGRS accuracy: 2 digits per coordinate (e.g. "18SUJ2306"), per
 * https://github.com/proj4js/mgrs's `forward(ll, accuracy)` contract (0 = 100km,
 * 1 = 10km, 2 = 1km, 3 = 100m, 4 = 10m, 5 = 1m). This is the single canonical
 * precision used for the stored `gridIdentifier` "geo fence code" -- see
 * docs/decisions/0009-mgrs-location-capture.md for why this is independent of
 * the display `precision` enum.
 */
const ONE_KM_ACCURACY = 2;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MgrsCellBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Derives the canonical 1km MGRS "geo fence code" for a coordinate. Returns
 * null when no coordinate is available -- callers should treat that as "no
 * grid identifier can be computed", not as an error.
 */
export function deriveGridIdentifier(latitude?: number | null, longitude?: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  return forward([longitude, latitude], ONE_KM_ACCURACY);
}

/**
 * Bounding box of the 1km cell identified by an MGRS code, for drawing a
 * highlight rectangle on a map.
 */
export function mgrsCellBounds(code: string): MgrsCellBounds {
  const [west, south, east, north] = inverse(code);
  return { south, west, north, east };
}

/**
 * Center point of the 1km cell identified by an MGRS code. Used as the
 * coordinate actually persisted for grid-mode picks, so an exact click point
 * is never stored -- only the 1km cell it falls in.
 */
export function mgrsCellCenter(code: string): LatLng {
  const [longitude, latitude] = toPoint(code);
  return { latitude, longitude };
}

/**
 * Loose structural validation of an MGRS string: a UTM/UPS grid zone
 * designator, a 100km square identifier, and an even, up-to-10-digit
 * easting/northing pair. Intentionally permissive (doesn't validate zone
 * letter/number combinations against real UTM zone boundaries) -- it's a
 * defensive check against garbage input, not a full MGRS conformance
 * validator.
 */
export function isValidMgrsCode(code: string): boolean {
  return /^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(\d{2}|\d{4}|\d{6}|\d{8}|\d{10})?$/.test(code.trim().toUpperCase());
}
