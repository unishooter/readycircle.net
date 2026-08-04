/**
 * Parses a single APRS-IS "position report" line in TNC2 text format
 * (`SRC>DEST,PATH:payload`). Pure, synchronous, no I/O -- the worker's
 * `AprsIsListener` is the only caller that deals with sockets.
 *
 * v1 scope: only the four position-report payload types (`!`, `=`, `@`,
 * `/`) are handled, and only the uncompressed lat/lon format. Messages,
 * telemetry, objects, weather, status packets, and Base91-compressed
 * positions all return `null` -- see docs/decisions/0017-aprs-live-tracking.md
 * for the trade-off.
 */

export interface ParsedAprsPosition {
  sourceCallsign: string;
  latitude: number;
  longitude: number;
  symbolTable: string;
  symbolCode: string;
  comment: string | null;
  /**
   * The packet's own DHM/HMS timestamp (only present on `@`/`/` payload
   * types), resolved against `referenceDate` for the day/month/year context
   * the packet itself doesn't carry. `null` for timestamp-less types
   * (`!`/`=`) and for the local-time `/` designator, whose UTC offset can't
   * be determined from the packet alone -- callers should fall back to
   * their own packet-receipt time in that case.
   */
  timestamp: Date | null;
}

const POSITION_TYPES = new Set(['!', '=', '@', '/']);
const TIMESTAMPED_TYPES = new Set(['@', '/']);

// Uncompressed position format: ddmm.hhN/dddmm.hhWsC<comment>
// Groups: 1 latDeg, 2 latMinHundredths, 3 latDir, 4 symbolTable,
//         5 lonDeg, 6 lonMinHundredths, 7 lonDir, 8 symbolCode, 9 comment.
const POSITION_PATTERN = /^(\d{2})(\d{2}\.\d{2})([NS])(.)(\d{3})(\d{2}\.\d{2})([EW])(.)([\s\S]*)$/;

const TIMESTAMP_PATTERN = /^(\d{2})(\d{2})(\d{2})([zh/])$/;

function parseAprsTimestamp(raw: string, referenceDate: Date): Date | null {
  const match = TIMESTAMP_PATTERN.exec(raw);
  if (!match) return null;
  const [, a, b, c, designator] = match;

  if (designator === 'z') {
    // DDHHMM, zulu.
    const day = Number(a);
    const hour = Number(b);
    const minute = Number(c);
    return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), day, hour, minute, 0));
  }

  if (designator === 'h') {
    // HHMMSS, zulu -- no day field, so the current UTC day is assumed.
    const hour = Number(a);
    const minute = Number(b);
    const second = Number(c);
    return new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), hour, minute, second),
    );
  }

  // '/' is DDHHMM in the sending station's local time zone, which the
  // packet never specifies -- not reliably convertible to UTC.
  return null;
}

function toSignedDegrees(degrees: string, minutesHundredths: string, negative: boolean): number {
  const value = Number(degrees) + Number(minutesHundredths) / 60;
  return negative ? -value : value;
}

export function parseAprsPosition(rawLine: string, referenceDate: Date = new Date()): ParsedAprsPosition | null {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return null;

  const headerEnd = line.indexOf(':');
  if (headerEnd === -1) return null;
  const header = line.slice(0, headerEnd);
  const payload = line.slice(headerEnd + 1);
  if (!payload) return null;

  const sourceCallsign = header.split('>')[0]?.trim().toUpperCase();
  if (!sourceCallsign) return null;

  const typeChar = payload[0];
  if (!typeChar || !POSITION_TYPES.has(typeChar)) return null;

  let rest = payload.slice(1);
  let timestamp: Date | null = null;
  if (TIMESTAMPED_TYPES.has(typeChar)) {
    if (rest.length < 7) return null;
    const rawTimestamp = rest.slice(0, 7);
    // The timestamp field is fixed-width -- if it isn't even
    // syntactically a DHM/HMS timestamp, the packet is malformed (the
    // rest of the string can't be reliably offset), so bail out entirely
    // rather than risk misparsing a position from the wrong byte offset.
    if (!TIMESTAMP_PATTERN.test(rawTimestamp)) return null;
    timestamp = parseAprsTimestamp(rawTimestamp, referenceDate);
    rest = rest.slice(7);
  }

  const match = POSITION_PATTERN.exec(rest);
  if (!match) return null;

  // All 9 groups are mandatory in POSITION_PATTERN (no `?`), so a
  // successful match always populates every element.
  const [, latDeg, latMin, latDir, symbolTable, lonDeg, lonMin, lonDir, symbolCode, comment] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const latitude = toSignedDegrees(latDeg, latMin, latDir === 'S');
  const longitude = toSignedDegrees(lonDeg, lonMin, lonDir === 'W');
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const trimmedComment = comment.trim();

  return {
    sourceCallsign,
    latitude,
    longitude,
    symbolTable,
    symbolCode,
    comment: trimmedComment.length > 0 ? trimmedComment : null,
    timestamp,
  };
}
