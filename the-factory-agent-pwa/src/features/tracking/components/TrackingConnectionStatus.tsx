'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCcw } from 'lucide-react';
import { useTrackingStore } from '@/store/tracking';

/**
 * Floating pill surfacing the realtime tracking connection state.
 * Hidden while the socket is healthy; shows reconnecting/offline notice when
 * live updates are degraded so failures are never silent.
 */
export function TrackingConnectionStatus({ className }: { className?: string }) {
  const wsStatus = useTrackingStore((s) => s.wsStatus);
  const [showConnecting, setShowConnecting] = useState(false);

  useEffect(() => {
    if (wsStatus !== 'connecting') {
      setShowConnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowConnecting(true), 4000);
    return () => clearTimeout(timer);
  }, [wsStatus]);

  const degraded =
    wsStatus === 'reconnecting' ||
    wsStatus === 'error' ||
    (wsStatus === 'connecting' && showConnecting);

  if (!degraded) return null;

  const isError = wsStatus === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        className ?? 'absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none'
      }
    >
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 shadow-lg backdrop-blur text-[12px] font-semibold text-white ${
          isError ? 'bg-red-600/95' : 'bg-amber-500/95'
        }`}
      >
        {isError ? (
          <WifiOff size={14} strokeWidth={2.5} />
        ) : (
          <RefreshCcw size={14} strokeWidth={2.5} className="animate-spin" />
        )}
        {isError
          ? 'Live tracking unavailable — retrying...'
          : 'Reconnecting to live tracking...'}
      </div>
    </div>
  );
}
