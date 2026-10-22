'use client';

import { useEffect, useState } from 'react';
import { getOfflineQueueStats, type OfflineQueueStats } from './queue';
import { useNetworkStatus } from '@/lib/network';
import { subscribeSyncStatus, getIsSyncing } from '@/lib/sync/syncEngine';
import { useShowingCachedData } from './cacheIndicator';

const EMPTY_STATS: OfflineQueueStats = {
  pendingActions: 0,
  pendingUploads: 0,
  pendingLocations: 0,
  pendingConflicts: 0,
};

export function useOfflineSyncStatus(pollEveryMs = 5_000) {
  const { isConnected } = useNetworkStatus();
  const [stats, setStats] = useState<OfflineQueueStats>(EMPTY_STATS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(getIsSyncing);
  const showingCachedData = useShowingCachedData();

  useEffect(() => {
    return subscribeSyncStatus(setIsSyncing);
  }, []);

  useEffect(() => {
    let mounted = true;
    let intervalId: number | undefined;

    const refresh = async (): Promise<OfflineQueueStats | null> => {
      setIsRefreshing(true);
      try {
        const next = await getOfflineQueueStats();
        if (mounted) setStats(next);
        return next;
      } catch {
        return null;
      } finally {
        if (mounted) setIsRefreshing(false);
      }
    };

    const stopInterval = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const syncPolling = (snapshot: OfflineQueueStats | null) => {
      const pending = snapshot
        ? snapshot.pendingActions +
          snapshot.pendingUploads +
          snapshot.pendingLocations +
          snapshot.pendingConflicts
        : 0;
      const shouldPoll = !isConnected || getIsSyncing() || pending > 0;
      stopInterval();
      if (!shouldPoll) return;
      intervalId = window.setInterval(() => {
        void refresh().then((next) => {
          if (mounted) syncPolling(next);
        });
      }, pollEveryMs);
    };

    const refreshAndArm = () => {
      void refresh().then((next) => {
        if (mounted) syncPolling(next);
      });
    };

    const unsubscribe = subscribeSyncStatus(() => {
      refreshAndArm();
    });
    window.addEventListener('online', refreshAndArm);
    window.addEventListener('offline', refreshAndArm);

    return () => {
      mounted = false;
      stopInterval();
      unsubscribe();
      window.removeEventListener('online', refreshAndArm);
      window.removeEventListener('offline', refreshAndArm);
    };
  }, [pollEveryMs, isConnected]);

  const totalPending =
    stats.pendingActions + stats.pendingUploads + stats.pendingLocations;

  return {
    isOffline: !isConnected,
    isRefreshing,
    isSyncing,
    showingCachedData,
    stats,
    totalPending,
  };
}
