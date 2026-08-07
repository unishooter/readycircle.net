import type { CircleRole } from '@readycircle/contracts';

export function canViewCircle(viewerRole: CircleRole | null): boolean {
  return viewerRole !== null;
}

export function canEditCircle(viewerRole: CircleRole | null): boolean {
  return viewerRole === 'coordinator';
}

export function canManageMembers(viewerRole: CircleRole | null): boolean {
  return viewerRole === 'coordinator';
}

/** Any active member may generate a Circle invite link -- not just coordinators. */
export function canCreateCircleInvite(viewerRole: CircleRole | null): boolean {
  return viewerRole !== null;
}

/**
 * Any active member may log a contact (for a station they own -- checked
 * separately at the API layer, since ownership isn't a Circle role).
 */
export function canLogContact(viewerRole: CircleRole | null): boolean {
  return viewerRole !== null;
}

/** Same membership gate as contacts: active members may log repeater checks. */
export function canLogRepeaterCheck(viewerRole: CircleRole | null): boolean {
  return viewerRole !== null;
}

/**
 * Every circle must retain at least one active coordinator. Call this
 * before demoting or removing a coordinator, passing the count of *other*
 * active coordinators (i.e. excluding the membership being changed).
 */
export function wouldLeaveCircleWithoutCoordinator(
  remainingActiveCoordinatorCount: number,
  targetIsCurrentlyActiveCoordinator: boolean,
): boolean {
  if (!targetIsCurrentlyActiveCoordinator) return false;
  return remainingActiveCoordinatorCount === 0;
}
