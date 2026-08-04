import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StationWizardPage } from './StationWizardPage.js';

const mutateAsyncMock = vi.fn();
vi.mock('../../../features/stations/api.js', () => ({
  useCreateStation: () => ({ mutateAsync: mutateAsyncMock, isPending: false, isError: false }),
}));

// Avoids exercising a real network call / the debounce timer for a
// component this test isn't focused on -- PlaceSearch has its own tests.
vi.mock('../../../features/geocoding/api.js', () => ({
  useGeocodingSearch: () => ({ data: undefined, isFetching: false }),
}));

const acceptInviteMock = vi.fn();
vi.mock('../../../features/invites/api.js', () => ({
  useAcceptInvite: () => ({ mutateAsync: acceptInviteMock, isPending: false, isError: false }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderWizard(searchPath = '') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/stations/new${searchPath}`]}>
        <StationWizardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StationWizardPage', () => {
  it('blocks moving past the identity step until a name is entered', async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('shows an optional callsign field on the identity step and includes it in the review and submission', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ id: 'station-9' });
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.type(screen.getByLabelText(/callsign/i), 'ki5abc-9');

    // Skip through the remaining steps to Review (Location, Capability,
    // Antenna & power, Experience, Goals, Participation & privacy).
    for (let i = 0; i < 7; i += 1) {
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    expect(screen.getByText('ki5abc-9')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create station/i }));
    expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ callsign: 'ki5abc-9' }));
  });

  it('advances through steps to the location step, defaulting to the broad-area search', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByLabelText(/general area/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search zip code, city, county, or state/i)).toBeInTheDocument();
  });

  it('shows the 1km grid map picker when precision is set to one_km_grid', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.selectOptions(screen.getByLabelText(/display precision/i), 'one_km_grid');
    // Exact-text match: a regex would also match the "Approximate 1km grid
    // square" <option> text, which is always present in the DOM regardless
    // of which precision is selected.
    expect(screen.getByText('1km grid square')).toBeInTheDocument();
    expect(screen.getByText(/click the map to select the 1km grid square/i)).toBeInTheDocument();
  });

  it('shows the precise map picker when precision is set to precise_private', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.selectOptions(screen.getByLabelText(/display precision/i), 'precise_private');
    expect(screen.getByText(/exact location \(only ever visible to you\)/i)).toBeInTheDocument();
  });

  it('shows no location capture UI when precision is hidden', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Home base');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await user.selectOptions(screen.getByLabelText(/display precision/i), 'hidden');
    expect(screen.queryByLabelText(/general area/i)).not.toBeInTheDocument();
    // Exact-text match -- see the comment in the one_km_grid test above.
    expect(screen.queryByText('1km grid square')).not.toBeInTheDocument();
    expect(screen.getByText(/location won't be shown to anyone/i)).toBeInTheDocument();
  });

  it('shortens the wizard for a planned station and submits hypothetical status', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ id: 'station-9' });
    renderWizard();

    await user.type(screen.getByLabelText(/station name/i), 'Future cabin station');
    await user.click(screen.getByLabelText(/this is a planned station/i));
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Location comes next, then straight to review -- no capability,
    // experience, or participation steps for a station with no equipment.
    expect(screen.getByLabelText(/general area/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Planned (no equipment yet)')).toBeInTheDocument();
    expect(screen.queryByText(/capabilities/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create station/i }));
    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'hypothetical', capabilities: [] }),
    );
  });

  it('accepts the carried invite and navigates to the Circle after creating a station from an invite link', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockResolvedValue({ id: 'station-9' });
    acceptInviteMock.mockResolvedValue({ circleId: 'circle-42' });
    renderWizard('?inviteToken=abc123');

    await user.type(screen.getByLabelText(/station name/i), 'Invited station');
    await user.click(screen.getByLabelText(/this is a planned station/i));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('button', { name: /create station.*join circle/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create station.*join circle/i }));

    expect(mutateAsyncMock).toHaveBeenCalled();
    expect(acceptInviteMock).toHaveBeenCalledWith({ stationId: 'station-9' });
    expect(navigateMock).toHaveBeenCalledWith('/app/circles/circle-42');
  });
});
