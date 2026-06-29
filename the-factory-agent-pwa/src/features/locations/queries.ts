import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { crmKeys } from '@/features/crm/queryKeys';
import { locationApi } from './api';
import { locationKeys } from './queryKeys';
import type { CreateSavedLocationInput, SavedLocationFilters } from './types';

export function useSavedLocations(filters?: SavedLocationFilters) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: locationKeys.list(filters),
    queryFn: () => locationApi.list(filters),
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });
}

export function useSavedLocation(id: number | null) {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: id != null ? locationKeys.detail(id) : locationKeys.details(),
    queryFn: () => locationApi.get(id as number),
    enabled: id != null && companyId != null,
  });
}

export function useCreateSavedLocation() {
  return useMutation({
    mutationFn: (input: CreateSavedLocationInput) => locationApi.create(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: locationKeys.lists() });
      if (variables.saveToCrm) {
        queryClient.invalidateQueries({ queryKey: crmKeys.all });
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.info(
          'Location saved locally',
          variables.saveToCrm
            ? 'Map and CRM sync will run when you are back online.'
            : 'Will sync when internet connection is restored.',
        );
      } else {
        toast.success(
          variables.saveToCrm ? 'Saved to map & CRM' : 'Location saved',
          variables.saveToCrm
            ? 'Lead added to Map Leads pipeline.'
            : 'Your location has been added to the map.',
        );
      }
    },
  });
}
