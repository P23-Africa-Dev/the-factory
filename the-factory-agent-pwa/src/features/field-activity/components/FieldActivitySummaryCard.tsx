'use client';

import React, { useState } from 'react';
import { toast } from '@/lib/toast';
import { flattenApiError } from '@/lib/api/errors';
import { useClassifyFieldStop, useFieldActivityToday } from '../queries';
import type { FieldStop, FieldStopClassification } from '../types';

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} h`;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${(m / 60).toFixed(1)} h`;
}

const CLASSIFY_OPTIONS: Array<{
  value: Exclude<FieldStopClassification, 'pending'>;
  label: string;
  needsLead?: boolean;
}> = [
  { value: 'customer_visit', label: 'Customer', needsLead: true },
  { value: 'lead_visit', label: 'Lead', needsLead: true },
  { value: 'org_visit', label: 'Org location' },
  { value: 'personal', label: 'Personal' },
  { value: 'ignore', label: 'Ignore' },
];

function StopRow({
  stop,
  onClassify,
  busy,
}: {
  stop: FieldStop;
  onClassify: (
    stopId: number,
    classification: Exclude<FieldStopClassification, 'pending'>,
    leadId?: number,
  ) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Exclude<FieldStopClassification, 'pending'> | null>(null);
  const [leadId, setLeadId] = useState(stop.lead_id ? String(stop.lead_id) : '');

  const needsLead = selected === 'customer_visit' || selected === 'lead_visit';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
          </p>
          <p className="mt-1 text-xs text-[#8F9098]">
            {formatDuration(stop.duration_seconds)} · {stop.classification.replace('_', ' ')}
            {stop.match_type ? ` · ${stop.match_type}` : ''}
          </p>
        </div>
        {stop.classification === 'pending' && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[#75ADAF]/20 px-3 py-1 text-xs font-semibold text-[#75ADAF]"
          >
            Classify
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {CLASSIFY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                onClick={() => setSelected(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${
                  selected === opt.value
                    ? 'border-[#75ADAF] bg-[#75ADAF]/20 text-[#75ADAF]'
                    : 'border-white/15 text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {needsLead && (
            <input
              type="number"
              inputMode="numeric"
              placeholder="Lead ID"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            />
          )}
          <button
            type="button"
            disabled={busy || !selected || (needsLead && !leadId)}
            onClick={() => {
              if (!selected) return;
              onClassify(stop.id, selected, leadId ? Number(leadId) : undefined);
              setOpen(false);
            }}
            className="w-full rounded-xl bg-[#75ADAF] py-2.5 text-sm font-semibold text-[#0B1E26] disabled:opacity-50"
          >
            Save classification
          </button>
        </div>
      )}
    </div>
  );
}

export function FieldActivitySummaryCard(): React.ReactElement | null {
  const { data, isLoading, isError } = useFieldActivityToday();
  const classifyMutation = useClassifyFieldStop();

  if (isLoading || isError || !data?.enabled) {
    return null;
  }

  const pendingStops = (data.stops ?? []).filter((s) => s.classification === 'pending');
  const session = data.session;
  const summary = data.summary;
  const distance = summary?.distance_meters ?? session?.distance_meters ?? 0;
  const travel = summary?.travel_seconds ?? session?.travel_seconds ?? 0;
  const stops = summary?.stop_count ?? session?.stop_count ?? data.stops.length;
  const visits = summary?.visit_count ?? session?.visit_count ?? 0;
  const unknown = summary?.unknown_stop_count ?? session?.unknown_stop_count ?? pendingStops.length;

  const handleClassify = async (
    stopId: number,
    classification: Exclude<FieldStopClassification, 'pending'>,
    leadId?: number,
  ) => {
    try {
      await classifyMutation.mutateAsync({
        stopId,
        payload: {
          classification,
          lead_id: leadId,
          source: 'agent',
        },
      });
      toast.success('Stop classified');
    } catch (err) {
      toast.error(flattenApiError(err) || 'Could not classify stop');
    }
  };

  return (
    <section className="mx-4 mt-4 space-y-4">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#12323A] to-[#0B1E26] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#75ADAF]">
          Today’s field activity
        </p>
        {summary?.narrative ? (
          <p className="mt-3 text-sm leading-relaxed text-white/90">{summary.narrative}</p>
        ) : (
          <p className="mt-3 text-sm text-white/70">
            Automatic workday tracking from clock-in to clock-out.
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-[#8F9098]">Distance</p>
            <p className="text-lg font-bold text-white">{formatKm(distance)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#8F9098]">Travel</p>
            <p className="text-lg font-bold text-white">{formatHours(travel)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#8F9098]">Stops</p>
            <p className="text-lg font-bold text-white">{stops}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#8F9098]">Visits / Unknown</p>
            <p className="text-lg font-bold text-white">
              {visits} / {unknown}
            </p>
          </div>
        </div>
        {session?.status === 'active' && (
          <p className="mt-4 text-xs font-medium text-[#75ADAF]">Live tracking active</p>
        )}
      </div>

      {pendingStops.length > 0 && (
        <div className="space-y-3">
          <h3 className="px-1 text-sm font-semibold text-white">Classify unknown stops</h3>
          {pendingStops.map((stop) => (
            <StopRow
              key={stop.id}
              stop={stop}
              busy={classifyMutation.isPending}
              onClassify={handleClassify}
            />
          ))}
        </div>
      )}
    </section>
  );
}
