'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Loader2, Search, User } from 'lucide-react';
import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { readSession } from '@/session/sessionStore';
import { OverlayPortal } from '@/components/shared/OverlayPortal';

export interface PickedEntity {
  id: number;
  name: string;
}

interface Row {
  id: number;
  name: string;
  detail: string | null;
}

function listOf(raw: unknown): Record<string, unknown>[] {
  const d = (raw as { data?: unknown })?.data ?? raw;
  const inner = (d as { data?: unknown; items?: unknown; leads?: unknown; locations?: unknown }) ?? {};
  const list = Array.isArray(d) ? d : inner.items ?? inner.data ?? inner.leads ?? inner.locations ?? [];
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

/** Search CRM customers/leads, or the company's own locations (works for agents and managers). */
async function search(kind: 'lead' | 'location', q: string): Promise<Row[]> {
  const manager = readSession()?.app_mode === 'manager';
  const params = { company_id: getActiveCompanyId() ?? undefined, search: q || undefined, per_page: 25 };
  if (kind === 'lead') {
    const res = await client.get(manager ? '/admin/crm/leads' : '/agent/crm/leads', { params, suppressErrorToast: true });
    return listOf(res.data).map((l) => ({
      id: Number(l.id),
      name: String(l.company_name || l.name || `Lead #${l.id}`),
      detail: (l.company_name && l.name ? String(l.name) : null) ?? (l.address ? String(l.address) : null),
    }));
  }
  const res = await client.get(manager ? '/admin/locations' : '/agent/locations', { params, suppressErrorToast: true });
  return listOf(res.data)
    .filter((l) => !q || String(l.name ?? '').toLowerCase().includes(q.toLowerCase()))
    .map((l) => ({ id: Number(l.id), name: String(l.name ?? `Location #${l.id}`), detail: l.address ? String(l.address) : null }));
}

export function CrmPicker({
  kind,
  onClose,
  onPick,
}: {
  kind: 'lead' | 'location';
  onClose: () => void;
  onPick: (picked: PickedEntity) => void;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      void search(kind, q.trim())
        .then((r) => !cancelled && setRows(r))
        .catch(() => !cancelled && setError('Could not search. Check your connection.'))
        .finally(() => !cancelled && setLoading(false));
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kind, q]);

  const Icon = kind === 'lead' ? User : Building2;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[10060] flex flex-col bg-[#0A1D25] text-white" role="dialog" aria-modal="true">
        <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/10">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-[16px] font-semibold">{kind === 'lead' ? 'Choose the customer or lead' : 'Choose the company location'}</h2>
        </div>
        <div className="px-4 pb-3">
          <label className="flex h-11 items-center gap-2 rounded-2xl border border-white/12 bg-[#0B3343]/60 px-3">
            <Search size={16} className="text-white/50" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={kind === 'lead' ? 'Search by name or company' : 'Search locations'}
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading && (
            <p className="flex items-center gap-2 py-6 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin" /> Searching…
            </p>
          )}
          {!loading && error && <p className="py-6 text-sm text-[#FD6046]">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="py-6 text-sm text-white/60">
              {kind === 'lead' ? 'No matches. For a new prospect, choose "Lead / prospect" and describe them in the notes.' : 'No locations found.'}
            </p>
          )}
          {!loading &&
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick({ id: r.id, name: r.name })}
                className="flex min-h-14 w-full items-center gap-3 border-b border-white/5 py-2 text-left active:bg-white/5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-[#44AFCD]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  {r.detail && <span className="block truncate text-[11px] text-white/55">{r.detail}</span>}
                </span>
              </button>
            ))}
        </div>
      </div>
    </OverlayPortal>
  );
}
