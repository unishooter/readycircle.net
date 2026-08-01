import { useQuery } from '@tanstack/react-query';
import type { GeocodingSearchResponse } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useGeocodingSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['geocoding-search', trimmed],
    queryFn: () => api.get<GeocodingSearchResponse>(`/api/v1/geocoding/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}
