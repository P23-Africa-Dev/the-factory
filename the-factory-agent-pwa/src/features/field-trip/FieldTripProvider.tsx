'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/types';
import { fieldTripApi } from './api';
import { newClientId, useFieldTripStore } from './store';
import { useFieldTripReporter } from './useFieldTripReporter';
import type { FieldTripCurrent, FieldTripDto, GpsHealth, LocalTrip, TripPosition } from './types';

export const fieldTripKeys = {
  current: ['field-trip', 'current'] as const,
};

const RETRY_MS = 20_000;

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
  const inFlight = useRef<'start' | 'end' | null>(null);
  /** When this device last learned its trip's server id; older server answers are ignored. */
  const syncedAtRef = useRef(0);

  useEffect(() => {
    useFieldTripStore.getState().hydrate();
  }, []);

  const currentQuery = useQuery({
    queryKey: fieldTripKeys.current,
    queryFn: fieldTripApi.current,
    staleTime: 30_000,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const current = currentQuery.data ?? null;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: fieldTripKeys.current });
  }, [queryClient]);

  const onServerEnded = useCallback(() => {
    refresh();
  }, [refresh]);

  const { flush } = useFieldTripReporter({
    active: local != null,
    clientTripId: local?.clientTripId ?? null,
    serverId: local?.serverId ?? null,
    movingIntervalSeconds: current?.settings.moving_interval_seconds,
    stationaryIntervalSeconds: current?.settings.stationary_interval_seconds,
    onServerEnded,
  });

  // ── Send a queued start (offline start, or a failed request) ──────────────
  const syncStart = useCallback(async (): Promise<void> => {
    const trip = useFieldTripStore.getState().local;
    if (!trip || trip.serverId != null || inFlight.current) return;
    inFlight.current = 'start';
    try {
      const res = await fieldTripApi.start({
        clientTripId: trip.clientTripId,
        startedAt: trip.startedAt,
        position: trip.startPosition,
      });
      syncedAtRef.current = Date.now();
      useFieldTripStore.getState().patchLocal({ serverId: res.trip.id });
      refresh();
    } catch (error) {
      if (!isNetworkError(error)) {
        // Refused (e.g. field trips turned off): drop the local trip.
        useFieldTripStore.getState().setLocal(null);
        toast.error('Could not start field trip', (error as ApiError).message);
      }
    } finally {
      inFlight.current = null;
    }
  }, [refresh]);

  // ── Send a queued end ─────────────────────────────────────────────────────
  const syncEnd = useCallback(async (): Promise<FieldTripDto | null> => {
    const trip = useFieldTripStore.getState().local;
    if (!trip || trip.phase !== 'ending' || trip.serverId == null || inFlight.current) return null;
    inFlight.current = 'end';
    try {
      await flush().catch(() => {});
      const res = await fieldTripApi.end(trip.serverId, {
        endedAt: trip.endRequestedAt ?? new Date().toISOString(),
        position: trip.endPosition,
      });
      useFieldTripStore.getState().setLocal(null);
      setLastEnded(res.trip);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['field-activity'] });
      return res.trip;
    } catch (error) {
      if (!isNetworkError(error)) {
        useFieldTripStore.getState().setLocal(null);
        refresh();
      }
      return null;
    } finally {
      inFlight.current = null;
    }
  }, [flush, queryClient, refresh]);

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
    if (!current || inFlight.current) return;
    // Ignore answers fetched before this device's last start reached the server.
    if (currentQuery.dataUpdatedAt <= syncedAtRef.current) return;
    const trip = useFieldTripStore.getState().local;
    const server = current.trip;

    if (!trip && server && server.status === 'active') {
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
      // Ended on the server (auto-ended for no location, or on another device).
      setLocal(null);
      toast.info('Your field trip has ended', reasonMessage(null));
    }
  }, [current, currentQuery.dataUpdatedAt, setLocal]);

  const startTrip = useCallback(
    async (position: TripPosition | null): Promise<boolean> => {
      if (useFieldTripStore.getState().local) return true;
      if (current && !current.enabled) {
        toast.error('Field trips are off', 'Ask an owner or admin to turn on Field Activity.');
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
      if (position) useFieldTripStore.getState().recordFix(position.accuracyMeters);
      await syncStart();
      const started = useFieldTripStore.getState().local;
      if (started && started.serverId == null) {
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
    }),
    [current, local, gps, startTrip, endTrip, lastEnded],
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
