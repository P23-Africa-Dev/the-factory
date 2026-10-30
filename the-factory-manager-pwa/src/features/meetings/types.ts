import type { z } from 'zod';
import type {
  meetingItemSchema,
  meetingAttendeeSchema,
  meetingReminderSchema,
  attendeeCandidateSchema,
  calendarStatusSchema,
  meetingStatusSchema,
  meetingSyncStatusSchema,
  createMeetingPayloadSchema,
  meetingListResponseSchema,
} from './schema';

export type Meeting = z.infer<typeof meetingItemSchema>;
export type MeetingAttendee = z.infer<typeof meetingAttendeeSchema>;
export type MeetingReminder = z.infer<typeof meetingReminderSchema>;
export type AttendeeCandidate = z.infer<typeof attendeeCandidateSchema>;
export type CalendarStatus = z.infer<typeof calendarStatusSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type MeetingSyncStatus = z.infer<typeof meetingSyncStatusSchema>;
export type MeetingListResponse = z.infer<typeof meetingListResponseSchema>;
export type CreateMeetingPayload = z.infer<typeof createMeetingPayloadSchema>;

export type UpdateMeetingPayload = Partial<CreateMeetingPayload> & {
  company_id: number;
  status?: MeetingStatus;
};

export type MeetingFilters = {
  status?: MeetingStatus;
  project_id?: number;
  task_id?: number;
  from?: string;
  to?: string;
  per_page?: number;
};

export type MeetingFormValues = {
  title: string;
  description: string;
  location: string;
  timezone: string;
  startDate: Date;
  endDate: Date;
  reminders: Array<{ offsetMinutes?: number; customRemindAt?: string }>;
  internalAttendees: Array<{ id: number; name: string; email: string; isOptional: boolean }>;
  externalAttendees: Array<{ email: string; displayName: string; isOptional: boolean }>;
};
