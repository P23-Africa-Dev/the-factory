import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldActivityApi } from './api';
import type { ClassifyStopPayload, FieldPointPayload } from './types';

export const FIELD_ACTIVITY_KEYS = {
  all: ['field-activity'] as const,
  today: ['field-activity', 'today'] as const,
};

export function useFieldActivityToday(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.today,
    queryFn: () => fieldActivityApi.today(),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useRecordFieldPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, points }: { sessionId: number; points: FieldPointPayload[] }) =>
      fieldActivityApi.recordPoints(sessionId, points),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_KEYS.all });
    },
  });
}

export function useClassifyFieldStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, payload }: { stopId: number; payload: ClassifyStopPayload }) =>
      fieldActivityApi.classifyStop(stopId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_KEYS.all });
    },
  });
}
