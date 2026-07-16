import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  attachNativeNotificationClickHandler,
  ensureNativeLocalNotificationPermission,
  notifyNative,
} from '@/features/tracking/native/nativeLocalNotifications';

export type TrackingAlertPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export async function requestTrackingNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (isNativeAndroid()) {
    const ok = await ensureNativeLocalNotificationPermission();
    attachNativeNotificationClickHandler();
    return ok ? 'granted' : 'denied';
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function buildMapTaskUrl(taskId: number): string {
  return `/map?taskId=${taskId}`;
}

async function showViaServiceWorker(payload: TrackingAlertPayload): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: payload.tag,
      data: { url: payload.url },
    });
    return true;
  } catch {
    return false;
  }
}

function showViaNotificationApi(payload: TrackingAlertPayload): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192x192.png',
      tag: payload.tag,
      data: { url: payload.url },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Show a device notification.
 * - Android APK: Capacitor LocalNotifications (works while backgrounded).
 * - PWA/browser: only when document is hidden (Maps handoff, etc.).
 */
export async function showTrackingAlert(payload: TrackingAlertPayload): Promise<void> {
  if (isNativeAndroid()) {
    await notifyNative(payload);
    return;
  }

  if (!isDocumentHidden()) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const shown = await showViaServiceWorker(payload);
  if (!shown) {
    showViaNotificationApi(payload);
  }
}

/** Force a device alert even if the document is visible (native always; web if permitted). */
export async function showDeviceAlert(payload: TrackingAlertPayload): Promise<void> {
  if (isNativeAndroid()) {
    await notifyNative(payload);
    return;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const shown = await showViaServiceWorker(payload);
  if (!shown) showViaNotificationApi(payload);
}

export async function notifyTrackingArrived(taskId: number): Promise<void> {
  await showTrackingAlert({
    title: "You've arrived",
    body: 'Confirm visit to complete the task.',
    tag: `tracking-arrived-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}

export async function notifyTrackingNearDestination(taskId: number): Promise<void> {
  await showTrackingAlert({
    title: 'Almost there',
    body: "You're near the destination. Prepare to complete the task.",
    tag: `tracking-near-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}

export async function notifyTrackingStopped(taskId: number, message: string): Promise<void> {
  await showTrackingAlert({
    title: 'Tracking stopped',
    body: message || 'Open the app for details.',
    tag: `tracking-stopped-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}
