import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StationResponse } from '@readycircle/contracts';
import { StationEditPage } from './StationEditPage.js';

const baseStation: StationResponse = {
  id: 'station-1',
  ownerId: 'owner-1',
  name: "Ana's Home Station",
  stationType: 'home',
  status: 'active',
  location: {
    areaLabel: 'Maple Street neighborhood',
    gridIdentifier: null,
    precision: 'broad_area',
    latitude: 39.5,
    longitude: -89.5,
  },
  capabilities: ['frs'],
  experienceLevel: 'new',
  authorization: 'frs_user',
  goals: ['nearby_family_communication'],
  participatesInScheduledChecks: true,
  willingToRelay: false,
  willingToActAsNetControl: false,
  receiveOnly: false,
  visibility: 'circle',
  transmitPowerWatts: null,
  antennaType: null,
  antennaHeightFeet: null,
  backupPower: [],
  isOwner: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mutateAsyncMock = vi.fn();
let stationOverride: Partial<StationResponse> = {};

vi.mock('../../../features/geocoding/api.js', () => ({
  useGeocodingSearch: () => ({ data: undefined, isFetching: false }),
}));

// The repeater access card manages its own queries/mutations; its behavior
// is covered separately, so stub it out of the form tests.
vi.mock('../../../features/repeaters/StationRepeatersCard.js', () => ({
  StationRepeatersCard: () => null,
}));

vi.mock('../../../features/stations/api.js', () => ({
  useStation: () => ({
    data: { ...baseStation, ...stationOverride },
    isLoading: false,
    error: null,
  }),
  useUpdateStation: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={['/app/stations/station-1/edit']}>
      <Routes>
        <Route path="/app/stations/:stationId/edit" element={<StationEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StationEditPage', () => {
  beforeEach(() => {
    stationOverride = {};
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(baseStation);
  });

  it("pre-populates the form from the station's current values", () => {
    renderEditPage();
    expect(screen.getByLabelText(/station name/i)).toHaveValue("Ana's Home Station");
    expect(screen.getByLabelText(/general area/i)).toHaveValue('Maple Street neighborhood');
  });

  it('saves edited values via useUpdateStation', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const nameInput = screen.getByLabelText(/station name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Station');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Station' }));
  });

  it("shows a not-editable message for a non-owner instead of the form", () => {
    stationOverride = { isOwner: false };
    renderEditPage();
    expect(screen.getByText(/you can't edit this station/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/station name/i)).not.toBeInTheDocument();
  });
});
