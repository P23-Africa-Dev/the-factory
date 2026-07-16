import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeAndroid } from './capacitorPlatform';

const CHANNEL_ID = 'tracking_alerts';
const CHANNEL_NAME = 'Factory 23 Agent alerts';

let channelsReady = false;
let clickListenerAttached = false;
let notifIdSeq = 9000;

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
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      description: 'Task and live-tracking alerts from Factory 23 Agent',
      importance: 5,
      visibility: 1,
      vibration: true,
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
        const url = path.startsWith('http') ? path : path.startsWith('/') ? path : `/${path}`;
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
          channelId: CHANNEL_ID,
          extra: { url: payload.url, tag: payload.tag },
          schedule: { at: new Date(Date.now() + 250) },
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[nativeLocalNotifications] schedule failed', err);
    return false;
  }
}
