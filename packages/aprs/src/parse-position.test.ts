import { describe, expect, it } from 'vitest';
import { parseAprsPosition } from './parse-position.js';

describe('parseAprsPosition', () => {
  it('parses a "!" position report without a timestamp', () => {
    const result = parseAprsPosition('KI5ABC-9>APRS,TCPIP*,qAC,T2USA:!3327.50N/09708.00W>Mobile station');
    expect(result).not.toBeNull();
    expect(result?.sourceCallsign).toBe('KI5ABC-9');
    expect(result?.latitude).toBeCloseTo(33 + 27.5 / 60, 5);
    expect(result?.longitude).toBeCloseTo(-(97 + 8 / 60), 5);
    expect(result?.symbolTable).toBe('/');
    expect(result?.symbolCode).toBe('>');
    expect(result?.comment).toBe('Mobile station');
    expect(result?.timestamp).toBeNull();
  });

  it('parses a "=" position report identically to "!"', () => {
    const result = parseAprsPosition('N0CALL>APRS:=4903.50N/07201.75W-Home station');
    expect(result).not.toBeNull();
    expect(result?.sourceCallsign).toBe('N0CALL');
    expect(result?.symbolCode).toBe('-');
    expect(result?.comment).toBe('Home station');
  });

  it('uppercases a lowercase source callsign and trims whitespace', () => {
    const result = parseAprsPosition('  ki5abc-9>aprs:!3327.50N/09708.00W>  ');
    expect(result?.sourceCallsign).toBe('KI5ABC-9');
    expect(result?.comment).toBeNull();
  });

  it('parses a "@" position report with a zulu (DHM) timestamp', () => {
    const referenceDate = new Date('2026-08-15T00:00:00Z');
    const result = parseAprsPosition('KI5ABC-9>APRS:@092345z3327.50N/09708.00W>', referenceDate);
    expect(result).not.toBeNull();
    expect(result?.timestamp?.toISOString()).toBe(new Date(Date.UTC(2026, 7, 9, 23, 45, 0)).toISOString());
  });

  it('parses a "/" position report with an HMS (zulu, "h") timestamp', () => {
    const referenceDate = new Date('2026-08-15T00:00:00Z');
    const result = parseAprsPosition('KI5ABC-9>APRS:/234550h3327.50N/09708.00W>', referenceDate);
    expect(result).not.toBeNull();
    expect(result?.timestamp?.toISOString()).toBe(new Date(Date.UTC(2026, 7, 15, 23, 45, 50)).toISOString());
  });

  it('returns a null timestamp for the local-time ("/") designator, but still parses the position', () => {
    const result = parseAprsPosition('KI5ABC-9>APRS:@092345/3327.50N/09708.00W>');
    expect(result).not.toBeNull();
    expect(result?.timestamp).toBeNull();
    expect(result?.latitude).toBeCloseTo(33 + 27.5 / 60, 5);
  });

  it('returns null for server comment/heartbeat lines', () => {
    expect(parseAprsPosition('# aprsc 2.1.4-g...')).toBeNull();
  });

  it('returns null for lines without a header/payload separator', () => {
    expect(parseAprsPosition('not a valid aprs line')).toBeNull();
  });

  it('returns null for an empty payload', () => {
    expect(parseAprsPosition('KI5ABC-9>APRS:')).toBeNull();
  });

  it('returns null for non-position payload types (messages, objects, telemetry, status, weather)', () => {
    expect(parseAprsPosition('KI5ABC-9>APRS::N0CALL   :Hello{001')).toBeNull();
    expect(parseAprsPosition('KI5ABC-9>APRS:;LEADER   *092345z3327.50N/09708.00W>')).toBeNull();
    expect(parseAprsPosition('KI5ABC-9>APRS:T#123,456,789,012,345,678,00000000')).toBeNull();
    expect(parseAprsPosition('KI5ABC-9>APRS:>Status text here')).toBeNull();
    expect(parseAprsPosition('KI5ABC-9>APRS:_10090556c220s004g005t077r000p000P000h50b09900')).toBeNull();
  });

  it('returns null for a malformed/truncated timestamp-typed packet', () => {
    expect(parseAprsPosition('KI5ABC-9>APRS:@12345')).toBeNull();
    expect(parseAprsPosition('KI5ABC-9>APRS:@abcdefz3327.50N/09708.00W>')).toBeNull();
  });

  it('returns null for Base91-compressed positions (v1 limitation, not the uncompressed lat/lon format)', () => {
    // Compressed format: type char, symbol table, 4-char base91 lat, 4-char
    // base91 lon, symbol code, compression byte -- doesn't match the
    // uncompressed regex, so it's safely ignored rather than misparsed.
    expect(parseAprsPosition('KI5ABC-9>APRS:!/5L!!<*e7>7P[')).toBeNull();
  });

  it('returns null for out-of-range coordinates', () => {
    expect(parseAprsPosition('KI5ABC-9>APRS:!9927.50N/09708.00W>')).toBeNull();
  });

  it('returns null for a missing/empty source callsign', () => {
    expect(parseAprsPosition('>APRS:!3327.50N/09708.00W>')).toBeNull();
  });
});
