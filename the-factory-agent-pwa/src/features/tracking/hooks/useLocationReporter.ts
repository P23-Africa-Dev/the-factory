'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { useTrackingStore } from '@/store/tracking';
import { trackingApi } from '../api';
import {
  useGeolocation,
  type LocationObject,
  restartSharedGeolocationWatch,
  probeSharedGeolocationFix,
} from './useGeolocation';
import type { LocationQueueItem } from '../types';
import { toast } from '@/lib/toast';
import { isDocumentHidden, notifyTrackingStopped } from '@/lib/notifications/trackingAlerts';
import { isNativeAndroid } from '../native/capacitorPlatform';
import {
  forceRestartNativeBackgroundWatch,
  isNativeBackgroundWatching,
} from '../native/nativeBackgroundGeolocation';
import { withLocationUploadLock } from '@/lib/sync/locationUploadLock';
import {
  applyProximityFromSync,
  subscribeProximityFromSync,
} from '../proximityFromSync';
import {
  createBackgroundTrackingWatchdog,
  recordBackgroundLocationFix,
  type BackgroundTrackingWatchdog,
} from '@/lib/tracking/background-tracking-watchdog';
import {
  acquireTrackingWakeLock,
  installTrackingWakeLockVisibilityHandler,
  releaseTrackingWakeLock,
} from '@/lib/tracking/tracking-wake-lock';
import { maybePromptBatteryOptimizationOnTrackingStart } from '@/lib/tracking/battery-optimization-prompt';

interface LocationReporterOptions {
  taskId: number;
  companyId: number;
  active: boolean;
  onArrived?: () => void;
  onNearDestination?: () => void;
  onDistanceRemaining?: (meters: number | null) => void;
}

const HEARTBEAT_FLUSH_MS = 30_000;
const MOVING_FLUSH_MS = 2_000;
const FLUSH_DISTANCE_M = 20;
const MOVING_SPEED_MPS = 0.5;
const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 100;

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const useLocationReporter = ({
  taskId,
  companyId,
  active,
  onArrived,
  onNearDestination,
  onDistanceRemaining,
}: LocationReporterOptions): { flush: () => Promise<void> } => {
  const { startWatching, stopWatching } = useGeolocation();
  const memoryQueue = useRef<LocationQueueItem[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnauthorizedRef = useRef(false);
  const needsImmediateFlushRef = useRef(false);
  const lastFlushRef = useRef<{ atMs: number; lng: number; lat: number } | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const enqueueRef = useRef<(loc: LocationObject) => Promise<void>>(async () => {});
  const startWatchingRef = useRef(startWatching);
  const stopWatchingRef = useRef(stopWatching);
  const onArrivedRef = useRef(onArrived);
  const onNearRef = useRef(onNearDestination);
  const onDistanceRef = useRef(onDistanceRemaining);
  const taskIdRef = useRef(taskId);
  const companyIdRef = useRef(companyId);
  const activeRef = useRef(active);
  const watchdogRef = useRef<BackgroundTrackingWatchdog | null>(null);
  const wakeLockVisibilityCleanupRef = useRef<(() => void) | null>(null);
  const lastWatchdogToastAt = useRef(0);

  useEffect(() => {
    onArrivedRef.current = onArrived;
    onNearRef.current = onNearDestination;
    onDistanceRef.current = onDistanceRemaining;
  }, [onArrived, onNearDestination, onDistanceRemaining]);

  useEffect(() => {
    startWatchingRef.current = startWatching;
    stopWatchingRef.current = stopWatching;
  }, [startWatching, stopWatching]);

  useEffect(() => {
    taskIdRef.current = taskId;
    companyIdRef.current = companyId;
    activeRef.current = active;
  }, [taskId, companyId, active]);

  const buildQueueItem = useCallback(
    (loc: LocationObject): LocationQueueItem => ({
      taskId,
      companyId,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracyMeters: loc.coords.accuracy ?? null,
      speedMps: loc.coords.speed ?? null,
      headingDegrees: loc.coords.heading ?? null,
      recordedAt: new Date(loc.timestamp).toISOString(),
    }),
    [taskId, companyId],
  );

  const enqueue = useCallback(
    async (loc: LocationObject) => {
      recordBackgroundLocationFix();

      const item = buildQueueItem(loc);
      const point: [number, number] = [loc.coords.longitude, loc.coords.latitude];

      useTrackingStore.getState().appendPolylinePoint(taskId, point);
      useTrackingStore.getState().upsertTask(taskId, {
        lastPosition: point,
        lastHeadingDegrees: loc.coords.heading ?? null,
        lastSpeedMps: loc.coords.speed ?? null,
        lastUpdatedAt: new Date(loc.timestamp).toISOString(),
      });

      if (memoryQueue.current.length >= MAX_QUEUE_SIZE) {
        memoryQueue.current.shift();
      }
      memoryQueue.current.push(item);

      if (needsImmediateFlushRef.current) {
        needsImmediateFlushRef.current = false;
        void flushRef.current?.();
      } else {
        const last = lastFlushRef.current;
        const nowMs = Date.now();
        const movedM = last
          ? haversineMeters(last.lng, last.lat, loc.coords.longitude, loc.coords.latitude)
          : FLUSH_DISTANCE_M;
        const elapsed = last ? nowMs - last.atMs : MOVING_FLUSH_MS;
        const speed = loc.coords.speed ?? 0;
        const moving = speed > MOVING_SPEED_MPS || movedM > 3;
        if (!last || movedM >= FLUSH_DISTANCE_M || (moving && elapsed >= MOVING_FLUSH_MS)) {
          void flushRef.current?.();
        }
      }

      try {
        const db = await getDb();
        await db.add('locationQueue', {
          taskId: item.taskId,
          companyId: item.companyId,
          latitude: item.latitude,
          longitude: item.longitude,
          accuracyMeters: item.accuracyMeters,
          speedMps: item.speedMps,
          headingDegrees: item.headingDegrees,
          recordedAt: item.recordedAt,
          synced: 0,
          inFlight: 0,
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          lastError: null,
        });
        await requestBackgroundSync('location-sync');
      } catch (err) {
        console.warn('[LocationReporter] Failed to store checkpoint in db:', err);
      }
    },
    [buildQueueItem, taskId],
  );

  useEffect(() => {
    enqueueRef.current = enqueue;
  }, [enqueue]);

  useEffect(() => {
    isUnauthorizedRef.current = false;
  }, [taskId]);

  // Memory flush and syncEngine both notify via applyProximityFromSync.
  useEffect(() => {
    return subscribeProximityFromSync((syncedTaskId, payload) => {
      if (syncedTaskId !== taskIdRef.current) return;
      if (payload.distance_remaining_meters !== undefined) {
        onDistanceRef.current?.(payload.distance_remaining_meters ?? null);
      }
      if (payload.near_destination) {
        onNearRef.current?.();
      }
      if (payload.arrived) {
        onArrivedRef.current?.();
      }
    });
  }, []);

  const flush = useCallback(async () => {
    if (isUnauthorizedRef.current) return;
    if (memoryQueue.current.length === 0) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    await withLocationUploadLock(async () => {
      if (isUnauthorizedRef.current) return;
      if (memoryQueue.current.length === 0) return;

      const batch = memoryQueue.current.slice(0, MAX_BATCH_SIZE);
      const currentTaskId = taskIdRef.current;
      const currentCompanyId = companyIdRef.current;
      const syncedTimestamps = new Set(batch.map((b) => b.recordedAt));

      // Mark matching IDB rows in-flight so syncEngine skips them.
      try {
        const db = await getDb();
        const tx = db.transaction('locationQueue', 'readwrite');
        const pending = await tx.store.index('by-taskId').getAll(currentTaskId);
        for (const row of pending) {
          if (row.id != null && row.synced === 0 && syncedTimestamps.has(row.recordedAt)) {
            await tx.store.put({ ...row, inFlight: 1 });
          }
        }
        await tx.done;
      } catch {
        // Non-fatal — mutex still prevents most duplicate POSTs.
      }

      try {
        const response = await trackingApi.recordLocation(currentTaskId, {
          companyId: currentCompanyId,
          points: batch.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
            accuracyMeters: p.accuracyMeters,
            speedMps: p.speedMps,
            headingDegrees: p.headingDegrees,
            recordedAt: p.recordedAt,
          })),
        });

        memoryQueue.current = memoryQueue.current.slice(batch.length);

        const db = await getDb();
        const tx = db.transaction('locationQueue', 'readwrite');
        const pending = await tx.store.index('by-taskId').getAll(currentTaskId);
        const unsynced = pending.filter((p) => p.synced === 0);
        for (const row of unsynced) {
          if (row.id != null && syncedTimestamps.has(row.recordedAt)) {
            await tx.store.put({
              ...row,
              synced: 1,
              inFlight: 0,
              attempts: 0,
              nextAttemptAt: null,
              lastError: null,
            });
          }
        }
        await tx.done;

        applyProximityFromSync(currentTaskId, response);

        const lastPoint = batch[batch.length - 1];
        if (lastPoint) {
          lastFlushRef.current = {
            atMs: Date.now(),
            lng: lastPoint.longitude,
            lat: lastPoint.latitude,
          };
        }
      } catch (error: unknown) {
        const apiErr = error as { status?: number; message?: string };
        const status = apiErr?.status;
        const isAuthFailure = status === 401 || status === 403;
        const is422 = status === 422;

        // Clear inFlight on failure so syncEngine can retry (except auth/422 drop).
        try {
          const db = await getDb();
          const tx = db.transaction('locationQueue', 'readwrite');
          const pending = await tx.store.index('by-taskId').getAll(currentTaskId);
          for (const row of pending) {
            if (row.id != null && syncedTimestamps.has(row.recordedAt) && row.inFlight === 1) {
              if (is422) {
                // Drop invalid batch; keep tracking running.
                await tx.store.put({
                  ...row,
                  synced: 1,
                  inFlight: 0,
                  nextAttemptAt: null,
                  lastError: apiErr?.message ?? null,
                });
              } else {
                await tx.store.put({ ...row, inFlight: 0 });
              }
            }
          }
          await tx.done;
        } catch {
          // non-fatal
        }

        if (isAuthFailure) {
          isUnauthorizedRef.current = true;
          memoryQueue.current = [];

          try {
            const db = await getDb();
            const tx = db.transaction('locationQueue', 'readwrite');
            const pending = await tx.store.index('by-taskId').getAll(currentTaskId);
            const unsynced = pending.filter((p) => p.synced === 0);
            for (const row of unsynced) {
              if (row.id != null) {
                await tx.store.put({
                  ...row,
                  synced: 1,
                  inFlight: 0,
                  nextAttemptAt: null,
                  lastError: apiErr?.message ?? null,
                });
              }
            }
            await tx.done;
          } catch {
            // non-fatal
          }

          useTrackingStore.getState().setActiveTrackingTaskId(null);
          const msg = apiErr?.message || 'Your session expired. Please sign in again.';
          void notifyTrackingStopped(currentTaskId, msg);
          if (!isDocumentHidden()) {
            toast.error('Tracking Stopped', msg);
          }
        } else if (is422) {
          // Validation error for this batch — drop it, keep GPS/tracking alive.
          memoryQueue.current = memoryQueue.current.slice(batch.length);
          console.warn('[LocationReporter] Dropping invalid location batch (422):', apiErr?.message);
        } else {
          console.error('[LocationReporter] Geolocation sync error:', error);
        }
      }
    });
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const restartLocationWatch = useCallback(async () => {
    if (!activeRef.current) return;

    if (isNativeAndroid()) {
      if (isNativeBackgroundWatching()) {
        await forceRestartNativeBackgroundWatch();
      } else {
        await startWatchingRef.current((loc) => enqueueRef.current(loc));
      }
      return;
    }

    await restartSharedGeolocationWatch();
    await probeSharedGeolocationFix();
  }, []);

  // Watch lifecycle depends only on `active` so FGS is not torn down on flush/enqueue churn.
  useEffect(() => {
    if (!active) {
      stopWatchingRef.current();
      needsImmediateFlushRef.current = false;
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      wakeLockVisibilityCleanupRef.current?.();
      wakeLockVisibilityCleanupRef.current = null;
      void releaseTrackingWakeLock();
      return;
    }

    needsImmediateFlushRef.current = true;
    void acquireTrackingWakeLock();
    maybePromptBatteryOptimizationOnTrackingStart();
    wakeLockVisibilityCleanupRef.current = installTrackingWakeLockVisibilityHandler();

    void startWatchingRef.current((loc) => enqueueRef.current(loc)).catch((err) => {
      console.error('[tracking] failed to start location watch', err);
    });

    // Safety flushes: cover races where the first GPS sample arrives before
    // the flush callback is wired, or the immediate flag is already cleared.
    const safetyZero = window.setTimeout(() => {
      void flushRef.current?.();
    }, 0);
    const safetyOneSec = window.setTimeout(() => {
      void flushRef.current?.();
    }, 1000);

    lastFlushRef.current = null;
    flushIntervalRef.current = setInterval(() => {
      void flushRef.current?.();
    }, HEARTBEAT_FLUSH_MS);

    watchdogRef.current = createBackgroundTrackingWatchdog({
      isActive: () => activeRef.current,
      onRestart: restartLocationWatch,
      onStaleDetected: () => {
        if (Date.now() - lastWatchdogToastAt.current > 60_000) {
          lastWatchdogToastAt.current = Date.now();
          if (!isDocumentHidden()) {
            toast.warning(
              'Recovering GPS',
              'Location updates paused in the background. Restarting tracking automatically.',
            );
          }
        }
      },
    });
    watchdogRef.current.start();

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void flushRef.current?.();
      watchdogRef.current?.poke();

      // Re-arm FGS if tracking is still active but the native watcher was lost.
      if (
        isNativeAndroid() &&
        activeRef.current &&
        useTrackingStore.getState().activeTrackingTaskId != null &&
        !isNativeBackgroundWatching()
      ) {
        void startWatchingRef.current((loc) => enqueueRef.current(loc)).catch((err) => {
          console.error('[tracking] failed to re-arm location watch', err);
        });
      }
    };
    const handleOnline = () => {
      void flushRef.current?.();
      watchdogRef.current?.poke();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      // Do not stopWatching here — only when `active` becomes false (above) or provider stops.
      window.clearTimeout(safetyZero);
      window.clearTimeout(safetyOneSec);
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      wakeLockVisibilityCleanupRef.current?.();
      wakeLockVisibilityCleanupRef.current = null;
      void releaseTrackingWakeLock();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      void flushRef.current?.();
    };
  }, [active, restartLocationWatch]);

  // True unmount of the reporter (tracking ended / provider cleared) — ensure FGS stops.
  useEffect(() => {
    return () => {
      stopWatchingRef.current();
    };
  }, []);

  return { flush };
};
