'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, CircleDashed, Loader2, MapPinned, Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { flattenApiError } from '@/lib/api/errors';
import { useBottomNavVisibility } from '@/components/shared/BottomNavVisibility';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { formatDistance, plural } from '../format';
import { TripRouteMap } from '../components/TripRouteMap';
import type { JourneyRouteDto } from '../journeyDetail';
import { AddStopSheet } from './AddStopSheet';
import { StopRecordSheet } from './StopRecordSheet';
import { TripSummaryCard } from './TripSummaryCard';
import { useDeleteStop, useSubmitReport, useTripReport } from './queries';
import { stopTitle, stopWindow } from './rules';
import { ACTIVITY_OPTIONS, OUTCOME_OPTIONS, type ReportStop } from './types';

const activityLabel = (v: string) => ACTIVITY_OPTIONS.find((o) => o.value === v)?.label ?? null;
const outcomeLabel = (v: string | null) => (v ? OUTCOME_OPTIONS.find((o) => o.value === v)?.label ?? null : null);

function StopCard({
  stop,
  index,
  onOpen,
  onDelete,
}: {
  stop: ReportStop;
  index: number;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const recorded = stop.record_status === 'recorded';
  const syncing = stop.id < 0;
  const activity = stop.classification !== 'pending' ? activityLabel(stop.classification) : null;
  const outcome = outcomeLabel(stop.outcome);
  return (
    <div className={`rounded-2xl border bg-[#0E2A36] ${recorded ? 'border-white/10' : 'border-[#F59E0B]/50'}`}>
      <button type="button" onClick={onOpen} disabled={syncing} className="flex w-full items-start gap-3 p-3 text-left disabled:opacity-70">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
            recorded ? 'bg-[#22C55E] text-white' : 'bg-[#F59E0B] text-[#0A1D25]'
          }`}
        >
          {recorded ? <Check size={14} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">{stopTitle(stop, index)}</p>
          <p className="text-[11px] text-white/55">{stopWindow(stop)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recorded ? (
              <>
                {activity && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/85">{activity}</span>}
                {outcome && <span className="rounded-full bg-[#44AFCD]/15 px-2 py-0.5 text-[11px] text-[#44AFCD]">{outcome}</span>}
              </>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
                <CircleDashed size={11} /> Needs details
              </span>
            )}
            {stop.location_status === 'corrected' && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/70">Place corrected</span>}
            {stop.source === 'manual' && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/70">Added by you</span>}
            {stop.off_route && (
              <span className="flex items-center gap-1 rounded-full bg-[#FD6046]/15 px-2 py-0.5 text-[11px] text-[#FD6046]">
                <AlertTriangle size={10} /> Not on recorded route
              </span>
            )}
            {stop.attachments.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/70">
                <Paperclip size={10} /> {stop.attachments.length}
              </span>
            )}
            {syncing && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-[#FBBF24]">Waiting to sync</span>}
          </div>
          {stop.notes && <p className="mt-1.5 line-clamp-2 text-[12px] text-white/70">{stop.notes}</p>}
        </div>
        {!syncing && <ChevronRight size={16} className="mt-1 shrink-0 text-white/35" />}
      </button>
      {onDelete && !syncing && (
        <div className="flex justify-end border-t border-white/5 px-2 py-1">
          <button type="button" onClick={onDelete} className="flex h-9 items-center gap-1 px-2 text-[12px] text-white/55 active:text-[#FD6046]">
            <Trash2 size={13} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Review your trip": opens right after End. Every stop gets a record (what was
 * done, outcome, notes, files), missed stops can be added, then the report is
 * submitted and ELY writes the trip summary. Agents and managers.
 */
export function TripReviewScreen({
  tripId,
  route,
  homePath,
  journeyHref,
}: {
  tripId: number;
  route: JourneyRouteDto | null | undefined;
  homePath: string;
  journeyHref: string;
}) {
  const router = useRouter();
  const report = useTripReport(tripId);
  const submit = useSubmitReport(tripId);
  const deleteStop = useDeleteStop(tripId);
  const [openStop, setOpenStop] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReportStop | null>(null);
  const { hide, show } = useBottomNavVisibility();
  useEffect(() => {
    hide();
    return () => show();
  }, [hide, show]);

  const data = report.data;
  const trip = data?.trip;
  const stops = useMemo(() => data?.stops ?? [], [data?.stops]);
  const done = data?.completeness.recorded ?? 0;
  const total = data?.completeness.total ?? 0;
  const ended = !!trip?.ended_at && trip.status !== 'active';
  const submitted = trip?.report_status === 'submitted';
  const complete = total === done;
  const waitingSummary = submitted && !trip?.ai_summary;

  // After submitting, ELY's summary arrives within a minute: check back for it.
  const { refetch } = report;
  useEffect(() => {
    if (!waitingSummary) return undefined;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > 24) clearInterval(t);
      void refetch();
    }, 5000);
    return () => clearInterval(t);
  }, [waitingSummary, refetch]);

  const onSubmit = () => {
    if (!complete) {
      const first = stops.find((s) => s.record_status !== 'recorded');
      if (first) setOpenStop(first.id);
      return;
    }
    submit.mutate(undefined, {
      onSuccess: () => toast.success('Trip report submitted', 'Your manager can see it now.'),
      onError: (error) => toast.error('Could not submit the report', flattenApiError(error)),
    });
  };

  const current = openStop != null ? stops.findIndex((s) => s.id === openStop) : -1;

  return (
    <main className="min-h-screen bg-[#0A1D25] pb-[calc(env(safe-area-inset-bottom)+150px)] text-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-[#0A1D25]/95 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+24px)] backdrop-blur">
        <button type="button" onClick={() => router.push(homePath)} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/10">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold">{submitted ? 'Trip report' : 'Review your trip'}</h1>
          {trip && (
            <p className="truncate text-[11px] text-white/55">
              {trip.started_at ? new Date(trip.started_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
              {trip.ended_at ? ` – ${new Date(trip.ended_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ' – now'} ·{' '}
              {formatDistance(trip.distance_meters)} · {plural(total, 'stop')}
            </p>
          )}
        </div>
      </header>

      {report.isLoading ? (
        <p className="flex items-center gap-2 px-5 py-8 text-sm text-white/60">
          <Loader2 size={16} className="animate-spin" /> Loading your trip…
        </p>
      ) : report.isError || !data ? (
        <div className="px-5 py-8">
          <p className="text-sm text-white/60">Could not load this trip.</p>
          <button type="button" onClick={() => void refetch()} className="mt-3 min-h-11 rounded-full bg-[#44AFCD] px-5 text-xs font-semibold text-[#0A1D25]">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-5 px-4 pt-2">
          {submitted && <TripSummaryCard summary={trip?.ai_summary} generating={waitingSummary} />}

          <TripRouteMap route={route} stops={stops} running={!ended} />

          {total > 0 && (
            <section className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-semibold">
                  {done} of {total} stops recorded
                </p>
                {submitted && trip?.report_submitted_at && (
                  <p className="text-[11px] text-[#22C55E]">Submitted {new Date(trip.report_submitted_at).toLocaleDateString()}</p>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <div className="h-full rounded-full bg-[#22C55E] transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
            </section>
          )}

          {total === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-[13px] text-white/70">
              <MapPinned size={18} className="mb-1 text-[#44AFCD]" />
              No stops were detected on this trip. If you stopped somewhere, add it below.
            </div>
          )}

          <section className="space-y-2">
            {stops.map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                index={i}
                onOpen={() => setOpenStop(stop.id)}
                onDelete={stop.source === 'manual' ? () => setConfirmDelete(stop) : undefined}
              />
            ))}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 text-[13px] font-medium text-white/85 active:bg-white/5"
            >
              <Plus size={16} /> Add a stop I made
            </button>
          </section>

          <Link href={journeyHref} className="block text-center text-[12px] font-medium text-[#44AFCD]">
            View full journey ›
          </Link>
        </div>
      )}

      {data && (
        <footer className="fixed inset-x-0 bottom-0 z-20 space-y-2 border-t border-white/8 bg-[#0E2A36] px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          {!ended ? (
            <p className="text-center text-[12px] text-white/60">You can record stops now. Submit the report after you end the trip.</p>
          ) : submitted ? (
            <button type="button" onClick={() => router.push(homePath)} className="h-12 w-full rounded-2xl border border-white/15 text-[14px] font-semibold">
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submit.isPending}
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:scale-[0.98] disabled:opacity-60 ${
                  complete ? 'bg-[#44AFCD] text-[#0A1D25]' : 'bg-[#F59E0B] text-[#0A1D25]'
                }`}
              >
                {submit.isPending ? <Loader2 size={16} className="animate-spin" /> : complete ? <Send size={15} /> : <ChevronRight size={16} />}
                {complete ? 'Submit trip report' : `Record ${plural(total - done, 'more stop')}`}
              </button>
              <button type="button" onClick={() => router.push(homePath)} className="h-10 w-full text-[13px] text-white/60">
                Finish later
                {data.policy === 'required' && <span className="text-white/40"> · needed before your next trip</span>}
              </button>
            </>
          )}
        </footer>
      )}

      {openStop != null && current >= 0 && (
        <StopRecordSheet
          key={openStop}
          tripId={tripId}
          stop={stops[current]}
          index={current}
          route={route?.coordinates}
          via="review"
          maxAttachments={data?.limits.max_attachments_per_stop}
          onClose={() => setOpenStop(null)}
        />
      )}

      {adding && trip && <AddStopSheet tripId={tripId} trip={trip} route={route} onClose={() => setAdding(false)} />}

      {confirmDelete && (
        <OverlayPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-[28px] bg-[#0E2A36] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5">
            <h2 className="text-[16px] font-semibold">Remove this stop?</h2>
            <p className="mt-1 text-[13px] text-white/65">{stopTitle(confirmDelete, stops.indexOf(confirmDelete))} and its notes and files will be removed.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="h-12 flex-1 rounded-2xl border border-white/15 text-[13px] font-medium">
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteStop.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="h-12 flex-1 rounded-2xl bg-[#FD6046] text-[13px] font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
        </OverlayPortal>
      )}
    </main>
  );
}
