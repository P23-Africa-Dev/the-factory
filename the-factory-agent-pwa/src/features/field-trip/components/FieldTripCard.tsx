'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardList, Loader2, Map as MapIcon, MapPin, Play, Square, Wifi, WifiOff } from 'lucide-react';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import { checkLocationSettings, getPermissionStatus, openAppSettings } from '@/features/tracking/native/locationSettings';
import { readBrowserPosition } from '../preflight';
import { useFieldTrip } from '../FieldTripProvider';
import { formatDistance, formatElapsed, plural, secondsSince } from '../format';
import { FieldTripPreflightSheet } from './FieldTripPreflightSheet';
import type { TripPosition } from '../types';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { useTripReport } from '../report/queries';
import { tripReviewPath } from '../report/paths';

/** "Stops: 2 recorded · 1 to record ›" on the running trip. */
function TripStopsStrip({ tripId, onOpen }: { tripId: number; onOpen: () => void }) {
  const report = useTripReport(tripId, { live: true });
  const c = report.data?.completeness;
  if (!c || c.total === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-white/5 px-3 text-left text-[12px] active:bg-white/10"
    >
      <ClipboardList size={14} className="shrink-0 text-[#44AFCD]" />
      <span className="flex-1">
        Stops: {c.recorded} recorded
        {c.pending > 0 && <span className="font-semibold text-[#F59E0B]"> · {c.pending} to record</span>}
      </span>
      <ChevronRight size={14} className="text-white/40" />
    </button>
  );
}

const GPS_LABEL = {
  waiting: 'Waiting for GPS…',
  good: 'GPS good',
  weak: 'GPS weak',
  lost: 'GPS lost — keep the app open',
} as const;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

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
  const online = useOnline();
  const reviewed = useRef<Set<number>>(new Set());
  const [gate, setGate] = useState<number | null>(null);

  // Trip just ended with stops to record: straight to "Review your trip".
  const ended = trip.lastEnded;
  useEffect(() => {
    if (!ended || ended.report_status !== 'due' || reviewed.current.has(ended.id)) return;
    reviewed.current.add(ended.id);
    router.push(tripReviewPath(ended.id));
  }, [ended, router]);

  const gateRequired = trip.reportPolicy === 'required' && trip.reportDue != null;
  const startPressed = () => {
    if (gateRequired && trip.reportDue) {
      // Same answer as the server: finish the last report first.
      setGate(trip.reportDue.trip_id);
      return;
    }
    setPreflightOpen(true);
  };
  const gateTrip = gate ?? trip.reportGate;
  const closeGate = () => {
    setGate(null);
    trip.clearReportGate();
  };

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

  /** GPS off → Android's own "turn on location" dialog; permission missing → app settings. */
  const fixLocation = async () => {
    const settings = await checkLocationSettings({ highAccuracy: true, showDialog: true });
    if (!settings.enabled) return;
    const status = await getPermissionStatus();
    if (status.foreground !== 'granted' || !status.precise || status.background !== 'granted') {
      await openAppSettings();
    }
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
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span>
              {ending
                ? online
                  ? 'Saving your route…'
                  : 'Saved on this phone · uploads when online'
                : !online || !trip.synced
                  ? `Offline · ${GPS_LABEL[trip.gps]} · will sync`
                  : GPS_LABEL[trip.gps]}
            </span>
          </p>
          {trip.local.serverId != null && !ending && (
            <TripStopsStrip tripId={trip.local.serverId} onOpen={() => router.push(tripReviewPath(trip.local!.serverId as number))} />
          )}
          {!ending && (trip.gps === 'lost' || (trip.gps === 'waiting' && elapsed > 120)) && (
            <div className="mt-2 rounded-xl bg-[#FBBF24]/10 px-3 py-2 text-[11px] text-[#FBBF24]">
              <p>
                {trip.gps === 'lost' ? 'No GPS for over 2 minutes.' : 'Still no GPS position after 2 minutes.'} Check
                that Location is on and set to precise, and that the app may use location all the time.
              </p>
              {isNativeAndroid() && (
                <button
                  type="button"
                  onClick={() => void fixLocation()}
                  className="mt-2 min-h-11 rounded-full bg-[#FBBF24] px-4 text-[12px] font-semibold text-[#0A1D25]"
                >
                  Fix location
                </button>
              )}
            </div>
          )}
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
  const due = trip.reportDue;
  return (
    <>
      {due && (
        <button
          type="button"
          onClick={() => router.push(tripReviewPath(due.trip_id))}
          className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-2.5 text-left text-white"
        >
          <ClipboardList size={18} className="shrink-0 text-[#F59E0B]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">Trip report due</span>
            <span className="block truncate text-[11px] text-white/70">
              {due.pending_stop_count > 0 ? `${plural(due.pending_stop_count, 'stop')} to record` : 'Ready to submit'}
              {due.due_count > 1 ? ` · ${due.due_count} trips` : ''}
              {trip.reportPolicy === 'required' ? ' · needed before your next trip' : ''}
            </span>
          </span>
          <ChevronRight size={16} className="text-white/50" />
        </button>
      )}
      {trip.lastEnded && trip.lastEnded.report_status !== 'due' && (
        <div className="mb-3 flex items-center justify-between rounded-[18px] bg-white/5 px-4 py-2.5 text-white">
          <p className="text-[12px] text-white/80">
            {trip.lastEnded.end_reason === 'auto_no_signal' ? 'Trip ended automatically (no location)' : 'Trip saved'} ·{' '}
            {formatDistance(trip.lastEnded.distance_meters)} · {plural(trip.lastEnded.stop_count, 'stop')}
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
        onClick={startPressed}
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

      {gateTrip != null && (
        <OverlayPortal>
          <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Finish your last trip report">
            <div className="w-full max-w-md rounded-t-[28px] bg-[#0E2A36] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 text-white">
              <ClipboardList size={22} className="text-[#F59E0B]" />
              <h2 className="mt-2 text-[16px] font-semibold">Finish your last trip report first</h2>
              <p className="mt-1 text-[13px] text-white/70">
                {due && due.pending_stop_count > 0
                  ? `${plural(due.pending_stop_count, 'stop')} from your last trip still need details. It only takes a minute.`
                  : 'Your last trip report is ready to submit.'}
              </p>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={closeGate} className="h-12 flex-1 rounded-2xl border border-white/15 text-[13px] font-medium">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = gateTrip || due?.trip_id;
                    closeGate();
                    if (id) router.push(tripReviewPath(id));
                  }}
                  className="h-12 flex-[1.4] rounded-2xl bg-[#F59E0B] text-[13px] font-semibold text-[#0A1D25]"
                >
                  Finish report
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
