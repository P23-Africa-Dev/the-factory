import type { GeoReading } from "@/types/tracking";
import { recordTaskLocation } from "@/lib/api/tracking";
import { useTrackingStore } from "@/store/tracking";
import { watchPosition, watchVisibilityAccuracy } from "./geolocation";

const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 30_000;
const SESSION_KEY = "factory_location_buffer";

interface BufferCallbacks {
  onArrived?: () => void;
  onError?: (err: unknown) => void;
}

interface BufferState {
  sessionKey: string;
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

function buildSessionKey(taskId: number): string {
  return `${SESSION_KEY}:${taskId}`;
}

function saveToSession(sessionKey: string, queue: GeoReading[]) {
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(queue));
  } catch {
    // sessionStorage not available
  }
}

function loadFromSession(sessionKey: string): GeoReading[] {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as GeoReading[]) : [];
  } catch {
    return [];
  }
}

function clearSession(sessionKey: string) {
  try {
    sessionStorage.removeItem(sessionKey);
  } catch {
    // ignore
  }
}

async function flushBuffer(targetState: BufferState, force = false) {
  if ((!targetState.active && !force) || targetState.queue.length === 0) return;

  const batch = targetState.queue.splice(0, MAX_QUEUE);
  saveToSession(targetState.sessionKey, targetState.queue);

  try {
    const res = await recordTaskLocation(
      targetState.taskId,
      {
        company_id: targetState.companyId,
        points: batch.map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          accuracy_meters: r.accuracyMeters,
          speed_mps: r.speedMps,
          heading_degrees: r.headingDegrees,
          recorded_at: r.recordedAt,
        })),
      },
      targetState.token
    );

    if (res.data.arrived) {
      useTrackingStore
        .getState()
        .markArrived(targetState.taskId, batch[batch.length - 1]?.recordedAt ?? new Date().toISOString());
      targetState.callbacks.onArrived?.();
    }
  } catch (err) {
    // Put points back at the front of the queue for retry
    targetState.queue.unshift(...batch);
    if (targetState.queue.length > MAX_QUEUE) {
      targetState.queue.splice(MAX_QUEUE);
    }
    saveToSession(targetState.sessionKey, targetState.queue);
    targetState.callbacks.onError?.(err);
  }
}

async function flush(force = false) {
  if (!state) return;
  await flushBuffer(state, force);
}

function handleOnline() {
  void flush();
}

function push(reading: GeoReading) {
  if (!state || !state.active) return;
  state.queue.push(reading);
  if (state.queue.length > MAX_QUEUE) {
    state.queue.shift();
  }
  saveToSession(state.sessionKey, state.queue);

  useTrackingStore
    .getState()
    .appendPolylinePoint(state.taskId, [reading.longitude, reading.latitude]);
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

  const sessionKey = buildSessionKey(taskId);
  const recovered = loadFromSession(sessionKey);

  state = {
    sessionKey,
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

  state.flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  // Flush recovered points immediately
  if (recovered.length > 0) {
    flushBuffer(state);
  }

  // Also flush on network recovery
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }
}

export function stop() {
  if (!state) return;
  const closingState = state;
  state = null;

  closingState.active = false;
  closingState.stopWatch?.();
  closingState.stopVisibility?.();
  if (closingState.flushTimer) clearInterval(closingState.flushTimer);

  if (typeof window !== "undefined") {
    window.removeEventListener("online", handleOnline);
  }

  // Final flush attempt
  flushBuffer(closingState, true).finally(() => {
    if (!state || state.sessionKey !== closingState.sessionKey) {
      clearSession(closingState.sessionKey);
    }
  });
}

export function isActive(): boolean {
  return !!state?.active;
}

export function getActiveTaskId(): number | null {
  return state?.taskId ?? null;
}
