import type { GeoReading } from "@/types/tracking";
import { recordTaskLocation } from "@/lib/api/tracking";
import { watchPosition, watchVisibilityAccuracy } from "./geolocation";

const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 30_000;
const SESSION_KEY = "factory_location_buffer";

interface BufferCallbacks {
  onArrived?: () => void;
  onError?: (err: unknown) => void;
}

interface BufferState {
  taskId: number;
  companyId: number | string;
  token: string;
  callbacks: BufferCallbacks;
  queue: GeoReading[];
  flushTimer: ReturnType<typeof setInterval> | null;
  stopWatch: (() => void) | null;
  stopVisibility: (() => void) | null;
  lowAccuracy: boolean;
  active: boolean;
}

let state: BufferState | null = null;

function saveToSession(queue: GeoReading[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(queue));
  } catch {
    // sessionStorage not available
  }
}

function loadFromSession(): GeoReading[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as GeoReading[]) : [];
  } catch {
    return [];
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

async function flush() {
  if (!state || !state.active || state.queue.length === 0) return;

  const batch = state.queue.splice(0, MAX_QUEUE);
  saveToSession(state.queue);

  try {
    const res = await recordTaskLocation(
      state.taskId,
      {
        company_id: state.companyId,
        points: batch.map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          accuracy_meters: r.accuracyMeters,
          speed_mps: r.speedMps,
          heading_degrees: r.headingDegrees,
          recorded_at: r.recordedAt,
        })),
      },
      state.token
    );

    if (res.data.arrived) {
      state.callbacks.onArrived?.();
    }
  } catch (err) {
    // Put points back at the front of the queue for retry
    state.queue.unshift(...batch);
    if (state.queue.length > MAX_QUEUE) {
      state.queue.splice(MAX_QUEUE);
    }
    saveToSession(state.queue);
    state.callbacks.onError?.(err);
  }
}

function push(reading: GeoReading) {
  if (!state || !state.active) return;
  state.queue.push(reading);
  if (state.queue.length > MAX_QUEUE) {
    state.queue.shift();
  }
  saveToSession(state.queue);
}

function startWatcher() {
  if (!state) return;
  state.stopWatch?.();
  state.stopWatch = watchPosition(
    push,
    (err) => state?.callbacks.onError?.(err),
    state.lowAccuracy
  );
}

export function start(
  taskId: number,
  companyId: number | string,
  token: string,
  callbacks: BufferCallbacks = {}
) {
  if (state) stop();

  const recovered = loadFromSession();

  state = {
    taskId,
    companyId,
    token,
    callbacks,
    queue: recovered,
    flushTimer: null,
    stopWatch: null,
    stopVisibility: null,
    lowAccuracy: false,
    active: true,
  };

  startWatcher();

  state.stopVisibility = watchVisibilityAccuracy((low) => {
    if (!state) return;
    state.lowAccuracy = low;
    startWatcher(); // restart with new accuracy
  });

  state.flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  // Flush recovered points immediately
  if (recovered.length > 0) {
    flush();
  }

  // Also flush on network recovery
  if (typeof window !== "undefined") {
    window.addEventListener("online", flush);
  }
}

export function stop() {
  if (!state) return;
  state.active = false;
  state.stopWatch?.();
  state.stopVisibility?.();
  if (state.flushTimer) clearInterval(state.flushTimer);

  if (typeof window !== "undefined") {
    window.removeEventListener("online", flush);
  }

  // Final flush attempt
  flush().finally(() => {
    clearSession();
    state = null;
  });
}

export function isActive(): boolean {
  return !!state?.active;
}

export function getActiveTaskId(): number | null {
  return state?.taskId ?? null;
}
