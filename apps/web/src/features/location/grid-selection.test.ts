import { describe, expect, it } from 'vitest';
import { computeGridSelection } from './grid-selection.js';

describe('computeGridSelection', () => {
  it('returns the 1km cell center and code for a clicked point, not the raw click point', () => {
    const selection = computeGridSelection(37.7749, -122.4194);
    expect(selection.mgrsCode).toBe('10SEG5180');
    // Cell center is close to, but not identical to, the raw click point.
    expect(selection.latitude).not.toBe(37.7749);
    expect(selection.longitude).not.toBe(-122.4194);
    expect(selection.latitude).toBeCloseTo(37.7749, 1);
    expect(selection.longitude).toBeCloseTo(-122.4194, 1);
  });

  it('returns bounds that contain the clicked point', () => {
    const selection = computeGridSelection(48.8584, 2.2945);
    expect(selection.bounds.south).toBeLessThan(48.8584);
    expect(selection.bounds.north).toBeGreaterThan(48.8584);
    expect(selection.bounds.west).toBeLessThan(2.2945);
    expect(selection.bounds.east).toBeGreaterThan(2.2945);
  });

  it('re-deriving from the returned center yields the same code (idempotent within a cell)', () => {
    const first = computeGridSelection(39.7817, -89.6501);
    const second = computeGridSelection(first.latitude, first.longitude);
    expect(second.mgrsCode).toBe(first.mgrsCode);
  });
});
