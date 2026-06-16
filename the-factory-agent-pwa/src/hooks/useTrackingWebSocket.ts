'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTrackingStore } from '@/store/tracking';
import { useNotificationStore } from '@/store/notifications';
import { trackingApi } from '@/features/tracking/api';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import { queryClient } from '@/lib/queryClient';
import { env } from '@/constants/env';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const WS_DISCONNECT_POLL_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 25_000;

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
          const lastPoint = route.points.length > 0 ? route.points[route.points.length - 1] : null;
          upsertTask(taskId, {
            polyline: route.polyline,
            lastPosition: lastPoint
              ? [lastPoint.longitude, lastPoint.latitude]
              : undefined,
            destination: {
              latitude: route.destination.latitude,
              longitude: route.destination.longitude,
              radiusMeters: route.destination.radius_meters,
            },
          });
        } catch {
          // Silent — polling is best-effort fallback
        }
      }
    }, POLL_INTERVAL_MS);
  }, [upsertTask]);

  const handleEvent = useCallback(
    (envelope: Record<string, unknown>) => {
      const taskId = envelope.task_id as number;
      const occurredAt = envelope.occurred_at as string;
      const data = (envelope.data ?? {}) as Record<string, unknown>;

      switch (envelope.type) {
        case 'tracking.task.started':
          upsertTask(taskId, {
            trackingSessionId: envelope.tracking_session_id as number,
            status: 'tracking',
            lastPosition:
              data.longitude != null && data.latitude != null
                ? [data.longitude as number, data.latitude as number]
                : null,
          });
          break;

        case 'tracking.location.updated': {
          const point: [number, number] = [
            data.longitude as number,
            data.latitude as number,
          ];
          appendPolylinePoint(taskId, point);
          upsertTask(taskId, { lastPosition: point, lastUpdatedAt: occurredAt });
          if (data.arrived) {
            markArrived(taskId, occurredAt);
          }
          break;
        }

        case 'tracking.task.arrived':
          markArrived(taskId, occurredAt);
          break;

        case 'tracking.task.completed':
          markCompleted(taskId);
          setTimeout(() => removeTask(taskId), 5_000);
          break;

        case 'notifications.unread_count.updated': {
          const count = (envelope.data as { unread_count?: number })?.unread_count;
          if (typeof count === 'number') {
            setUnreadCount(count);
            queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
          }
          break;
        }

        case 'notifications.created': {
          const notifData = envelope.data as Record<string, unknown>;
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
  }, [setWsStatus, handleEvent, startPolling, stopPolling]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      stopPolling();
    };
  }, [connect, stopPolling]);
};
