import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldActivityApi } from './api';
import type { ClassifyStopPayload, FieldPointPayload } from './types';

export const FIELD_ACTIVITY_KEYS = {
  all: ['field-activity'] as const,
  today: ['field-activity', 'today'] as const,
  pendingReview: ['field-activity', 'pending-review'] as const,
  journeys: (preset = 'last_30_days') => ['field-activity', 'journeys', preset] as const,
  journey: (id: number | string) => ['field-activity', 'journey', id] as const,
};

export function useFieldActivityToday(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.today,
    queryFn: () => fieldActivityApi.today(),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useMyJourneys(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.journeys(),
    queryFn: () => fieldActivityApi.journeys({ preset: 'last_30_days' }),
    enabled,
    staleTime: 60_000,
  });
}

export function useFieldActivityPendingReview(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.pendingReview,
    queryFn: () => fieldActivityApi.pendingReview(),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useJourneyDetail(sessionId: number | string | undefined, enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.journey(sessionId ?? 'none'),
    queryFn: () => fieldActivityApi.journeyDetail(Number(sessionId)),
    enabled: enabled && !!sessionId,
    staleTime: 60_000,
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
