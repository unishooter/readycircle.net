/** Positions heard longer ago than this render with a muted/stale marker style. */
export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export function isStale(heardAtIso: string, now: number = Date.now()): boolean {
  return now - new Date(heardAtIso).getTime() > STALE_THRESHOLD_MS;
}

/** "3m ago" / "2h ago" / "5d ago" -- coarse, one unit, no localization needed for this internal debug-ish detail. */
export function formatHeardAgo(heardAtIso: string, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(heardAtIso).getTime());
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
