'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { trackingApi } from '../api';
import { useGeolocation, type LocationObject } from './useGeolocation';
import type { LocationQueueItem } from '../types';
import { toast } from '@/lib/toast';

interface LocationReporterOptions {
  taskId: number;
  companyId: number;
  active: boolean;
  onArrived?: () => void;
}

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 50;  // backend contract batch cap
const MAX_QUEUE_SIZE = 100; // safety ceiling

export const useLocationReporter = ({
  taskId,
  companyId,
  active,
  onArrived,
}: LocationReporterOptions): void => {
  const { startWatching, stopWatching } = useGeolocation();
  const memoryQueue = useRef<LocationQueueItem[]>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnauthorizedRef = useRef(false);

  const buildQueueItem = useCallback((loc: LocationObject): LocationQueueItem => ({
    taskId,
    companyId,
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyMeters: loc.coords.accuracy ?? null,
    speedMps: loc.coords.speed ?? null,
    headingDegrees: loc.coords.heading ?? null,
    recordedAt: new Date(loc.timestamp).toISOString(),
  }), [taskId, companyId]);

  const enqueue = useCallback(async (loc: LocationObject) => {
    const item = buildQueueItem(loc);

    if (memoryQueue.current.length >= MAX_QUEUE_SIZE) {
      memoryQueue.current.shift();
    }
    memoryQueue.current.push(item);

    // Persist to IndexedDB immediately for crash safety
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
  }, [buildQueueItem]);

  useEffect(() => {
    isUnauthorizedRef.current = false;
  }, [taskId]);

  const flush = useCallback(async () => {
    if (isUnauthorizedRef.current) return;
    if (memoryQueue.current.length === 0) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) return; // offline sync will push

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

      // Remove synced items from memory
      memoryQueue.current = memoryQueue.current.slice(batch.length);

      // Mark as synced in IndexedDB
      const db = await getDb();
      const tx = db.transaction('locationQueue', 'readwrite');
      const pending = await tx.store.index('by-taskId').getAll(taskId);
      const unsynced = pending.filter(p => p.synced === 0);

      // Match synced timestamps
      const syncedTimestamps = new Set(batch.map(b => b.recordedAt));
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

      if (response.arrived) {
        onArrived?.();
      }
    } catch (error: unknown) {
      const apiErr = error as { status?: number, message?: string };
      const is422 = apiErr?.status === 422;

      if (is422) {
        isUnauthorizedRef.current = true;
        memoryQueue.current = [];
        
        try {
          const db = await getDb();
          const tx = db.transaction('locationQueue', 'readwrite');
          const pending = await tx.store.index('by-taskId').getAll(taskId);
          const unsynced = pending.filter(p => p.synced === 0);
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
        } catch {}

        const msg = apiErr?.message || 'You can only track tasks currently assigned to you.';
        toast.error('Tracking Stopped', msg);
        return;
      }
      console.error('[LocationReporter] Geolocation sync error:', error);
    }
  }, [taskId, companyId, onArrived]);

  useEffect(() => {
    if (!active) {
      stopWatching();
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      return;
    }

    startWatching(enqueue);
    flushIntervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') flush();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopWatching();
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active, enqueue, flush, startWatching, stopWatching]);
};
