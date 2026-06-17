'use client';

import React from 'react';
import type { MeetingSyncStatus } from '../types';

interface SyncStatusBannerProps {
  syncStatus: MeetingSyncStatus;
  syncErrorMessage: string | null;
  googleMeetUrl: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function SyncStatusBanner({
  syncStatus,
  syncErrorMessage,
  googleMeetUrl,
  onRetry,
  isRetrying,
}: SyncStatusBannerProps): React.ReactElement | null {
  if (syncStatus === 'synced' && !googleMeetUrl) return null;

  if (syncStatus === 'synced' && googleMeetUrl) {
    return (
      <div className="flex items-center rounded-xl p-3.5 mb-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 select-none">
        <span className="text-sm font-semibold mr-2">✓</span>
        <span className="text-xs font-semibold">Synced with Google Calendar</span>
      </div>
    );
  }

  if (syncStatus === 'pending') {
    return (
      <div className="flex items-center rounded-xl p-3.5 mb-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 select-none">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent mr-2.5" />
        <span className="text-xs font-semibold">Syncing to Google Calendar…</span>
      </div>
    );
  }

  if (syncStatus === 'failed') {
    return (
      <div className="flex items-center justify-between rounded-xl p-3.5 mb-3 bg-red-500/10 border border-red-500/20 text-red-400 select-none">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold">⚠</span>
          <span className="text-xs font-semibold truncate leading-tight">
            {syncErrorMessage
              ? `Sync failed: ${syncErrorMessage}`
              : 'Google Calendar sync failed.'}
          </span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="ml-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg px-3.5 py-1.5 transition-all active:scale-95 whitespace-nowrap"
          >
            {isRetrying ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Retry'
            )}
          </button>
        )}
      </div>
    );
  }

  if (syncStatus === 'pending_setup') {
    return (
      <div className="flex items-center rounded-xl p-3.5 mb-3 bg-white/[0.04] border border-white/5 text-white/50 select-none">
        <span className="text-xs font-semibold">
          Calendar not configured. Contact your administrator to connect Google Calendar.
        </span>
      </div>
    );
  }

  return null;
}
