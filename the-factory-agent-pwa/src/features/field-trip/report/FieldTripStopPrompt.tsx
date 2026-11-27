'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Check, ChevronRight, Loader2, MapPin, X } from 'lucide-react';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { useNotificationStore } from '@/store/notifications';
import { useOptionalFieldTrip } from '../FieldTripProvider';
import { Chip } from './StopDetailsFields';
import { StopRecordSheet } from './StopRecordSheet';
import { useRecordStop, useStopPrompt, useTripReport } from './queries';
import { isVisit, needsOutcome, stopWindow } from './rules';
import { ACTIVITY_OPTIONS, type StopActivity } from './types';

const PROMPTED_KEY = 'factory23.field-trip.prompted-stops';

function readPrompted(): number[] {
  try {
    return JSON.parse(sessionStorage.getItem(PROMPTED_KEY) ?? '[]') as number[];
  } catch {
    return [];
  }
}

function markPrompted(id: number): void {
  try {
    const list = readPrompted();
    if (!list.includes(id)) sessionStorage.setItem(PROMPTED_KEY, JSON.stringify([...list, id].slice(-50)));
  } catch {
    // storage unavailable: prompts may repeat, harmless
  }
}

function positive(v: string | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * "You've stopped — what are you doing here?" Opens for a new stop on the
 * person's running trip (live check, in-app notification, or a tap on the
 * push), so the stop is recorded on the spot in two taps.
 * Mounted once per app shell (agents and managers).
 */
/**
 * Push tapped → "/?stop=12&trip=3" (also when the app was closed, or already
 * open on the home screen: only the query changes then).
 */
function StopDeepLink({ activeTripId, open }: { activeTripId: number | null; open: (tripId: number, stopId: number) => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const stopParam = search.get('stop');
  const tripParam = search.get('trip');

  useEffect(() => {
    const stop = positive(stopParam);
    if (!stop) return;
    const trip = positive(tripParam) ?? activeTripId;
    if (!trip) return; // wait until the running trip is known
    markPrompted(stop);
    open(trip, stop);
    const params = new URLSearchParams(window.location.search);
    params.delete('stop');
    params.delete('trip');
    const rest = params.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${rest ? `?${rest}` : ''}`);
  }, [stopParam, tripParam, pathname, activeTripId, open]);

  return null;
}

export function FieldTripStopPrompt() {
  const fieldTrip = useOptionalFieldTrip();
  const { stopId, tripId, later, open, dismiss } = useStopPrompt();
  const activeTripId = fieldTrip?.local?.phase === 'active' ? fieldTrip.local.serverId : null;

  // 2. App open: the in-app notification for a new stop.
  useEffect(
    () =>
      useNotificationStore.subscribe((state, prev) => {
        const n = state.pendingNotification;
        if (!n || n === prev.pendingNotification || n.type !== 'field_trip.stop_detected') return;
        const meta = n.metadata ?? {};
        const stop = Number(meta.field_stop_id ?? n.reference_id);
        const trip = Number(meta.field_activity_session_id ?? 0) || useStopPrompt.getState().tripId;
        if (!stop || !trip || useStopPrompt.getState().later.includes(stop)) return;
        markPrompted(stop);
        open(trip, stop);
      }),
    [open],
  );

  // 3. Live check while on a trip (works without push or websocket).
  const live = useTripReport(activeTripId, { live: true });
  useEffect(() => {
    if (!activeTripId || !live.data || stopId) return;
    const prompted = readPrompted();
    const fresh = live.data.stops.find(
      (s) =>
        s.source === 'detected' &&
        s.record_status === 'pending' &&
        !s.departed_at &&
        !later.includes(s.id) &&
        !prompted.includes(s.id),
    );
    if (fresh) {
      markPrompted(fresh.id);
      open(activeTripId, fresh.id);
    }
  }, [activeTripId, live.data, stopId, later, open]);

  return (
    <>
      <Suspense fallback={null}>
        <StopDeepLink activeTripId={activeTripId} open={open} />
      </Suspense>
      {stopId && tripId ? <QuickRecordCard key={stopId} tripId={tripId} stopId={stopId} onDismiss={dismiss} /> : null}
    </>
  );
}

function QuickRecordCard({ tripId, stopId, onDismiss }: { tripId: number; stopId: number; onDismiss: (later?: boolean) => void }) {
  const report = useTripReport(tripId, { live: true });
  const record = useRecordStop(tripId);
  const index = report.data?.stops.findIndex((s) => s.id === stopId) ?? -1;
  const stop = index >= 0 ? report.data?.stops[index] : undefined;
  const [picked, setChoice] = useState<StopActivity | null>(null);
  // Pre-selected when the stop was matched (e.g. a known customer's address).
  const choice = picked ?? (stop && stop.classification !== 'pending' ? stop.classification : null);
  const [details, setDetails] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const duration = useMemo(() => {
    if (!stop) return null;
    const seconds = stop.departed_at
      ? stop.duration_seconds
      : Math.max(stop.duration_seconds, (now - Date.parse(stop.arrived_at ?? '')) / 1000 || 0);
    return { ...stop, duration_seconds: seconds };
  }, [stop, now]);

  // The cached report may predate this stop: fetch once more, then give up
  // quietly if it is still not there (removed, or not this person's).
  const [openedAt] = useState(() => Date.now());
  const { refetch, isFetching } = report;
  useEffect(() => {
    if (report.isError) {
      onDismiss(false);
      return;
    }
    if (!report.isSuccess || stop || isFetching) return;
    if (report.dataUpdatedAt < openedAt) void refetch();
    else onDismiss(false);
  }, [report.isSuccess, report.isError, report.dataUpdatedAt, isFetching, stop, openedAt, refetch, onDismiss]);

  if (!stop || !duration) {
    return (
      <OverlayPortal>
        <div className="fixed inset-x-0 bottom-0 z-[10040] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+92px)]">
          <div className="flex w-full max-w-md items-center gap-2 rounded-[22px] bg-[#0E2A36] p-4 text-sm text-white/70 shadow-2xl">
            <Loader2 size={16} className="animate-spin" /> Loading your stop…
          </div>
        </div>
      </OverlayPortal>
    );
  }

  // A visit needs a customer/lead and how it went: go to the full form.
  const needsDetails = (a: StopActivity | null) => !!a && needsOutcome(a);
  const recorded = stop.record_status === 'recorded';

  const quickSave = () => {
    if (!choice) return;
    if (needsDetails(choice)) {
      setDetails(true);
      return;
    }
    record.mutate({
      stopId: stop.id,
      input: {
        activity: choice,
        via: 'live',
        lead_id: isVisit(choice) ? stop.lead_id : null,
        company_location_id: choice === 'org_visit' ? stop.company_location_id : null,
        location: { action: 'confirm' },
      },
    });
    onDismiss(false);
  };

  if (details) {
    return (
      <StopRecordSheet
        tripId={tripId}
        stop={stop}
        index={index}
        via="live"
        initialActivity={choice}
        maxAttachments={report.data?.limits.max_attachments_per_stop}
        onClose={() => onDismiss(false)}
      />
    );
  }

  return (
    <OverlayPortal>
      <div className="fixed inset-x-0 bottom-0 z-[10040] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+92px)]" role="dialog" aria-label="Record this stop">
        <div className="w-full max-w-md rounded-[24px] border border-[#F59E0B]/40 bg-[#0E2A36] p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]/15 text-[#F59E0B]">
              <MapPin size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F59E0B]">
                {recorded ? 'Stop recorded' : "You've stopped"} · {stopWindow(duration).split(' · ')[1]}
              </p>
              <p className="line-clamp-2 text-[14px] font-semibold leading-snug">
                {stop.lead_name || stop.location_name || stop.address || 'Finding the address…'}
              </p>
            </div>
            <button type="button" onClick={() => onDismiss(true)} aria-label="Later" className="-mr-1 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-white/60 active:bg-white/10">
              <X size={18} />
            </button>
          </div>

          <p className="mt-3 text-[12px] text-white/60">What are you doing here?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACTIVITY_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} active={choice === o.value} onClick={() => setChoice(o.value)} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_1.3fr] gap-2">
            <button
              type="button"
              onClick={() => setDetails(true)}
              className="flex h-11 items-center justify-center gap-1 rounded-2xl border border-white/15 text-[13px] font-medium active:bg-white/5"
            >
              Add details <ChevronRight size={14} />
            </button>
            <button
              type="button"
              disabled={!choice}
              onClick={quickSave}
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#44AFCD] text-[13px] font-semibold text-[#0A1D25] active:scale-[0.98] disabled:opacity-40"
            >
              {choice && needsDetails(choice) ? (
                <>
                  Next <ChevronRight size={14} />
                </>
              ) : (
                <>
                  <Check size={14} /> Save
                </>
              )}
            </button>
          </div>
          <button type="button" onClick={() => onDismiss(true)} className="mt-2 h-9 w-full text-[12px] text-white/55">
            Later — I&apos;ll record it when I end the trip
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
