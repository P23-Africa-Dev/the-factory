'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTrackingStore } from '@/store/tracking';
import { useNotificationStore } from '@/store/notifications';
import { trackingApi } from '@/features/tracking/api';
import { hydrateLiveTaskFromRoute } from '@/features/tracking/hydrateRoute';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import { queryClient } from '@/lib/queryClient';
import { env } from '@/constants/env';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const WS_DISCONNECT_POLL_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 25_000;

function readAgentFields(data: Record<string, unknown>): {
  agentId?: number;
  agentName?: string;
  agentAvatar?: string | null;
} {
  const agent = data.agent as
    | { id?: number; name?: string; avatar_url?: string | null }
    | undefined;
  if (!agent) return {};

  return {
    ...(typeof agent.id === 'number' ? { agentId: agent.id } : {}),
    ...(typeof agent.name === 'string' ? { agentName: agent.name } : {}),
    ...(agent.avatar_url != null ? { agentAvatar: agent.avatar_url } : {}),
  };
}

export const useTrackingWebSocket = (): void => {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const setPendingNotification = useNotificationStore((s) => s.setPendingNotification);
  const setWsStatus = useTrackingStore((s) => s.setWsStatus);
  const upsertTask = useTrackingStore((s) => s.upsertTask);
  const appendPolylinePoint = useTrackingStore((s) => s.appendPolylinePoint);
  const markArrived = useTrackingStore((s) => s.markArrived);
  const markCompleted = useTrackingStore((s) => s.markCompleted);
  const removeTask = useTrackingStore((s) => s.removeTask);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const connectRef = useRef<(() => void) | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedAtRef = useRef<number | null>(null);

  const subscribeActiveTask = useCallback((ws: WebSocket) => {
    const activeTaskId = useTrackingStore.getState().activeTrackingTaskId;
    if (activeTaskId != null) {
      ws.send(JSON.stringify({ type: 'subscribe_task', task_id: activeTaskId }));
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    const companyId = getActiveCompanyId();
    if (!companyId) return;

    pollTimerRef.current = setInterval(async () => {
      const { liveTaskMap } = useTrackingStore.getState();
      const activeTaskIds = Object.keys(liveTaskMap).map(Number);

      for (const taskId of activeTaskIds) {
        try {
          const route = await trackingApi.getTaskRoute(taskId, companyId);
          hydrateLiveTaskFromRoute(taskId, route);
        } catch {
          // Silent — polling is best-effort fallback
        }
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const handleEvent = useCallback(
    (message: Record<string, unknown>) => {
      // The realtime relay wraps every Redis event as
      // `{ type, channel, payload: { task_id, occurred_at, tracking_session_id, data } }`.
      // Fall back to the message root for any non-wrapped/legacy messages.
      const type = message.type as string;
      const envelope = ((message.payload as Record<string, unknown> | undefined) ?? message) as Record<
        string,
        unknown
      >;
      const taskId = envelope.task_id as number;
      const occurredAt = envelope.occurred_at as string;
      const data = (envelope.data ?? {}) as Record<string, unknown>;

      switch (type) {
        case 'tracking.task.started':
          if (taskId == null) break;
          upsertTask(taskId, {
            trackingSessionId: envelope.tracking_session_id as number,
            status: 'tracking',
            lastPosition:
              data.longitude != null && data.latitude != null
                ? [data.longitude as number, data.latitude as number]
                : null,
            ...readAgentFields(data),
          });
          break;

        case 'tracking.location.updated':
        case 'tracking.agent.location.updated': {
          if (taskId == null || data.longitude == null || data.latitude == null) break;
          const point: [number, number] = [
            data.longitude as number,
            data.latitude as number,
          ];
          appendPolylinePoint(taskId, point);
          upsertTask(taskId, {
            lastPosition: point,
            lastUpdatedAt: occurredAt,
            ...readAgentFields(data),
            ...(data.heading_degrees != null
              ? { lastHeadingDegrees: data.heading_degrees as number }
              : {}),
            ...(data.speed_mps != null ? { lastSpeedMps: data.speed_mps as number } : {}),
          });
          if (data.arrived) {
            markArrived(taskId, occurredAt);
          }
          break;
        }

        case 'tracking.task.reassigned': {
          if (taskId == null) break;
          const toUserId = data.to_user_id as number | undefined;
          upsertTask(taskId, {
            ...(typeof toUserId === 'number' ? { agentId: toUserId } : {}),
            agentAvatar: null,
            lastUpdatedAt: occurredAt,
          });
          break;
        }

        case 'tracking.task.near_destination':
          if (taskId == null) break;
          upsertTask(taskId, { status: 'tracking', lastUpdatedAt: occurredAt });
          break;

        case 'tracking.task.arrived':
          if (taskId == null) break;
          markArrived(taskId, occurredAt);
          break;

        case 'tracking.task.completed':
          if (taskId == null) break;
          markCompleted(taskId);
          setTimeout(() => removeTask(taskId), 5_000);
          break;

        case 'notifications.unread_count.updated': {
          const count = (data as { unread_count?: number })?.unread_count;
          if (typeof count === 'number') {
            setUnreadCount(count);
            queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
          }
          break;
        }

        case 'notifications.created': {
          const notifData = data;
          setPendingNotification({
            notification_id: notifData.notification_id as number,
            type: notifData.type as string,
            category: notifData.category as string,
            priority: notifData.priority as string,
            title: notifData.title as string,
            message: notifData.message as string,
            is_in_app_visible: notifData.is_in_app_visible as boolean,
            action_url: (notifData.action_url as string | null) ?? null,
          });
          queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
          break;
        }

        case 'system.auth_required':
          wsRef.current?.close();
          break;
      }
    },
    [upsertTask, appendPolylinePoint, markArrived, markCompleted, removeTask, setUnreadCount, setPendingNotification]
  );

  const connect = useCallback(function connectFn() {
    const token = appStore.getString('auth_token');
    const companyId = getActiveCompanyId();
    if (!token || !companyId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setWsStatus('connecting');

    const wsBaseUrl = env.TRACKING_WS_URL as string;
    const wsUrl = `${wsBaseUrl}?token=${encodeURIComponent(token)}&company_id=${encodeURIComponent(String(companyId))}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      backoffRef.current = INITIAL_BACKOFF_MS;
      disconnectedAtRef.current = null;
      stopPolling();
      ws.send(JSON.stringify({ type: 'ping' }));
      subscribeActiveTask(ws);
    };

    ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data as string) as Record<string, unknown>;
        handleEvent(envelope);
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      setWsStatus('error');
      console.warn(
        '[tracking-ws] connection error',
        '— reason: WebSocket relay unreachable or auth rejected.',
        'suggested fix: verify TRACKING_WS_URL and that the realtime relay is running.',
      );
    };

    ws.onclose = () => {
      setWsStatus('reconnecting');
      disconnectedAtRef.current = disconnectedAtRef.current ?? Date.now();

      const disconnectedMs = Date.now() - (disconnectedAtRef.current ?? Date.now());
      if (disconnectedMs > WS_DISCONNECT_POLL_THRESHOLD_MS) {
        startPolling();
      }

      retryTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connectRef.current?.();
      }, backoffRef.current);
    };
  }, [setWsStatus, handleEvent, startPolling, stopPolling, subscribeActiveTask]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const unsubscribe = useTrackingStore.subscribe((state, prevState) => {
      if (state.activeTrackingTaskId === prevState.activeTrackingTaskId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (prevState.activeTrackingTaskId != null) {
        ws.send(JSON.stringify({ type: 'unsubscribe_task', task_id: prevState.activeTrackingTaskId }));
      }
      if (state.activeTrackingTaskId != null) {
        ws.send(JSON.stringify({ type: 'subscribe_task', task_id: state.activeTrackingTaskId }));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      stopPolling();
    };
  }, [connect, stopPolling]);
};
