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

interface FieldTripState {
  /** The running trip on this device (survives reloads); null when idle. */
  local: LocalTrip | null;
  gps: GpsHealth;
  lastFixAt: number | null;
  lastAccuracy: number | null;
  setLocal: (trip: LocalTrip | null) => void;
  patchLocal: (patch: Partial<LocalTrip>) => void;
  recordFix: (accuracy: number | null) => void;
  setGps: (gps: GpsHealth) => void;
  hydrate: () => void;
}

export const useFieldTripStore = create<FieldTripState>((set, get) => ({
  local: null,
  gps: 'waiting',
  lastFixAt: null,
  lastAccuracy: null,
  setLocal: (trip) => {
    persist(trip);
    set({ local: trip, ...(trip ? {} : { gps: 'waiting', lastFixAt: null, lastAccuracy: null }) });
  },
  patchLocal: (patch) => {
    const current = get().local;
    if (!current) return;
    const next = { ...current, ...patch };
    persist(next);
    set({ local: next });
  },
  recordFix: (accuracy) =>
    set({
      lastFixAt: Date.now(),
      lastAccuracy: accuracy,
      gps: accuracy != null && accuracy > 60 ? 'weak' : 'good',
    }),
  setGps: (gps) => set({ gps }),
  hydrate: () => set({ local: readPersisted() }),
}));
