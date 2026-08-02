import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptCircleInviteInput,
  CircleInviteCreatedResponse,
  CircleInvitePreviewResponse,
  CircleInviteSummary,
  CreateCircleInviteInput,
} from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useCircleInvites(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'invites'],
    queryFn: () => api.get<{ items: CircleInviteSummary[] }>(`/api/v1/circles/${circleId}/invites`),
    enabled: Boolean(circleId),
  });
}

export function useCreateCircleInvite(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCircleInviteInput) =>
      api.post<CircleInviteCreatedResponse>(`/api/v1/circles/${circleId}/invites`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'invites'] }),
  });
}

export function useRevokeCircleInvite(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.post<CircleInviteSummary>(`/api/v1/circle-invites/${inviteId}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'invites'] }),
  });
}

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invites', token, 'preview'],
    queryFn: () => api.get<CircleInvitePreviewResponse>(`/api/v1/invites/${token}`),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useAcceptInvite(token: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptCircleInviteInput) =>
      api.post<CircleInviteSummary>(`/api/v1/invites/${token}/accept`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles'] });
      queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });
}
