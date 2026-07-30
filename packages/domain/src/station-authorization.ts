import type { StationVisibility } from '@readycircle/contracts';

/**
 * Everything the authorization layer needs to know about the relationship
 * between the current viewer and a station, already resolved from the
 * database. Keeping this a plain data object (instead of passing repository
 * handles around) is what keeps this module pure and unit-testable.
 */
export interface StationViewerContext {
  isOwner: boolean;
  /** Viewer is an active member of at least one circle this station belongs to. */
  sharesCircleWithViewer: boolean;
  /** Viewer is an active coordinator of at least one circle this station belongs to. */
  isCoordinatorOfSharedCircle: boolean;
}

/**
 * Decides whether a viewer may see a shaped version of a station record at
 * all. `discoverable_aggregate` intentionally does not grant individual
 * detail access in this milestone -- aggregate/nearby discovery is out of
 * scope, so that visibility level only marks intent for a future feature.
 */
export function canViewStation(ctx: StationViewerContext, visibility: StationVisibility): boolean {
  if (ctx.isOwner) return true;
  switch (visibility) {
    case 'circle':
      return ctx.sharesCircleWithViewer;
    case 'coordinators':
      return ctx.isCoordinatorOfSharedCircle;
    case 'private':
    case 'discoverable_aggregate':
    default:
      return false;
  }
}

export function canEditStation(isOwner: boolean): boolean {
  return isOwner;
}

export function canArchiveStation(isOwner: boolean): boolean {
  return isOwner;
}

/**
 * A station may only be added to a circle by the user who owns it.
 */
export function canAddStationToCircle(stationOwnerId: string, requestingUserId: string): boolean {
  return stationOwnerId === requestingUserId;
}
