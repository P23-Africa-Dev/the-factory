'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { client } from '@/lib/api/client';
import { useLocationReporter } from './hooks/useLocationReporter';
import { isNativeAndroid } from './native/capacitorPlatform';
import {
  endLiveTrackingIndicator,
  notifyTrackingCompleted,
  notifyTrackingPaused,
} from '@/lib/notifications/trackingAlerts';

type TrackingCallbacks = {
  onArrived?: () => void;
  onNearDestination?: () => void;
  onDistanceRemaining?: (meters: number | null) => void;
};

export type StopTrackingReason = 'completed' | 'paused' | 'stopped' | 'silent';

type StopTrackingOptions = {
  /** Why tracking ended — drives the device notification. Default: silent. */
  reason?: StopTrackingReason;
  /** Optional title used in the “completed” notification. */
  taskTitle?: string | null;
};

interface ActiveTrackingContextValue {
  startTracking: (taskId: number, companyId: number, callbacks?: TrackingCallbacks) => void;
  stopTracking: (options?: StopTrackingOptions) => Promise<void>;
  isTracking: boolean;
  activeTaskId: number | null;
}

const ActiveTrackingContext = createContext<ActiveTrackingContextValue>({
  startTracking: () => {},
  stopTracking: async () => {},
  isTracking: false,
  activeTaskId: null,
});

export function useActiveTracking(): ActiveTrackingContextValue {
  return useContext(ActiveTrackingContext);
}

function ActiveTrackingReporter({
  taskId,
  companyId,
  callbacksRef,
  onFlushReady,
  serverSimulatesMovement,
}: {
  taskId: number;
  companyId: number;
  callbacksRef: React.MutableRefObject<TrackingCallbacks>;
  onFlushReady: (flush: () => Promise<void>) => void;
  serverSimulatesMovement: boolean;
}) {
  const { flush } = useLocationReporter({
    taskId,
    companyId,
    active: !serverSimulatesMovement,
    onArrived: () => callbacksRef.current.onArrived?.(),
    onNearDestination: () => callbacksRef.current.onNearDestination?.(),
    onDistanceRemaining: (m) => callbacksRef.current.onDistanceRemaining?.(m),
  });

  React.useEffect(() => {
    onFlushReady(flush);
  }, [flush, onFlushReady]);

  return null;
}

/** The task being tracked survives reloads / app restarts (cleared on stop). */
const ACTIVE_TASK_KEY = 'tracking:active_task_v1';

function saveActiveTask(value: { taskId: number; companyId: number } | null): void {
  try {
    if (value) localStorage.setItem(ACTIVE_TASK_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACTIVE_TASK_KEY);
  } catch {
    // Storage unavailable: tracking simply does not resume after a reload.
  }
}

function readActiveTask(): { taskId: number; companyId: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TASK_KEY);
    const parsed = raw ? (JSON.parse(raw) as { taskId?: unknown; companyId?: unknown }) : null;
    const taskId = Number(parsed?.taskId);
    const companyId = Number(parsed?.companyId);
    return taskId > 0 && companyId > 0 ? { taskId, companyId } : null;
  } catch {
    return null;
  }
}

export function ActiveTrackingProvider({ children }: { children: React.ReactNode }) {
  const activeTrackingTaskId = useTrackingStore((s) => s.activeTrackingTaskId);
  const serverSimulatesMovement = useTrackingStore((s) => s.serverSimulatesMovement);
  const setActiveTrackingTaskId = useTrackingStore((s) => s.setActiveTrackingTaskId);
  const setServerSimulatesMovement = useTrackingStore((s) => s.setServerSimulatesMovement);
  const [companyId, setCompanyId] = useState(0);
  const callbacksRef = useRef<TrackingCallbacks>({});
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const startTracking = useCallback(
    (taskId: number, resolvedCompanyId: number, callbacks?: TrackingCallbacks) => {
      callbacksRef.current = callbacks ?? {};
      const company = resolvedCompanyId || getActiveCompanyId() || 0;
      setCompanyId(company);
      setActiveTrackingTaskId(taskId);
      saveActiveTask(company > 0 ? { taskId, companyId: company } : null);
    },
    [setActiveTrackingTaskId],
  );

  // App reloaded or reopened while a task was being tracked: resume it, but
  // only if the server still has the task in progress.
  useEffect(() => {
    const saved = readActiveTask();
    if (!saved || useTrackingStore.getState().activeTrackingTaskId != null) return;
    let cancelled = false;
    void client
      .get(`/tasks/${saved.taskId}`, { params: { company_id: saved.companyId } })
      .then((res) => {
        const body = res.data as { data?: { task?: { status?: string } } & { status?: string } };
        const status = body?.data?.task?.status ?? body?.data?.status;
        if (cancelled || useTrackingStore.getState().activeTrackingTaskId != null) return;
        if (status === 'in_progress') {
          setCompanyId(saved.companyId);
          setActiveTrackingTaskId(saved.taskId);
        } else {
          saveActiveTask(null);
        }
      })
      .catch((error: { status?: number }) => {
        // Gone / not yours any more: forget it. Offline: keep it for next time.
        if (error?.status === 403 || error?.status === 404 || error?.status === 422) saveActiveTask(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setActiveTrackingTaskId]);

  const stopTracking = useCallback(
    async (options?: StopTrackingOptions) => {
      const reason = options?.reason ?? 'silent';
      const taskId = useTrackingStore.getState().activeTrackingTaskId;
      const liveTitle =
        options?.taskTitle ??
        (taskId != null ? useTrackingStore.getState().liveTaskMap[taskId]?.taskTitle : null);

      if (flushRef.current) {
        await flushRef.current();
      }
      // The task reporter unmounts below and releases its geolocation
      // subscription; the shared native watcher stops only when no other
      // tracker (e.g. an active field trip) still needs it.
      if (!isNativeAndroid()) {
        await endLiveTrackingIndicator();
      }

      callbacksRef.current = {};
      setActiveTrackingTaskId(null);
      setServerSimulatesMovement(false);
      setCompanyId(0);
      saveActiveTask(null);

      if (taskId == null || reason === 'silent') return;

      if (reason === 'completed') {
        await notifyTrackingCompleted(taskId, liveTitle);
      } else if (reason === 'paused') {
        await notifyTrackingPaused(taskId);
      }
      // 'stopped' alerts are fired by callers (e.g. unauthorized / error paths)
    },
    [setActiveTrackingTaskId, setServerSimulatesMovement],
  );

  const handleFlushReady = useCallback((flush: () => Promise<void>) => {
    flushRef.current = flush;
  }, []);

  return (
    <ActiveTrackingContext.Provider
      value={{
        startTracking,
        stopTracking,
        isTracking: activeTrackingTaskId != null,
        activeTaskId: activeTrackingTaskId,
      }}
    >
      {activeTrackingTaskId != null && companyId > 0 && (
        <ActiveTrackingReporter
          taskId={activeTrackingTaskId}
          companyId={companyId}
          callbacksRef={callbacksRef}
          onFlushReady={handleFlushReady}
          serverSimulatesMovement={serverSimulatesMovement}
        />
      )}
      {children}
    </ActiveTrackingContext.Provider>
  );
}
