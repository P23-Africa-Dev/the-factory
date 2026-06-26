'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2, WifiOff } from 'lucide-react';
import { useOfflineSyncStatus } from '@/lib/offline/useOfflineSyncStatus';

export function OfflineSyncBanner(): React.ReactElement | null {
  const { isOffline, isSyncing, showingCachedData, stats, totalPending } = useOfflineSyncStatus();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const shouldShow = isOffline || isSyncing || showingCachedData;
  if (!shouldShow) return null;

  const title = isSyncing
    ? `Syncing ${totalPending > 0 ? totalPending : ''} changes…`
    : isOffline
      ? 'Offline mode active'
      : 'Showing saved data';

  const Icon = isSyncing ? Loader2 : WifiOff;

  return (
    <div className="fixed bottom-24 right-4 z-40 group">
      <button
        type="button"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/40 bg-[#0B2330]/95 text-amber-100 shadow-2xl backdrop-blur transition hover:scale-[1.03]"
        aria-label={title}
        title={title}
      >
        <Icon size={18} className={isSyncing ? 'animate-spin' : undefined} />
        {totalPending > 0 && !isSyncing ? (
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
        {isOffline || showingCachedData ? (
          <div className="mt-1 text-[11px] text-amber-100/80">
            {isOffline
              ? 'Changes are saved locally and will sync when you reconnect.'
              : 'Displaying the last saved copy from this device.'}
          </div>
        ) : null}
        {isSyncing ? (
          <div className="mt-1 text-[11px] text-[#75ADAF]">
            Uploading queued changes to the server…
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
