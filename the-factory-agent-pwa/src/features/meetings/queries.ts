import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { meetingsApi } from './api';
import { meetingKeys } from './queryKeys';
import type { Meeting, MeetingFilters, CreateMeetingPayload, UpdateMeetingPayload } from './types';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMeetingList(filters?: MeetingFilters) {
  return useInfiniteQuery({
    queryKey: meetingKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      if (pageParam) return meetingsApi.listByUrl(pageParam as string);
      return meetingsApi.list(filters);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.next_page_url ?? null,
  });
}

export function useMeeting(id: number | string | null | undefined) {
  return useQuery({
    queryKey: meetingKeys.detail(id ?? 0),
    queryFn: () => meetingsApi.get(id!),
    enabled: id != null && id !== 0 && id !== '',
  });
}

export function useAttendeeCandidates() {
  return useQuery({
    queryKey: meetingKeys.candidates(),
    queryFn: meetingsApi.listCandidates,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCalendarStatus() {
  return useQuery({
    queryKey: meetingKeys.calendarStatus(),
    queryFn: meetingsApi.calendarStatus,
    staleTime: 1000 * 60 * 2,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateMeeting() {
  return useMutation({
    mutationFn: (payload: CreateMeetingPayload) => {
      const companyId = getActiveCompanyId() ?? 0;
      return meetingsApi.create({ ...payload, company_id: companyId, source_page: 'agent' });
    },
    onSuccess: ({ warnings }) => {
      queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
      warnings.forEach((w) => toast.info(w));
    },
  });
}

export function useUpdateMeeting() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: number | string; payload: Omit<UpdateMeetingPayload, 'company_id'> }) =>
      meetingsApi.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(meetingKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
  });
}

export function useCancelMeeting() {
  return useMutation({
    mutationFn: (id: number | string) => meetingsApi.cancel(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: meetingKeys.detail(id) });
      const previous = queryClient.getQueryData<Meeting>(meetingKeys.detail(id));
      queryClient.setQueryData<Meeting>(meetingKeys.detail(id), (old) =>
        old ? { ...old, status: 'cancelled' } : old,
      );
      return { previous };
    },
    onError: (_, id, context) => {
      queryClient.setQueryData(meetingKeys.detail(id), context?.previous);
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: meetingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
    onSuccess: () => {
      toast.success('Meeting cancelled', 'All attendees have been notified.');
    },
  });
}

export function useDeleteMeeting() {
  return useMutation({
    mutationFn: (id: number | string) => meetingsApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: meetingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
  });
}

export function useResyncMeeting() {
  return useMutation({
    mutationFn: (id: number | string) => meetingsApi.resync(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(meetingKeys.detail(updated.id), updated);
      toast.success('Sync requested', 'Google Calendar sync has been retried.');
    },
  });
}
