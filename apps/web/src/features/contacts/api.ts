import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactResponse, LogContactInput } from '@readycircle/contracts';
import { api } from '../../lib/api-client.js';

export function useMyContacts() {
  return useQuery({
    queryKey: ['contacts', 'mine'],
    queryFn: () => api.get<{ items: ContactResponse[] }>('/api/v1/contacts'),
  });
}

export function useCircleContacts(circleId: string | undefined) {
  return useQuery({
    queryKey: ['circles', circleId, 'contacts'],
    queryFn: () => api.get<{ items: ContactResponse[] }>(`/api/v1/circles/${circleId}/contacts`),
    enabled: Boolean(circleId),
  });
}

export function useStationContacts(stationId: string | undefined) {
  return useQuery({
    queryKey: ['stations', stationId, 'contacts'],
    queryFn: () => api.get<{ items: ContactResponse[] }>(`/api/v1/stations/${stationId}/contacts`),
    enabled: Boolean(stationId),
  });
}

/** Matches every contacts-related query (mine, per-circle, per-station) regardless of the id in the key. */
function invalidateAllContactQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes('contacts') });
}

export function useLogContact(circleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LogContactInput) => api.post<ContactResponse>(`/api/v1/circles/${circleId}/contacts`, input),
    onSuccess: () => invalidateAllContactQueries(queryClient),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => api.delete<void>(`/api/v1/contacts/${contactId}`),
    onSuccess: () => invalidateAllContactQueries(queryClient),
  });
}
