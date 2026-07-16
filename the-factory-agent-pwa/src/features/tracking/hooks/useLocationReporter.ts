'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { useTrackingStore } from '@/store/tracking';
import { trackingApi } from '../api';
import { useGeolocation, type LocationObject } from './useGeolocation';
import type { LocationQueueItem } from '../types';
import { toast } from '@/lib/toast';
import { isDocumentHidden, notifyTrackingStopped } from '@/lib/notifications/trackingAlerts';
import { isNativeAndroid } from '../native/capacitorPlatform';
import {
  buildLiveTrackingTitle,
  updateNativeBackgroundNotification,
} from '../native/nativeBackgroundGeolocation';

interface LocationReporterOptions {
  taskId: number;
  companyId: number;
  active: boolean;
  onArrived?: () => void;
  onNearDestination?: () => void;
  onDistanceRemaining?: (meters: number | null) => void;
}

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 100;

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
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const onArrivedRef = useRef(onArrived);
  const onNearRef = useRef(onNearDestination);
  const onDistanceRef = useRef(onDistanceRemaining);

  useEffect(() => {
    onArrivedRef.current = onArrived;
    onNearRef.current = onNearDestination;
    onDistanceRef.current = onDistanceRemaining;
  }, [onArrived, onNearDestination, onDistanceRemaining]);

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
      const item = buildQueueItem(loc);
      const point: [number, number] = [loc.coords.longitude, loc.coords.latitude];

      useTrackingStore.getState().appendPolylinePoint(taskId, point);
      useTrackingStore.getState().upsertTask(taskId, {
        lastPosition: point,
        lastHeadingDegrees: loc.coords.heading ?? null,
        lastSpeedMps: loc.coords.speed ?? null,
        lastUpdatedAt: new Date(loc.timestamp).toISOString(),
      });

      if (needsImmediateFlushRef.current) {
        needsImmediateFlushRef.current = false;
        void flushRef.current?.();
      }

      if (memoryQueue.current.length >= MAX_QUEUE_SIZE) {
        memoryQueue.current.shift();
      }
      memoryQueue.current.push(item);

      try {
        const db = await getDb();
        await db.add('locationQueue', {
          taskId: item.taskId,
          latitude: item.latitude,
          longitude: item.longitude,
          accuracyMeters: item.accuracyMeters,
          speedMps: item.speedMps,
          headingDegrees: item.headingDegrees,
          recordedAt: item.recordedAt,
          synced: 0,
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          lastError: null,
        });
        await requestBackgroundSync('location-sync');
      } catch (err) {
        console.warn('[LocationReporter] Failed to store checkpoint in db:', err);
      }
    },
    [buildQueueItem],
  );

  useEffect(() => {
    isUnauthorizedRef.current = false;
  }, [taskId]);

  const applyProximityResponse = useCallback(
    (response: {
      arrived: boolean;
      near_destination?: boolean;
      distance_remaining_meters?: number | null;
    }) => {
      if (response.distance_remaining_meters !== undefined) {
        const meters = response.distance_remaining_meters ?? null;
        onDistanceRef.current?.(meters);
        if (isNativeAndroid() && meters != null) {
          const live = useTrackingStore.getState().liveTaskMap[taskId];
          void updateNativeBackgroundNotification({
            title: buildLiveTrackingTitle(live?.taskTitle ?? null),
            distanceMeters: meters,
          });
        }
      }
      if (response.near_destination) {
        onNearRef.current?.();
      }
      if (response.arrived) {
        useTrackingStore.getState().markArrived(taskId, new Date().toISOString());
        onArrivedRef.current?.();
      }
    },
    [taskId],
  );

  const flush = useCallback(async () => {
    if (isUnauthorizedRef.current) return;
    if (memoryQueue.current.length === 0) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const batch = memoryQueue.current.slice(0, MAX_BATCH_SIZE);

    try {
      const response = await trackingApi.recordLocation(taskId, {
        companyId,
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
      const pending = await tx.store.index('by-taskId').getAll(taskId);
      const unsynced = pending.filter((p) => p.synced === 0);
      const syncedTimestamps = new Set(batch.map((b) => b.recordedAt));
      for (const row of unsynced) {
        if (row.id != null && syncedTimestamps.has(row.recordedAt)) {
          await tx.store.put({
            ...row,
            synced: 1,
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          });
        }
      }
      await tx.done;

      applyProximityResponse(response);
    } catch (error: unknown) {
      const apiErr = error as { status?: number; message?: string };
      const is422 = apiErr?.status === 422;

      if (is422) {
        isUnauthorizedRef.current = true;
        memoryQueue.current = [];

        try {
          const db = await getDb();
          const tx = db.transaction('locationQueue', 'readwrite');
          const pending = await tx.store.index('by-taskId').getAll(taskId);
          const unsynced = pending.filter((p) => p.synced === 0);
          for (const row of unsynced) {
            if (row.id != null) {
              await tx.store.put({
                ...row,
                synced: 1,
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
        const msg =
          apiErr?.message || 'You can only track tasks currently assigned to you.';
        void notifyTrackingStopped(taskId, msg);
        if (!isDocumentHidden()) {
          toast.error('Tracking Stopped', msg);
        }
      } else {
        console.error('[LocationReporter] Geolocation sync error:', error);
      }
    }
  }, [taskId, companyId, applyProximityResponse]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!active) {
      stopWatching();
      needsImmediateFlushRef.current = false;
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      return;
    }

    needsImmediateFlushRef.current = true;
    void startWatching(enqueue).catch((err) => {
      console.error('[tracking] failed to start location watch', err);
    });
    flushIntervalRef.current = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void flush();
    };
    const handleOnline = () => void flush();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      stopWatching();
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      void flush();
    };
  }, [active, enqueue, flush, startWatching, stopWatching]);

  return { flush };
};
