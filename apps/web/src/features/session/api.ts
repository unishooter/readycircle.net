import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentUser, DevLoginInput, DevUserSummary, SessionResponse, UpdateCurrentUserInput } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<SessionResponse>('/api/v1/session'),
  });
}

export function useCurrentUser(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api.get<CurrentUser>('/api/v1/users/me'),
    enabled,
  });
}

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCurrentUserInput) => api.patch<CurrentUser>('/api/v1/users/me', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
  });
}

export function useDevUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['dev-auth', 'users'],
    queryFn: () => api.get<{ items: DevUserSummary[] }>('/api/v1/dev-auth/users'),
    enabled,
  });
}

export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DevLoginInput) => api.post<SessionResponse>('/api/v1/dev-auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['session'], data);
      queryClient.invalidateQueries();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/v1/logout'),
    onSuccess: () => {
      queryClient.setQueryData<SessionResponse>(['session'], (previous) => ({
        authenticated: false,
        user: null,
        devAuthEnabled: previous?.devAuthEnabled ?? true,
        cognitoEnabled: previous?.cognitoEnabled ?? false,
        inviteOnlyAccess: previous?.inviteOnlyAccess ?? false,
        aprsEnabled: previous?.aprsEnabled ?? true,
      }));
      queryClient.invalidateQueries();
    },
  });
}
