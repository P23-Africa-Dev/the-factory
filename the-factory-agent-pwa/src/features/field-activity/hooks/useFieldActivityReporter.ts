'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { useGeolocation, type LocationObject } from '@/features/tracking/hooks/useGeolocation';
import {
  buildLiveTrackingMessage,
  buildLiveTrackingTitle,
  isNativeBackgroundWatching,
  startNativeBackgroundWatch,
  stopNativeBackgroundWatch,
  updateNativeBackgroundNotification,
} from '@/features/tracking/native/nativeBackgroundGeolocation';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import { fieldActivityApi } from '../api';
import type { FieldPointPayload } from '../types';

const MAX_BATCH = 50;
const MAX_QUEUE = 200;
const WATCHDOG_INTERVAL_MS = 45_000;

function speedKmh(loc: LocationObject): number | null {
  const speed = loc.coords.speed;
  if (speed == null || !Number.isFinite(speed)) return null;
  return Math.max(0, speed) * 3.6;
}

function isStationary(loc: LocationObject): boolean {
  const kmh = speedKmh(loc);
  if (kmh == null) return false;
  return kmh < 1;
}

export function useFieldActivityReporter(options: {
  sessionId: number | null;
  active: boolean;
  movingIntervalSeconds?: number;
  stationaryIntervalSeconds?: number;
}): { flush: () => Promise<void> } {
  const {
    sessionId,
    active,
    movingIntervalSeconds = 60,
    stationaryIntervalSeconds = 300,
  } = options;

  const { startWatching, stopWatching } = useGeolocation();
  const memoryQueue = useRef<FieldPointPayload[]>([]);
  const lastSampleAt = useRef(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const sessionIdRef = useRef(sessionId);
  const activeRef = useRef(active);
  const movingRef = useRef(movingIntervalSeconds);
  const stationaryRef = useRef(stationaryIntervalSeconds);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWatchdogToastAt = useRef(0);
  const restartWatcher = useCallback(() => {
    if (!isNativeAndroid()) return;
    if (!activeRef.current || !sessionIdRef.current) return;
    if (isNativeBackgroundWatching()) return;

    void startNativeBackgroundWatch(
      (loc) => {
        void enqueue(loc);
      },
      (message) => {
        if (Date.now() - lastWatchdogToastAt.current > 60_000) {
          lastWatchdogToastAt.current = Date.now();
          toast.warning(
            'Field tracking warning',
            message || 'Background location watcher was lost and is restarting.',
          );
        }
      },
      {
        title: buildLiveTrackingTitle('Field activity'),
        message: buildLiveTrackingMessage(null),
      },
    );
  }, [enqueue]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    activeRef.current = active;
    movingRef.current = movingIntervalSeconds;
    stationaryRef.current = stationaryIntervalSeconds;
  }, [sessionId, active, movingIntervalSeconds, stationaryIntervalSeconds]);

  const enqueue = useCallback(async (loc: LocationObject) => {
    const sid = sessionIdRef.current;
    if (!sid || !activeRef.current) return;

    const now = Date.now();
    const intervalMs = (isStationary(loc) ? stationaryRef.current : movingRef.current) * 1000;
    if (now - lastSampleAt.current < intervalMs * 0.85 && memoryQueue.current.length > 0) {
      return;
    }
    lastSampleAt.current = now;

    const item: FieldPointPayload = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracyMeters: loc.coords.accuracy,
      speedMps: loc.coords.speed,
      headingDegrees: loc.coords.heading,
      recordedAt: new Date(loc.timestamp).toISOString(),
    };

    memoryQueue.current.push(item);
    if (memoryQueue.current.length > MAX_QUEUE) {
      memoryQueue.current = memoryQueue.current.slice(-MAX_QUEUE);
    }

    try {
      const db = await getDb();
      await db.add('locationQueue', {
        taskId: 0,
        fieldActivitySessionId: sid,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracyMeters: item.accuracyMeters ?? null,
        speedMps: item.speedMps ?? null,
        headingDegrees: item.headingDegrees ?? null,
        recordedAt: item.recordedAt,
        synced: 0,
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        lastError: null,
      });
      await requestBackgroundSync('offline-action-sync');
    } catch {
      // Memory queue still holds the point for immediate flush.
    }

    if (isNativeAndroid()) {
      void updateNativeBackgroundNotification({
        title: buildLiveTrackingTitle('Field activity'),
        message: buildLiveTrackingMessage(null),
      });
    }
  }, []);

  const flush = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const batch = memoryQueue.current.splice(0, MAX_BATCH);
    if (batch.length === 0) {
      // Try draining IndexedDB-only backlog via API for current session.
      try {
        const db = await getDb();
        const pending = await db.getAllFromIndex('locationQueue', 'by-synced', 0);
        const fieldRows = pending
          .filter((r) => r.fieldActivitySessionId === sid)
          .slice(0, MAX_BATCH);
        if (fieldRows.length === 0) return;

        await fieldActivityApi.recordPoints(
          sid,
          fieldRows.map((r) => ({
            latitude: r.latitude,
            longitude: r.longitude,
            accuracyMeters: r.accuracyMeters,
            speedMps: r.speedMps,
            headingDegrees: r.headingDegrees,
            recordedAt: r.recordedAt,
          })),
        );

        const tx = db.transaction('locationQueue', 'readwrite');
        for (const row of fieldRows) {
          if (row.id != null) {
            await tx.store.put({ ...row, synced: 1, nextAttemptAt: null, lastError: null });
          }
        }
        await tx.done;
      } catch {
        // Leave for sync engine.
      }
      return;
    }

    try {
      await fieldActivityApi.recordPoints(sid, batch);
    } catch {
      memoryQueue.current = [...batch, ...memoryQueue.current].slice(0, MAX_QUEUE);
    }
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!active || !sessionId) {
      stopWatching();
      if (isNativeAndroid() && isNativeBackgroundWatching()) {
        void stopNativeBackgroundWatch();
      }
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
      return;
    }

    const companyId = getActiveCompanyId();
    void (async () => {
      if (isNativeAndroid()) {
        await startNativeBackgroundWatch(
          (loc) => {
            void enqueue(loc);
          },
          (message) => {
            if (Date.now() - lastWatchdogToastAt.current > 60_000) {
              lastWatchdogToastAt.current = Date.now();
              toast.warning(
                'Field tracking degraded',
                message || 'Background location paused. Re-open the app to resume.',
              );
            }
          },
          {
            title: buildLiveTrackingTitle('Field activity'),
            message: buildLiveTrackingMessage(null),
          },
        );
      } else {
        await startWatching((loc) => {
          void enqueue(loc);
        });
      }
    })();

    flushIntervalRef.current = setInterval(() => {
      void flushRef.current?.();
    }, 30_000);

    watchdogIntervalRef.current = setInterval(() => {
      restartWatcher();
    }, WATCHDOG_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        restartWatcher();
      }
    };
    const handleOnline = () => {
      restartWatcher();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      stopWatching();
      if (isNativeAndroid()) {
        void stopNativeBackgroundWatch();
      }
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      void flushRef.current?.();
      void companyId;
    };
  }, [active, sessionId, enqueue, restartWatcher, startWatching, stopWatching]);

  return { flush };
}
