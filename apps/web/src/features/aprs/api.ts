import { useQuery } from '@tanstack/react-query';
import type { AprsPositionResponse } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

/**
 * Live APRS-derived positions for a Circle's member stations. Short polling
 * interval (rather than a one-shot fetch) since this is meant to read as a
 * "live" map -- the worker's APRS-IS listener can update a station's
 * position at any time.
 */
export function useCircleAprsPositions(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'aprs-positions'],
    queryFn: () => api.get<{ items: AprsPositionResponse[] }>(`/api/v1/circles/${circleId}/aprs-positions`),
    enabled: Boolean(circleId),
    refetchInterval: 60 * 1000,
  });
}
