import { deriveGridIdentifier, mgrsCellBounds, mgrsCellCenter, type MgrsCellBounds } from '@readycircle/geo';

export interface GridSelection {
  /** Cell center coordinates -- never the raw click point (see below). */
  latitude: number;
  longitude: number;
  mgrsCode: string;
  bounds: MgrsCellBounds;
}

/**
 * Turns a raw map click into the 1km MGRS cell it falls in. Deliberately
 * returns the cell's center, not the click point itself, so an exact
 * address is never captured by the "grid" picker mode -- only the 1km cell
 * it falls in. Kept free of any Leaflet/React import so it's cheap to unit
 * test without rendering a map.
 */
export function computeGridSelection(latitude: number, longitude: number): GridSelection {
  const mgrsCode = deriveGridIdentifier(latitude, longitude);
  if (!mgrsCode) {
    throw new Error(`Could not derive an MGRS grid cell for (${latitude}, ${longitude}).`);
  }
  const center = mgrsCellCenter(mgrsCode);
  const bounds = mgrsCellBounds(mgrsCode);
  return { latitude: center.latitude, longitude: center.longitude, mgrsCode, bounds };
}
