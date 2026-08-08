import { describe, expect, it } from 'vitest';
import { aprsFiUrl } from './format.js';

describe('aprsFiUrl', () => {
  it('builds the aprs.fi track URL with a/ prefix and 1-hour window', () => {
    expect(aprsFiUrl('KJ5PYB-9')).toBe(
      'https://aprs.fi/#!call=a%2FKJ5PYB-9&timerange=3600&tail=3600',
    );
  });

  it('uppercases and trims the callsign for the URL', () => {
    expect(aprsFiUrl('  ki5abc-9  ')).toBe(
      'https://aprs.fi/#!call=a%2FKI5ABC-9&timerange=3600&tail=3600',
    );
  });
});
