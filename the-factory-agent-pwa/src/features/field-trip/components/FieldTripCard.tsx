'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Map as MapIcon, MapPin, Play, Square, Wifi, WifiOff } from 'lucide-react';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import { readBrowserPosition } from '../preflight';
import { useFieldTrip } from '../FieldTripProvider';
import { formatDistance, formatElapsed, plural, secondsSince } from '../format';
import { FieldTripPreflightSheet } from './FieldTripPreflightSheet';
import type { TripPosition } from '../types';
import { OverlayPortal } from '@/components/shared/OverlayPortal';

const GPS_LABEL = {
  waiting: 'Waiting for GPS…',
  good: 'GPS good',
  weak: 'GPS weak',
  lost: 'GPS lost — keep the app open',
} as const;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * The big "Start Field Trip / End Field Trip" control on the mobile dashboard
 * (agents and managers). Each trip is saved to Journey History.
 */
export function FieldTripCard({
  journeyBasePath,
  mapPath = '/map',
}: {
  /** e.g. "/field-activity/journeys" (agent) or "/manager/field-activity/journeys" (manager) */
  journeyBasePath: string;
  mapPath?: string;
}) {
  const router = useRouter();
  const trip = useFieldTrip();
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = trip.local != null;
  const now = useNow(active);

  const onReady = useCallback(
    async (position: TripPosition | null) => {
      setPreflightOpen(false);
      setBusy(true);
      await trip.startTrip(position);
      setBusy(false);
    },
    [trip],
  );

  const end = async () => {
    setBusy(true);
    let position: TripPosition | null = null;
    try {
      position = await readBrowserPosition(5_000);
    } catch {
      position = null;
    }
    await trip.endTrip(position);
    setBusy(false);
    setConfirmEnd(false);
  };

  const browserAndroid =
    typeof navigator !== 'undefined' && !isNativeAndroid() && /Android/i.test(navigator.userAgent);

  // ── Feature off for this company ─────────────────────────────────────────
  if (trip.ready && !trip.enabled && !active) {
    return (
      <div className="mb-5 rounded-[20px] border border-white/10 bg-[#0B3343] px-4 py-3 text-white/80">
        <p className="text-[13px] font-semibold text-white">Field trips are off for your company</p>
        <p className="mt-0.5 text-[11px]">
          {trip.canManageSettings
            ? 'Turn on Field Activity in the web dashboard settings to start tracking field trips.'
            : 'Ask an owner or admin to turn on Field Activity.'}
        </p>
      </div>
    );
  }

  // ── Active trip ───────────────────────────────────────────────────────────
  if (active && trip.local) {
    const server = trip.serverTrip && trip.serverTrip.id === trip.local.serverId ? trip.serverTrip : null;
    const elapsed = secondsSince(trip.local.startedAt, now);
    const ending = trip.local.phase === 'ending';

    return (
      <>
        <div className="mb-5 rounded-[20px] border border-[#FD6046]/60 bg-[#1A2C33] p-4 text-white shadow-[0_12px_32px_rgba(253,96,70,0.25)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FD6046] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FD6046]" />
              </span>
              <span className="text-[12px] font-bold tracking-wide">{ending ? 'ENDING TRIP…' : 'ON FIELD TRIP'}</span>
            </div>
            <span className="font-mono text-[18px] font-semibold tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/70">
            {server ? `${formatDistance(server.distance_meters)} · ${plural(server.stop_count, 'stop')}` : 'Recording your route'}
            <span aria-hidden>·</span>
            {trip.synced ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span>{trip.synced ? GPS_LABEL[trip.gps] : 'Offline — will sync'}</span>
          </p>
          {browserAndroid && (
            <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 text-[11px] text-white/75">
              Keep this screen open. For tracking while the phone is locked,{' '}
              <a href="/downloads/factory23-agent.apk" className="font-semibold text-[#44AFCD] underline">
                install the Factory 23 app
              </a>
              .
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(mapPath)}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/15 text-[12px] font-medium active:bg-white/5"
            >
              <MapIcon size={15} /> View on map
            </button>
            <button
              type="button"
              disabled={busy || ending}
              onClick={() => setConfirmEnd(true)}
              className="flex h-11 flex-[1.3] items-center justify-center gap-1.5 rounded-2xl bg-[#FD6046] text-[13px] font-semibold active:scale-[0.98] disabled:opacity-60"
            >
              {busy || ending ? <Loader2 size={15} className="animate-spin" /> : <Square size={13} fill="currentColor" />}
              End Field Trip
            </button>
          </div>
        </div>

        {confirmEnd && (
          <OverlayPortal>
          <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="End field trip">
            <div className="w-full max-w-md rounded-t-[28px] bg-[#0E2A36] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 text-white">
              <h2 className="text-[16px] font-semibold">End this field trip?</h2>
              <p className="mt-1 text-[13px] text-white/75">
                {formatElapsed(elapsed)}
                {server ? ` · ${formatDistance(server.distance_meters)} · ${plural(server.stop_count, 'stop')}` : ''}
              </p>
              <p className="mt-1 text-[12px] text-white/55">Your route and stops will be saved to Journey History.</p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmEnd(false)}
                  className="h-12 flex-1 rounded-2xl border border-white/15 text-[13px] font-medium"
                >
                  Keep going
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void end()}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FD6046] text-[13px] font-semibold disabled:opacity-60"
                >
                  {busy && <Loader2 size={15} className="animate-spin" />} End trip
                </button>
              </div>
            </div>
          </div>
          </OverlayPortal>
        )}
      </>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <>
      {trip.lastEnded && (
        <div className="mb-3 flex items-center justify-between rounded-[18px] bg-white/5 px-4 py-2.5 text-white">
          <p className="text-[12px] text-white/80">
            Trip saved · {formatDistance(trip.lastEnded.distance_meters)} · {plural(trip.lastEnded.stop_count, 'stop')}
          </p>
          <Link
            href={`${journeyBasePath}/${trip.lastEnded.id}`}
            onClick={() => trip.clearLastEnded()}
            className="text-[12px] font-semibold text-[#44AFCD]"
          >
            View journey ›
          </Link>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setPreflightOpen(true)}
        className="mb-5 flex h-[76px] w-full items-center gap-3 rounded-[20px] bg-[#44AFCD] px-4 text-left text-[#0A1D25] shadow-[0_14px_34px_rgba(68,175,205,0.35)] active:scale-[0.98] disabled:opacity-70"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A1D25]/10">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <MapPin size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold leading-tight">Start Field Trip</span>
          <span className="block truncate text-[11px] font-medium opacity-75">
            {trip.today && trip.today.trip_count > 0
              ? `${plural(trip.today.trip_count, 'trip')} today · ${formatDistance(trip.today.distance_meters)}`
              : 'Track your route and stops'}
          </span>
        </span>
        <Play size={18} fill="currentColor" className="shrink-0" />
      </button>

      {preflightOpen && (
        <FieldTripPreflightSheet open onClose={() => setPreflightOpen(false)} onReady={onReady} />
      )}
    </>
  );
}
