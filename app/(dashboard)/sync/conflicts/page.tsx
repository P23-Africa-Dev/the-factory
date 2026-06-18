"use client";

import { useEffect, useState } from "react";
import { resolveConflict, listPendingConflicts } from "@/lib/offline/queue";
import { syncAllOfflineMutations } from "@/lib/offline/sync-engine";
import { toast } from "sonner";

type PendingConflict = Awaited<ReturnType<typeof listPendingConflicts>>[number];

export default function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<PendingConflict[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refreshConflicts = async () => {
    const rows = await listPendingConflicts();
    setConflicts(rows);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshConflicts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleResolve = async (
    conflictId: number,
    resolution: "keep_local" | "keep_server" | "merged",
  ) => {
    setBusyId(conflictId);
    try {
      await resolveConflict(conflictId, resolution);
      await syncAllOfflineMutations();
      await refreshConflicts();
      toast.success("Conflict resolved.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-white">
      <h1 className="text-2xl font-bold">Offline Sync Conflicts</h1>
      <p className="mt-2 text-sm text-white/70">
        Resolve edits made offline that conflict with newer server changes.
      </p>

      {conflicts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          No pending conflicts.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="text-sm font-semibold">
                {conflict.method} {conflict.path}
              </div>
              <p className="mt-1 text-xs text-white/70">{conflict.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    conflict.id != null &&
                    handleResolve(conflict.id, "keep_local")
                  }
                  disabled={busyId === conflict.id}
                  className="rounded-md bg-[#75ADAF] px-3 py-2 text-xs font-semibold text-[#0A1D25] disabled:opacity-50"
                >
                  Keep Local Version
                </button>
                <button
                  onClick={() =>
                    conflict.id != null &&
                    handleResolve(conflict.id, "keep_server")
                  }
                  disabled={busyId === conflict.id}
                  className="rounded-md border border-white/30 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Keep Server Version
                </button>
                <button
                  onClick={() =>
                    conflict.id != null && handleResolve(conflict.id, "merged")
                  }
                  disabled={busyId === conflict.id}
                  className="rounded-md bg-[#113948] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Merge Changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

