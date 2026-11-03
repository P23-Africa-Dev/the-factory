import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import {
  notificationListResponseSchema,
  notificationPreferenceSchema,
  unreadCountResponseSchema,
} from './schema';
import type {
  NotificationFilters,
  NotificationListResponse,
  NotificationPreference,
  MarkReadPayload,
  UpdatePreferencesPayload,
} from './types';

function unwrapData(raw: unknown): unknown {
  const r = raw as Record<string, unknown>;
  return r?.data ?? raw;
}

function reportSkippedItems(result: NotificationListResponse, url: string): void {
  if (result.skippedCount === 0) return;
  console.warn(`[Notifications] Skipped ${result.skippedCount} unrecognised notification items for URL: ${url}`);
}

export const notificationsApi = {
  list: async (filters?: NotificationFilters): Promise<NotificationListResponse> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/notifications', {
      params: { company_id: companyId ?? undefined, ...filters },
    });
    const data = unwrapData(response.data) as Record<string, unknown>;
    const result = notificationListResponseSchema.parse(data);
    reportSkippedItems(result, '/notifications');
    return result;
  },

  unreadCount: async (): Promise<number> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/notifications/unread-count', {
      params: { company_id: companyId ?? undefined },
    });
    const data = unwrapData(response.data);
    return unreadCountResponseSchema.parse(data);
  },

  markRead: async (payload: MarkReadPayload): Promise<void> => {
    await client.patch('/notifications/read', payload);
  },

  markUnread: async (payload: MarkReadPayload): Promise<void> => {
    await client.patch('/notifications/unread', payload);
  },

  markAllRead: async (): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch('/notifications/read-all', { company_id: companyId ?? undefined });
  },

  deleteOne: async (id: number): Promise<void> => {
    await client.delete(`/notifications/${id}`);
  },

  getPreferences: async (): Promise<NotificationPreference[]> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/notifications/preferences', {
      params: { company_id: companyId ?? undefined },
    });
    const data = unwrapData(response.data) as Record<string, unknown>;
    return (data?.preferences as unknown[] ?? []).map((p) => notificationPreferenceSchema.parse(p));
  },

  updatePreferences: async (payload: UpdatePreferencesPayload): Promise<NotificationPreference[]> => {
    const response = await client.put('/notifications/preferences', payload);
    const data = unwrapData(response.data) as Record<string, unknown>;
    return (data?.preferences as unknown[] ?? []).map((p) => notificationPreferenceSchema.parse(p));
  },

  listByUrl: async (url: string): Promise<NotificationListResponse> => {
    const response = await client.get(url);
    const data = unwrapData(response.data) as Record<string, unknown>;
    const result = notificationListResponseSchema.parse(data);
    reportSkippedItems(result, url);
    return result;
  },
} satisfies Record<string, (...args: never[]) => Promise<unknown>>;
