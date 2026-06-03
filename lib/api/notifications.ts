"use client";

import { apiRequest, API_BASE_URL, ApiEnvelope } from "./onboarding";

export type NotificationCategory =
  | "task"
  | "tracking"
  | "project"
  | "payroll"
  | "crm"
  | "auth"
  | "onboarding"
  | "workforce"
  | "enterprise"
  | "all";

export type NotificationPriority = "low" | "normal" | "high" | "urgent" | "critical";

export type AppNotification = {
  id: number;
  user_id: number;
  company_id?: number | null;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  reference_type?: string | null;
  reference_id?: number | null;
  action_url?: string | null;
  action_route?: string | null;
  metadata?: Record<string, unknown> | null;
  is_in_app_visible: boolean;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  updated_at?: string;
};

export type NotificationPaginationData = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  total?: number;
};

export type NotificationsListData = {
  items: AppNotification[];
  pagination: NotificationPaginationData;
};

export type UnreadCountData = {
  unread_count: number;
};

export type ListNotificationsParams = {
  company_id?: number | string;
  is_read?: 0 | 1;
  category?: NotificationCategory;
  per_page?: number;
  page?: number;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) qs.set(key, String(value));
  });
  const q = qs.toString();
  return q ? `?${q}` : "";
}

export function listNotifications(
  params: ListNotificationsParams,
  token: string
): Promise<ApiEnvelope<NotificationsListData>> {
  const query = buildQuery({
    company_id: params.company_id,
    is_read: params.is_read,
    category: params.category,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return apiRequest<NotificationsListData>({
    method: "GET",
    path: `/notifications${query}`,
    token,
  });
}

export function listNotificationHistory(
  params: ListNotificationsParams,
  token: string
): Promise<ApiEnvelope<NotificationsListData>> {
  const query = buildQuery({
    company_id: params.company_id,
    is_read: params.is_read,
    category: params.category,
    per_page: params.per_page ?? 20,
    page: params.page,
  });
  return apiRequest<NotificationsListData>({
    method: "GET",
    path: `/notifications/history${query}`,
    token,
  });
}

export function getUnreadCount(
  token: string,
  companyId?: number | string
): Promise<ApiEnvelope<UnreadCountData>> {
  const query = buildQuery({ company_id: companyId });
  return apiRequest<UnreadCountData>({
    method: "GET",
    path: `/notifications/unread-count${query}`,
    token,
  });
}

export function markNotificationsRead(
  notificationIds: number[],
  token: string,
  companyId?: number | string
): Promise<ApiEnvelope<unknown>> {
  return apiRequest<unknown>({
    method: "PATCH",
    path: "/notifications/read",
    body: { company_id: companyId, notification_ids: notificationIds },
    token,
  });
}

export function markAllNotificationsRead(
  token: string,
  companyId?: number | string
): Promise<ApiEnvelope<unknown>> {
  return apiRequest<unknown>({
    method: "PATCH",
    path: "/notifications/read-all",
    body: { company_id: companyId },
    token,
  });
}

export async function deleteNotification(
  notificationId: number,
  token: string
): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}
