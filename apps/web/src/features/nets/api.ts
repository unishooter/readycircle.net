import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CloseNetSessionInput,
  CreateNetInput,
  NetDetailResponse,
  NetResponse,
  NetSessionResponse,
  OpenNetSessionInput,
  RecordCheckinInput,
  UpdateNetInput,
} from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

const OPEN_SESSION_POLL_MS = 5000;

export function useNets() {
  return useQuery({
    queryKey: ['nets'],
    queryFn: () => api.get<{ items: NetResponse[] }>('/api/v1/nets'),
  });
}

export function useCircleNets(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'nets'],
    queryFn: () => api.get<{ items: NetResponse[] }>(`/api/v1/circles/${circleId}/nets`),
    enabled: Boolean(circleId),
  });
}

export function useNet(netId: string | undefined) {
  return useQuery({
    queryKey: ['nets', netId],
    queryFn: () => api.get<NetDetailResponse>(`/api/v1/nets/${netId}`),
    enabled: Boolean(netId),
    // Poll while a session is open so check-ins from other members appear live.
    refetchInterval: (query) =>
      query.state.data?.sessions.some((session) => session.status === 'open') ? OPEN_SESSION_POLL_MS : false,
  });
}

export function useCreateNet(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNetInput) => api.post<NetResponse>(`/api/v1/circles/${circleId}/nets`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
      void queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'nets'] });
    },
  });
}

export function useUpdateNet(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNetInput) => api.patch<NetResponse>(`/api/v1/nets/${netId}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
    },
  });
}

export function useArchiveNet(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NetResponse>(`/api/v1/nets/${netId}/archive`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
    },
  });
}

export function useOpenSession(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenNetSessionInput = {}) =>
      api.post<NetSessionResponse>(`/api/v1/nets/${netId}/sessions`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
    },
  });
}

export function useCloseSession(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: CloseNetSessionInput & { sessionId: string }) =>
      api.post<NetSessionResponse>(`/api/v1/nets/${netId}/sessions/${sessionId}/close`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
    },
  });
}

export function useRecordCheckin(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...input }: RecordCheckinInput & { sessionId: string }) =>
      api.post<NetSessionResponse>(`/api/v1/nets/${netId}/sessions/${sessionId}/checkins`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets', netId] });
    },
  });
}

export function useRemoveCheckin(netId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, stationId }: { sessionId: string; stationId: string }) =>
      api.delete<NetSessionResponse>(`/api/v1/nets/${netId}/sessions/${sessionId}/checkins/${stationId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nets', netId] });
    },
  });
}
