"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useTrackingStore } from "@/store/tracking";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { getTaskRoute } from "@/lib/api/tracking";
import type { TrackingEnvelope } from "@/types/tracking";

const WS_URL =
  process.env.NEXT_PUBLIC_TRACKING_WS_URL ?? "wss://realtime.thefactory23.com/tracking-ws";

const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];
const POLL_INTERVAL_MS = 25_000;
const STALE_THRESHOLD_MS = 30_000;

const LOG = "[tracking-ws]";

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
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const store = useTrackingStore();

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const connectionAttemptRef = useRef(0);

  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

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
          const res = await getTaskRoute(
            t.taskId,
            { company_id: companyId, role: "management" },
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
  }, [companyId, token]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    console.log(LOG, "Starting REST polling fallback", { intervalMs: POLL_INTERVAL_MS });
    pollTimerRef.current = setInterval(rehydrateActiveTasks, POLL_INTERVAL_MS);
  }, [rehydrateActiveTasks]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      console.log(LOG, "Stopping REST polling fallback");
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token || !companyId || !mountedRef.current) {
      console.log(LOG, "Connect skipped", {
        hasToken: !!token,
        companyId,
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

    const url = `${WS_URL}?token=${encodeURIComponent(token)}&company_id=${companyId}`;
    console.groupCollapsed(`${LOG} Connecting (attempt #${attempt})`);
    console.log("URL (token redacted)", url.replace(token, redactToken(token)));
    console.log("WS base", WS_URL);
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
        url: WS_URL,
      });

      if (!mountedRef.current) {
        console.warn(LOG, "Component unmounted before onopen — closing socket");
        ws.close();
        return;
      }

      backoffRef.current = 0;
      disconnectedAtRef.current = null;
      store.setWsStatus("connected");
      stopPolling();

      const authMessage = { type: "authenticate", token, company_id: companyId };
      console.log(LOG, "Sending post-connect authenticate", {
        type: authMessage.type,
        company_id: authMessage.company_id,
        token: redactToken(token),
      });
      ws.send(JSON.stringify(authMessage));

      rehydrateActiveTasks();
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
      };

      if (msg.type === "system.connected") {
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
        msg.type === "tracking.location.updated" ||
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
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [token, companyId, store, rehydrateActiveTasks, startPolling, stopPolling, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    console.log(LOG, "Hook mounted", {
      hasToken: !!token,
      companyId,
      wsUrl: WS_URL,
    });

    if (token && companyId) {
      connect();
    } else {
      console.warn(LOG, "Not connecting — missing token or companyId");
    }

    return () => {
      console.log(LOG, "Hook unmounting — cleaning up", {
        wsReadyState: wsRef.current ? readyStateLabel(wsRef.current.readyState) : "no socket",
      });

      mountedRef.current = false;
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
  }, [token, String(companyId)]);

  return { wsStatus: store.wsStatus };
}
