import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  attendanceApi,
  type AttendanceSettings,
} from './api';
import { attendanceKeys } from './queryKeys';
import type { ClockInPayload } from './types';

export function useAttendanceMetrics(date?: string, enabled = true) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'metrics', date ?? 'today'],
    queryFn: () => attendanceApi.getMetrics(date ? { date } : undefined),
    enabled,
    staleTime: 45_000,
  });
}

export function useAttendanceRecords(
  params?: {
    date?: string;
    status?: string;
    role?: string;
    clock_state?: string;
    search?: string;
    page?: number;
    per_page?: number;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'records', params],
    queryFn: () => attendanceApi.getRecords(params),
    enabled,
    staleTime: 30_000,
  });
}

export const useAdminAttendanceRecords = useAttendanceRecords;

export function useAgentAttendanceHistory(
  agentId: number | string | null | undefined,
  params?: { from?: string; to?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'agent-history', agentId, params],
    queryFn: () => attendanceApi.getAgentHistory(agentId!, params),
    enabled: enabled && Boolean(agentId),
    staleTime: 60_000,
  });
}

export function useAttendanceSettings(enabled = true) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'settings'],
    queryFn: () => attendanceApi.getSettings(),
    enabled,
    staleTime: 120_000,
  });
}

export const useAdminAttendanceSettings = useAttendanceSettings;

export function useUpdateAttendanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<AttendanceSettings>) => attendanceApi.updateSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...attendanceKeys.all, 'settings'] });
    },
  });
}

export const useUpdateAttendanceSettingsMutation = useUpdateAttendanceSettings;

export function useAttendanceMapSnapshots(date?: string, enabled = true) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'map-snapshots', date ?? 'today'],
    queryFn: () => attendanceApi.getMapSnapshots(date ? { date } : undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function usePayrollSummaries(
  params?: { month?: string; year?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'payroll-summaries', params],
    queryFn: () => attendanceApi.getPayrollSummaries(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useGeneratePayrollSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: { month?: string; start_date?: string; end_date?: string }) =>
      attendanceApi.generatePayrollSummaries(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...attendanceKeys.all, 'payroll-summaries'] });
    },
  });
}

export const useGeneratePayrollSummaryMutation = useGeneratePayrollSummary;

// Legacy exports kept for backward compatibility
export function useTodayAttendance() {
  return useQuery({
    queryKey: attendanceKeys.today(),
    queryFn: attendanceApi.getToday,
    retry: false,
  });
}

export function useClockIn() {
  return useMutation({
    mutationFn: (payload: ClockInPayload) => attendanceApi.clockIn(payload),
  });
}

export function useClockOut() {
  return useMutation({
    mutationFn: (payload: ClockInPayload) => attendanceApi.clockOut(payload),
  });
}
