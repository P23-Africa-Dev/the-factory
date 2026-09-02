import { LocalNotifications } from '@capacitor/local-notifications';
import { resolveAgentDeepLink } from '@/lib/notifications/resolveAgentDeepLink';
import { isNativeAndroid } from './capacitorPlatform';

const ALERTS_CHANNEL_ID = 'tracking_alerts';
const ALERTS_CHANNEL_NAME = 'Factory 23 Agent alerts';

/** Dedicated channel for the sticky “tracking in progress” status notification. */
const LIVE_CHANNEL_ID = 'live_tracking';
const LIVE_CHANNEL_NAME = 'Live tracking status';

/** Stable id so we can cancel/replace the sticky live-tracking notification. */
export const LIVE_TRACKING_NOTIFICATION_ID = 23023;

let channelsReady = false;
let clickListenerAttached = false;
let notifIdSeq = 9000;
let liveTrackingActive = false;

const recentTags = new Map<string, number>();
const DEDUPE_MS = 45_000;

function isDuplicate(tag: string): boolean {
  const now = Date.now();
  const prev = recentTags.get(tag);
  if (prev != null && now - prev < DEDUPE_MS) return true;
  recentTags.set(tag, now);
  for (const [key, at] of recentTags) {
    if (now - at > DEDUPE_MS * 4) recentTags.delete(key);
  }
  return false;
}

async function ensureChannels(): Promise<void> {
  if (channelsReady || !isNativeAndroid()) return;
  try {
    await LocalNotifications.createChannel({
      id: ALERTS_CHANNEL_ID,
      name: ALERTS_CHANNEL_NAME,
      description: 'Task and live-tracking alerts from Factory 23 Agent',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: LIVE_CHANNEL_ID,
      name: LIVE_CHANNEL_NAME,
      description: 'Shows while Factory 23 background tracking is active',
      importance: 4,
      visibility: 1,
      vibration: false,
      sound: undefined,
    });
    channelsReady = true;
  } catch (err) {
    console.warn('[nativeLocalNotifications] createChannel failed', err);
  }
}

export async function ensureNativeLocalNotificationPermission(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
    }
    await ensureChannels();
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

/** Attach once: tapping a notification opens the deep link path in the WebView. */
export function attachNativeNotificationClickHandler(): void {
  if (!isNativeAndroid() || clickListenerAttached) return;
  clickListenerAttached = true;

  void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const raw = event.notification.extra?.url;
    const path = typeof raw === 'string' ? raw : null;
    if (!path) return;
    try {
      if (typeof window !== 'undefined') {
        const url = resolveAgentDeepLink(path);
        window.location.assign(url.startsWith('http') ? url : url);
      }
    } catch {
      // ignore
    }
  });
}

export type NativeAlertPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

/**
 * Show a Factory 23 Agent device notification on Android APK.
 * Dedupes by tag within a short window.
 */
export async function notifyNative(payload: NativeAlertPayload): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  if (isDuplicate(payload.tag)) return false;

  const granted = await ensureNativeLocalNotificationPermission();
  if (!granted) return false;

  attachNativeNotificationClickHandler();

  const id = notifIdSeq++;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: payload.title.startsWith('Factory 23')
            ? payload.title
            : `Factory 23 Agent · ${payload.title}`,
          body: payload.body,
          channelId: ALERTS_CHANNEL_ID,
          extra: { url: resolveAgentDeepLink(payload.url), tag: payload.tag },
          schedule: { at: new Date(Date.now() + 250) },
          autoCancel: true,
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[nativeLocalNotifications] schedule failed', err);
    return false;
  }
}

export type OngoingTrackingPayload = {
  title: string;
  body: string;
  url: string;
};

/**
 * Sticky OS notification while background tracking is running.
 * Uses a fixed id + ongoing=true so it stays until we cancel it.
 * Complements the FGS notification from background-geolocation.
 */
export async function showOngoingTrackingNotification(
  payload: OngoingTrackingPayload,
): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  const granted = await ensureNativeLocalNotificationPermission();
  if (!granted) return false;

  attachNativeNotificationClickHandler();

  try {
    // Replace any previous sticky notification with the same id.
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: LIVE_TRACKING_NOTIFICATION_ID }],
      });
    } catch {
      // ignore
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: LIVE_TRACKING_NOTIFICATION_ID,
          title: payload.title,
          body: payload.body,
          largeBody: payload.body,
          summaryText: 'Tracking active',
          channelId: LIVE_CHANNEL_ID,
          ongoing: true,
          autoCancel: false,
          extra: { url: resolveAgentDeepLink(payload.url), tag: 'live-tracking-active' },
          // Immediate (or near-immediate) display
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    liveTrackingActive = true;
    return true;
  } catch (err) {
    console.warn('[nativeLocalNotifications] ongoing schedule failed', err);
    return false;
  }
}

/** Remove the sticky live-tracking status notification. */
export async function clearOngoingTrackingNotification(): Promise<void> {
  if (!isNativeAndroid()) return;
  liveTrackingActive = false;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: LIVE_TRACKING_NOTIFICATION_ID }],
    });
  } catch {
    // ignore
  }
}

export function isOngoingTrackingNotificationActive(): boolean {
  return liveTrackingActive;
}
