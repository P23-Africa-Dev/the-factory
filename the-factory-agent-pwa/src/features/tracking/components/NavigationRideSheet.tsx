'use client';

import React, { useMemo } from 'react';

export type RideTrackingStatus = 'connecting' | 'live' | 'error';

function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function TrackingStatusPill({
  trackingStatus,
  lastUpdatedAt,
}: {
  trackingStatus: RideTrackingStatus;
  lastUpdatedAt: string | null;
}) {
  const freshness = useMemo(() => {
    if (!lastUpdatedAt) return 'unknown' as const;
    const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (ageMs <= 15_000) return 'fresh' as const;
    if (ageMs <= 30_000) return 'aging' as const;
    return 'stale' as const;
  }, [lastUpdatedAt]);

  if (trackingStatus === 'connecting') {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="font-sans text-xs font-semibold text-amber-700">Connecting GPS…</span>
      </div>
    );
  }

  if (trackingStatus === 'error') {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span className="font-sans text-xs font-semibold text-red-700">Tracking unavailable</span>
      </div>
    );
  }

  if (freshness === 'stale') {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        <span className="font-sans text-xs font-semibold text-gray-500">Signal weak</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-sans text-xs font-semibold text-emerald-700">Live tracking</span>
    </div>
  );
}

export function NavigationRideSheet({
  destinationName,
  etaMinutes,
  distanceRemainingM,
  totalDistanceM,
  trackingStatus,
  lastUpdatedAt,
  onEnd,
}: {
  destinationName: string;
  etaMinutes: number | null;
  distanceRemainingM: number | null;
  totalDistanceM: number | null;
  trackingStatus: RideTrackingStatus;
  lastUpdatedAt: string | null;
  onEnd: () => void;
}) {
  const etaLabel =
    etaMinutes === null ? '—' : etaMinutes < 60 ? `${etaMinutes} min` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;

  const progress =
    totalDistanceM != null && totalDistanceM > 0 && distanceRemainingM != null
      ? Math.min(1, Math.max(0, 1 - distanceRemainingM / totalDistanceM))
      : null;

  return (
    <div className="px-5 pb-4 pt-0 text-[#09232D]">
      <TrackingStatusPill trackingStatus={trackingStatus} lastUpdatedAt={lastUpdatedAt} />

      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Arriving in</p>
          <p className="font-sans font-bold text-3xl text-[#09232D] leading-none">{etaLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Distance</p>
          <p className="font-sans font-bold text-lg text-[#09232D]">{formatDistance(distanceRemainingM)}</p>
        </div>
      </div>

      {progress != null && (
        <div className="h-1.5 rounded-full bg-[#E5E9EB] mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0095FF] transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <p className="font-sans font-semibold text-sm text-[#09232D] truncate mb-4">{destinationName}</p>

      <button
        type="button"
        onClick={onEnd}
        style={{
          background: 'linear-gradient(90deg, #1D7293 0%, #09232D 100%)',
          boxShadow: 'inset 0px 4px 8px -2px rgba(0, 0, 0, 0.4)',
        }}
        className="w-full h-[56px] rounded-[60px] flex items-center justify-center text-white font-sans font-bold text-sm active:scale-[0.98] transition-transform"
      >
        End Task
      </button>
    </div>
  );
}
