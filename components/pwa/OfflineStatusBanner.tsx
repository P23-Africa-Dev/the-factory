"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
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
  const [isOnline, setIsOnline] = useState(true);
  const [snapshot, setSnapshot] = useState<OfflineSnapshot>(EMPTY_SNAPSHOT);
  const [isSyncing, setIsSyncing] = useState(getRuntimeSyncStatus().isSyncing);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const probeConnectivity = async () => {
      if (typeof navigator === "undefined") return true;
      if (navigator.onLine) return true;

      try {
        const response = await fetch(`/favicon.ico?probe=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
        });
        return response.ok;
      } catch {
        return false;
      }
    };

    const refresh = async () => {
      const next = await getOfflineSnapshot();
      if (mounted) setSnapshot(next);
    };

    const evaluateConnection = async () => {
      const connected = await probeConnectivity();
      if (mounted) {
        setIsOnline(connected);
        if (connected) {
          setIsPanelOpen(false);
        }
      }
    };

    refresh();
    evaluateConnection();
    const interval = window.setInterval(refresh, 8000);
    const unsubscribe = subscribeRuntimeSyncStatus((status) => {
      if (mounted) setIsSyncing(status.isSyncing);
    });

    const handleOnline = () => {
      setIsOnline(true);
      setIsPanelOpen(false);
    };
    const handleOffline = () => {
      evaluateConnection();
    };

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

  if (isOnline) return null;

  return (
    <div className="group fixed bottom-5 right-5 z-[60]">
      <button
        type="button"
        onClick={() => setIsPanelOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-[#0B2330]/95 text-amber-200 shadow-2xl backdrop-blur transition hover:scale-[1.03]"
        aria-label="Offline mode details"
        title="Offline mode active"
      >
        <WifiOff size={18} />
      </button>

      <div
        className={`absolute bottom-14 right-0 w-72 rounded-xl border border-white/15 bg-[#0B2330]/95 px-3 py-2 text-white shadow-2xl backdrop-blur ${
          isPanelOpen ? "block" : "hidden group-hover:block"
        }`}
      >
        <div className="text-xs font-semibold">Offline Mode Active</div>
        <div className="mt-1 text-[11px] text-white/75">
          Actions: {snapshot.pendingActions} | Uploads: {snapshot.pendingUploads} | Failed:{" "}
          {snapshot.failedActions}
          {snapshot.pendingConflicts > 0 ? ` | Conflicts: ${snapshot.pendingConflicts}` : ""}
        </div>
        {isSyncing ? (
          <div className="mt-1 text-[11px] text-[#75ADAF]">Sync will resume when connected.</div>
        ) : null}
        {!hasPending ? (
          <div className="mt-1 text-[11px] text-white/60">No queued changes pending.</div>
        ) : null}
        {snapshot.pendingConflicts > 0 ? (
          <Link
            href="/sync/conflicts"
            className="mt-1 inline-block text-[11px] font-semibold text-[#75ADAF] underline"
          >
            Resolve conflicts
          </Link>
        ) : null}
      </div>
    </div>
  );
}

