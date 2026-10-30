'use client';

import React, { useEffect, useMemo, useState } from 'react';

export type RideTrackingStatus = 'connecting' | 'live' | 'error';

function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatOnSiteDuration(arrivedAt: string | null, nowMs: number): string | null {
  if (!arrivedAt) return null;
  const start = new Date(arrivedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function TrackingStatusPill({
  trackingStatus,
  lastUpdatedAt,
  isOffline = false,
  queuedLocationCount = 0,
}: {
  trackingStatus: RideTrackingStatus;
  lastUpdatedAt: string | null;
  isOffline?: boolean;
  queuedLocationCount?: number;
}) {
  const freshness = useMemo(() => {
    if (!lastUpdatedAt) return 'unknown' as const;
    // eslint-disable-next-line react-hooks/purity -- relative age against server timestamp
    const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (ageMs <= 15_000) return 'fresh' as const;
    if (ageMs <= 30_000) return 'aging' as const;
    return 'stale' as const;
  }, [lastUpdatedAt]);

  if (isOffline) {
    const queueLabel =
      queuedLocationCount > 0
        ? `${queuedLocationCount} point${queuedLocationCount === 1 ? '' : 's'} queued`
        : 'waiting for network';
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="font-sans text-xs font-semibold text-amber-700">
          Offline · {queueLabel}
        </span>
      </div>
    );
  }

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
  hasArrived = false,
  arrivedAt = null,
  isOffline = false,
  queuedLocationCount = 0,
  onEnd,
  onOpenGoogleMaps,
}: {
  destinationName: string;
  etaMinutes: number | null;
  distanceRemainingM: number | null;
  totalDistanceM: number | null;
  trackingStatus: RideTrackingStatus;
  lastUpdatedAt: string | null;
  hasArrived?: boolean;
  /** ISO timestamp when the agent arrived on site. */
  arrivedAt?: string | null;
  isOffline?: boolean;
  queuedLocationCount?: number;
  onEnd: () => void;
  onOpenGoogleMaps?: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasArrived || !arrivedAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [hasArrived, arrivedAt]);

  const etaLabel =
    etaMinutes === null ? '—' : etaMinutes < 60 ? `${etaMinutes} min` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;

  const progress =
    totalDistanceM != null && totalDistanceM > 0 && distanceRemainingM != null
      ? Math.min(1, Math.max(0, 1 - distanceRemainingM / totalDistanceM))
      : null;

  const onSiteLabel = hasArrived ? formatOnSiteDuration(arrivedAt, nowMs) : null;

  return (
    <div className="px-5 pb-4 pt-0 text-[#09232D]">
      <TrackingStatusPill
        trackingStatus={trackingStatus}
        lastUpdatedAt={lastUpdatedAt}
        isOffline={isOffline}
        queuedLocationCount={queuedLocationCount}
      />

      {hasArrived && onSiteLabel != null ? (
        <div className="mb-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center justify-between gap-2">
          <span className="font-sans text-xs font-semibold text-emerald-800">On site</span>
          <span className="font-sans text-sm font-bold text-emerald-900 tabular-nums">
            {onSiteLabel}
          </span>
        </div>
      ) : (
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
      )}

      {progress != null && !hasArrived && (
        <div className="h-1.5 rounded-full bg-[#E5E9EB] mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0095FF] transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <p className="font-sans font-semibold text-sm text-[#09232D] truncate mb-4">{destinationName}</p>

      {onOpenGoogleMaps && !hasArrived ? (
        <button
          type="button"
          onClick={onOpenGoogleMaps}
          className="w-full h-11 mb-3 rounded-[60px] border border-[#1D7293] bg-white flex items-center justify-center gap-2 text-[#1D7293] font-sans font-bold text-sm active:scale-[0.98] transition-transform"
        >
          <img src="/assets/navigation-03.png" alt="" className="w-5 h-5 object-contain" />
          Open in Google Maps
        </button>
      ) : null}

      <button
        type="button"
        onClick={onEnd}
        style={{
          background: 'linear-gradient(90deg, #1D7293 0%, #09232D 100%)',
          boxShadow: 'inset 0px 4px 8px -2px rgba(0, 0, 0, 0.4)',
        }}
        className="w-full h-[56px] rounded-[60px] flex items-center justify-center text-white font-sans font-bold text-sm active:scale-[0.98] transition-transform"
      >
        {hasArrived ? 'Complete Task' : 'Pause Tracking'}
      </button>
    </div>
  );
}
