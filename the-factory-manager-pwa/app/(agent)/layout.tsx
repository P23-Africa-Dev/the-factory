'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth';
import { usePushSubscription } from '@/features/notifications/hooks/usePushSubscription';
import { useDeviceNotificationBridge } from '@/features/notifications/hooks/useDeviceNotificationBridge';
import { useTrackingWebSocket } from '@/hooks/useTrackingWebSocket';
import { syncEngine } from '@/lib/sync/syncEngine';
import { scheduleWarmAgentRoutes } from '@/lib/pwa/routeWarming';
import { useRouteRestoration } from '@/lib/pwa/routeRestoration';
import { BottomNavBar } from '@/components/shared/BottomNavBar';
import {
  BottomNavVisibilityProvider,
  useBottomNavVisibility,
} from '@/components/shared/BottomNavVisibility';
import { OfflineSyncBanner } from '@/components/shared/OfflineSyncBanner';

function ManagerShellContent({
  children,
  isRestoring,
}: {
  children: React.ReactNode;
  isRestoring: boolean;
}) {
  const { isHidden } = useBottomNavVisibility();

  return (
    <>
      <div className={`flex flex-col flex-1 ${isHidden ? '' : 'pb-[100px]'}`}>
        {isRestoring ? (
          <div className="flex flex-1 items-center justify-center min-h-[50vh]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
          </div>
        ) : (
          children
        )}
      </div>
      {!isHidden && <BottomNavBar />}
      {!isHidden && <OfflineSyncBanner />}
    </>
  );
}

function ManagerShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  usePushSubscription(user?.id);
  useDeviceNotificationBridge();
  useTrackingWebSocket();
  const { isRestoring } = useRouteRestoration();

  useEffect(() => {
    const SYNC_DEBOUNCE_MS = 8_000;
    const INITIAL_SYNC_DELAY_MS = 4_000;
    let timer: number | undefined;

    const scheduleDebouncedSync = (delayMs: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void syncEngine.syncAll();
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleDebouncedSync(SYNC_DEBOUNCE_MS);
      }
    };

    const handleOnline = () => {
      scheduleDebouncedSync(SYNC_DEBOUNCE_MS);
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type === 'SYNC_REQUESTED') {
        scheduleDebouncedSync(SYNC_DEBOUNCE_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    if (navigator.onLine) {
      scheduleDebouncedSync(INITIAL_SYNC_DELAY_MS);
      void syncEngine.scheduleSync();
      scheduleWarmAgentRoutes();
    }

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  return (
    <BottomNavVisibilityProvider>
      <div className="flex flex-col flex-1 min-h-screen bg-[#0A1D25] text-white">
        <ManagerShellContent isRestoring={isRestoring}>{children}</ManagerShellContent>
      </div>
    </BottomNavVisibilityProvider>
  );
}

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isSignedIn) {
      router.replace('/login');
    }
  }, [isSignedIn, isLoading, router]);

  if (isLoading || !isSignedIn) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  return <ManagerShell>{children}</ManagerShell>;
}
