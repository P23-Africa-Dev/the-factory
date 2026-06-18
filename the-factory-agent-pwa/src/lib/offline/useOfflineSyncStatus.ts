'use client';

import { useEffect, useState } from 'react';
import { getOfflineQueueStats, type OfflineQueueStats } from './queue';
import { useNetworkStatus } from '@/lib/network';

const EMPTY_STATS: OfflineQueueStats = {
  pendingActions: 0,
  pendingUploads: 0,
  pendingLocations: 0,
  pendingConflicts: 0,
};

export function useOfflineSyncStatus(pollEveryMs = 8_000) {
  const { isConnected } = useNetworkStatus();
  const [stats, setStats] = useState<OfflineQueueStats>(EMPTY_STATS);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [pollEveryMs, isConnected]);

  return {
    isOffline: !isConnected,
    isRefreshing,
    stats,
    totalPending:
      stats.pendingActions + stats.pendingUploads + stats.pendingLocations,
  };
}

