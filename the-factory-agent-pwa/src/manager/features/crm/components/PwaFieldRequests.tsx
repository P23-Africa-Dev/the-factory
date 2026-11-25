'use client';

import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

import { toast } from '@/lib/toast';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { crmApi } from '@/manager/features/crm/api';
import { crmKeys } from '@/manager/features/crm/queryKeys';
import {
  FIELD_REQUESTS_PAGE_SIZE,
  bannerLabel,
  filterFieldRequests,
  pendingFieldRequests,
  usageLabel,
  type FieldRequestSort,
} from '@/manager/features/crm/fieldRequests';
import type { LeadFieldDefinition } from '@/manager/features/crm';

function requestedAgo(field: LeadFieldDefinition): string | null {
  if (!field.created_at) return null;
  try {
    return `${formatDistanceToNowStrict(parseISO(field.created_at))} ago`;
  } catch {
    return null;
  }
}

/**
 * One line ("N field requests waiting for review · Review") that opens the review
 * sheet. Renders nothing without pending requests, so it never grows.
 */
export function PwaFieldRequestsBanner({ fields }: { fields: LeadFieldDefinition[] }) {
  const [open, setOpen] = useState(false);
  const count = pendingFieldRequests(fields).length;

  if (count === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-[#FD6046]/40 bg-[#0B3343] px-3 py-2.5 text-left"
      >
        <Inbox className="h-4 w-4 shrink-0 text-[#FD6046]" aria-hidden />
        <span className="flex-1 text-xs font-semibold text-white">{bannerLabel(count)}</span>
        <span className="flex items-center gap-0.5 text-xs font-bold text-[#FD6046]">
          Review <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
      {open ? <PwaFieldRequestsSheet fields={fields} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Bottom sheet: search, sort, approve or decline one request (reason box only after
 * Decline), or several at once. Handled rows leave the list.
 */
export function PwaFieldRequestsSheet({
  fields,
  onClose,
}: {
  fields: LeadFieldDefinition[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FieldRequestSort>('newest');
  const [visible, setVisible] = useState(FIELD_REQUESTS_PAGE_SIZE);
  const [selected, setSelected] = useState<number[]>([]);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const [handledIds, setHandledIds] = useState<number[]>([]);

  const pending = useMemo(
    () => pendingFieldRequests(fields).filter((field) => !handledIds.includes(field.id)),
    [fields, handledIds],
  );
  const filtered = useMemo(() => filterFieldRequests(pending, query, sort), [pending, query, sort]);
  const shown = filtered.slice(0, visible);
  const selectedPending = selected.filter((id) => pending.some((field) => field.id === id));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: crmKeys.leadFields(getActiveCompanyId()) });
  };

  const act = async (field: LeadFieldDefinition, action: 'approve' | 'decline', declineReason?: string) => {
    setBusyIds((ids) => [...ids, field.id]);
    try {
      if (action === 'approve') {
        await crmApi.approveLeadField(field.id);
      } else {
        await crmApi.declineLeadField(field.id, declineReason || undefined);
      }
      setHandledIds((ids) => [...ids, field.id]);
      setSelected((ids) => ids.filter((id) => id !== field.id));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Couldn't update “${field.label}”`);
      return false;
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== field.id));
    }
  };

  const actOne = async (field: LeadFieldDefinition, action: 'approve' | 'decline') => {
    const ok = await act(field, action, action === 'decline' ? reason.trim() : undefined);
    if (!ok) return;
    refresh();
    if (action === 'decline') {
      setDecliningId(null);
      setReason('');
    }
    toast.success(action === 'approve' ? `“${field.label}” is now on every new lead` : `“${field.label}” stays lead-only`);
  };

  const actMany = async (action: 'approve' | 'decline') => {
    const targets = pending.filter((field) => selectedPending.includes(field.id));
    let done = 0;
    for (const field of targets) {
      if (await act(field, action)) done += 1;
    }
    if (done > 0) {
      refresh();
      toast.success(`${action === 'approve' ? 'Approved' : 'Declined'} ${done} ${done === 1 ? 'request' : 'requests'}`);
    }
  };

  const allShownSelected = shown.length > 0 && shown.every((field) => selectedPending.includes(field.id));
  const bulkBusy = busyIds.length > 0;

  return (
    <div className="fixed inset-0 z-[11000] flex items-end justify-center bg-black/50">
      <button type="button" className="absolute inset-0" aria-label="Close field requests" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Field requests"
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-[#0A1D25]"
      >
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <div>
            <p className="text-sm font-bold text-white">
              Field requests <span className="font-normal text-white/50">· {pending.length}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-white/60">
              Approve to show on every new lead form. Decline keeps the field on existing leads only.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-white/60" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 px-5 pb-3">
          <label className="flex flex-1 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5">
            <Search className="h-3.5 w-3.5 text-white/40" aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisible(FIELD_REQUESTS_PAGE_SIZE);
              }}
              placeholder="Search field or agent"
              aria-label="Search field requests"
              className="h-9 w-full bg-transparent text-xs text-white placeholder-white/30 outline-none"
            />
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as FieldRequestSort)}
            aria-label="Sort field requests"
            className="h-9 rounded-xl border border-white/10 bg-[#0B3343] px-2 text-xs text-white"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {shown.length > 0 ? (
          <div className="flex items-center gap-2 border-y border-white/10 px-5 py-2 text-[11px] text-white/60">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={() =>
                  setSelected((ids) =>
                    allShownSelected
                      ? ids.filter((id) => !shown.some((field) => field.id === id))
                      : Array.from(new Set([...ids, ...shown.map((field) => field.id)])),
                  )
                }
                aria-label="Select all shown requests"
              />
              {selectedPending.length > 0 ? `${selectedPending.length} selected` : 'Select all'}
            </label>
            {selectedPending.length > 0 ? (
              <span className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => actMany('approve')}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 font-bold text-emerald-300 disabled:opacity-50"
                >
                  Approve {selectedPending.length}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => actMany('decline')}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-2 py-1 font-bold text-rose-300 disabled:opacity-50"
                >
                  Decline {selectedPending.length}
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto pb-6">
          {pending.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-white/60">All field requests are handled.</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-white/60">No requests match “{query}”.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {shown.map((field) => {
                const busy = busyIds.includes(field.id);
                const meta = [field.created_by?.name ?? 'An agent', requestedAgo(field), usageLabel(field.usage_count)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={field.id} className={`px-5 py-2.5 ${decliningId === field.id ? 'bg-white/5' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedPending.includes(field.id)}
                        onChange={() =>
                          setSelected((ids) => (ids.includes(field.id) ? ids.filter((id) => id !== field.id) : [...ids, field.id]))
                        }
                        aria-label={`Select ${field.label}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">
                          {field.label} <span className="font-normal capitalize text-white/40">· {field.type}</span>
                        </p>
                        <p className="truncate text-[10px] text-white/50">{meta}</p>
                      </div>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" aria-hidden /> : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => actOne(field, 'approve')}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDecliningId(decliningId === field.id ? null : field.id);
                          setReason('');
                        }}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                    {decliningId === field.id ? (
                      <div className="mt-2 flex gap-2 pl-6">
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Reason (optional)"
                          aria-label={`Decline reason for ${field.label}`}
                          className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] text-white placeholder-white/30 outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => actOne(field, 'decline')}
                          className="rounded-lg bg-rose-500/30 px-2.5 text-[11px] font-bold text-rose-200 disabled:opacity-50"
                        >
                          Confirm decline
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > shown.length ? (
            <button
              type="button"
              onClick={() => setVisible((count) => count + FIELD_REQUESTS_PAGE_SIZE)}
              className="w-full border-t border-white/10 px-5 py-3 text-xs font-bold text-white/70"
            >
              Showing {shown.length} of {filtered.length} · Show more
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
