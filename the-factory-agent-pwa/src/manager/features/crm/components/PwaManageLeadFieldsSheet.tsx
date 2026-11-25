'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

import { toast } from '@/lib/toast';
import {
  useDeleteLeadField,
  useLeadFields,
  useReorderLeadFields,
  useUpdateLeadField,
} from '@/manager/features/crm/queries';
import { isUniversalLeadField } from '@/manager/features/crm/customFields';
import type { LeadFieldDefinition } from '@/manager/features/crm';

export function PwaManageLeadFieldsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { data: fields = [] } = useLeadFields();
  const update = useUpdateLeadField();
  const remove = useDeleteLeadField();
  const reorder = useReorderLeadFields();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const active = useMemo(() => fields.filter((field) => field.status === 'active'), [fields]);

  if (!visible) return null;

  const move = (field: LeadFieldDefinition, direction: 'up' | 'down') => {
    if (reorder.isPending) return;
    const index = active.findIndex((item) => item.id === field.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= active.length) return;
    const next = [...active];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    reorder.mutate(next.map((item) => item.id), {
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not reorder fields'),
    });
  };

  return (
    <div className="fixed inset-0 z-[11000] flex items-end justify-center bg-black/50">
      <button type="button" className="absolute inset-0" aria-label="Close manage fields" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0A1D25] px-5 pb-8 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Manage lead fields</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-white/50">No custom fields yet.</p>
        ) : (
          <ul className="space-y-3">
            {active.map((field, index) => (
              <li key={field.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                {editingId === field.id ? (
                  <div className="space-y-2">
                    <input
                      value={labelDraft}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-[#FD6046] px-3 py-1.5 text-[11px] font-bold text-white"
                        onClick={() => {
                          update.mutate(
                            { fieldId: field.id, payload: { label: labelDraft } },
                            { onSuccess: () => setEditingId(null) },
                          );
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white">
                      {field.label}{' '}
                      <span className="font-normal text-white/40">({field.type})</span>
                    </p>
                    <p className="text-[10px] text-white/45">
                      {field.is_universal ? 'Universal' : 'Lead-specific'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-[#44AFCD]"
                        onClick={() => {
                          setEditingId(field.id);
                          setLabelDraft(field.label);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={index === 0 || reorder.isPending}
                        className="rounded-md border border-white/15 p-1 text-white/70 disabled:opacity-40"
                        onClick={() => move(field, 'up')}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index >= active.length - 1 || reorder.isPending}
                        className="rounded-md border border-white/15 p-1 text-white/70 disabled:opacity-40"
                        onClick={() => move(field, 'down')}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {!isUniversalLeadField(field) ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-emerald-300"
                          onClick={() => update.mutate({ fieldId: field.id, payload: { is_universal: true } })}
                        >
                          Make universal
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-rose-300"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Delete ${field.label}? Saved values stay on existing leads, but the column is removed from forms and lists.`,
                          );
                          if (confirmed) remove.mutate(field.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
