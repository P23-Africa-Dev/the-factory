import { z } from 'zod';

export const meetingStatusSchema = z.enum(['scheduled', 'cancelled', 'completed']);
export const meetingSyncStatusSchema = z.enum(['pending', 'synced', 'failed', 'pending_setup']);
export const attendeeResponseStatusSchema = z.enum(['needs_action', 'accepted', 'tentative', 'declined']);
export const reminderStatusSchema = z.enum(['pending', 'queued', 'sent', 'failed', 'cancelled']);

export const meetingAttendeeSchema = z.object({
  id: z.number(),
  user_id: z.number().nullable(),
  email: z.string(),
  display_name: z.string().nullable(),
  response_status: attendeeResponseStatusSchema,
  is_optional: z.boolean(),
  is_organizer: z.boolean(),
}).transform((d) => ({
  id: d.id,
  userId: d.user_id,
  email: d.email,
  displayName: d.display_name,
  responseStatus: d.response_status,
  isOptional: d.is_optional,
  isOrganizer: d.is_organizer,
}));

export const meetingReminderSchema = z.object({
  id: z.number(),
  recipient_user_id: z.number().nullable(),
  recipient_email: z.string(),
  recipient_name: z.string().nullable(),
  offset_minutes: z.number().nullable(),
  custom_remind_at: z.string().nullable(),
  remind_at: z.string(),
  status: reminderStatusSchema,
  attempts: z.number(),
  next_retry_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  last_error: z.string().nullable(),
}).transform((d) => ({
  id: d.id,
  recipientUserId: d.recipient_user_id,
  recipientEmail: d.recipient_email,
  recipientName: d.recipient_name,
  offsetMinutes: d.offset_minutes,
  customRemindAt: d.custom_remind_at,
  remindAt: d.remind_at,
  status: d.status,
  attempts: d.attempts,
  nextRetryAt: d.next_retry_at,
  sentAt: d.sent_at,
  lastError: d.last_error,
}));

export const reminderConfigSchema = z.object({
  offset_minutes: z.number().nullable().optional(),
  custom_remind_at: z.string().nullable().optional(),
  remind_at: z.string(),
  label: z.string().optional(),
}).transform((d) => ({
  offsetMinutes: d.offset_minutes ?? null,
  customRemindAt: d.custom_remind_at ?? null,
  remindAt: d.remind_at,
  label: d.label ?? null,
}));

export const meetingCreatorSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
});

export const meetingItemSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  created_by_user_id: z.number(),
  project_id: z.number().nullable(),
  task_id: z.number().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  timezone: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  status: meetingStatusSchema,
  source_page: z.enum(['dashboard', 'operations', 'project', 'task', 'api', 'agent']),
  organizer_email_snapshot: z.string().nullable(),
  organizer_name_snapshot: z.string().nullable(),
  reminder_config: z.array(reminderConfigSchema),
  meeting_settings: z.record(z.string(), z.unknown()).nullable(),
  google_event_id: z.string().nullable(),
  google_calendar_id: z.string().nullable(),
  google_meet_url: z.string().nullable(),
  google_html_link: z.string().nullable(),
  sync_status: meetingSyncStatusSchema,
  sync_error_message: z.string().nullable(),
  synced_at: z.string().nullable(),
  external_updated_at: z.string().nullable(),
  attendees: z.array(meetingAttendeeSchema),
  creator: meetingCreatorSchema.nullable(),
  reminders: z.array(meetingReminderSchema),
  created_at: z.string(),
  updated_at: z.string(),
}).transform((d) => ({
  id: d.id,
  companyId: d.company_id,
  createdByUserId: d.created_by_user_id,
  projectId: d.project_id,
  taskId: d.task_id,
  title: d.title,
  description: d.description,
  location: d.location,
  timezone: d.timezone,
  startAt: d.start_at,
  endAt: d.end_at,
  status: d.status,
  sourcePage: d.source_page,
  organizerEmail: d.organizer_email_snapshot,
  organizerName: d.organizer_name_snapshot,
  reminderConfig: d.reminder_config,
  meetingSettings: d.meeting_settings,
  googleEventId: d.google_event_id,
  googleCalendarId: d.google_calendar_id,
  googleMeetUrl: d.google_meet_url,
  googleHtmlLink: d.google_html_link,
  syncStatus: d.sync_status,
  syncErrorMessage: d.sync_error_message,
  syncedAt: d.synced_at,
  externalUpdatedAt: d.external_updated_at,
  attendees: d.attendees,
  creator: d.creator,
  reminders: d.reminders,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
}));

export const meetingListResponseSchema = z.object({
  items: z.array(meetingItemSchema),
  pagination: z.object({
    next_page_url: z.string().nullable(),
    prev_page_url: z.string().nullable(),
    per_page: z.number(),
  }),
});

export const attendeeCandidateSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable().optional(),
  company_role: z.string(),
  internal_role: z.enum(['supervisor', 'agent']).nullable().optional(),
  display_role: z.string(),
  is_active: z.boolean(),
}).transform((d) => ({
  id: d.id,
  name: d.name,
  email: d.email,
  avatarUrl: d.avatar_url ?? null,
  companyRole: d.company_role,
  internalRole: d.internal_role ?? null,
  displayRole: d.display_role,
  isActive: d.is_active,
}));

export const calendarStatusSchema = z.object({
  connected: z.boolean(),
  status: z.string(),
  account_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  last_error_at: z.string().nullable().optional(),
  last_error_message: z.string().nullable().optional(),
  requires_owner_action: z.boolean().optional(),
}).transform((d) => ({
  connected: d.connected,
  status: d.status,
  accountName: d.account_name ?? null,
  email: d.email ?? null,
  lastErrorAt: d.last_error_at ?? null,
  lastErrorMessage: d.last_error_message ?? null,
  requiresOwnerAction: d.requires_owner_action ?? false,
}));

export const createMeetingPayloadSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  timezone: z.string().min(1, 'Timezone is required'),
  start_at: z.string().min(1, 'Start time is required'),
  end_at: z.string().min(1, 'End time is required'),
  description: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  reminders: z.array(z.object({
    offset_minutes: z.number().min(1).optional(),
    remind_at: z.string().optional(),
  })).optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    display_name: z.string().max(255).optional(),
    user_id: z.number().optional(),
    is_optional: z.boolean().optional(),
  })).optional(),
});
