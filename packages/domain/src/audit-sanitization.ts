/**
 * Recursively strips keys that must never reach audit metadata (precise
 * coordinates chief among them). Used as the last safety net before an
 * audit event is persisted, in addition to callers being careful about
 * what they pass in.
 */
const FORBIDDEN_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'precise_latitude',
  'precise_longitude',
  'password',
  'sessionSecret',
  'accessToken',
  'idToken',
]);

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditMetadata(entry));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      result[key] = sanitizeAuditMetadata(val);
    }
    return result;
  }
  return value;
}
