"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AgentPendingFieldStop } from "@/lib/api/field-activity";
import {
  useAgentPendingReview,
  useClassifyAgentFieldStop,
} from "@/hooks/use-agent-field-review";

const OPTIONS = [
  { value: "customer_visit", label: "Customer" },
  { value: "lead_visit", label: "Lead" },
  { value: "org_visit", label: "Org location" },
  { value: "personal", label: "Personal" },
  { value: "ignore", label: "Ignore" },
] as const;

function StopRow({
  stop,
  busy,
  onClassify,
}: {
  stop: AgentPendingFieldStop;
  busy: boolean;
  onClassify: (stopId: number, classification: string, leadId?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [leadId, setLeadId] = useState("");
  const needsLead = selected === "customer_visit" || selected === "lead_visit";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dash-dark">
            {stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.round(stop.duration_seconds / 60)} min · {stop.classification}
          </p>
        </div>
        {stop.classification === "pending" && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[#75ADAF]/15 px-3 py-1 text-xs font-semibold text-[#2F5E71]"
          >
            Classify
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                onClick={() => setSelected(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  selected === opt.value
                    ? "border-[#2F5E71] bg-[#2F5E71] text-white"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {needsLead && (
            <input
              type="number"
              placeholder="Lead ID"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
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
            className="w-full rounded-xl bg-[#2F5E71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save classification
          </button>
        </div>
      )}
    </div>
  );
}

export function AgentDayReviewModal({
  open,
  onClose,
  onPile,
}: {
  open: boolean;
  onClose: () => void;
  onPile: () => void;
}) {
  const { data, refetch } = useAgentPendingReview(open);
  const classify = useClassifyAgentFieldStop();

  const stops = useMemo(() => {
    const first = data?.sessions?.[0];
    return first?.stops?.filter((s) => s.classification === "pending") ?? [];
  }, [data]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F5E71]">
              Day review
            </p>
            <h3 className="mt-1 text-lg font-bold text-dash-dark">Complete your journey</h3>
            <p className="mt-1 text-sm text-slate-500">
              {(data?.pending_stop_count ?? 0) > 0
                ? `${data?.pending_stop_count} stop(s) still need classification.`
                : "All caught up for now."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {stops.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Nothing left to classify.
            </p>
          ) : (
            stops.map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                busy={classify.isPending}
                onClassify={async (stopId, classification, leadId) => {
                  try {
                    await classify.mutateAsync({ stopId, classification, lead_id: leadId });
                    toast.success("Stop classified");
                    void refetch();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not classify stop");
                  }
                }}
              />
            ))
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPile();
              toast.success("Piled for later");
            }}
            className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-700"
          >
            Pile for later
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-[#2F5E71] py-3 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentPileInboxPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, refetch, isLoading } = useAgentPendingReview(open);
  const classify = useClassifyAgentFieldStop();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-600">
              Review inbox
            </p>
            <h3 className="mt-1 text-lg font-bold text-dash-dark">Piled day reviews</h3>
            <p className="mt-1 text-sm text-slate-500">
              {data?.pending_stop_count ?? 0} stop(s) across {data?.pending_session_count ?? 0} day(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (data?.sessions?.length ?? 0) === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            Inbox is clear.
          </p>
        ) : (
          <div className="space-y-5">
            {data!.sessions.map((session) => (
              <div key={session.session_id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dash-dark">
                    {session.started_at
                      ? new Date(session.started_at).toLocaleDateString()
                      : "Unknown date"}
                  </p>
                  <span className="text-xs text-slate-400">
                    {session.pending_stop_count} pending
                  </span>
                </div>
                {session.stops.map((stop) => (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    busy={classify.isPending}
                    onClassify={async (stopId, classification, leadId) => {
                      try {
                        await classify.mutateAsync({
                          stopId,
                          classification,
                          lead_id: leadId,
                        });
                        toast.success("Stop classified");
                        void refetch();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Could not classify stop",
                        );
                      }
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentPileInboxButton({ onClick }: { onClick: () => void }) {
  const { data } = useAgentPendingReview();
  const count = data?.pending_stop_count ?? 0;
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-700"
    >
      Review inbox
      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white">
        {count}
      </span>
    </button>
  );
}
