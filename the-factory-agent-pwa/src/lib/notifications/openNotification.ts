'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/features/notifications/api';
import { notificationKeys } from '@/features/notifications/queryKeys';
import { queryClient } from '@/lib/queryClient';
import { getActiveCompanyId } from '@/lib/storage/stores';
import {
  openNotificationTarget,
  registerNotificationNavigator,
  resolveNotificationTargetFromPayload,
  takePendingNotification,
  type NotificationClickPayload,
} from './notificationTarget';

/** Best-effort: a tapped push counts as read in the in-app inbox. */
export function markNotificationOpened(notificationId: unknown): void {
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id <= 0) return;
  void notificationsApi
    .markRead({ company_id: getActiveCompanyId() ?? 0, notification_ids: [id] })
    .then(() => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    })
    .catch(() => {
      // Non-fatal — navigation matters more than the read flag.
    });
}

/** Resolve a tapped notification payload for the current mode and navigate to it. */
export function openNotificationPayload(payload: NotificationClickPayload): string {
  const target = resolveNotificationTargetFromPayload(payload);
  markNotificationOpened(payload.notification_id);
  openNotificationTarget(target);
  return target;
}

type SwNotificationMessage = {
  type?: string;
  payload?: NotificationClickPayload;
};

/**
 * Mounted once per signed-in shell (agent + manager):
 * - routes notification taps through the Next router (no full reload)
 * - answers service-worker click messages for already-open windows
 * - opens a notification that was tapped while signed out, after sign-in
 */
export function useNotificationClickRouting(): void {
  const router = useRouter();

  useEffect(() => {
    registerNotificationNavigator((path) => router.push(path));
    return () => registerNotificationNavigator(null);
  }, [router]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<SwNotificationMessage>) => {
      if (event.data?.type !== 'NOTIFICATION_CLICKED') return;
      event.ports?.[0]?.postMessage({ type: 'NOTIFICATION_CLICK_ACK' });
      openNotificationPayload(event.data.payload ?? {});
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const pending = takePendingNotification();
    if (pending) openNotificationPayload(pending);
  }, []);
}
