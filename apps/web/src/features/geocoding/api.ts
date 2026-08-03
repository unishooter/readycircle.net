import { useQuery } from '@tanstack/react-query';
import type { GeocodingSearchResponse, ZipLookupResponse } from '@readycircle/contracts';
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

/** Backs the Account page's zip-driven city/state autofill. A 404 (unknown zip) is expected and not retried -- callers should just leave city/state to manual entry. */
export function useZipLookup(zip: string) {
  return useQuery({
    queryKey: ['geocoding-zip', zip],
    queryFn: () => api.get<ZipLookupResponse>(`/api/v1/geocoding/zip/${encodeURIComponent(zip)}`),
    enabled: /^\d{5}$/.test(zip),
    retry: false,
    staleTime: 60_000,
  });
}
