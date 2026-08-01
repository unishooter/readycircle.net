import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePlanInput,
  PlanDetailResponse,
  PlanResponse,
  PlanVersionDetail,
  PlanVersionSummary,
} from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

/** Poll every few seconds while any version is still generating or its document is pending. */
function isInFlight(version: PlanVersionSummary | null | undefined): boolean {
  if (!version) return false;
  return version.status === 'generating' || version.document?.status === 'pending';
}

const POLL_INTERVAL_MS = 3000;

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ items: PlanResponse[] }>('/api/v1/plans'),
    refetchInterval: (query) =>
      query.state.data?.items.some((plan) => isInFlight(plan.latestVersion)) ? POLL_INTERVAL_MS : false,
  });
}

export function useCirclePlans(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'plans'],
    queryFn: () => api.get<{ items: PlanResponse[] }>(`/api/v1/circles/${circleId}/plans`),
    enabled: Boolean(circleId),
    refetchInterval: (query) =>
      query.state.data?.items.some((plan) => isInFlight(plan.latestVersion)) ? POLL_INTERVAL_MS : false,
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: ['plans', planId],
    queryFn: () => api.get<PlanDetailResponse>(`/api/v1/plans/${planId}`),
    enabled: Boolean(planId),
    refetchInterval: (query) =>
      query.state.data?.versions.some((version) => isInFlight(version)) ? POLL_INTERVAL_MS : false,
  });
}

export function usePlanVersion(planId: string | undefined, versionId: string | undefined) {
  return useQuery({
    queryKey: ['plans', planId, 'versions', versionId],
    queryFn: () => api.get<PlanVersionDetail>(`/api/v1/plans/${planId}/versions/${versionId}`),
    enabled: Boolean(planId && versionId),
    refetchInterval: (query) => (isInFlight(query.state.data) ? POLL_INTERVAL_MS : false),
  });
}

export function useGeneratePlan(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanInput = {}) =>
      api.post<PlanResponse>(`/api/v1/circles/${circleId}/plans`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      void queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'plans'] });
    },
  });
}

export function useRegeneratePlan(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanResponse>(`/api/v1/plans/${planId}/regenerate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function usePublishVersion(planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<PlanVersionSummary>(`/api/v1/plans/${planId}/versions/${versionId}/publish`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

/** Direct download URL for a rendered plan document (served by the API with auth). */
export function planDocumentUrl(planId: string, versionId: string): string {
  return `/api/v1/plans/${planId}/versions/${versionId}/document`;
}
