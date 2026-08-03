import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StationResponse } from '@readycircle/contracts';
import { StationsListPage } from './StationsListPage.js';

function makeStation(overrides: Partial<StationResponse> = {}): StationResponse {
  return {
    id: 'station-1',
    ownerId: 'owner-1',
    name: 'Home Base',
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
    ...overrides,
  };
}

let stationsResult: { data?: { items: StationResponse[] }; isLoading: boolean } = {
  data: { items: [] },
  isLoading: false,
};

vi.mock('../../../features/stations/api.js', () => ({
  useStations: () => stationsResult,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/stations']}>
      <StationsListPage />
    </MemoryRouter>,
  );
}

describe('StationsListPage', () => {
  beforeEach(() => {
    stationsResult = { data: { items: [] }, isLoading: false };
  });

  it('shows an empty state when there are no stations at all', () => {
    renderPage();
    expect(screen.getByText(/no stations yet/i)).toBeInTheDocument();
  });

  it('hides archived stations and the toggle when there are none', () => {
    stationsResult = { data: { items: [makeStation()] }, isLoading: false };
    renderPage();
    expect(screen.getByText('Home Base')).toBeInTheDocument();
    expect(screen.queryByText(/show archived/i)).not.toBeInTheDocument();
  });

  it('hides archived stations by default, sorting them last once revealed', async () => {
    const user = userEvent.setup();
    stationsResult = {
      data: {
        items: [
          makeStation({ id: 'archived-1', name: 'Old Handheld', status: 'archived' }),
          makeStation({ id: 'active-1', name: 'Home Base', status: 'active' }),
        ],
      },
      isLoading: false,
    };
    renderPage();

    expect(screen.getByText('Home Base')).toBeInTheDocument();
    expect(screen.queryByText('Old Handheld')).not.toBeInTheDocument();
    expect(screen.getByText(/show archived \(1\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /show archived/i }));

    const names = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(names).toEqual(['Home Base', 'Old Handheld']);
  });

  it('offers to reveal archived stations when every station is archived', () => {
    stationsResult = { data: { items: [makeStation({ status: 'archived' })] }, isLoading: false };
    renderPage();
    expect(screen.getByText(/no active stations/i)).toBeInTheDocument();
    expect(screen.queryByText('Home Base')).not.toBeInTheDocument();
  });
});
