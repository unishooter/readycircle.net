/**
 * Platform-wide admin authorization -- distinct from Circle-scoped
 * coordinator/member roles in circle-authorization.ts. Only admins can
 * manage other admins or platform settings.
 */
export function canManageAdmins(viewerIsAdmin: boolean): boolean {
  return viewerIsAdmin;
}

/**
 * The app must retain at least one active admin. Call this before demoting
 * or removing an admin, passing the count of *other* active admins (i.e.
 * excluding the account being changed). Mirrors
 * `wouldLeaveCircleWithoutCoordinator`.
 */
export function wouldLeaveAppWithoutAdmin(
  remainingActiveAdminCount: number,
  targetIsCurrentlyAdmin: boolean,
): boolean {
  if (!targetIsCurrentlyAdmin) return false;
  return remainingActiveAdminCount === 0;
}

/**
 * Pure resolution of the effective invite-only-access setting: an explicit
 * admin override always wins; otherwise fall back to the environment
 * default. `null` means "no override configured".
 */
export function resolveInviteOnlyAccess(envDefault: boolean, override: boolean | null): boolean {
  return override ?? envDefault;
}
