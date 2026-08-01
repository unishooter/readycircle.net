import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapLocationPicker } from './MapLocationPicker.js';

describe('MapLocationPicker', () => {
  it('renders a map and prompts to click when nothing is selected yet (grid mode)', () => {
    render(<MapLocationPicker mode="grid" value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/click the map to select the 1km grid square/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use my current location/i })).toBeInTheDocument();
  });

  // Rendering a value in 'grid' mode also renders a <Rectangle> cell
  // highlight, which needs Leaflet's SVG/Canvas vector renderer -- JSDOM
  // doesn't support this deeply enough for that case to render without
  // erroring, so it's intentionally left uncovered here (per this
  // feature's ADR: deep Leaflet interaction testing under JSDOM is
  // impractical). The 'precise' mode case below (Marker only, no
  // Rectangle) covers the analogous "value is set" rendering path safely.

  it('prompts to drop a pin when nothing is selected yet (precise mode)', () => {
    render(<MapLocationPicker mode="precise" value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/click the map to drop a pin at your exact location/i)).toBeInTheDocument();
  });

  it('shows the selected coordinates once a value is set (precise mode)', () => {
    render(<MapLocationPicker mode="precise" value={{ latitude: 39.78, longitude: -89.65 }} onChange={vi.fn()} />);
    expect(screen.getByText(/39\.78000, -89\.65000/)).toBeInTheDocument();
  });
});
