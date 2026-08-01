import { describe, expect, it } from 'vitest';
import { deriveGridIdentifier, isValidMgrsCode, mgrsCellBounds, mgrsCellCenter } from './mgrs.js';

describe('deriveGridIdentifier', () => {
  it('derives the 1km MGRS cell for a known coordinate (Eiffel Tower)', () => {
    expect(deriveGridIdentifier(48.8584, 2.2945)).toBe('31UDQ4811');
  });

  it('derives the 1km MGRS cell for a known coordinate (San Francisco)', () => {
    expect(deriveGridIdentifier(37.7749, -122.4194)).toBe('10SEG5180');
  });

  it('returns null when latitude or longitude is missing', () => {
    expect(deriveGridIdentifier(null, -122.4194)).toBeNull();
    expect(deriveGridIdentifier(48.8584, undefined)).toBeNull();
    expect(deriveGridIdentifier(undefined, undefined)).toBeNull();
  });
});

describe('mgrsCellBounds', () => {
  it('returns a bounding box that contains the coordinate the code was derived from', () => {
    // Uses the Eiffel Tower point rather than the San Francisco one from
    // other tests in this file: MGRS cells are aligned to the UTM
    // easting/northing grid, not to lat/lng, so a coordinate can legitimately
    // sit right on a cell's lat/lng-projected edge -- SF's happens to.
    const code = deriveGridIdentifier(48.8584, 2.2945)!;
    const bounds = mgrsCellBounds(code);
    expect(bounds.south).toBeLessThan(48.8584);
    expect(bounds.north).toBeGreaterThan(48.8584);
    expect(bounds.west).toBeLessThan(2.2945);
    expect(bounds.east).toBeGreaterThan(2.2945);
    // A 1km cell should be roughly 0.009 degrees of latitude tall.
    expect(bounds.north - bounds.south).toBeGreaterThan(0.005);
    expect(bounds.north - bounds.south).toBeLessThan(0.02);
  });
});

describe('mgrsCellCenter', () => {
  it('returns the center point of the cell, close to but not identical to the original coordinate', () => {
    const code = deriveGridIdentifier(48.8584, 2.2945)!;
    const center = mgrsCellCenter(code);
    expect(center.latitude).toBeCloseTo(48.8544, 1);
    expect(center.longitude).toBeCloseTo(2.2979, 1);
  });

  it('round-trips: the center of the derived cell re-derives to the same code', () => {
    const code = deriveGridIdentifier(37.7749, -122.4194)!;
    const center = mgrsCellCenter(code);
    expect(deriveGridIdentifier(center.latitude, center.longitude)).toBe(code);
  });
});

describe('isValidMgrsCode', () => {
  it('accepts well-formed MGRS codes at various precisions', () => {
    expect(isValidMgrsCode('31UDQ4811')).toBe(true);
    expect(isValidMgrsCode('10SEG5180')).toBe(true);
    expect(isValidMgrsCode('18SUJ')).toBe(true);
    expect(isValidMgrsCode('18SUJ2306482160')).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(isValidMgrsCode('')).toBe(false);
    expect(isValidMgrsCode('not-a-grid')).toBe(false);
    expect(isValidMgrsCode('FN20QR')).toBe(false);
    expect(isValidMgrsCode('18SUJ123')).toBe(false);
  });
});
