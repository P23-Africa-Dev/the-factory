'use client';

import React, { useMemo, useState } from 'react';
import { Check, Clock, Loader2, MapPin, PencilLine, X } from 'lucide-react';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { AttachmentPicker } from './AttachmentPicker';
import { PlacePickerSheet, type PickedPlace } from './PlacePickerSheet';
import { Section, StopDetailsFields } from './StopDetailsFields';
import { newClientId, retryAttachmentsFor } from './api';
import { useAddStop } from './queries';
import { fromTimeInput, guessStopTimes, toRecordInput, toTimeInput, validateStopForm, type FormState } from './rules';
import type { StopAttachment } from './types';
import type { JourneyRouteDto } from '../journeyDetail';

const EMPTY: FormState = {
  activity: null,
  leadId: null,
  leadName: null,
  locationId: null,
  outcome: null,
  followUpAt: null,
  notes: '',
  place: null,
};

/**
 * "Add a stop I made": a stop the system did not detect. Pick the place on the
 * map (the trip's route is shown), times are guessed from the route, then the
 * same details as any stop.
 */
export function AddStopSheet({
  tripId,
  trip,
  route,
  onClose,
}: {
  tripId: number;
  trip: { started_at: string | null; ended_at: string | null };
  route: JourneyRouteDto | null | undefined;
  onClose: () => void;
}) {
  const [clientStopId] = useState(() => newClientId());
  const [openedAt] = useState(() => Date.now());
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [placeOpen, setPlaceOpen] = useState(true);
  const [arrived, setArrived] = useState('');
  const [departed, setDeparted] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [files, setFiles] = useState<StopAttachment[]>([]);
  const [tried, setTried] = useState(false);
  const addStop = useAddStop(tripId);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const coords = useMemo(() => route?.coordinates ?? [], [route]);
  const initialPlace = useMemo<PickedPlace>(() => {
    const c = coords[Math.floor(coords.length / 2)];
    return c ? { latitude: c[1], longitude: c[0], address: null } : { latitude: 6.5244, longitude: 3.3792, address: null };
  }, [coords]);

  const base = useMemo(() => new Date(trip.started_at ?? openedAt), [trip.started_at, openedAt]);
  const tripStart = trip.started_at ? Date.parse(trip.started_at) : 0;
  const tripEnd = trip.ended_at ? Date.parse(trip.ended_at) : openedAt + 3_600_000;

  const times = useMemo(() => {
    if (!arrived || !departed) return null;
    let a = fromTimeInput(base, arrived);
    let d = fromTimeInput(base, departed);
    // A trip past midnight: times earlier than the start belong to the next day.
    if (a.getTime() < tripStart - 300_000) a = new Date(a.getTime() + 86_400_000);
    if (d.getTime() < a.getTime()) d = new Date(d.getTime() + 86_400_000);
    return { a, d };
  }, [arrived, departed, base, tripStart]);

  const timeError = !times
    ? 'Enter when you arrived and left.'
    : times.d.getTime() <= times.a.getTime()
      ? 'The leaving time must be after the arrival.'
      : times.a.getTime() < tripStart - 300_000 || times.d.getTime() > tripEnd + 300_000
        ? 'The stop must be during this trip.'
        : null;
  const formError = validateStopForm(form);
  const error = !place ? 'Choose where you stopped.' : timeError ?? formError;

  const onPlace = (p: PickedPlace) => {
    setPlace(p);
    setPlaceOpen(false);
    if (!arrived) {
      const g = guessStopTimes(p, route, trip);
      setArrived(toTimeInput(g.arrived));
      setDeparted(toTimeInput(g.departed));
    }
  };

  const save = () => {
    setTried(true);
    if (error || !place || !times || !form.activity) return;
    const record = toRecordInput(form, 'review');
    addStop.mutate(
      {
        activity: record.activity,
        lead_id: record.lead_id,
        company_location_id: record.company_location_id,
        outcome: record.outcome,
        follow_up_at: record.follow_up_at,
        notes: record.notes,
        via: 'review',
        client_stop_id: clientStopId,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        arrived_at: times.a.toISOString(),
        departed_at: times.d.toISOString(),
      },
      {
        onSuccess: () => {
          if (files.length) void retryAttachmentsFor(clientStopId).catch(() => {});
          onClose();
        },
      },
    );
  };

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[10050] flex flex-col bg-[#0A1D25] text-white" role="dialog" aria-modal="true" aria-label="Add a stop">
        <header className="flex items-center gap-2 border-b border-white/8 px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+24px)]">
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-white/10">
            <X size={20} />
          </button>
          <div>
            <h2 className="text-[16px] font-semibold">Add a stop you made</h2>
            <p className="text-[11px] text-white/55">For a stop the app did not pick up</p>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <Section title="Place">
            <button
              type="button"
              onClick={() => setPlaceOpen(true)}
              className={`flex min-h-14 w-full items-center gap-2.5 rounded-2xl border bg-[#0E2A36] p-3 text-left ${tried && !place ? 'border-[#FD6046]' : 'border-white/10'}`}
            >
              <MapPin size={18} className="shrink-0 text-[#F59E0B]" />
              <span className={`flex-1 text-[14px] ${place ? 'font-medium' : 'text-white/50'}`}>
                {place ? place.address || `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : 'Choose on the map'}
              </span>
              <PencilLine size={14} className="text-white/50" />
            </button>
          </Section>

          <Section title="When" hint="Guessed from your route · adjust if needed">
            <div className={`grid grid-cols-2 gap-2 rounded-2xl ${tried && timeError ? 'p-1 ring-1 ring-[#FD6046]' : ''}`}>
              {[
                { label: 'Arrived', value: arrived, onChange: setArrived },
                { label: 'Left', value: departed, onChange: setDeparted },
              ].map((f) => (
                <label key={f.label} className="flex h-14 flex-col justify-center rounded-2xl border border-white/12 bg-[#0E2A36] px-3">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/50">
                    <Clock size={10} /> {f.label}
                  </span>
                  <input
                    type="time"
                    value={f.value}
                    onChange={(e) => f.onChange(e.target.value)}
                    className="bg-transparent text-[15px] font-medium text-white outline-none [color-scheme:dark]"
                  />
                </label>
              ))}
            </div>
            {tried && timeError && <p className="text-[11px] text-[#FD6046]">{timeError}</p>}
          </Section>

          <StopDetailsFields form={form} set={set} tried={tried} />

          <Section title="Photos & documents" hint={files.length ? `${files.length}/10` : undefined}>
            <AttachmentPicker
              tripId={tripId}
              stopId={null}
              clientStopId={clientStopId}
              attachments={files}
              onLocalAdd={(a) => setFiles((l) => [...l, a])}
              onLocalRemove={(a) => setFiles((l) => l.filter((x) => x.client_attachment_id !== a.client_attachment_id))}
            />
          </Section>
        </div>

        <footer className="space-y-2 border-t border-white/8 bg-[#0E2A36] px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          {tried && error && <p className="text-[12px] text-[#FD6046]">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={addStop.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#44AFCD] text-[15px] font-semibold text-[#0A1D25] active:scale-[0.98] disabled:opacity-60"
          >
            {addStop.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Add stop
          </button>
        </footer>

        {placeOpen && (
          <PlacePickerSheet
            title="Where did you stop?"
            initial={place ?? initialPlace}
            route={coords}
            onClose={() => (place ? setPlaceOpen(false) : onClose())}
            onPick={onPlace}
          />
        )}
      </div>
    </OverlayPortal>
  );
}
