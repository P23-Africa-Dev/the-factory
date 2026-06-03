import type { GeoReading } from "@/types/tracking";
import { recordTaskLocation } from "@/lib/api/tracking";
import { watchPosition, watchVisibilityAccuracy } from "./geolocation";

const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 30_000;
const SESSION_KEY_PREFIX = "factory_location_buffer";

interface BufferCallbacks {
  onArrived?: () => void;
  onError?: (err: unknown) => void;
}

interface BufferState {
  taskId: number;
  companyId: number | string;
  token: string;
  sessionKey: string;
  callbacks: BufferCallbacks;
  queue: GeoReading[];
  flushTimer: ReturnType<typeof setInterval> | null;
  stopWatch: (() => void) | null;
  stopVisibility: (() => void) | null;
  lowAccuracy: boolean;
  active: boolean;
}

let state: BufferState | null = null;

function makeSessionKey(taskId: number, companyId: number | string): string {
  return `${SESSION_KEY_PREFIX}:${String(companyId)}:${taskId}`;
}

function saveToSession(key: string, queue: GeoReading[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // sessionStorage not available
  }
}

function loadFromSession(key: string): GeoReading[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as GeoReading[]) : [];
  } catch {
    return [];
  }
}

function clearSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function flushState(target: BufferState, options: { allowInactive?: boolean } = {}) {
  const allowInactive = options.allowInactive ?? false;
  if ((!target.active && !allowInactive) || target.queue.length === 0) return;

  const batch = target.queue.splice(0, MAX_QUEUE);
  saveToSession(target.sessionKey, target.queue);

  try {
    const res = await recordTaskLocation(
      target.taskId,
      {
        company_id: target.companyId,
        points: batch.map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          accuracy_meters: r.accuracyMeters,
          speed_mps: r.speedMps,
          heading_degrees: r.headingDegrees,
          recorded_at: r.recordedAt,
        })),
      },
      target.token
    );

    if (res.data.arrived) {
      target.callbacks.onArrived?.();
    }
  } catch (err) {
    // Put points back at the front of the queue for retry
    target.queue.unshift(...batch);
    if (target.queue.length > MAX_QUEUE) {
      target.queue.splice(MAX_QUEUE);
    }
    saveToSession(target.sessionKey, target.queue);
    target.callbacks.onError?.(err);
  }
}

async function flush() {
  if (!state) return;
  await flushState(state);
}

function push(reading: GeoReading) {
  if (!state || !state.active) return;
  state.queue.push(reading);
  if (state.queue.length > MAX_QUEUE) {
    state.queue.shift();
  }
  saveToSession(state.sessionKey, state.queue);
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

  const sessionKey = makeSessionKey(taskId, companyId);
  const recovered = loadFromSession(sessionKey);

  state = {
    taskId,
    companyId,
    token,
    sessionKey,
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

  const stopping = state;
  state = null;

  stopping.active = false;
  stopping.stopWatch?.();
  stopping.stopVisibility?.();
  if (stopping.flushTimer) clearInterval(stopping.flushTimer);

  if (typeof window !== "undefined") {
    window.removeEventListener("online", flush);
  }

  // Final flush attempt
  flushState(stopping, { allowInactive: true }).finally(() => {
    clearSession(stopping.sessionKey);
  });
}

export function isActive(): boolean {
  return !!state?.active;
}

export function getActiveTaskId(): number | null {
  return state?.taskId ?? null;
}
