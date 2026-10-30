import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fieldActivityApi,
  type FieldActivitySettings,
} from './api';
import type { ClassifyStopPayload, FieldPointPayload } from './types';

export const FIELD_ACTIVITY_KEYS = {
  all: ['field-activity'] as const,
  today: ['field-activity', 'today'] as const,
  analytics: (params?: Record<string, unknown>) =>
    ['field-activity', 'analytics', params] as const,
  live: ['field-activity', 'live'] as const,
  settings: ['field-activity', 'settings'] as const,
  pendingReview: ['field-activity', 'pending-review'] as const,
  journeys: (params?: Record<string, unknown>) =>
    ['field-activity', 'journeys', params] as const,
  agentJourneys: (agentId: number | string | null | undefined, params?: Record<string, unknown>) =>
    ['field-activity', 'agent-journeys', agentId, params] as const,
  journey: (id: number | string) => ['field-activity', 'journey', id] as const,
};

export function useFieldActivityAnalytics(
  params?: { preset?: string; from?: string; to?: string; agent_id?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.analytics(params),
    queryFn: () => fieldActivityApi.getAnalytics(params),
    enabled,
    staleTime: 45_000,
  });
}

export function useFieldActivityLive(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.live,
    queryFn: () => fieldActivityApi.getLive(),
    enabled,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useAgentJourneys(
  agentId: number | string | null | undefined,
  params?: {
    preset?: string;
    from?: string;
    to?: string;
    per_page?: number;
    page?: number;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.agentJourneys(agentId, params),
    queryFn: () => fieldActivityApi.getAgentJourneys(agentId!, params),
    enabled: enabled && Boolean(agentId),
    staleTime: 45_000,
  });
}

export function useFieldActivitySettings(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.settings,
    queryFn: () => fieldActivityApi.getSettings(),
    enabled,
    staleTime: 120_000,
  });
}

export function useUpdateFieldActivitySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<FieldActivitySettings>) =>
      fieldActivityApi.updateSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_KEYS.all });
    },
  });
}

export function useScanFieldAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fieldActivityApi.scanAlerts(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_KEYS.all });
    },
  });
}

export function useFieldActivityToday(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.today,
    queryFn: () => fieldActivityApi.today(),
    enabled,
    staleTime: 60_000,
  });
}

export function useMyJourneys(
  params?: {
    agent_id?: number;
    preset?: string;
    from?: string;
    to?: string;
    per_page?: number;
    page?: number;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.journeys(params),
    queryFn: () => fieldActivityApi.journeys(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useFieldActivityPendingReview(enabled = true) {
  return useQuery({
    queryKey: FIELD_ACTIVITY_KEYS.pendingReview,
    queryFn: () => fieldActivityApi.pendingReview(),
    enabled,
    staleTime: 120_000,
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
  return useMutation({
    mutationFn: ({ sessionId, points }: { sessionId: number; points: FieldPointPayload[] }) =>
      fieldActivityApi.recordPoints(sessionId, points),
  });
}

export function useClassifyFieldStop() {
  return useMutation({
    mutationFn: ({ stopId, payload }: { stopId: number; payload: ClassifyStopPayload }) =>
      fieldActivityApi.classifyStop(stopId, payload),
  });
}
