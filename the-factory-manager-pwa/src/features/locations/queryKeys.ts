import type { SavedLocationFilters } from './types';

export const locationKeys = {
  all: ['saved-locations'] as const,
  lists: () => [...locationKeys.all, 'list'] as const,
  list: (filters?: SavedLocationFilters) =>
    [...locationKeys.lists(), filters ?? {}] as const,
  details: () => [...locationKeys.all, 'detail'] as const,
  detail: (id: number) => [...locationKeys.details(), id] as const,
};
