import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStationInput, StationResponse, UpdateStationInput } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<{ items: StationResponse[] }>('/api/v1/stations'),
  });
}

export function useStation(stationId: string | undefined) {
  return useQuery({
    queryKey: ['stations', stationId],
    queryFn: () => api.get<StationResponse>(`/api/v1/stations/${stationId}`),
    enabled: Boolean(stationId),
  });
}

export function useCreateStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStationInput) => api.post<StationResponse>('/api/v1/stations', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });
}

export function useUpdateStation(stationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStationInput) => api.patch<StationResponse>(`/api/v1/stations/${stationId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });
}

export function useArchiveStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stationId: string) => api.delete<StationResponse>(`/api/v1/stations/${stationId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });
}
