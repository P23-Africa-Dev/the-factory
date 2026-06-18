'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth';
import { ActiveTrackingProvider } from '@/features/tracking/ActiveTrackingProvider';
import { useTrackingWebSocket } from '@/hooks/useTrackingWebSocket';
import { syncEngine } from '@/lib/sync/syncEngine';
import { BottomNavBar } from '@/components/shared/BottomNavBar';
import { OfflineSyncBanner } from '@/components/shared/OfflineSyncBanner';

function AgentShell({ children }: { children: React.ReactNode }) {
  useTrackingWebSocket();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncEngine.syncAll();
      }
    };

    const handleOnline = () => {
      syncEngine.syncAll();
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type === 'SYNC_REQUESTED') {
        syncEngine.syncAll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    if (navigator.onLine) {
      syncEngine.syncAll();
      syncEngine.scheduleSync();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-[#0A1D25] text-white">
      <OfflineSyncBanner />
      <div className="flex flex-col flex-1 pb-[100px]">{children}</div>
      <BottomNavBar />
    </div>
  );
}

export default function AgentLayout({
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

  return (
    <ActiveTrackingProvider>
      <AgentShell>{children}</AgentShell>
    </ActiveTrackingProvider>
  );
}
