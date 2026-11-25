'use client';

import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

import { toast } from '@/lib/toast';
import { useApproveLeadField, useDeclineLeadField } from '@/manager/features/crm/queries';
import { isPendingUniversalRequest } from '@/manager/features/crm/customFields';
import type { LeadFieldDefinition } from '@/manager/features/crm';

export function PwaPendingUniversalFieldsCard({
  fields,
}: {
  fields: LeadFieldDefinition[];
}) {
  const pending = fields.filter(isPendingUniversalRequest);
  const approve = useApproveLeadField();
  const decline = useDeclineLeadField();
  const [reasons, setReasons] = useState<Record<number, string>>({});

  if (pending.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-[#FD6046]/40 bg-[#0B3343] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#FD6046]">
        Universal field requests ({pending.length})
      </p>
      <p className="mt-1 text-[10px] text-white/60">
        Approve to show on every new lead form. Decline keeps the field on existing leads only.
      </p>
      <div className="mt-2 space-y-2">
        {pending.map((field) => (
          <div key={field.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{field.label}</p>
                <p className="text-[10px] text-white/50">
                  Type: <span className="capitalize">{field.type}</span>
                  {field.created_by?.name ? ` · ${field.created_by.name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={approve.isPending || decline.isPending}
                  onClick={() => {
                    approve.mutate(field.id, {
                      onSuccess: () => toast.success(`“${field.label}” is now universal`),
                      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not approve'),
                    });
                  }}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300"
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  type="button"
                  disabled={approve.isPending || decline.isPending}
                  onClick={() => {
                    decline.mutate(
                      { fieldId: field.id, reason: reasons[field.id] },
                      {
                        onSuccess: () => toast.success(`“${field.label}” stays lead-only`),
                        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not decline'),
                      },
                    );
                  }}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/20 p-1.5 text-rose-300"
                  title="Decline"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              value={reasons[field.id] ?? ''}
              onChange={(event) => setReasons((current) => ({ ...current, [field.id]: event.target.value }))}
              placeholder="Optional decline reason"
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white placeholder-white/30 outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
