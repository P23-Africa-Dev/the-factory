'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/notifications';
import { useTrackingStore } from '@/store/tracking';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  attachNativeNotificationClickHandler,
  ensureNativeLocalNotificationPermission,
} from '@/features/tracking/native/nativeLocalNotifications';
import {
  isDocumentHidden,
  notifyTrackingArrived,
  showDeviceAlert,
  showTrackingAlert,
} from '@/lib/notifications/trackingAlerts';

/**
 * Bridges WebSocket / store events to OS device notifications.
 * - Native APK: LocalNotifications for pending inbox items + arrival status flips.
 * - PWA: surfaces when the document is hidden.
 */
export function useDeviceNotificationBridge(): void {
  const pending = useNotificationStore((s) => s.pendingNotification);
  const setPending = useNotificationStore((s) => s.setPendingNotification);
  const liveTaskMap = useTrackingStore((s) => s.liveTaskMap);
  const lastStatusRef = useRef<Record<number, string>>({});
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!isNativeAndroid() || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void ensureNativeLocalNotificationPermission().then((ok) => {
      if (ok) attachNativeNotificationClickHandler();
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const url = pending.action_url?.startsWith('/')
      ? pending.action_url
      : pending.action_url
        ? `/${pending.action_url}`
        : '/notifications';

    const payload = {
      title: pending.title || 'New notification',
      body: pending.message || '',
      tag: `inbox-${pending.notification_id}`,
      url,
    };

    void (async () => {
      if (isNativeAndroid()) {
        await showDeviceAlert(payload);
      } else if (isDocumentHidden()) {
        await showTrackingAlert(payload);
      }
      setPending(null);
    })();
  }, [pending, setPending]);

  useEffect(() => {
    const entries = Object.values(liveTaskMap);
    for (const task of entries) {
      const prev = lastStatusRef.current[task.taskId];
      const next = task.status;
      if (prev === next) continue;
      lastStatusRef.current[task.taskId] = next;
      if (prev == null) continue;
      if (next === 'arrived' && prev !== 'arrived') {
        void notifyTrackingArrived(task.taskId);
      }
    }
  }, [liveTaskMap]);
}
