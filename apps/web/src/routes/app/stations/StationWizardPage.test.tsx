import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

function renderWizard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
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
});
