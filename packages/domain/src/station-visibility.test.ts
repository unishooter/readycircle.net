import { describe, expect, it } from 'vitest';
import { shapeStationDetailFields, shapeStationLocation } from './station-visibility.js';

describe('shapeStationLocation', () => {
  const raw = {
    areaLabel: 'Downtown Springfield',
    gridIdentifier: 'AB12',
    precision: 'one_km_grid' as const,
    latitude: 39.78,
    longitude: -89.65,
  };

  it('returns full precision to the owner', () => {
    expect(shapeStationLocation(raw, true)).toEqual(raw);
  });

  it('never returns coordinates to non-owners', () => {
    const shaped = shapeStationLocation(raw, false);
    expect(shaped.latitude).toBeNull();
    expect(shaped.longitude).toBeNull();
  });

  it('hides area label entirely when precision is hidden', () => {
    const shaped = shapeStationLocation({ ...raw, precision: 'hidden' }, false);
    expect(shaped.areaLabel).toBeNull();
    expect(shaped.gridIdentifier).toBeNull();
  });

  it('only reveals the grid identifier at one_km_grid precision', () => {
    const shaped = shapeStationLocation({ ...raw, precision: 'broad_area' }, false);
    expect(shaped.areaLabel).toBe('Downtown Springfield');
    expect(shaped.gridIdentifier).toBeNull();
  });
});

describe('shapeStationDetailFields', () => {
  const raw = { experienceLevel: 'experienced', authorization: 'amateur_general', goals: ['serve_as_relay'] };

  it('returns full detail when permitted', () => {
    expect(shapeStationDetailFields(raw, true)).toEqual(raw);
  });

  it('strips experience, authorization, and goals otherwise', () => {
    expect(shapeStationDetailFields(raw, false)).toEqual({ experienceLevel: null, authorization: null, goals: [] });
  });
});
