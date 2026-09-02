'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import {
  useGeolocation,
  type LocationObject,
  restartSharedGeolocationWatch,
  probeSharedGeolocationFix,
} from '@/features/tracking/hooks/useGeolocation';
import {
  buildLiveTrackingMessage,
  buildLiveTrackingTitle,
  forceRestartNativeBackgroundWatch,
  startNativeBackgroundWatch,
  stopNativeBackgroundWatch,
  updateNativeBackgroundNotification,
} from '@/features/tracking/native/nativeBackgroundGeolocation';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  notifyFieldTrackingEnded,
  notifyFieldTrackingStarted,
} from '@/lib/notifications/trackingAlerts';
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
import { fieldActivityApi } from '../api';
import type { FieldPointPayload } from '../types';

const MAX_BATCH = 50;
const MAX_QUEUE = 200;
/** Cap client-side stationary sampling during active field sessions (server still dedupes). */
const ACTIVE_STATIONARY_INTERVAL_SECONDS = 60;

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
    movingIntervalSeconds = 30,
    stationaryIntervalSeconds = ACTIVE_STATIONARY_INTERVAL_SECONDS,
  } = options;

  const { startWatching, stopWatching } = useGeolocation();
  const memoryQueue = useRef<FieldPointPayload[]>([]);
  const lastSampleAt = useRef(0);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const sessionIdRef = useRef(sessionId);
  const activeRef = useRef(active);
  const movingRef = useRef(movingIntervalSeconds);
  const stationaryRef = useRef(
    Math.min(stationaryIntervalSeconds, ACTIVE_STATIONARY_INTERVAL_SECONDS),
  );
  const watchdogRef = useRef<BackgroundTrackingWatchdog | null>(null);
  const wakeLockVisibilityCleanupRef = useRef<(() => void) | null>(null);
  const lastWatchdogToastAt = useRef(0);
  const hadActiveSessionRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    activeRef.current = active;
    movingRef.current = movingIntervalSeconds;
    stationaryRef.current = Math.min(
      stationaryIntervalSeconds,
      ACTIVE_STATIONARY_INTERVAL_SECONDS,
    );
  }, [sessionId, active, movingIntervalSeconds, stationaryIntervalSeconds]);

  const enqueue = useCallback(async (loc: LocationObject) => {
    const sid = sessionIdRef.current;
    if (!sid || !activeRef.current) return;

    recordBackgroundLocationFix();

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
        companyId: getActiveCompanyId(),
        fieldActivitySessionId: sid,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracyMeters: item.accuracyMeters ?? null,
        speedMps: item.speedMps ?? null,
        headingDegrees: item.headingDegrees ?? null,
        recordedAt: item.recordedAt,
        synced: 0,
        inFlight: 0,
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

  const startLocationWatch = useCallback(async () => {
    if (isNativeAndroid()) {
      await startNativeBackgroundWatch(
        (loc) => {
          void enqueue(loc);
        },
        (message) => {
          if (Date.now() - lastWatchdogToastAt.current > 60_000) {
            lastWatchdogToastAt.current = Date.now();
            toast.warning(
              'Field tracking warning',
              message || 'Background location paused. Recovering…',
            );
          }
        },
        {
          title: buildLiveTrackingTitle('Field activity'),
          message: buildLiveTrackingMessage(null),
        },
      );
      return;
    }

    if (!isNativeAndroid() && /Android/i.test(navigator.userAgent)) {
      if (Date.now() - lastWatchdogToastAt.current > 300_000) {
        lastWatchdogToastAt.current = Date.now();
        toast.warning(
          'Use the Android app for reliable tracking',
          'Browser tracking may pause when the screen locks. Install the Factory 23 Agent APK for all-day background GPS.',
        );
      }
    }

    await startWatching((loc) => {
      void enqueue(loc);
    });
  }, [enqueue, startWatching]);

  const restartLocationWatch = useCallback(async () => {
    if (!activeRef.current || !sessionIdRef.current) return;

    if (isNativeAndroid()) {
      await forceRestartNativeBackgroundWatch();
      return;
    }

    await restartSharedGeolocationWatch();
    await probeSharedGeolocationFix();
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
      if (isNativeAndroid()) {
        void stopNativeBackgroundWatch();
      }
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      wakeLockVisibilityCleanupRef.current?.();
      wakeLockVisibilityCleanupRef.current = null;
      void releaseTrackingWakeLock();
      if (hadActiveSessionRef.current) {
        hadActiveSessionRef.current = false;
        void notifyFieldTrackingEnded(true);
      }
      return;
    }

    hadActiveSessionRef.current = true;
    void notifyFieldTrackingStarted();
    void acquireTrackingWakeLock();
    maybePromptBatteryOptimizationOnTrackingStart();
    wakeLockVisibilityCleanupRef.current = installTrackingWakeLockVisibilityHandler();

    const companyId = getActiveCompanyId();
    void startLocationWatch();

    flushIntervalRef.current = setInterval(() => {
      void flushRef.current?.();
    }, 30_000);

    watchdogRef.current = createBackgroundTrackingWatchdog({
      isActive: () => activeRef.current && sessionIdRef.current != null,
      onRestart: restartLocationWatch,
      onStaleDetected: () => {
        if (Date.now() - lastWatchdogToastAt.current > 60_000) {
          lastWatchdogToastAt.current = Date.now();
          toast.warning(
            'Recovering GPS',
            'Location updates paused in the background. Restarting tracking automatically.',
          );
        }
      },
    });
    watchdogRef.current.start();

    return () => {
      stopWatching();
      if (isNativeAndroid()) {
        void stopNativeBackgroundWatch();
      }
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      wakeLockVisibilityCleanupRef.current?.();
      wakeLockVisibilityCleanupRef.current = null;
      void releaseTrackingWakeLock();
      void flushRef.current?.();
      void companyId;
    };
  }, [active, sessionId, restartLocationWatch, startLocationWatch, stopWatching]);

  return { flush };
}
