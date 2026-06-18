import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { attendanceApi } from './api';
import { attendanceKeys } from './queryKeys';
import type { ClockInPayload, TodayAttendance } from './types';

export function useTodayAttendance() {
  return useQuery({
    queryKey: attendanceKeys.today(),
    queryFn: attendanceApi.getToday,
  });
}

export function useClockIn() {
  return useMutation({
    mutationFn: (payload: ClockInPayload) => attendanceApi.clockIn(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: attendanceKeys.today() });
      const previous = queryClient.getQueryData<TodayAttendance>(attendanceKeys.today());
      queryClient.setQueryData<TodayAttendance>(attendanceKeys.today(), (old) =>
        old
          ? { ...old, isClockedIn: true, clockInAt: payload.timestamp, clockOutAt: null }
          : old,
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(attendanceKeys.today(), context.previous);
      }
    },
    onSettled: () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: attendanceKeys.today() });
      }
    },
  });
}

export function useClockOut() {
  return useMutation({
    mutationFn: (payload: ClockInPayload) => attendanceApi.clockOut(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: attendanceKeys.today() });
      const previous = queryClient.getQueryData<TodayAttendance>(attendanceKeys.today());
      queryClient.setQueryData<TodayAttendance>(attendanceKeys.today(), (old) =>
        old ? { ...old, isClockedIn: false, clockOutAt: payload.timestamp } : old,
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(attendanceKeys.today(), context.previous);
      }
    },
    onSettled: () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: attendanceKeys.today() });
      }
    },
  });
}
