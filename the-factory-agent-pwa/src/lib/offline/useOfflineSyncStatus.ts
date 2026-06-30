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

    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const next = await getOfflineQueueStats();
        if (mounted) {
          setStats(next);
        }
      } finally {
        if (mounted) {
          setIsRefreshing(false);
        }
      }
    };

    refresh();
    const interval = window.setInterval(refresh, pollEveryMs);

    const handleOnline = () => {
      void refresh();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
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
