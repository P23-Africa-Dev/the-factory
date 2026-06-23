"use client";

import { useCallback, useEffect, useState } from "react";
import {
  describeHttpMutation,
  listHttpMutationQueue,
  retryHttpMutation,
  type QueueListItem,
} from "@/lib/offline/queue";
import { syncAllOfflineMutations } from "@/lib/offline/sync-engine";
import { useConnectivityStatus } from "@/lib/offline/connectivity";
import { toast } from "sonner";

function statusBadgeClass(status: QueueListItem["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/15 text-amber-200 border-amber-400/30";
    case "syncing":
      return "bg-cyan-500/15 text-cyan-200 border-cyan-400/30";
    case "failed":
      return "bg-red-500/15 text-red-200 border-red-400/30";
    case "synced":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
    default:
      return "bg-white/10 text-white/80 border-white/20";
  }
}

export default function SyncQueuePage() {
  const { isOffline } = useConnectivityStatus();
  const [items, setItems] = useState<QueueListItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listHttpMutationQueue();
    setItems(rows);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const pendingCount = items.filter((item) =>
    ["pending", "syncing"].includes(item.status),
  ).length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const syncedCount = items.filter((item) => item.status === "synced").length;
  const lastSynced = items.find((item) => item.status === "synced");
  const lastFailed = items.find((item) => item.status === "failed");

  const handleSyncNow = async () => {
    if (isOffline) {
      toast.info("Reconnect to the internet to sync queued changes.");
      return;
    }
    setIsSyncing(true);
    try {
      await syncAllOfflineMutations();
      await refresh();
      toast.success("Sync completed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetry = async (id: number) => {
    setBusyId(id);
    try {
      await retryHttpMutation(id);
      if (!isOffline) {
        await syncAllOfflineMutations();
      }
      await refresh();
      toast.success("Action queued for retry.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Offline Sync Queue</h1>
          <p className="mt-2 text-sm text-white/70">
            Review actions saved locally while offline and their synchronization status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSyncNow()}
          disabled={isSyncing || isOffline}
          className="rounded-xl border border-[#75ADAF]/40 bg-[#75ADAF]/10 px-4 py-2 text-sm font-semibold text-[#75ADAF] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSyncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Pending</div>
          <div className="mt-1 text-2xl font-bold">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Failed</div>
          <div className="mt-1 text-2xl font-bold text-red-200">{failedCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Completed</div>
          <div className="mt-1 text-2xl font-bold text-emerald-200">{syncedCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Connection</div>
          <div className="mt-1 text-sm font-semibold">
            {isOffline ? "Offline" : "Online"}
          </div>
        </div>
      </div>

      {(lastSynced || lastFailed) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          {lastSynced ? (
            <div>Last successful sync: {new Date(lastSynced.updatedAt).toLocaleString()}</div>
          ) : null}
          {lastFailed ? (
            <div className="mt-1">
              Last failed sync: {new Date(lastFailed.updatedAt).toLocaleString()}
              {lastFailed.lastError ? ` — ${lastFailed.lastError}` : ""}
            </div>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          No offline actions in the queue yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{describeHttpMutation(item)}</div>
                  <div className="mt-1 text-xs text-white/60">
                    Queued {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(item.status)}`}
                >
                  {item.status}
                </span>
              </div>
              {item.lastError ? (
                <div className="mt-2 text-xs text-red-200">{item.lastError}</div>
              ) : null}
              {item.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => void handleRetry(item.id)}
                  disabled={busyId === item.id}
                  className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 disabled:opacity-50"
                >
                  {busyId === item.id ? "Retrying…" : "Retry"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
