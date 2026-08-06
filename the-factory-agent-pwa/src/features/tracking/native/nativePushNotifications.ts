/**
 * Capacitor FCM push for the Android APK shell.
 * Registers the device token with the Laravel push-subscriptions API so
 * DeliverPushNotificationJob can reach the OS notification tray when the app
 * is backgrounded or killed (LocalNotifications alone cannot do that).
 */
import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { client } from '@/lib/api/client';
import { isNativeAndroid } from './capacitorPlatform';
import { notifyNative } from './nativeLocalNotifications';

let listenersAttached = false;
let lastRegisteredToken: string | null = null;

function resolveActionUrl(data: Record<string, unknown> | undefined): string {
  const raw = data?.action_url ?? data?.action_route ?? data?.url;
  if (typeof raw !== 'string' || raw.trim() === '') return '/';
  const path = raw.trim();
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

async function registerTokenWithApi(token: string): Promise<void> {
  if (!token || token === lastRegisteredToken) return;

  await client.post('/notifications/push-subscriptions', {
    provider: 'fcm',
    platform: 'android',
    device_token: token,
    endpoint: token,
    subscription_payload: {
      source: 'capacitor-push-notifications',
    },
  });

  lastRegisteredToken = token;
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  void PushNotifications.addListener('registration', (token: Token) => {
    void registerTokenWithApi(token.value).catch((err) => {
      console.error('[Push][FCM] Failed to register device token:', err);
    });
  });

  void PushNotifications.addListener('registrationError', (error) => {
    console.error('[Push][FCM] Registration error:', error.error);
  });

  // Foreground delivery — show a local tray notification so the user still sees it.
  void PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    const data = (notification.data ?? {}) as Record<string, unknown>;
    const title = notification.title || (typeof data.title === 'string' ? data.title : 'Factory 23');
    const body =
      notification.body ||
      (typeof data.body === 'string' ? data.body : typeof data.message === 'string' ? data.message : '');
    const tag =
      typeof data.notification_id === 'string' || typeof data.notification_id === 'number'
        ? `fcm-${data.notification_id}`
        : `fcm-${Date.now()}`;

    void notifyNative({
      title,
      body,
      tag,
      url: resolveActionUrl(data),
    });
  });

  void PushNotifications.addListener('pushNotificationActionPerformed', (event: ActionPerformed) => {
    const data = (event.notification.data ?? {}) as Record<string, unknown>;
    const url = resolveActionUrl(data);
    try {
      if (typeof window !== 'undefined') {
        window.location.assign(url.startsWith('http') ? url : url);
      }
    } catch {
      // ignore navigation failures
    }
  });
}

/**
 * Request notification permission and register for FCM on Android APK.
 * No-ops on web / non-Android platforms.
 */
export async function registerNativePush(): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  try {
    attachListeners();

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[Push][FCM] Permission not granted');
      return false;
    }

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.error('[Push][FCM] Failed to register:', err);
    return false;
  }
}

/** Best-effort deactivate of the last FCM token on logout. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeAndroid()) return;

  const token = lastRegisteredToken;
  lastRegisteredToken = null;

  if (!token) return;

  try {
    await client.delete('/notifications/push-subscriptions', {
      data: { device_token: token },
    });
  } catch {
    // Non-fatal — token may already be cleared with auth
  }
}
