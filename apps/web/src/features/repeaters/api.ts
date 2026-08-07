import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRepeaterInput,
  ImportRepeatersInput,
  LogRepeaterCheckInput,
  RepeaterCheckResponse,
  RepeaterImportSearchResponse,
  RepeaterResponse,
  RepeaterService,
  SetStationRepeatersInput,
  StationRepeaterOption,
  StationRepeaterResponse,
  UpdateRepeaterInput,
} from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

// ---------------------------------------------------------------------------
// Circle repeater directory
// ---------------------------------------------------------------------------

export function useCircleRepeaters(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'repeaters'],
    queryFn: () => api.get<{ items: RepeaterResponse[] }>(`/api/v1/circles/${circleId}/repeaters`),
    enabled: Boolean(circleId),
  });
}

export function useCreateRepeater(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRepeaterInput) =>
      api.post<RepeaterResponse>(`/api/v1/circles/${circleId}/repeaters`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeaters'] }),
  });
}

export function useUpdateRepeater(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ repeaterId, input }: { repeaterId: string; input: UpdateRepeaterInput }) =>
      api.patch<RepeaterResponse>(`/api/v1/repeaters/${repeaterId}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeaters'] }),
  });
}

export function useDeleteRepeater(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repeaterId: string) => api.delete<null>(`/api/v1/repeaters/${repeaterId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeaters'] }),
  });
}

export function useRepeaterImportSearch(
  circleId: string | undefined,
  service: RepeaterService,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['circles', circleId, 'repeater-import-search', service],
    queryFn: () =>
      api.get<RepeaterImportSearchResponse>(
        `/api/v1/circles/${circleId}/repeaters/import-search?service=${service}`,
      ),
    enabled: Boolean(circleId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useImportRepeaters(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportRepeatersInput) =>
      api.post<{ items: RepeaterResponse[] }>(`/api/v1/circles/${circleId}/repeaters/import`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeaters'] });
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeater-import-search'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Station repeater links
// ---------------------------------------------------------------------------

export function useStationRepeaterLinks(stationId: string | undefined) {
  return useQuery({
    queryKey: ['stations', stationId, 'repeaters'],
    queryFn: () => api.get<{ items: StationRepeaterResponse[] }>(`/api/v1/stations/${stationId}/repeaters`),
    enabled: Boolean(stationId),
  });
}

export function useAvailableRepeaters(stationId: string | undefined) {
  return useQuery({
    queryKey: ['stations', stationId, 'available-repeaters'],
    queryFn: () =>
      api.get<{ items: StationRepeaterOption[] }>(`/api/v1/stations/${stationId}/available-repeaters`),
    enabled: Boolean(stationId),
  });
}

export function useSetStationRepeaters(stationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetStationRepeatersInput) =>
      api.put<{ items: StationRepeaterResponse[] }>(`/api/v1/stations/${stationId}/repeaters`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations', stationId, 'repeaters'] }),
  });
}

// ---------------------------------------------------------------------------
// Repeater checks
// ---------------------------------------------------------------------------

export function useCircleRepeaterChecks(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'repeater-checks'],
    queryFn: () => api.get<{ items: RepeaterCheckResponse[] }>(`/api/v1/circles/${circleId}/repeater-checks`),
    enabled: Boolean(circleId),
  });
}

export function useLogRepeaterCheck(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogRepeaterCheckInput) =>
      api.post<RepeaterCheckResponse>(`/api/v1/circles/${circleId}/repeater-checks`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeater-checks'] });
      void queryClient.invalidateQueries({ queryKey: ['stations', variables.stationId, 'repeaters'] });
    },
  });
}

export function useDeleteRepeaterCheck(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checkId: string) => api.delete<null>(`/api/v1/repeater-checks/${checkId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'repeater-checks'] }),
  });
}
