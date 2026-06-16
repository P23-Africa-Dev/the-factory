import type { MeetingFilters } from './types';

export const meetingKeys = {
  all: ['meetings'] as const,
  lists: () => [...meetingKeys.all, 'list'] as const,
  list: (filters?: MeetingFilters) => [...meetingKeys.lists(), filters] as const,
  details: () => [...meetingKeys.all, 'detail'] as const,
  detail: (id: number | string) => [...meetingKeys.details(), id] as const,
  candidates: () => [...meetingKeys.all, 'candidates'] as const,
  calendarStatus: () => [...meetingKeys.all, 'calendar-status'] as const,
};
