import { useEffect } from 'react';
import { client } from '@/lib/api/client';
import { urlBase64ToUint8Array } from '@/lib/notifications/vapidHelper';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export function usePushSubscription(userId?: string | number) {
  useEffect(() => {
    if (!userId || !VAPID_PUBLIC_KEY || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    async function registerPush() {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (!registration.pushManager) {
          console.warn('[Push] PushManager not supported by this browser');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
          });
        }

        const subJSON = subscription.toJSON();
        const p256dh = subJSON.keys?.p256dh;
        const auth = subJSON.keys?.auth;

        if (!p256dh || !auth) return;

        // Register with Laravel API
        await client.post('/notifications/push-subscriptions', {
          provider: 'web-push',
          platform: 'web',
          device_token: subscription.endpoint,
          endpoint: subscription.endpoint,
          subscription_payload: {
            keys: { p256dh, auth },
          },
        });
      } catch (error) {
        console.error('[Push] Failed to register push subscription:', error);
      }
    }

    registerPush();
  }, [userId]);
}
