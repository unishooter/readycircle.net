import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlaceSearch } from './PlaceSearch.js';

vi.mock('../geocoding/api.js', () => ({
  useGeocodingSearch: (query: string) => ({
    data:
      query.trim().length >= 2
        ? { results: [{ label: 'Springfield, Illinois, United States', latitude: 39.78, longitude: -89.65 }] }
        : undefined,
    isFetching: false,
  }),
}));

function renderPlaceSearch(onSelect = vi.fn()) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <PlaceSearch onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return { onSelect };
}

describe('PlaceSearch', () => {
  it('renders a text input with a helpful placeholder', () => {
    renderPlaceSearch();
    expect(screen.getByPlaceholderText(/search zip code, city, county, or state/i)).toBeInTheDocument();
  });

  it('shows matching results once the debounce elapses and calls onSelect when one is chosen', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPlaceSearch();

    await user.type(screen.getByPlaceholderText(/search zip code, city, county, or state/i), 'Springfield');

    const resultButton = await waitFor(() => screen.getByRole('button', { name: /springfield, illinois/i }), {
      timeout: 2000,
    });
    await user.click(resultButton);

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Springfield, Illinois, United States',
      latitude: 39.78,
      longitude: -89.65,
    });
    // Selecting a result fills the input with its label and hides the list.
    expect(screen.getByPlaceholderText(/search zip code, city, county, or state/i)).toHaveValue(
      'Springfield, Illinois, United States',
    );
    expect(screen.queryByRole('button', { name: /springfield, illinois/i })).not.toBeInTheDocument();
  });
});
