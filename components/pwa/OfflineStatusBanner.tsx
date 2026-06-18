"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOfflineSnapshot, type OfflineSnapshot } from "@/lib/offline/queue";
import {
  getRuntimeSyncStatus,
  subscribeRuntimeSyncStatus,
} from "@/lib/offline/sync-engine";

const EMPTY_SNAPSHOT: OfflineSnapshot = {
  pendingActions: 0,
  pendingUploads: 0,
  failedActions: 0,
  pendingConflicts: 0,
};

export default function OfflineStatusBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [snapshot, setSnapshot] = useState<OfflineSnapshot>(EMPTY_SNAPSHOT);
  const [isSyncing, setIsSyncing] = useState(getRuntimeSyncStatus().isSyncing);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      const next = await getOfflineSnapshot();
      if (mounted) setSnapshot(next);
    };

    refresh();
    const interval = window.setInterval(refresh, 8000);
    const unsubscribe = subscribeRuntimeSyncStatus((status) => {
      if (mounted) setIsSyncing(status.isSyncing);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const hasPending =
    snapshot.pendingActions > 0 ||
    snapshot.pendingUploads > 0 ||
    snapshot.failedActions > 0 ||
    snapshot.pendingConflicts > 0;

  if (isOnline && !isSyncing && !hasPending) return null;

  return (
    <div className="fixed top-3 left-1/2 z-[60] w-[min(96%,760px)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#0B2330]/95 px-4 py-2 text-white shadow-2xl backdrop-blur">
      <div className="text-xs font-semibold">
        {!isOnline
          ? "Offline Mode Active"
          : isSyncing
            ? "Syncing queued actions..."
            : "Pending synchronization"}
      </div>
      <div className="mt-1 text-[11px] text-white/75">
        Actions: {snapshot.pendingActions} | Uploads: {snapshot.pendingUploads} | Failed:{" "}
        {snapshot.failedActions}
        {snapshot.pendingConflicts > 0 ? ` | Conflicts: ${snapshot.pendingConflicts}` : ""}
      </div>
      {snapshot.pendingConflicts > 0 ? (
        <Link
          href="/sync/conflicts"
          className="mt-1 inline-block text-[11px] font-semibold text-[#75ADAF] underline"
        >
          Resolve conflicts
        </Link>
      ) : null}
    </div>
  );
}

