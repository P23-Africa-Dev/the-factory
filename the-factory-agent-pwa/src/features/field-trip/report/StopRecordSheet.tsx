'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, MapPin, PencilLine, X } from 'lucide-react';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { AttachmentPicker } from './AttachmentPicker';
import { PlacePickerSheet } from './PlacePickerSheet';
import { Section, StopDetailsFields } from './StopDetailsFields';
import { useRecordStop } from './queries';
import { formFromStop, stopWindow, toRecordInput, validateStopForm, type FormState } from './rules';
import type { ReportStop, StopActivity } from './types';

/**
 * The full stop form: place (confirm / change), what was done, outcome,
 * notes and attachments. Shared by the live card ("Add details") and the trip review.
 */
export function StopRecordSheet({
  tripId,
  stop,
  index,
  route,
  via,
  initialActivity,
  maxAttachments = 10,
  onClose,
}: {
  tripId: number;
  stop: ReportStop;
  index: number;
  route?: [number, number][];
  via: 'live' | 'review';
  initialActivity?: StopActivity | null;
  maxAttachments?: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => {
    const f = formFromStop(stop);
    return initialActivity ? { ...f, activity: initialActivity } : f;
  });
  const [placeOpen, setPlaceOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const record = useRecordStop(tripId);

  const error = useMemo(() => validateStopForm(form), [form]);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const shownPlace = form.place ?? { latitude: stop.latitude, longitude: stop.longitude, address: stop.address };
  const placeState = form.place ? 'changed' : stop.location_status;

  const save = () => {
    setTried(true);
    if (error) return;
    // Optimistic: the stop shows as recorded at once; a failure rolls back with a toast.
    record.mutate({ stopId: stop.id, input: toRecordInput(form, via), leadName: form.leadName });
    onClose();
  };

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[10050] flex flex-col bg-[#0A1D25] text-white" role="dialog" aria-modal="true" aria-label="Record this stop">
        <header className="flex items-start gap-2 border-b border-white/8 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+10px)]">
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-white/10">
            <X size={20} />
          </button>
          <div className="min-w-0 pt-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#44AFCD]">
              Stop {index + 1}
              {stop.source === 'manual' && ' · added by you'}
            </p>
            <h2 className="truncate text-[16px] font-semibold">{stopWindow(stop)}</h2>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <Section title="Place">
            <div className="rounded-2xl border border-white/10 bg-[#0E2A36] p-3">
              <div className="flex items-start gap-2.5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-[#F59E0B]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-snug">
                    {shownPlace.address || `${shownPlace.latitude.toFixed(5)}, ${shownPlace.longitude.toFixed(5)}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    {placeState === 'changed' && 'Changed · saved when you save the stop'}
                    {placeState === 'corrected' && 'Corrected by you'}
                    {placeState === 'confirmed' && 'Confirmed'}
                    {placeState === 'unconfirmed' && 'Detected from GPS · is this the right place?'}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set({ place: null })}
                  aria-pressed={!form.place}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium ${
                    !form.place ? 'bg-white/10 text-white' : 'border border-white/15 text-white/80'
                  }`}
                >
                  <Check size={14} /> {form.place ? 'Use detected' : 'Right place'}
                </button>
                <button
                  type="button"
                  onClick={() => setPlaceOpen(true)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 text-[13px] font-medium text-white/80"
                >
                  <PencilLine size={14} /> Change place
                </button>
              </div>
            </div>
          </Section>

          <StopDetailsFields form={form} set={set} tried={tried} initialLocationName={stop.location_name} />

          <Section title="Photos & documents" hint={stop.attachments.length ? `${stop.attachments.length}/${maxAttachments}` : undefined}>
            <AttachmentPicker tripId={tripId} stopId={stop.id} clientStopId={stop.client_stop_id} attachments={stop.attachments} max={maxAttachments} />
          </Section>
        </div>

        <footer className="space-y-2 border-t border-white/8 bg-[#0E2A36] px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          {tried && error && <p className="text-[12px] text-[#FD6046]">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={record.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#44AFCD] text-[15px] font-semibold text-[#0A1D25] active:scale-[0.98] disabled:opacity-60"
          >
            {record.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Save stop
          </button>
        </footer>

        {placeOpen && (
          <PlacePickerSheet
            initial={shownPlace}
            detected={{ latitude: stop.original_latitude ?? stop.latitude, longitude: stop.original_longitude ?? stop.longitude }}
            route={route}
            onClose={() => setPlaceOpen(false)}
            onPick={(p) => {
              set({ place: p });
              setPlaceOpen(false);
            }}
          />
        )}
      </div>
    </OverlayPortal>
  );
}
