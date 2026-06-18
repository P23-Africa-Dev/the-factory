'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth';
import { useTrackingWebSocket } from '@/hooks/useTrackingWebSocket';
import { syncEngine } from '@/lib/sync/syncEngine';
import { BottomNavBar } from '@/components/shared/BottomNavBar';
import { OfflineSyncBanner } from '@/components/shared/OfflineSyncBanner';

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  // Mount WebSocket tracking session for authenticated agents
  useTrackingWebSocket();

  // Handle offline sync trigger on reconnect, visibility, and service worker messages.
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

    // Initial check/sync
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

  // Protect all agent routes
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
    <div className="flex flex-col flex-1 min-h-screen bg-[#0A1D25] text-white">
      <OfflineSyncBanner />
      {/* Scrollable screen view container with padding to avoid bottom navigation bar overlay */}
      <div className="flex flex-col flex-1 pb-[100px]">
        {children}
      </div>

      {/* Floating Bottom Nav Bar */}
      <BottomNavBar />
    </div>
  );
}
