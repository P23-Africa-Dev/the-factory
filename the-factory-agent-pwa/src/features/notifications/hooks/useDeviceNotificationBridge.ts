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
  resolveNotificationTargetFromPayload,
  type NotificationClickPayload,
} from '@/lib/notifications/notificationTarget';
import { useNotificationClickRouting } from '@/lib/notifications/openNotification';
import {
  isDocumentHidden,
  notifyTrackingArrived,
  notifyTrackingCompleted,
  showDeviceAlert,
  showTrackingAlert,
} from '@/lib/notifications/trackingAlerts';

/**
 * Bridges WebSocket / store events to OS device notifications.
 * - Native APK: LocalNotifications for pending inbox items + arrival/complete flips.
 * - PWA: surfaces when the document is hidden.
 */
export function useDeviceNotificationBridge(): void {
  const pending = useNotificationStore((s) => s.pendingNotification);
  const setPending = useNotificationStore((s) => s.setPendingNotification);
  const lastStatusRef = useRef<Record<number, string>>({});
  const bootstrappedRef = useRef(false);

  useNotificationClickRouting();

  useEffect(() => {
    if (!isNativeAndroid() || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void ensureNativeLocalNotificationPermission().then((ok) => {
      if (ok) attachNativeNotificationClickHandler();
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const clickPayload: NotificationClickPayload = {
      notification_id: pending.notification_id,
      type: pending.type,
      action_url: pending.action_url,
      action_route: pending.action_route ?? null,
      reference_type: pending.reference_type ?? null,
      reference_id: pending.reference_id ?? null,
      metadata: pending.metadata ?? null,
    };

    const payload = {
      title: pending.title || 'New notification',
      body: pending.message || '',
      tag: `inbox-${pending.notification_id}`,
      url: resolveNotificationTargetFromPayload(clickPayload),
      payload: clickPayload,
    };

    void (async () => {
      // App open on screen: the quick-record card asks instead of a device alert.
      if (pending.type === 'field_trip.stop_detected' && !isDocumentHidden()) {
        setPending(null);
        return;
      }
      if (isNativeAndroid()) {
        await showDeviceAlert(payload);
      } else if (isDocumentHidden()) {
        await showTrackingAlert(payload);
      }
      setPending(null);
    })();
  }, [pending, setPending]);

  useEffect(() => {
    const seed = useTrackingStore.getState().liveTaskMap;
    for (const task of Object.values(seed)) {
      lastStatusRef.current[task.taskId] = task.status;
    }

    return useTrackingStore.subscribe((state) => {
      for (const task of Object.values(state.liveTaskMap)) {
        const prev = lastStatusRef.current[task.taskId];
        const next = task.status;
        if (prev === next) continue;
        lastStatusRef.current[task.taskId] = next;
        if (prev == null) continue;
        if (next === 'arrived' && prev !== 'arrived') {
          void notifyTrackingArrived(task.taskId);
        }
        // WS-driven completion when the agent isn't on the complete screen.
        // Deduped by tag if CompleteRequirementsSheet already notified.
        if (next === 'completed' && prev !== 'completed') {
          void notifyTrackingCompleted(task.taskId, task.taskTitle);
        }
      }
    });
  }, []);
}
