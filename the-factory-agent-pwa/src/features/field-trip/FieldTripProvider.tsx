'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/types';
import { fieldTripApi } from './api';
import { newClientId, useFieldTripStore } from './store';
import { useFieldTripReporter } from './useFieldTripReporter';
import { onFieldTripServerEnded } from './serverEnded';
import { deleteTripRows } from '@/lib/sync/locationQueueMaintenance';
import type { FieldTripCurrent, FieldTripDto, FieldTripReportDue, GpsHealth, LocalTrip, TripPosition } from './types';

export const fieldTripKeys = {
  current: ['field-trip', 'current'] as const,
};

const RETRY_MS = 20_000;
/** How long End waits for the last points to upload before ending anyway. */
const END_WAIT_FOR_POINTS_MS = 10 * 60_000;

/** Server answer plus when it was requested (to spot stale answers). */
type CurrentWithStamp = FieldTripCurrent & { requestedAt?: number };

type FieldTripContextValue = {
  /** Server answer loaded at least once. */
  ready: boolean;
  enabled: boolean;
  canManageSettings: boolean;
  local: LocalTrip | null;
  serverTrip: FieldTripDto | null;
  today: FieldTripCurrent['today'] | null;
  settings: FieldTripCurrent['settings'] | null;
  gps: GpsHealth;
  /** Start synced with the server (false while an offline start is queued). */
  synced: boolean;
  startTrip: (position: TripPosition | null) => Promise<boolean>;
  endTrip: (position: TripPosition | null) => Promise<FieldTripDto | null>;
  lastEnded: FieldTripDto | null;
  clearLastEnded: () => void;
  /** The newest trip whose report is still due (banner / Start gate). */
  reportDue: FieldTripReportDue | null;
  reportPolicy: 'required' | 'optional';
  /** Start was refused because this trip's report must be finished first. */
  reportGate: number | null;
  clearReportGate: () => void;
};

const FieldTripContext = createContext<FieldTripContextValue | null>(null);

function isNetworkError(error: unknown): boolean {
  const status = (error as ApiError)?.status;
  return status === 0 || status === undefined || status >= 500;
}

function reasonMessage(trip: FieldTripDto | null): string {
  if (trip?.end_reason === 'auto_no_signal') {
    return 'It was ended automatically because we had no location for a while. It is saved in your Journey History.';
  }
  return 'It is saved in your Journey History.';
}

/**
 * Field trip lifecycle for agents and managers. Mounted once per app shell.
 * The trip lives on this device first (persisted), so it starts instantly,
 * survives reloads and works offline; the server copy is reconciled here.
 */
export function FieldTripProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const local = useFieldTripStore((s) => s.local);
  const gps = useFieldTripStore((s) => s.gps);
  const setLocal = useFieldTripStore((s) => s.setLocal);
  const patchLocal = useFieldTripStore((s) => s.patchLocal);
  const [lastEnded, setLastEnded] = useState<FieldTripDto | null>(null);
  const [reportGate, setReportGate] = useState<number | null>(null);
  /**
   * The start/end request currently in flight. Every caller (the button and the
   * background retry) awaits the SAME request, so a second caller never bails
   * out early and misreads the state ("started offline", trip shown again…).
   */
  const inFlightRef = useRef<{ kind: 'start' | 'end'; promise: Promise<FieldTripDto | null> } | null>(null);
  /**
   * When this device last started/ended a trip. Server answers whose request was
   * SENT before that are stale (they may finish after the start/end and still say
   * "no trip" / "trip running") and must never undo what the user just did.
   */
  const lastMutationAtRef = useRef(0);
  /** Trips this device ended: never re-adopt them from a stale server answer. */
  const endedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    useFieldTripStore.getState().hydrate();
  }, []);

  const currentQuery = useQuery({
    queryKey: fieldTripKeys.current,
    queryFn: async (): Promise<CurrentWithStamp> => {
      const requestedAt = Date.now();
      const data = await fieldTripApi.current();
      return { ...data, requestedAt };
    },
    staleTime: 30_000,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const current = currentQuery.data ?? null;

  /** Apply a start/end result to the cached server state right away. */
  const writeCurrent = useCallback(
    (trip: FieldTripDto | null) => {
      queryClient.setQueryData<CurrentWithStamp>(fieldTripKeys.current, (prev) =>
        prev ? { ...prev, trip: trip && trip.status === 'active' ? trip : null, requestedAt: Date.now() } : prev,
      );
    },
    [queryClient],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: fieldTripKeys.current });
  }, [queryClient]);

  const { flush } = useFieldTripReporter({
    // Recording stops the moment End is tapped; uploading continues until done.
    active: local != null && local.phase === 'active',
    clientTripId: local?.clientTripId ?? null,
    serverId: local?.serverId ?? null,
    movingIntervalSeconds: current?.settings.moving_interval_seconds,
    stationaryIntervalSeconds: current?.settings.stationary_interval_seconds,
    startedAt: local?.startedAt ?? null,
    idleConfirmed: current != null && current.trip == null && local == null,
  });

  /**
   * The server ended this trip (auto-ended for no location, or on another
   * device): stop here and say so.
   *
   * `refusedByServer`: an upload was just refused with "not active", so the
   * trip is certainly over and End (idempotent) only reads back its reason.
   * Otherwise (a status check said "no trip") End is NEVER called: a wrong or
   * cached answer must not be able to end a trip that is still running.
   */
  const adoptServerEnd = useCallback(
    (serverId: number, refusedByServer: boolean) => {
      endedIdsRef.current.add(serverId);
      lastMutationAtRef.current = Date.now();
      setLocal(null);
      writeCurrent(null);
      refresh();
      if (!refusedByServer) {
        toast.info('Your field trip has ended', reasonMessage(null));
        return;
      }
      void fieldTripApi
        .end(serverId, { endedAt: new Date().toISOString(), position: null })
        .then((res) => {
          setLastEnded(res.trip);
          toast.info('Your field trip has ended', reasonMessage(res.trip));
        })
        .catch(() => toast.info('Your field trip has ended', reasonMessage(null)));
    },
    [refresh, setLocal, writeCurrent],
  );

  useEffect(
    () =>
      onFieldTripServerEnded((sessionId) => {
        const trip = useFieldTripStore.getState().local;
        if (!trip || trip.serverId !== sessionId) return;
        adoptServerEnd(sessionId, true);
      }),
    [adoptServerEnd],
  );

  // ── Send a queued start (offline start, or a failed request) ──────────────
  const syncStart = useCallback((): Promise<FieldTripDto | null> => {
    if (inFlightRef.current) return inFlightRef.current.promise;
    const trip = useFieldTripStore.getState().local;
    if (!trip || trip.serverId != null) return Promise.resolve(null);

    const promise = (async (): Promise<FieldTripDto | null> => {
      try {
        // Stop any status check already on its way: it predates this start.
        await queryClient.cancelQueries({ queryKey: fieldTripKeys.current });
        const res = await fieldTripApi.start({
          clientTripId: trip.clientTripId,
          startedAt: trip.startedAt,
          position: trip.startPosition,
        });
        lastMutationAtRef.current = Date.now();
        useFieldTripStore.getState().patchLocal({ serverId: res.trip.id });
        writeCurrent(res.trip);
        return res.trip;
      } catch (error) {
        if (!isNetworkError(error)) {
          // Refused (e.g. field trips turned off): drop the local trip and
          // the points recorded for it (they can never be uploaded).
          useFieldTripStore.getState().setLocal(null);
          void deleteTripRows(trip.clientTripId).catch(() => {});
          if ((error as ApiError).code === 'report_due') {
            // The last trip's report must be finished first: the card explains.
            const due = queryClient.getQueryData<CurrentWithStamp>(fieldTripKeys.current)?.report_due;
            setReportGate(due?.trip_id ?? 0);
            void queryClient.invalidateQueries({ queryKey: fieldTripKeys.current });
          } else {
            toast.error('Could not start field trip', (error as ApiError).message);
          }
        }
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = { kind: 'start', promise };
    return promise;
  }, [queryClient, writeCurrent]);

  // ── Send a queued end ─────────────────────────────────────────────────────
  const syncEnd = useCallback((): Promise<FieldTripDto | null> => {
    if (inFlightRef.current?.kind === 'end') return inFlightRef.current.promise;
    if (inFlightRef.current) return Promise.resolve(null);
    const trip = useFieldTripStore.getState().local;
    if (!trip || trip.phase !== 'ending' || trip.serverId == null) return Promise.resolve(null);
    const serverId = trip.serverId;

    const promise = (async (): Promise<FieldTripDto | null> => {
      try {
        // Every point first: once the trip is ended the server refuses more,
        // so ending with points still on the phone would cut the route short.
        // Not uploaded yet (offline / server error) → stay "ending", retry.
        const allSent = await flush().catch(() => false);
        const waitingMs = Date.now() - Date.parse(trip.endRequestedAt ?? new Date().toISOString());
        // Never stuck on "ending": after a while end anyway (the server keeps
        // accepting this trip's late points for a grace period).
        if (!allSent && waitingMs < END_WAIT_FOR_POINTS_MS) return null;
        // Stop any status check already on its way: it predates this end.
        await queryClient.cancelQueries({ queryKey: fieldTripKeys.current });
        const res = await fieldTripApi.end(serverId, {
          endedAt: trip.endRequestedAt ?? new Date().toISOString(),
          position: trip.endPosition,
        });
        lastMutationAtRef.current = Date.now();
        endedIdsRef.current.add(serverId);
        useFieldTripStore.getState().setLocal(null);
        writeCurrent(null);
        setLastEnded(res.trip);
        refresh();
        void queryClient.invalidateQueries({ queryKey: ['field-activity'] });
        return res.trip;
      } catch (error) {
        if (!isNetworkError(error)) {
          endedIdsRef.current.add(serverId);
          useFieldTripStore.getState().setLocal(null);
          writeCurrent(null);
          refresh();
        }
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = { kind: 'end', promise };
    return promise;
  }, [flush, queryClient, refresh, writeCurrent]);

  // Retry queued start/end when back online and periodically.
  useEffect(() => {
    if (!local) return undefined;
    const needsStart = local.serverId == null;
    const needsEnd = local.phase === 'ending' && local.serverId != null;
    if (!needsStart && !needsEnd) return undefined;

    const run = () => {
      if (needsStart) void syncStart();
      else void syncEnd();
    };
    run();
    const timer = setInterval(run, RETRY_MS);
    window.addEventListener('online', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [local, syncStart, syncEnd]);

  // ── Reconcile this device with the server ─────────────────────────────────
  useEffect(() => {
    if (!current || inFlightRef.current) return;
    // Ignore answers requested before this device's last start/end: they can
    // arrive afterwards and would undo what the user just did.
    if ((current.requestedAt ?? 0) < lastMutationAtRef.current) return;
    const trip = useFieldTripStore.getState().local;
    const server = current.trip;

    if (!trip && server && server.status === 'active' && !endedIdsRef.current.has(server.id)) {
      // Started on another device or before a reinstall: adopt it here.
      setLocal({
        clientTripId: server.client_trip_id ?? `server-${server.id}`,
        serverId: server.id,
        startedAt: server.started_at ?? new Date().toISOString(),
        startPosition: null,
        phase: 'active',
        endRequestedAt: null,
        endPosition: null,
      });
      return;
    }

    if (trip && trip.serverId != null && trip.phase === 'active' && server?.id !== trip.serverId) {
      // Looks ended on the server (auto-ended, or ended on another device).
      // Ask once more, fresh, before dropping a running trip: one wrong answer
      // (old cache, flaky network) must never stop a trip.
      const serverId = trip.serverId;
      const askedAt = Date.now();
      void fieldTripApi
        .current()
        .then((fresh) => {
          const still = useFieldTripStore.getState().local;
          if (askedAt < lastMutationAtRef.current || still?.serverId !== serverId || still.phase !== 'active') return;
          if (fresh.trip?.id === serverId) return; // still running: the first answer was wrong
          adoptServerEnd(serverId, false);
        })
        .catch(() => {});
    }
  }, [current, setLocal, adoptServerEnd]);

  const startTrip = useCallback(
    async (position: TripPosition | null): Promise<boolean> => {
      if (useFieldTripStore.getState().local) return true;
      if (current && !current.enabled) {
        toast.error('Field trips are off', 'Ask an owner or admin to turn on Field Activity.');
        return false;
      }
      if (current?.report_due && (current.settings.trip_report_policy ?? 'required') === 'required') {
        setReportGate(current.report_due.trip_id);
        return false;
      }
      setLastEnded(null);
      setLocal({
        clientTripId: newClientId(),
        serverId: null,
        startedAt: position?.recordedAt ?? new Date().toISOString(),
        startPosition: position,
        phase: 'active',
        endRequestedAt: null,
        endPosition: null,
      });
      if (position) {
        useFieldTripStore.getState().recordFix(position.accuracyMeters, [position.longitude, position.latitude]);
      }
      const synced = await syncStart();
      const started = useFieldTripStore.getState().local;
      if (!synced && started && started.serverId == null) {
        toast.info('Field trip started offline', 'Tracking is on. It will sync when you are back online.');
      }
      return started != null;
    },
    [current, setLocal, syncStart],
  );

  const endTrip = useCallback(
    async (position: TripPosition | null): Promise<FieldTripDto | null> => {
      const trip = useFieldTripStore.getState().local;
      if (!trip) return null;
      patchLocal({
        phase: 'ending',
        endRequestedAt: position?.recordedAt ?? new Date().toISOString(),
        endPosition: position,
      });
      if (trip.serverId == null) {
        toast.info('Ending when back online', 'Your trip will be saved as soon as you reconnect.');
        return null;
      }
      const ended = await syncEnd();
      if (!ended && useFieldTripStore.getState().local) {
        toast.info('Ending when back online', 'Your trip will be saved as soon as you reconnect.');
      } else if (ended) {
        toast.success('Field trip saved', reasonMessage(ended));
      }
      return ended;
    },
    [patchLocal, syncEnd],
  );

  const value = useMemo<FieldTripContextValue>(
    () => ({
      ready: current != null,
      enabled: current?.enabled ?? true,
      canManageSettings: current?.can_manage_settings ?? false,
      local,
      serverTrip: current?.trip ?? null,
      today: current?.today ?? null,
      settings: current?.settings ?? null,
      gps,
      synced: local?.serverId != null,
      startTrip,
      endTrip,
      lastEnded,
      clearLastEnded: () => setLastEnded(null),
      reportDue: current?.report_due ?? null,
      reportPolicy: current?.settings.trip_report_policy ?? 'required',
      reportGate,
      clearReportGate: () => setReportGate(null),
    }),
    [current, local, gps, startTrip, endTrip, lastEnded, reportGate],
  );

  return <FieldTripContext.Provider value={value}>{children}</FieldTripContext.Provider>;
}

export function useFieldTrip(): FieldTripContextValue {
  const ctx = useContext(FieldTripContext);
  if (!ctx) throw new Error('useFieldTrip must be used inside <FieldTripProvider>');
  return ctx;
}

/** Same as useFieldTrip but safe outside the provider (returns null). */
export function useOptionalFieldTrip(): FieldTripContextValue | null {
  return useContext(FieldTripContext);
}
