'use client';

import React, { useState } from 'react';
import { toast } from '@/lib/toast';
import { flattenApiError } from '@/lib/api/errors';
import { useClassifyFieldStop } from '../queries';
import type { FieldStop, FieldStopClassification } from '../types';

const CLASSIFY_OPTIONS: Array<{
  value: Exclude<FieldStopClassification, 'pending'>;
  label: string;
}> = [
  { value: 'customer_visit', label: 'Customer' },
  { value: 'lead_visit', label: 'Lead' },
  { value: 'org_visit', label: 'Org location' },
  { value: 'personal', label: 'Personal' },
  { value: 'ignore', label: 'Ignore' },
];

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export function StopClassifyRow({
  stop,
  busy,
  onClassify,
}: {
  stop: FieldStop;
  busy: boolean;
  onClassify: (
    stopId: number,
    classification: Exclude<FieldStopClassification, 'pending'>,
    leadId?: number,
  ) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Exclude<FieldStopClassification, 'pending'> | null>(
    null,
  );
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

export function useStopClassifier() {
  const classifyMutation = useClassifyFieldStop();

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

  return { handleClassify, busy: classifyMutation.isPending };
}
