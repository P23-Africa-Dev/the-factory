import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  attachNativeNotificationClickHandler,
  clearOngoingTrackingNotification,
  ensureNativeLocalNotificationPermission,
  notifyNative,
} from '@/features/tracking/native/nativeLocalNotifications';

export type TrackingAlertPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

export type LiveTrackingIndicatorOptions = {
  /** Short label shown in the status notification (task title / Field activity). */
  label?: string | null;
  /** Deep-link path when the user taps the notification. */
  url?: string;
};

const PWA_LIVE_TAG = 'factory23-live-tracking';

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

async function showViaServiceWorker(
  payload: TrackingAlertPayload,
  opts?: { requireInteraction?: boolean; silent?: boolean },
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    // `renotify` is supported by browsers for SW notifications but missing from TS DOM types.
    const options: NotificationOptions & { renotify?: boolean } = {
      body: payload.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: payload.tag,
      renotify: !opts?.silent,
      requireInteraction: opts?.requireInteraction ?? false,
      silent: opts?.silent ?? false,
      data: { url: payload.url },
    };
    await registration.showNotification(payload.title, options);
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

async function clearPwaLiveTrackingNotification(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.getNotifications({ tag: PWA_LIVE_TAG });
    for (const n of existing) {
      n.close();
    }
  } catch {
    // ignore
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

/**
 * Sticky “tracking is active” indicator for the whole live session.
 * - Android APK: foreground-service notification from background-geolocation
 *   (started in startNativeBackgroundWatch) — we only ensure permission here
 *   so the tray item can appear. Avoid a second ongoing LocalNotification.
 * - PWA: sticky service-worker notification for the whole session.
 */
export async function beginLiveTrackingIndicator(
  options?: LiveTrackingIndicatorOptions,
): Promise<void> {
  const label = options?.label?.trim() || 'Live session';
  const url = options?.url || '/map';
  const title = 'Factory 23 · Tracking active';
  const body = `${label} · Location sharing is on · Tap to return to the map`;

  await requestTrackingNotificationPermission();

  if (isNativeAndroid()) {
    // FGS from startNativeBackgroundWatch owns the ongoing Android tray item.
    return;
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  await showViaServiceWorker(
    { title, body, tag: PWA_LIVE_TAG, url },
    { requireInteraction: true, silent: true },
  );
}

/** Clear the sticky live-tracking indicator (call when GPS watch stops). */
export async function endLiveTrackingIndicator(): Promise<void> {
  if (isNativeAndroid()) {
    await clearOngoingTrackingNotification();
    return;
  }
  await clearPwaLiveTrackingNotification();
}

export async function notifyTrackingArrived(taskId: number): Promise<void> {
  await showDeviceAlert({
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
  await endLiveTrackingIndicator();
  await showDeviceAlert({
    title: 'Tracking stopped',
    body: message || 'Open the app for details.',
    tag: `tracking-stopped-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}

export async function notifyTrackingPaused(taskId: number): Promise<void> {
  await endLiveTrackingIndicator();
  await showDeviceAlert({
    title: 'Tracking paused',
    body: 'Your task is still in progress. Open the app and tap Start when ready.',
    tag: `tracking-paused-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}

export async function notifyTrackingCompleted(
  taskId: number,
  taskTitle?: string | null,
): Promise<void> {
  await endLiveTrackingIndicator();
  const name = taskTitle?.trim();
  await showDeviceAlert({
    title: 'Tracking completed',
    body: name
      ? `${name} is done. Great work — location sharing has stopped.`
      : 'Task complete. Location sharing has stopped.',
    tag: `tracking-completed-${taskId}`,
    url: buildMapTaskUrl(taskId),
  });
}

export async function notifyFieldTrackingStarted(): Promise<void> {
  await beginLiveTrackingIndicator({
    label: 'Field activity',
    url: '/map',
  });
}

export async function notifyFieldTrackingEnded(completed: boolean): Promise<void> {
  await endLiveTrackingIndicator();
  await showDeviceAlert({
    title: completed ? 'Field tracking completed' : 'Field tracking stopped',
    body: completed
      ? 'Your field activity session has ended. Location sharing is off.'
      : 'Field activity tracking has stopped.',
    tag: `field-tracking-${completed ? 'completed' : 'stopped'}`,
    url: '/map',
  });
}
