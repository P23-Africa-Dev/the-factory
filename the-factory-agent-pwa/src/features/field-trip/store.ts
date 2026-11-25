'use client';

import { create } from 'zustand';
import { trackingStore } from '@/lib/storage/stores';
import type { GpsHealth, LocalTrip } from './types';

const STORAGE_KEY = 'field_trip_local_v1';

function readPersisted(): LocalTrip | null {
  const raw = trackingStore.getString(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalTrip;
    return parsed && typeof parsed.clientTripId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function persist(trip: LocalTrip | null): void {
  if (trip) trackingStore.set(STORAGE_KEY, JSON.stringify(trip));
  else trackingStore.delete(STORAGE_KEY);
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback for very old WebViews.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Max points kept for the on-device trail (the server keeps the full route). */
const MAX_TRAIL = 3000;
/** Ignore moves smaller than this so GPS jitter does not scribble the line. */
const MIN_TRAIL_STEP_M = 5;

function metersBetween(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

interface FieldTripState {
  /** The running trip on this device (survives reloads); null when idle. */
  local: LocalTrip | null;
  gps: GpsHealth;
  lastFixAt: number | null;
  lastAccuracy: number | null;
  /** This trip's route on this device, [lng, lat] — drawn on the mobile map. */
  trail: [number, number][];
  /** Latest position, [lng, lat]. */
  lastPosition: [number, number] | null;
  setLocal: (trip: LocalTrip | null) => void;
  patchLocal: (patch: Partial<LocalTrip>) => void;
  recordFix: (accuracy: number | null, position?: [number, number] | null) => void;
  setTrail: (trail: [number, number][]) => void;
  setGps: (gps: GpsHealth) => void;
  hydrate: () => void;
}

export const useFieldTripStore = create<FieldTripState>((set, get) => ({
  local: null,
  gps: 'waiting',
  lastFixAt: null,
  lastAccuracy: null,
  trail: [],
  lastPosition: null,
  setLocal: (trip) => {
    const previous = get().local;
    persist(trip);
    const newTrip = trip != null && trip.clientTripId !== previous?.clientTripId;
    set({
      local: trip,
      ...(trip ? {} : { gps: 'waiting', lastFixAt: null, lastAccuracy: null, trail: [], lastPosition: null }),
      ...(newTrip ? { trail: [], lastPosition: null } : {}),
    });
  },
  patchLocal: (patch) => {
    const current = get().local;
    if (!current) return;
    const next = { ...current, ...patch };
    persist(next);
    set({ local: next });
  },
  recordFix: (accuracy, position) =>
    set((state) => {
      const base = {
        lastFixAt: Date.now(),
        lastAccuracy: accuracy,
        gps: (accuracy != null && accuracy > 60 ? 'weak' : 'good') as GpsHealth,
      };
      if (!position || !state.local) return base;
      // Too noisy for the line, but still the best "you are here".
      if (accuracy != null && accuracy > 150) return { ...base, lastPosition: position };
      const last = state.trail[state.trail.length - 1];
      if (last && metersBetween(last, position) < MIN_TRAIL_STEP_M) return { ...base, lastPosition: position };
      const trail = [...state.trail, position];
      return { ...base, lastPosition: position, trail: trail.length > MAX_TRAIL ? trail.slice(-MAX_TRAIL) : trail };
    }),
  setTrail: (trail) =>
    set((state) => ({ trail, lastPosition: state.lastPosition ?? trail[trail.length - 1] ?? null })),
  setGps: (gps) => set({ gps }),
  hydrate: () => set({ local: readPersisted() }),
}));
