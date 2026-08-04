/**
 * Builds the APRS-IS "buddy list" filter line for a set of callsigns, per
 * the protocol's `filter` command (https://www.aprs-is.net/javaprsfilter.aspx).
 * Returns `null` when there are no callsigns to filter on -- callers should
 * treat that as "there is nothing to listen for yet" rather than sending a
 * filter that would (incorrectly) pass every packet on the server.
 */
export function buildAprsIsFilter(callsigns: string[]): string | null {
  const unique = Array.from(
    new Set(callsigns.map((callsign) => callsign.trim().toUpperCase()).filter((callsign) => callsign.length > 0)),
  );
  if (unique.length === 0) return null;
  return `filter b/${unique.join('/')}`;
}
