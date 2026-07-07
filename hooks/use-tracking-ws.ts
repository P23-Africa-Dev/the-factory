"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useTrackingStore } from "@/store/tracking";
import { useAttendanceMapStore } from "@/store/attendance-map";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { getTrackingWebSocketUrl } from "@/lib/config/public-env";
import { getTaskRoute, listAgentLocations } from "@/lib/api/tracking";
import type { TrackingEnvelope } from "@/types/tracking";

const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];
const POLL_INTERVAL_MS = 25_000;
const STALE_THRESHOLD_MS = 30_000;

const LOG = "[tracking-ws]";

function isManagementRole(role: string | null | undefined): boolean {
  if (!role) return true;
  const normalized = role.toLowerCase();
  return ["owner", "admin", "management", "manager", "supervisor"].includes(
    normalized
  );
}

function readyStateLabel(state: number): string {
  switch (state) {
    case WebSocket.CONNECTING:
      return "CONNECTING (0)";
    case WebSocket.OPEN:
      return "OPEN (1)";
    case WebSocket.CLOSING:
      return "CLOSING (2)";
    case WebSocket.CLOSED:
      return "CLOSED (3)";
    default:
      return `UNKNOWN (${state})`;
  }
}

function redactToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    console.warn(LOG, "Failed to parse message as JSON", { raw, error: e });
    return null;
  }
}

export function useTrackingWebSocket() {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role: companyRole } = getActiveCompanyContext(user);
  const store = useTrackingStore();
  const wsUrl = getTrackingWebSocketUrl();
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const authenticatedRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  const connectRef = useRef<() => void>(() => { });
  const subscribedTaskIdsRef = useRef<number[]>([]);

  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const subscribedTaskIds = Array.from(
    new Set(
      [
        ...Object.keys(store.liveTasks).map((value) => Number.parseInt(value, 10)),
        store.activeTrackingTaskId,
      ].filter((value): value is number => Number.isFinite(value))
    )
  ).sort((left, right) => left - right);

  const hydrateLocationSnapshots = useCallback(async (options?: { markInitial?: boolean }) => {
    if (!companyId || !token) {
      return;
    }

    const markInitial = options?.markInitial ?? false;

    if (markInitial) {
      setIsInitialHydrating(true);
    }

    try {
      const res = await listAgentLocations(
        {
          company_id: companyId,
          include_offline: true,
          limit: 300,
        },
        token
      );

      useTrackingStore.getState().hydrateFromSnapshots(res.data.items);
      console.log(LOG, "Snapshot read model hydrated", {
        items: res.data.items.length,
      });
    } catch (err) {
      console.warn(LOG, "Snapshot hydration failed", err);
    } finally {
      if (markInitial) {
        setIsInitialHydrating(false);
      }
    }
  }, [companyId, token]);

  const rehydrateActiveTasks = useCallback(async () => {
    const { liveTasks } = useTrackingStore.getState();
    const active = Object.values(liveTasks).filter((t) => t.status !== "completed");
    if (!active.length || !companyId || !token) {
      console.log(LOG, "Rehydrate skipped", {
        activeTaskCount: active.length,
        hasCompanyId: !!companyId,
        hasToken: !!token,
      });
      return;
    }

    console.log(LOG, "Rehydrating active tasks via REST", {
      taskIds: active.map((t) => t.taskId),
    });

    await Promise.allSettled(
      active.map(async (t) => {
        try {
          const routeRole = isManagementRole(companyRole) ? "management" : "agent";
          const res = await getTaskRoute(
            t.taskId,
            { company_id: companyId, role: routeRole },
            token
          );
          console.log(LOG, "Route rehydrated", {
            taskId: t.taskId,
            pointsCount: res.data.summary?.points_count,
            polylineLength: res.data.polyline?.length,
          });
          useTrackingStore.getState().hydrateFromRoute(t.taskId, res.data, {
            id: t.taskId,
            title: t.taskTitle,
            company_id: companyId as number,
            assigned_agent_id: t.userId,
            status: "in_progress",
            assignee: { id: t.userId, name: t.agentName, email: "" },
          } as Parameters<
            ReturnType<typeof useTrackingStore.getState>["hydrateFromRoute"]
          >[2]);
        } catch (err) {
          console.warn(LOG, "Route rehydrate failed for task", t.taskId, err);
        }
      })
    );
  }, [companyId, companyRole, token]);

  const runRecoveryCycle = useCallback(async () => {
    await hydrateLocationSnapshots();
    await rehydrateActiveTasks();
  }, [hydrateLocationSnapshots, rehydrateActiveTasks]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    console.log(LOG, "Starting REST polling fallback", { intervalMs: POLL_INTERVAL_MS });
    pollTimerRef.current = setInterval(runRecoveryCycle, POLL_INTERVAL_MS);
  }, [runRecoveryCycle]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      console.log(LOG, "Stopping REST polling fallback");
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token || !companyId || !wsUrl || !mountedRef.current) {
      console.log(LOG, "Connect skipped", {
        hasToken: !!token,
        companyId,
        hasWsUrl: !!wsUrl,
        mounted: mountedRef.current,
      });
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(LOG, "Connect skipped — socket already OPEN");
      return;
    }

    connectionAttemptRef.current += 1;
    const attempt = connectionAttemptRef.current;

    store.setWsStatus("connecting");

    const params = new URLSearchParams({
      token,
      company_id: String(companyId),
    });
    if (subscribedTaskIds.length > 0) {
      params.set("task_ids", subscribedTaskIds.join(","));
    }
    const url = `${wsUrl}?${params.toString()}`;
    console.groupCollapsed(`${LOG} Connecting (attempt #${attempt})`);
    console.log("URL (token redacted)", url.replace(token, redactToken(token)));
    console.log("WS base", wsUrl);
    console.log("company_id", companyId);
    console.log("user id", user?.id);
    console.log(
      "Note: Browser location is NOT requested here. This hook only listens for live tracking events on the map. Agents get a location prompt when starting a task (Commence / Start Tracking)."
    );
    console.groupEnd();

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(LOG, "✅ Socket OPEN", {
        attempt,
        readyState: readyStateLabel(ws.readyState),
        url: wsUrl,
      });

      if (!mountedRef.current) {
        console.warn(LOG, "Component unmounted before onopen — closing socket");
        ws.close();
        return;
      }

      backoffRef.current = 0;
      disconnectedAtRef.current = null;
      authenticatedRef.current = false;
      subscribedTaskIdsRef.current = subscribedTaskIds;
      store.setWsStatus("connected");
      stopPolling();

      const authMessage = {
        type: "authenticate",
        token,
        company_id: companyId,
        task_ids: subscribedTaskIds,
      };
      console.log(LOG, "Sending post-connect authenticate", {
        type: authMessage.type,
        company_id: authMessage.company_id,
        token: redactToken(token),
        task_ids: authMessage.task_ids,
      });
      ws.send(JSON.stringify(authMessage));

      runRecoveryCycle();
    };

    ws.onmessage = (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : String(evt.data);
      const parsed = safeParse(raw);

      console.groupCollapsed(`${LOG} 📩 Message received`);
      console.log("raw length", raw.length);
      console.log("parsed", parsed);
      console.groupEnd();

      if (!parsed || typeof parsed !== "object") return;

      const msg = parsed as {
        type: string;
        payload?: TrackingEnvelope["payload"];
        channel?: string;
        code?: string;
        message?: string;
        connection_id?: string;
        access_role?: string;
        company_id?: number;
        subscribed_task_ids?: number[];
      };

      if (msg.type === "system.connected") {
        authenticatedRef.current = true;
        subscribedTaskIdsRef.current = Array.isArray(msg.subscribed_task_ids)
          ? msg.subscribed_task_ids.filter(
            (value: number): value is number => Number.isFinite(value)
          )
          : subscribedTaskIdsRef.current;
        console.log(LOG, "✅ Relay authenticated (system.connected)", msg);
        return;
      }

      if (msg.type === "system.error") {
        console.error(LOG, "❌ Relay system.error", msg);
        return;
      }

      if (msg.type === "system.auth_required") {
        console.warn(LOG, "Relay requested auth (system.auth_required)", msg);
        return;
      }

      if (msg.type === "pong") {
        console.log(LOG, "pong", msg);
        return;
      }

      if (
        msg.type === "tracking.task.started" ||
        msg.type === "tracking.task.near_destination" ||
        msg.type === "tracking.location.updated" ||
        msg.type === "tracking.agent.location.updated" ||
        msg.type === "tracking.task.arrived" ||
        msg.type === "tracking.task.completed"
      ) {
        console.log(LOG, "📍 Tracking event", {
          type: msg.type,
          channel: msg.channel,
          task_id: msg.payload?.task_id,
          user_id: msg.payload?.user_id,
          tracking_session_id: msg.payload?.tracking_session_id,
          occurred_at: msg.payload?.occurred_at,
          data: msg.payload?.data,
        });

        if (msg.payload) {
          store.upsertFromWs({
            type: msg.type as TrackingEnvelope["type"],
            channel: msg.channel ?? "",
            payload: msg.payload,
          });
          console.log(LOG, "Store updated after event", {
            liveTaskCount: Object.keys(useTrackingStore.getState().liveTasks).length,
          });
        } else {
          console.warn(LOG, "Tracking event missing payload", msg.type);
        }
        return;
      }

      if (msg.type === "attendance.clocked_in" || msg.type === "attendance.clocked_out") {
        const attendanceStore = useAttendanceMapStore.getState();
        const data = msg.payload?.data as AttendanceMapSnapshotItem | undefined;

        if (msg.type === "attendance.clocked_in" && data) {
          attendanceStore.upsertSnapshot(data);
        }

        if (msg.type === "attendance.clocked_out" && msg.payload?.user_id) {
          attendanceStore.removeSnapshot(Number(msg.payload.user_id));
        }

        return;
      }

      console.log(LOG, "Unhandled message type", msg.type, msg);
    };

    ws.onerror = (event) => {
      console.error(LOG, "❌ Socket error", {
        attempt,
        readyState: readyStateLabel(ws.readyState),
        event,
      });
    };

    ws.onclose = (event) => {
      console.warn(LOG, "🔌 Socket CLOSED", {
        attempt,
        code: event.code,
        reason: event.reason || "(none)",
        wasClean: event.wasClean,
        readyState: readyStateLabel(ws.readyState),
        mounted: mountedRef.current,
        codeHints:
          event.code === 4401
            ? "4401 = auth failed or auth timeout on relay"
            : event.code === 1006
              ? "1006 = abnormal closure (network, proxy, or server dropped)"
              : undefined,
      });

      if (!mountedRef.current) {
        console.log(LOG, "Close ignored — component unmounted (teardown, not reconnecting)");
        return;
      }

      authenticatedRef.current = false;
      store.setWsStatus("reconnecting");
      disconnectedAtRef.current = disconnectedAtRef.current ?? Date.now();

      const elapsed = Date.now() - disconnectedAtRef.current;
      if (elapsed > STALE_THRESHOLD_MS) {
        startPolling();
      }

      const delay = BACKOFF_STEPS[Math.min(backoffRef.current, BACKOFF_STEPS.length - 1)];
      backoffRef.current++;

      console.log(LOG, "Scheduling reconnect", { delayMs: delay, backoffStep: backoffRef.current });

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, delay);
    };
  }, [
    token,
    companyId,
    store,
    runRecoveryCycle,
    startPolling,
    stopPolling,
    subscribedTaskIds,
    user?.id,
    wsUrl,
  ]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authenticatedRef.current) {
      return;
    }

    const previous = new Set(subscribedTaskIdsRef.current);
    const next = new Set(subscribedTaskIds);

    for (const taskId of subscribedTaskIds) {
      if (previous.has(taskId)) {
        continue;
      }

      ws.send(JSON.stringify({ type: "subscribe_task", task_id: taskId }));
    }

    for (const taskId of subscribedTaskIdsRef.current) {
      if (next.has(taskId)) {
        continue;
      }

      ws.send(JSON.stringify({ type: "unsubscribe_task", task_id: taskId }));
    }

    subscribedTaskIdsRef.current = subscribedTaskIds;
  }, [subscribedTaskIds]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    console.log(LOG, "Hook mounted", {
      hasToken: !!token,
      companyId,
      wsUrl,
    });

    if (token && companyId) {
      // Hydrate the store immediately from the REST snapshot endpoint so the
      // map is populated before the WebSocket handshake completes (~1-3s lag).
      queueMicrotask(() => {
        void hydrateLocationSnapshots({ markInitial: true });
      });
    }

    if (token && companyId && wsUrl) {
      connect();
    } else if (!token || !companyId) {
      console.warn(LOG, "Not connecting — missing token or companyId");
    }

    return () => {
      console.log(LOG, "Hook unmounting — cleaning up", {
        wsReadyState: wsRef.current ? readyStateLabel(wsRef.current.readyState) : "no socket",
      });

      mountedRef.current = false;
      authenticatedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      stopPolling();
      const ws = wsRef.current;
      wsRef.current = null;
      store.setWsStatus("idle");

      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState !== WebSocket.CONNECTING) {
          console.log(LOG, "Closing socket on cleanup", {
            readyState: readyStateLabel(ws.readyState),
          });
          ws.close();
        } else {
          console.log(
            LOG,
            "Skipping close on CONNECTING socket (avoids browser warning; onopen guard will close if needed)"
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, String(companyId), wsUrl]);

  return { wsStatus: store.wsStatus, isInitialHydrating };
}
