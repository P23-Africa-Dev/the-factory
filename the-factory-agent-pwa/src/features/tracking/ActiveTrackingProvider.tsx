'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { useLocationReporter } from './hooks/useLocationReporter';
import { isNativeAndroid } from './native/capacitorPlatform';
import { stopNativeBackgroundWatch } from './native/nativeBackgroundGeolocation';

type TrackingCallbacks = {
  onArrived?: () => void;
  onNearDestination?: () => void;
  onDistanceRemaining?: (meters: number | null) => void;
};

interface ActiveTrackingContextValue {
  startTracking: (taskId: number, companyId: number, callbacks?: TrackingCallbacks) => void;
  stopTracking: () => Promise<void>;
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
      setCompanyId(resolvedCompanyId || getActiveCompanyId() || 0);
      setActiveTrackingTaskId(taskId);
    },
    [setActiveTrackingTaskId],
  );

  const stopTracking = useCallback(async () => {
    if (flushRef.current) {
      await flushRef.current();
    }
    if (isNativeAndroid()) {
      await stopNativeBackgroundWatch();
    }
    callbacksRef.current = {};
    setActiveTrackingTaskId(null);
    setServerSimulatesMovement(false);
    setCompanyId(0);
  }, [setActiveTrackingTaskId, setServerSimulatesMovement]);

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
