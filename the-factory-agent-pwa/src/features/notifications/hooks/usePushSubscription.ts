'use client';

import { useEffect, useRef } from 'react';
import { client } from '@/lib/api/client';
import { urlBase64ToUint8Array } from '@/lib/notifications/vapidHelper';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  registerNativePush,
  unregisterNativePush,
} from '@/features/tracking/native/nativePushNotifications';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

async function registerWebPushSubscription(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — Web Push disabled');
    }
    return null;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration.pushManager) {
    console.warn('[Push] PushManager not supported by this browser');
    return null;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const subJSON = subscription.toJSON();
  const p256dh = subJSON.keys?.p256dh;
  const auth = subJSON.keys?.auth;

  if (!p256dh || !auth) return null;

  await client.post('/notifications/push-subscriptions', {
    provider: 'web-push',
    platform: 'web',
    device_token: subscription.endpoint,
    endpoint: subscription.endpoint,
    subscription_payload: {
      keys: { p256dh, auth },
    },
  });

  return subscription;
}

/**
 * Registers device push for the signed-in agent:
 * - Android APK → FCM via Capacitor PushNotifications
 * - Installed PWA / browser → Web Push (VAPID)
 */
export function usePushSubscription(userId?: string | number) {
  const lastUserRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!userId) {
      if (lastUserRef.current != null) {
        void unregisterNativePush();
        lastUserRef.current = null;
      }
      return;
    }

    lastUserRef.current = userId;
    let cancelled = false;

    async function registerPush() {
      try {
        if (isNativeAndroid()) {
          await registerNativePush();
          return;
        }

        if (cancelled) return;
        await registerWebPushSubscription();
      } catch (error) {
        console.error('[Push] Failed to register push subscription:', error);
      }
    }

    void registerPush();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
