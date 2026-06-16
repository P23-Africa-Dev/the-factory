import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import {
  meetingItemSchema,
  meetingListResponseSchema,
  attendeeCandidateSchema,
  calendarStatusSchema,
} from './schema';
import type {
  Meeting,
  MeetingFilters,
  MeetingListResponse,
  AttendeeCandidate,
  CalendarStatus,
  CreateMeetingPayload,
  UpdateMeetingPayload,
} from './types';

function unwrapData(raw: unknown): unknown {
  const r = raw as Record<string, unknown>;
  return r?.data ?? raw;
}

function unwrapMeeting(raw: unknown): unknown {
  const data = unwrapData(raw) as Record<string, unknown>;
  return data?.meeting ?? data;
}

export const meetingsApi = {
  list: async (filters?: MeetingFilters): Promise<MeetingListResponse> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/meetings', {
      params: { company_id: companyId ?? undefined, ...filters },
    });
    const data = unwrapData(response.data) as Record<string, unknown>;
    return meetingListResponseSchema.parse(data);
  },

  listByUrl: async (url: string): Promise<MeetingListResponse> => {
    const response = await client.get(url);
    const data = unwrapData(response.data) as Record<string, unknown>;
    return meetingListResponseSchema.parse(data);
  },

  get: async (id: number | string): Promise<Meeting> => {
    const companyId = getActiveCompanyId();
    const response = await client.get(`/meetings/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
    return meetingItemSchema.parse(unwrapMeeting(response.data));
  },

  create: async (payload: CreateMeetingPayload & { company_id: number; source_page: 'agent' }): Promise<{
    meeting: Meeting;
    warnings: string[];
  }> => {
    const response = await client.post('/meetings', payload);
    const data = unwrapData(response.data) as Record<string, unknown>;
    return {
      meeting: meetingItemSchema.parse(data?.meeting ?? data),
      warnings: (data?.warnings as string[]) ?? [],
    };
  },

  update: async (id: number | string, payload: Omit<UpdateMeetingPayload, 'company_id'>): Promise<Meeting> => {
    const companyId = getActiveCompanyId();
    const response = await client.patch(`/meetings/${id}`, { ...payload, company_id: companyId });
    return meetingItemSchema.parse(unwrapMeeting(response.data));
  },

  cancel: async (id: number | string): Promise<Meeting> => {
    const companyId = getActiveCompanyId();
    const response = await client.post(`/meetings/${id}/cancel`, {
      company_id: companyId ?? undefined,
    });
    return meetingItemSchema.parse(unwrapMeeting(response.data));
  },

  delete: async (id: number | string): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.delete(`/meetings/${id}`, {
      data: { company_id: companyId ?? undefined },
    });
  },

  resync: async (id: number | string): Promise<Meeting> => {
    const companyId = getActiveCompanyId();
    const response = await client.post(`/meetings/${id}/resync`, {
      company_id: companyId ?? undefined,
    });
    return meetingItemSchema.parse(unwrapMeeting(response.data));
  },

  listCandidates: async (): Promise<AttendeeCandidate[]> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/meetings/attendees', {
      params: { company_id: companyId ?? undefined },
    });
    const data = unwrapData(response.data) as Record<string, unknown>;
    return (data?.candidates as unknown[] ?? []).map((c) => attendeeCandidateSchema.parse(c));
  },

  calendarStatus: async (): Promise<CalendarStatus> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/calendar/integration/status', {
      params: { company_id: companyId ?? undefined },
    });
    const data = unwrapData(response.data) as Record<string, unknown>;
    return calendarStatusSchema.parse(data);
  },
} satisfies Record<string, (...args: never[]) => Promise<unknown>>;
