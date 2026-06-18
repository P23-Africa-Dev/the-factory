'use client';

import React from 'react';

function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function NavigationRideSheet({
  destinationName,
  etaMinutes,
  distanceRemainingM,
  totalDistanceM,
  onEnd,
}: {
  destinationName: string;
  etaMinutes: number | null;
  distanceRemainingM: number | null;
  totalDistanceM: number | null;
  onEnd: () => void;
}) {
  const etaLabel =
    etaMinutes === null ? '—' : etaMinutes < 60 ? `${etaMinutes} min` : `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m`;

  const progress =
    totalDistanceM != null && totalDistanceM > 0 && distanceRemainingM != null
      ? Math.min(1, Math.max(0, 1 - distanceRemainingM / totalDistanceM))
      : null;

  return (
    <div className="bg-[#F2F4F5] rounded-t-3xl px-5 pb-4 pt-2 text-[#09232D] border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
      <div className="flex justify-center mb-3">
        <div className="w-9 h-1 rounded-full bg-gray-300" />
      </div>

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
