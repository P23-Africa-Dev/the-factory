'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb } from '@/lib/db/client';
import { requestBackgroundSync } from '@/lib/offline/queue';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { withLocationUploadLock } from '@/lib/sync/locationUploadLock';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/types';
import {
  useGeolocation,
  type LocationObject,
  restartSharedGeolocationWatch,
  probeSharedGeolocationFix,
} from '@/features/tracking/hooks/useGeolocation';
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
import { fieldTripApi } from './api';
import { newClientId, useFieldTripStore } from './store';
import { isTripNotActiveError, notifyFieldTripServerEnded } from './serverEnded';
import { FieldTripTracker, isNativeTrackerAvailable, type NativeTrackerState } from './nativeTracker';
import { fetchTripRoute, mergeTrails } from './serverRoute';
import { env } from '@/constants/env';
import { appStore } from '@/lib/storage/stores';

const MAX_BATCH = 50;
const FLUSH_EVERY_MS = 30_000;
/** Readings worse than this are too noisy for a trail (same limit as task tracking). */
const MAX_ACCURACY_M = 250;
/** No fix for this long while the app is open → read the position directly. */
const FALLBACK_AFTER_MS = 45_000;
const FALLBACK_EVERY_MS = 30_000;
export const NATIVE_OWNER = 'field-trip';

export const TRIP_NOTIFICATION = {
  title: 'Factory 23 · Field trip in progress',
  message: 'Your route and stops are being recorded · Tap to open',
};

function isStationary(loc: LocationObject): boolean {
  const speed = loc.coords.speed;
  return speed != null && Number.isFinite(speed) && speed * 3.6 < 1;
}

/**
 * Records GPS for the active field trip and uploads it.
 *
 * - Every point is written to IndexedDB first (single source of truth), with a
 *   stable client id the server de-duplicates on; nothing is sent twice.
 * - Points recorded before the trip reaches the server (offline start) carry
 *   the trip's client id and are back-filled with the server id later.
 * - Uses the shared native watcher under its own owner, so ending a task or
 *   leaving the map never stops a field trip's GPS.
 */
export function useFieldTripReporter(options: {
  active: boolean;
  clientTripId: string | null;
  serverId: number | null;
  movingIntervalSeconds?: number;
  stationaryIntervalSeconds?: number;
  /** When the trip started (ISO), for the native notification's timer. */
  startedAt?: string | null;
  /** The server confirmed there is no trip running: stop any native recording. */
  idleConfirmed?: boolean;
}): { flush: () => Promise<boolean>; native: boolean } {
  const { active, clientTripId, serverId } = options;
  const { startWatching, stopWatching } = useGeolocation();
  /** APK 1.0.4+: the native service records and uploads (screen off, swiped away, reboot). */
  const [native] = useState(isNativeTrackerAvailable);
  const refs = useRef({
    clientTripId,
    serverId,
    active,
    moving: options.movingIntervalSeconds ?? 30,
    stationary: Math.min(options.stationaryIntervalSeconds ?? 60, 60),
    startedAt: options.startedAt ?? null,
  });
  const lastSampleAt = useRef(0);
  const lastToastAt = useRef(0);
  const watchdogRef = useRef<BackgroundTrackingWatchdog | null>(null);

  useEffect(() => {
    refs.current = {
      clientTripId,
      serverId,
      active,
      moving: options.movingIntervalSeconds ?? 30,
      stationary: Math.min(options.stationaryIntervalSeconds ?? 60, 60),
      startedAt: options.startedAt ?? null,
    };
  }, [active, clientTripId, serverId, options.movingIntervalSeconds, options.stationaryIntervalSeconds, options.startedAt]);

  const enqueue = useCallback(async (loc: LocationObject) => {
    const { clientTripId: tripId, serverId: sid, active: isActive, moving, stationary } = refs.current;
    if (!isActive || !tripId) return;

    recordBackgroundLocationFix();
    useFieldTripStore.getState().recordFix(loc.coords.accuracy ?? null, [loc.coords.longitude, loc.coords.latitude]);

    if (loc.coords.accuracy != null && loc.coords.accuracy > MAX_ACCURACY_M) return;

    const now = Date.now();
    const intervalMs = (isStationary(loc) ? stationary : moving) * 1000;
    if (now - lastSampleAt.current < intervalMs * 0.85) return;
    lastSampleAt.current = now;

    try {
      const db = await getDb();
      await db.add('locationQueue', {
        taskId: 0,
        companyId: getActiveCompanyId(),
        fieldActivitySessionId: sid ?? null,
        fieldTripClientId: tripId,
        clientPointId: newClientId(),
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracyMeters: loc.coords.accuracy ?? null,
        speedMps: loc.coords.speed ?? null,
        headingDegrees: loc.coords.heading ?? null,
        recordedAt: new Date(loc.timestamp).toISOString(),
        synced: 0,
        inFlight: 0,
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        lastError: null,
      });
      await requestBackgroundSync('offline-action-sync');
    } catch {
      // IndexedDB unavailable (private mode): nothing more we can do offline.
    }
  }, []);

  /**
   * Upload this trip's queued points (back-filling the server id first).
   * Resolves true once nothing of this trip is left waiting on this phone.
   */
  const flushWeb = useCallback(async (): Promise<boolean> => {
    const { clientTripId: tripId, serverId: sid } = refs.current;
    if (!tripId || !sid) return false;

    return withLocationUploadLock(async (): Promise<boolean> => {
      const db = await getDb();
      const pending = (await db.getAllFromIndex('locationQueue', 'by-synced', 0)).filter(
        (row) => row.fieldTripClientId === tripId || row.fieldActivitySessionId === sid,
      );
      if (pending.length === 0) return true;

      for (let i = 0; i < pending.length; i += MAX_BATCH) {
        const batch = pending.slice(i, i + MAX_BATCH);
        const markAll = async (patch: Record<string, unknown>) => {
          const tx = db.transaction('locationQueue', 'readwrite');
          for (const row of batch) {
            if (row.id != null) await tx.store.put({ ...row, fieldActivitySessionId: sid, ...patch });
          }
          await tx.done;
        };

        try {
          await fieldTripApi.recordPoints(
            sid,
            batch.map((r) => ({
              latitude: r.latitude,
              longitude: r.longitude,
              accuracyMeters: r.accuracyMeters,
              speedMps: r.speedMps,
              headingDegrees: r.headingDegrees,
              recordedAt: r.recordedAt,
              clientPointId: r.clientPointId ?? newClientId(),
            })),
          );
          await markAll({ synced: 1, inFlight: 0, attempts: 0, nextAttemptAt: null, lastError: null });
        } catch (error) {
          const apiError = error as ApiError;
          if (apiError.status === 422) {
            // Trip already ended on the server (auto-ended or ended on another
            // device): these points can never be stored.
            await markAll({ synced: 1, inFlight: 0, lastError: apiError.message ?? null });
            if (isTripNotActiveError(apiError)) notifyFieldTripServerEnded(sid);
            return true;
          }
          // Network / server error: keep rows (now carrying the server id) for
          // the sync engine / service worker to retry.
          await markAll({ inFlight: 0 });
          return false;
        }
      }
      return true;
    });
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!native) return flushWeb();
    const { serverId: sid } = refs.current;
    if (!sid) return false;
    try {
      const state = await FieldTripTracker.flush();
      if (state.endedByServer) notifyFieldTripServerEnded(sid);
      return state.pending === 0 || state.endedByServer;
    } catch {
      return false;
    }
  }, [flushWeb, native]);

  /**
   * Same proven path as task tracking: the shared geolocation watch, which on
   * the APK runs the native background watcher (foreground service) and in a
   * browser uses watchPosition. A direct native subscription delivered no
   * points on some phones.
   */
  const startWatch = useCallback(async () => {
    try {
      await startWatching((loc: LocationObject) => void enqueue(loc));
    } catch (error) {
      if (Date.now() - lastToastAt.current > 60_000) {
        lastToastAt.current = Date.now();
        toast.warning(
          'Field trip: location problem',
          error instanceof Error ? error.message : 'Could not start location tracking. Retrying…',
        );
      }
    }
  }, [enqueue, startWatching]);

  const restartWatch = useCallback(async () => {
    if (!refs.current.active) return;
    await restartSharedGeolocationWatch();
    await probeSharedGeolocationFix();
  }, []);

  // Collect GPS while the trip is active (including while "ending", until the
  // final flush has been attempted by the provider).
  useEffect(() => {
    if (native || !active || !clientTripId) return undefined;

    void acquireTrackingWakeLock();
    maybePromptBatteryOptimizationOnTrackingStart();
    const cleanupWakeLock = installTrackingWakeLockVisibilityHandler();
    void startWatch();

    const flushTimer = setInterval(() => void flush(), FLUSH_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    const gpsTimer = setInterval(() => {
      const { lastFixAt } = useFieldTripStore.getState();
      if (lastFixAt != null && Date.now() - lastFixAt > 120_000) {
        useFieldTripStore.getState().setGps('lost');
      }
    }, 15_000);

    // Safety net: while the app is open, if the watcher has delivered nothing
    // for a while, read the position directly so the trip always moves.
    const fallbackTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const { lastFixAt } = useFieldTripStore.getState();
      if (lastFixAt != null && Date.now() - lastFixAt < FALLBACK_AFTER_MS) return;
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          void enqueue({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            },
            timestamp: pos.timestamp || Date.now(),
          }),
        () => {},
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
      );
    }, FALLBACK_EVERY_MS);

    watchdogRef.current = createBackgroundTrackingWatchdog({
      isActive: () => refs.current.active,
      onRestart: restartWatch,
    });
    watchdogRef.current.start();

    return () => {
      clearInterval(flushTimer);
      clearInterval(gpsTimer);
      clearInterval(fallbackTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      watchdogRef.current?.stop();
      watchdogRef.current = null;
      cleanupWakeLock?.();
      void releaseTrackingWakeLock();
      stopWatching();
    };
  }, [native, active, clientTripId, flush, restartWatch, startWatch, stopWatching]);

  // ── Native tracker (APK 1.0.4+) ───────────────────────────────────────────
  const nativeStartedRef = useRef<string | null>(null);

  const nativeStart = useCallback((tripId: string) => {
    const startedAtMillis = refs.current.startedAt ? Date.parse(refs.current.startedAt) : NaN;
    return FieldTripTracker.start({
      clientTripId: tripId,
      serverId: refs.current.serverId ?? undefined,
      apiBaseUrl: env.API_BASE_URL,
      token: appStore.getString('auth_token') ?? undefined,
      companyId: getActiveCompanyId() ?? undefined,
      movingIntervalSeconds: refs.current.moving,
      stationaryIntervalSeconds: refs.current.stationary,
      startedAtMillis: Number.isFinite(startedAtMillis) ? startedAtMillis : undefined,
    });
  }, []);

  // Start / pause recording. The service keeps going on its own; this only
  // (re)hands it the trip, the sign-in token and the settings.
  useEffect(() => {
    if (!native || !clientTripId) return;
    if (!active) {
      // End tapped: stop recording, keep uploading until the provider ends it.
      void FieldTripTracker.update({ recording: false }).catch(() => {});
      return;
    }
    nativeStartedRef.current = clientTripId;
    maybePromptBatteryOptimizationOnTrackingStart();
    void nativeStart(clientTripId).catch((error: unknown) => {
      toast.warning(
        'Field trip: location problem',
        error instanceof Error ? error.message : 'Could not start location tracking.',
      );
    });
  }, [native, active, clientTripId, nativeStart]);

  // The trip is over (ended here, or the server says none is running): stop the
  // service and drop its points (they are on the server).
  useEffect(() => {
    if (!native || clientTripId) return;
    if (nativeStartedRef.current == null && !options.idleConfirmed) return;
    nativeStartedRef.current = null;
    void FieldTripTracker.getState()
      .then((state) => (state.active ? FieldTripTracker.stop() : state))
      .catch(() => {});
  }, [native, clientTripId, options.idleConfirmed]);

  // Server id known (offline start synced): uploads can begin.
  useEffect(() => {
    if (native && clientTripId && serverId) {
      void FieldTripTracker.update({ serverId, token: appStore.getString('auth_token') ?? undefined }).catch(() => {});
    }
  }, [native, clientTripId, serverId]);

  // Mirror native fixes into the live trail / GPS status while the app is open,
  // and react when the server has already ended the trip.
  useEffect(() => {
    if (!native || !clientTripId) return undefined;
    const handles = [
      FieldTripTracker.addListener('fix', (fix) => {
        recordBackgroundLocationFix();
        useFieldTripStore.getState().recordFix(fix.accuracy ?? null, [fix.longitude, fix.latitude]);
      }),
      FieldTripTracker.addListener('endedByServer', (state: NativeTrackerState) => {
        if (state.serverId) notifyFieldTripServerEnded(state.serverId);
      }),
    ];
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      void FieldTripTracker.getState()
        .then((state) => {
          if (state.endedByServer && state.serverId) {
            notifyFieldTripServerEnded(state.serverId);
          } else if (!state.running && refs.current.active) {
            // The system killed the service: start it again.
            void nativeStart(clientTripId).catch(() => {});
          }
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    const gpsTimer = setInterval(() => {
      const { lastFixAt } = useFieldTripStore.getState();
      if (lastFixAt != null && Date.now() - lastFixAt > 120_000) useFieldTripStore.getState().setGps('lost');
    }, 15_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(gpsTimer);
      handles.forEach((h) => void h.then((x) => x.remove()).catch(() => {}));
    };
  }, [native, clientTripId, nativeStart]);

  // Browser / older APKs: tell the server how tracking is doing (managers see it).
  useEffect(() => {
    if (native || !active || !serverId) return undefined;
    const report = async () => {
      try {
        const db = await getDb();
        const queued = (await db.getAllFromIndex('locationQueue', 'by-synced', 0)).filter(
          (r) => r.fieldActivitySessionId === serverId || r.fieldTripClientId === refs.current.clientTripId,
        ).length;
        const { lastFixAt, gps } = useFieldTripStore.getState();
        await fieldTripApi.health(serverId, {
          source: 'web',
          app_state: document.visibilityState === 'visible' ? 'foreground' : 'background',
          last_fix_at: lastFixAt ? new Date(lastFixAt).toISOString() : undefined,
          queued,
          last_error: gps === 'lost' ? 'No GPS fix for over 2 minutes' : undefined,
          reported_at: new Date().toISOString(),
        });
      } catch {
        // Diagnostics only.
      }
    };
    const first = setTimeout(() => void report(), 10_000);
    const timer = setInterval(() => void report(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [native, active, serverId]);

  // After a reload the in-memory trail is empty: rebuild it from this trip's
  // points saved on the device (synced or not).
  useEffect(() => {
    if (!active || !clientTripId) return;
    if (useFieldTripStore.getState().trail.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        if (native) {
          const { points } = await FieldTripTracker.getTrail();
          if (!cancelled && points.length > 0 && useFieldTripStore.getState().trail.length === 0) {
            useFieldTripStore.getState().setTrail(points);
          }
          return;
        }
        const db = await getDb();
        const rows = (await db.getAll('locationQueue'))
          .filter((r) => r.fieldTripClientId === clientTripId)
          .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
        if (!cancelled && rows.length > 0 && useFieldTripStore.getState().trail.length === 0) {
          useFieldTripStore.getState().setTrail(rows.map((r) => [r.longitude, r.latitude] as [number, number]));
        }
      } catch {
        // No local history (private mode): the line starts from the next fix.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native, active, clientTripId]);

  // The live map shows the WHOLE trip: the server's route (after a reinstall,
  // on another phone, or once the phone only keeps recent points) with this
  // phone's newer points on top. Refreshed when the app comes back on screen.
  useEffect(() => {
    if (!active || !serverId) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const server = await fetchTripRoute(serverId);
        if (cancelled || server.length === 0) return;
        const store = useFieldTripStore.getState();
        store.setTrail(mergeTrails(server, store.trail));
      } catch {
        // Offline: the phone's own trail is shown.
      }
    };
    const first = setTimeout(() => void load(), 2_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, serverId]);

  // Upload straight away once the server id becomes known (offline start synced).
  useEffect(() => {
    if (!native && active && serverId) void flush();
  }, [native, active, serverId, flush]);

  return { flush, native };
}
