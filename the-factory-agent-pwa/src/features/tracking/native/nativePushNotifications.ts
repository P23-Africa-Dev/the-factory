/**
 * Capacitor FCM push for the Android APK shell.
 *
 * Calling PushNotifications.register() without google-services.json crashes
 * the native process. We probe Firebase readiness from MainActivity before
 * registering. When FCM is unavailable, the caller should fall back to Web Push.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { client } from '@/lib/api/client';
import {
  openNotificationTarget,
  resolveNotificationTargetFromPayload,
  type NotificationClickPayload,
} from '@/lib/notifications/notificationTarget';
import { markNotificationOpened } from '@/lib/notifications/openNotification';
import { isNativeAndroid } from './capacitorPlatform';
import { ensureNativeLocalNotificationPermission, notifyNative } from './nativeLocalNotifications';

type FactoryPushBridgePlugin = {
  isFirebaseReady: () => Promise<{ ready: boolean; reason?: string }>;
};

const FactoryPushBridge = registerPlugin<FactoryPushBridgePlugin>('FactoryPushBridge');

let listenersAttached = false;
let lastRegisteredToken: string | null = null;

/** Explicit opt-in still supported; auto-enable when Firebase is present on device. */
function isFcmPushEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_FCM_PUSH === 'true';
}

async function isFirebaseReadyOnDevice(): Promise<boolean> {
  try {
    if (!Capacitor.isPluginAvailable('FactoryPushBridge')) {
      // Older APKs without the bridge: only trust the env flag.
      return isFcmPushEnvEnabled();
    }
    const result = await FactoryPushBridge.isFirebaseReady();
    return Boolean(result?.ready);
  } catch {
    return false;
  }
}

/** FCM data values arrive as strings; keep them as the raw click payload. */
function clickPayloadFrom(data: Record<string, unknown> | undefined): NotificationClickPayload {
  return { ...(data ?? {}) } as NotificationClickPayload;
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

    const payload = clickPayloadFrom(data);
    // App on screen: the "You've stopped" card asks in the app instead.
    if (payload.type === 'field_trip.stop_detected' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      return;
    }
    void notifyNative({
      title,
      body,
      tag,
      url: resolveNotificationTargetFromPayload(payload),
      payload,
    });
  });

  // Tray tap (app backgrounded or cold-started from the notification).
  void PushNotifications.addListener('pushNotificationActionPerformed', (event: ActionPerformed) => {
    try {
      const payload = clickPayloadFrom(event.notification.data as Record<string, unknown> | undefined);
      const target = resolveNotificationTargetFromPayload(payload);
      markNotificationOpened(payload.notification_id);
      openNotificationTarget(target);
    } catch {
      // ignore navigation failures
    }
  });
}

/**
 * Request notification permission on Android.
 * Registers FCM only when Firebase is initialized on the device (or env forces it).
 * Returns true when an FCM token registration was started.
 */
export async function registerNativePush(): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  try {
    // Always ensure local notification permission for tracking/inbox alerts.
    await ensureNativeLocalNotificationPermission();

    const firebaseReady = await isFirebaseReadyOnDevice();
    if (!firebaseReady && !isFcmPushEnvEnabled()) {
      console.info(
        '[Push][FCM] Skipped — Firebase is not initialized. Add android/app/google-services.json, rebuild the APK, set backend FCM_SERVER_KEY, and redeploy the PWA.',
      );
      return false;
    }

    if (!firebaseReady) {
      console.warn(
        '[Push][FCM] NEXT_PUBLIC_ENABLE_FCM_PUSH=true but Firebase is not ready — refusing register() to avoid a native crash.',
      );
      return false;
    }

    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.warn('[Push][FCM] PushNotifications plugin not available');
      return false;
    }

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
