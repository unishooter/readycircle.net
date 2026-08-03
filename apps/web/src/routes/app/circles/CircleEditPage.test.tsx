import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CircleResponse } from '@readycircle/contracts';
import { CircleEditPage } from './CircleEditPage.js';

const baseCircle: CircleResponse = {
  id: 'circle-1',
  circleType: 'neighborhood',
  circleTypeLabel: 'Neighborhood',
  name: 'Riverside Neighbors',
  circleIdentifier: 'RAV7',
  shortDescription: 'Block watch and emergency prep',
  purpose: 'Stay in touch during outages',
  area: { areaLabel: 'Riverside district', gridOrLocalityLabel: null, gridIdentifier: null, gridLatitude: null, gridLongitude: null },
  isPrivate: true,
  requiresApproval: true,
  memberSharingPolicy: 'coordinators_only',
  status: 'active',
  memberCount: 5,
  coordinatorCount: 1,
  viewerRole: 'coordinator',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mutateAsyncMock = vi.fn();
let circleOverride: Partial<CircleResponse> = {};

vi.mock('../../../features/circles/api.js', () => ({
  useCircle: () => ({
    data: { ...baseCircle, ...circleOverride },
    isLoading: false,
    error: null,
  }),
  useUpdateCircle: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

// Real Leaflet map interaction can't be simulated under JSDOM once a value
// with an `mgrsCode` is set (it renders a <Rectangle>, which needs a vector
// renderer JSDOM doesn't support -- see MapLocationPicker.test.tsx), so this
// fake stands in for click-to-select behavior in these tests.
vi.mock('../../../features/location/MapLocationPicker.js', () => ({
  MapLocationPicker: ({ onChange }: { onChange: (value: { latitude: number; longitude: number }) => void }) => (
    <button type="button" onClick={() => onChange({ latitude: 38.8977, longitude: -77.0365 })}>
      Simulate map click
    </button>
  ),
}));

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={['/app/circles/circle-1/edit']}>
      <Routes>
        <Route path="/app/circles/:circleId/edit" element={<CircleEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CircleEditPage', () => {
  beforeEach(() => {
    circleOverride = {};
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(baseCircle);
  });

  it("pre-populates the form from the Circle's current values", () => {
    renderEditPage();
    expect(screen.getByLabelText(/circle name/i)).toHaveValue('Riverside Neighbors');
    expect(screen.getByLabelText(/general area/i)).toHaveValue('Riverside district');
  });

  it('shows the read-only Circle Identifier, not the internal database id', () => {
    renderEditPage();
    expect(screen.getByText('Circle Identifier')).toBeInTheDocument();
    expect(screen.getByText('RAV7')).toBeInTheDocument();
    expect(screen.queryByText(baseCircle.id)).not.toBeInTheDocument();
    // Display-only -- there's no editable form field for it, just the copy button.
    expect(screen.queryByRole('textbox', { name: /circle identifier/i })).not.toBeInTheDocument();
  });

  it('saves edited values via useUpdateCircle', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const nameInput = screen.getByLabelText(/circle name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Circle');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Circle' }));
  });

  it('shows a not-editable message for a non-coordinator instead of the form', () => {
    circleOverride = { viewerRole: 'member' };
    renderEditPage();
    expect(screen.getByText(/you can't edit this circle/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/circle name/i)).not.toBeInTheDocument();
  });

  describe('grid location', () => {
    it('shows no Clear location button or legacy fallback note when no pin or legacy label exists', () => {
      renderEditPage();
      expect(screen.queryByRole('button', { name: /clear location/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/previously recorded/i)).not.toBeInTheDocument();
    });

    it('shows a legacy-label fallback note when no pin exists but a legacy gridOrLocalityLabel does', () => {
      circleOverride = { area: { ...baseCircle.area, gridOrLocalityLabel: 'FN20' } };
      renderEditPage();
      expect(screen.getByText(/previously recorded: fn20/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear location/i })).not.toBeInTheDocument();
    });

    it('shows a Clear location button once a pin is picked, hides the legacy note, and clears the pin on click', async () => {
      const user = userEvent.setup();
      circleOverride = { area: { ...baseCircle.area, gridOrLocalityLabel: 'FN20' } };
      renderEditPage();

      await user.click(screen.getByRole('button', { name: /simulate map click/i }));
      expect(screen.getByRole('button', { name: /clear location/i })).toBeInTheDocument();
      expect(screen.queryByText(/previously recorded/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /clear location/i }));
      expect(screen.queryByRole('button', { name: /clear location/i })).not.toBeInTheDocument();
      expect(screen.getByText(/previously recorded: fn20/i)).toBeInTheDocument();
    });

    it('sends the picked gridLocation on save', async () => {
      const user = userEvent.setup();
      renderEditPage();

      await user.click(screen.getByRole('button', { name: /simulate map click/i }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          area: { areaLabel: 'Riverside district', gridLocation: { latitude: 38.8977, longitude: -77.0365 } },
        }),
      );
    });
  });
});
