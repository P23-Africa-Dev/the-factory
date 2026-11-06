import type { z } from 'zod';
import type {
  appNotificationSchema,
  notificationCategorySchema,
  notificationPrioritySchema,
  notificationPreferenceSchema,
  notificationListResponseSchema,
} from './schema';

export type AppNotification = z.infer<typeof appNotificationSchema>;
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export type NotificationFilters = {
  company_id?: number;
  is_read?: 0 | 1;
  category?: NotificationCategory;
  per_page?: number;
  page?: number;
};

export type MarkReadPayload = {
  company_id: number;
  notification_ids: number[];
};

export type UpdatePreferencesPayload = {
  company_id: number;
  preferences: Array<{
    category: 'all' | NotificationCategory;
    is_enabled: boolean;
    in_app_enabled: boolean;
    push_enabled: boolean;
    email_enabled: boolean;
    muted_until?: string | null;
    quiet_hours?: { start: string; end: string } | null;
    digest_mode?: string | null;
  }>;
};
