'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useOptionalFieldTrip } from '../FieldTripProvider';
import { formatElapsed, secondsSince } from '../format';

/**
 * Small "On field trip · 01:24:10" pill shown on every screen while a trip runs
 * (hidden on the dashboard, which shows the full card). Tap → dashboard.
 */
export function FieldTripStatusPill({ homePath }: { homePath: string }) {
  const trip = useOptionalFieldTrip();
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const active = trip?.local != null;

  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!trip?.local || pathname === homePath) return null;

  return (
    <button
      type="button"
      onClick={() => router.push(homePath)}
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#FD6046] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-lg active:scale-95"
      aria-label="Field trip in progress, open dashboard"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      On field trip · <span className="font-mono tabular-nums">{formatElapsed(secondsSince(trip.local.startedAt, now))}</span>
    </button>
  );
}
