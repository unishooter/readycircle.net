import type { LocationPrecision } from '@readycircle/contracts';

export interface RawStationLocation {
  areaLabel: string | null;
  gridIdentifier: string | null;
  precision: LocationPrecision;
  latitude: number | null;
  longitude: number | null;
}

export interface ShapedStationLocation {
  areaLabel: string | null;
  gridIdentifier: string | null;
  precision: LocationPrecision;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Coordinates are never sent to anyone but the owner, regardless of
 * visibility settings, per the milestone's privacy rules. Non-owners only
 * ever receive the generalized area label / grid identifier, and only when
 * the selected precision permits displaying something coarser than
 * "hidden".
 */
export function shapeStationLocation(location: RawStationLocation, isOwner: boolean): ShapedStationLocation {
  if (isOwner) {
    return { ...location };
  }

  const showGeneralized = location.precision !== 'hidden';

  return {
    areaLabel: showGeneralized ? location.areaLabel : null,
    gridIdentifier: location.precision === 'one_km_grid' ? location.gridIdentifier : null,
    precision: location.precision,
    latitude: null,
    longitude: null,
  };
}

export interface RawStationDetail {
  experienceLevel: string | null;
  authorization: string | null;
  goals: string[];
}

/**
 * Fields beyond location that are conservatively hidden from non-owners.
 * Capabilities and station type are considered safe to share with anyone
 * already permitted to view the station (they describe equipment class,
 * not identity), but authorization/experience and personal goals are kept
 * owner + coordinator only to avoid over-sharing operator background.
 */
export function shapeStationDetailFields(
  detail: RawStationDetail,
  viewerCanSeeDetail: boolean,
): RawStationDetail {
  if (viewerCanSeeDetail) return { ...detail };
  return { experienceLevel: null, authorization: null, goals: [] };
}
