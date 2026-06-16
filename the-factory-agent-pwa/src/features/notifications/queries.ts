import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { useNotificationStore } from '@/store/notifications';
import { notificationsApi } from './api';
import { notificationKeys } from './queryKeys';
import type { AppNotification, NotificationFilters, UpdatePreferencesPayload } from './types';

// ── Queries ─────────────────────────────────────────────────────────────────

export function useNotifications(filters?: Omit<NotificationFilters, 'page'>) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      if (pageParam) {
        return notificationsApi.listByUrl(pageParam as string);
      }
      return notificationsApi.list(filters);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.next_page_url ?? null,
    refetchOnMount: 'always',
  });
}

export function useUnreadCount() {
  const wsCount = useNotificationStore((s) => s.unreadCount);

  const query = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationsApi.unreadCount,
    staleTime: 1000 * 60,
  });

  const apiCount = query.data ?? 0;
  return { ...query, count: wsCount > 0 ? wsCount : apiCount };
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: notificationsApi.getPreferences,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useMarkRead() {
  return useMutation({
    mutationFn: (ids: number[]) => {
      const companyId = getActiveCompanyId() ?? 0;
      return notificationsApi.markRead({ company_id: companyId, notification_ids: ids });
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() });
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: Parameters<typeof patchPages>[0]) => patchPages(old, ids, true),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export function useMarkUnread() {
  return useMutation({
    mutationFn: (ids: number[]) => {
      const companyId = getActiveCompanyId() ?? 0;
      return notificationsApi.markUnread({ company_id: companyId, notification_ids: ids });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export function useMarkAllRead() {
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() });
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: Parameters<typeof patchPages>[0]) => patchPages(old, 'all', true),
      );
      useNotificationStore.getState().setUnreadCount(0);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export function useDeleteNotification() {
  return useMutation({
    mutationFn: (id: number) => notificationsApi.deleteOne(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists() });
      queryClient.setQueriesData(
        { queryKey: notificationKeys.lists() },
        (old: Parameters<typeof removeFromPages>[0]) => removeFromPages(old, id),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export function useUpdatePreferences() {
  return useMutation({
    mutationFn: (payload: UpdatePreferencesPayload) => notificationsApi.updatePreferences(payload),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type InfiniteData = {
  pages: Array<{ items: AppNotification[]; pagination: unknown }>;
  pageParams: unknown[];
} | undefined;

function patchPages(old: InfiniteData, ids: number[] | 'all', isRead: boolean): InfiniteData {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.map((n) => {
        const match = ids === 'all' || ids.includes(n.id);
        return match ? { ...n, isRead } : n;
      }),
    })),
  };
}

function removeFromPages(old: InfiniteData, id: number): InfiniteData {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.filter((n) => n.id !== id),
    })),
  };
}
