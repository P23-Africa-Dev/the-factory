'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readSession } from '@/session/sessionStore';
import {
  markNotificationNavigation,
  parseOpenNotificationParam,
  resolveNotificationTargetFromPayload,
  storePendingNotification,
} from '@/lib/notifications/notificationTarget';
import { markNotificationOpened } from '@/lib/notifications/openNotification';

/**
 * Landing route for push-notification taps (opened by public/sw.js).
 *
 * The service worker cannot know whether the signed-in user is an agent or a
 * manager, so it hands the raw notification payload to this page, which resolves
 * the real destination for the current session and replaces itself with it.
 */
export default function OpenNotificationPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = parseOpenNotificationParam(params.get('d')) ?? {};

    if (!readSession()?.token) {
      storePendingNotification(payload);
      router.replace('/login');
      return;
    }

    const target = resolveNotificationTargetFromPayload(payload);
    markNotificationOpened(payload.notification_id);
    markNotificationNavigation();
    router.replace(target);
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
    </div>
  );
}
