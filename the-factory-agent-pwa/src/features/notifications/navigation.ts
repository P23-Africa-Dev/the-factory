'use client';

import { useRouter } from 'next/navigation';
import type { AppNotification } from './types';
import {
  markNotificationNavigation,
  resolveNotificationTarget,
} from '@/lib/notifications/notificationTarget';
import { saveNotificationReturn } from './notificationReturnStore';

/** Resolve the screen an in-app notification opens (agent or manager, per session). */
export function resolveInAppNotificationTarget(notification: AppNotification): string {
  return resolveNotificationTarget({
    type: notification.type,
    actionUrl: notification.actionUrl,
    actionRoute: notification.actionRoute,
    referenceType: notification.referenceType,
    referenceId: notification.referenceId,
    metadata: notification.metadata,
  });
}

export function useNotificationNavigation() {
  const router = useRouter();

  const navigateToNotification = (notification: AppNotification): void => {
    markNotificationNavigation();
    const target = resolveInAppNotificationTarget(notification);
    if (typeof window !== 'undefined') {
      saveNotificationReturn(window.location.pathname, target);
      window.dispatchEvent(new CustomEvent('f23:notification-navigate', { detail: { target } }));
    }
    router.push(target);
  };

  return { navigateToNotification };
}
