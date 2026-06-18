'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { useOfflineSyncStatus } from '@/lib/offline/useOfflineSyncStatus';

export function OfflineSyncBanner(): React.ReactElement | null {
  const { isOffline, stats, totalPending, isRefreshing } = useOfflineSyncStatus();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const hasPending =
    totalPending > 0 || stats.pendingConflicts > 0 || stats.pendingActions > 0;

  const shouldShow = isOffline || hasPending || isRefreshing;
  if (!shouldShow) return null;

  const title = isOffline
    ? 'Offline mode active'
    : isRefreshing
      ? 'Syncing offline changes'
      : 'Pending offline changes';

  return (
    <div className="fixed bottom-24 right-4 z-40 group">
      <button
        type="button"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border shadow-2xl backdrop-blur transition hover:scale-[1.03] ${
          isOffline
            ? 'border-amber-400/40 bg-[#0B2330]/95 text-amber-100'
            : stats.pendingActions > 0 && stats.pendingConflicts === 0
              ? 'border-cyan-400/35 bg-[#0B2330]/95 text-cyan-100'
              : 'border-red-400/35 bg-[#0B2330]/95 text-red-100'
        }`}
        aria-label={title}
        title={title}
      >
        {isRefreshing ? (
          <RefreshCw size={18} className="animate-spin" />
        ) : isOffline ? (
          <WifiOff size={18} />
        ) : (
          <CloudOff size={18} />
        )}
        {totalPending > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-[#0B2330]">
            {totalPending > 99 ? '99+' : totalPending}
          </span>
        ) : null}
      </button>

      <div
        className={`absolute bottom-14 right-0 w-72 rounded-xl border border-white/15 bg-[#0B2330]/95 px-3 py-2 text-white shadow-2xl backdrop-blur ${
          isPanelOpen ? 'block' : 'hidden group-hover:block'
        }`}
      >
        <div className="text-xs font-semibold">{title}</div>
        <div className="mt-1 text-[11px] text-white/75">
          Queue: {stats.pendingActions} actions | Uploads: {stats.pendingUploads} | Tracking:{' '}
          {stats.pendingLocations}
          {stats.pendingConflicts > 0 ? ` | Conflicts: ${stats.pendingConflicts}` : ''}
        </div>
        {isOffline ? (
          <div className="mt-1 text-[11px] text-amber-100/80">
            Changes are saved locally and will sync when you reconnect.
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/sync/queue"
            className="inline-block text-[11px] font-semibold text-[#75ADAF] underline"
          >
            View sync queue
          </Link>
          {stats.pendingConflicts > 0 ? (
            <Link
              href="/sync/conflicts"
              className="inline-block text-[11px] font-semibold text-[#75ADAF] underline"
            >
              Resolve conflicts
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
