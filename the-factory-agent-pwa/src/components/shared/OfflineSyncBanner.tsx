'use client';

import React from 'react';
import Link from 'next/link';
import { useOfflineSyncStatus } from '@/lib/offline/useOfflineSyncStatus';

export function OfflineSyncBanner(): React.ReactElement | null {
  const { isOffline, stats, totalPending } = useOfflineSyncStatus();

  if (!isOffline && totalPending === 0 && stats.pendingConflicts === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 px-4 pt-3">
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${
          isOffline
            ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
            : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
        }`}
      >
        <div className="font-semibold">
          {isOffline ? 'Offline Mode Active' : 'Syncing Pending Changes'}
        </div>
        <div className="mt-1 opacity-90">
          Queue: {stats.pendingActions} actions | Uploads: {stats.pendingUploads} | Tracking:{' '}
          {stats.pendingLocations}
          {stats.pendingConflicts > 0
            ? ` | Conflicts: ${stats.pendingConflicts}`
            : ''}
        </div>
        {stats.pendingConflicts > 0 && (
          <Link href="/sync/conflicts" className="mt-2 inline-block underline text-[11px] font-semibold">
            Resolve Sync Conflicts
          </Link>
        )}
      </div>
    </div>
  );
}

