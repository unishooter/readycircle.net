import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CircleResponse,
  CreateCircleInput,
  CreateMembershipInput,
  MembershipResponse,
  UpdateCircleInput,
  UpdateMembershipInput,
} from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useCircles() {
  return useQuery({
    queryKey: ['circles'],
    queryFn: () => api.get<{ items: CircleResponse[] }>('/api/v1/circles'),
  });
}

export function useCircle(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId],
    queryFn: () => api.get<CircleResponse>(`/api/v1/circles/${circleId}`),
    enabled: Boolean(circleId),
  });
}

export function useCreateCircle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCircleInput) => api.post<CircleResponse>('/api/v1/circles', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles'] }),
  });
}

export function useUpdateCircle(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCircleInput) => api.patch<CircleResponse>(`/api/v1/circles/${circleId}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['circles'] }),
  });
}

export function useCircleMembers(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'members'],
    queryFn: () => api.get<{ items: MembershipResponse[] }>(`/api/v1/circles/${circleId}/members`),
    enabled: Boolean(circleId),
  });
}

export function useAddMember(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMembershipInput) =>
      api.post<MembershipResponse>(`/api/v1/circles/${circleId}/members`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['circles', circleId] });
    },
  });
}

export function useUpdateMember(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, input }: { membershipId: string; input: UpdateMembershipInput }) =>
      api.patch<MembershipResponse>(`/api/v1/circles/${circleId}/members/${membershipId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['circles', circleId] });
    },
  });
}

export function useRemoveMember(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      api.delete<MembershipResponse>(`/api/v1/circles/${circleId}/members/${membershipId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', circleId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['circles', circleId] });
    },
  });
}
