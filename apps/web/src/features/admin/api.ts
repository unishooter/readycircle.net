import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserSummary, PlatformSettingsResponse, UpdatePlatformSettingsInput } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ items: AdminUserSummary[] }>('/api/v1/admin/users'),
  });
}

export function useSetUserAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      api.patch<AdminUserSummary>(`/api/v1/admin/users/${userId}`, { isAdmin }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<PlatformSettingsResponse>('/api/v1/admin/settings'),
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePlatformSettingsInput) =>
      api.patch<PlatformSettingsResponse>('/api/v1/admin/settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'settings'], data);
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}
