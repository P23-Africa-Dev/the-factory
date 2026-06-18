'use client';

import { useEffect, useState } from 'react';
import {
  listPendingConflicts,
  resolveOfflineConflict,
} from '@/lib/offline/queue';
import { syncEngine } from '@/lib/sync/syncEngine';
import { toast } from '@/lib/toast';

type PendingConflict = Awaited<ReturnType<typeof listPendingConflicts>>[number];

export default function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<PendingConflict[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadConflicts = async () => {
    const rows = await listPendingConflicts();
    setConflicts(rows);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConflicts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleResolve = async (
    conflictId: number,
    resolution: 'keep_local' | 'keep_server' | 'merged',
  ) => {
    setBusyId(conflictId);
    try {
      await resolveOfflineConflict(conflictId, resolution);
      await syncEngine.syncAll();
      await loadConflicts();
      toast.success('Conflict resolved');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1D25] text-white px-5 py-6">
      <h1 className="text-xl font-semibold">Sync Conflicts</h1>
      <p className="mt-2 text-xs text-white/70">
        Resolve changes made offline that conflict with newer server updates.
      </p>

      {conflicts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          No pending conflicts.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="text-sm font-semibold">{conflict.actionType}</div>
              <div className="mt-1 text-xs text-white/70">{conflict.message}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    conflict.id != null &&
                    handleResolve(conflict.id, 'keep_local')
                  }
                  disabled={busyId === conflict.id}
                  className="rounded-md bg-[#75ADAF] px-3 py-2 text-xs font-semibold text-[#0A1D25] disabled:opacity-50"
                >
                  Keep Local Version
                </button>
                <button
                  onClick={() =>
                    conflict.id != null &&
                    handleResolve(conflict.id, 'keep_server')
                  }
                  disabled={busyId === conflict.id}
                  className="rounded-md border border-white/30 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Keep Server Version
                </button>
                <button
                  onClick={() =>
                    conflict.id != null && handleResolve(conflict.id, 'merged')
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

