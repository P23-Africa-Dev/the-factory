'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  useGeolocation,
  useStartTask,
  useTrackingNavigation,
  useActiveTracking,
  trackingApi,
  hydrateLiveTaskFromRoute,
  LocationPermissionGate,
} from '@/features/tracking';
import { useTask, isResumeTrackingStatus, taskHasMapLocation } from '@/features/tasks';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { flattenApiError, isTrackingAlreadyActiveError } from '@/lib/api/errors';
import { toast } from '@/lib/toast';

function resolveCompanyId(taskCompanyId: number | null | undefined): number {
  return taskCompanyId ?? getActiveCompanyId() ?? 0;
}

export default function TrackingPage() {
  const routeParams = useParams();
  const router = useRouter();
  const id = (routeParams?.id as string) || '';
  const taskId = Number(id);

  const { mutateAsync: startTaskAsync, isPending: isStarting } = useStartTask();
  const { resolveCurrentPosition, ensureLocationPermission, retryLocationPermission, checkPermission } = useGeolocation();
  const { goToMapActivity, goToTrackingComplete } = useTrackingNavigation();
  const { startTracking } = useActiveTracking();
  const [gateMode, setGateMode] = useState<'request' | 'denied'>('request');
  const [isRequesting, setIsRequesting] = useState(false);
  const autoStartAttemptedRef = useRef(false);
  const flowInFlightRef = useRef(false);
  const resumeRedirectedRef = useRef(false);

  const { data: task, isLoading: isTaskLoading } = useTask(String(taskId));
  const isResume = isResumeTrackingStatus(task?.status);
  const hasMapLocation = task ? taskHasMapLocation(task) : false;

  useEffect(() => {
    if (!task || isTaskLoading) return;
    if (!hasMapLocation) {
      toast.error('No map location', 'This task has no destination. Update its status from task details.');
      router.replace(`/task/${taskId}`);
    }
  }, [task, isTaskLoading, hasMapLocation, router, taskId]);

  // Active tasks skip this page entirely — resume on the map.
  useEffect(() => {
    if (!task || !isResume || !hasMapLocation || resumeRedirectedRef.current) return;
    resumeRedirectedRef.current = true;
    goToMapActivity(taskId);
  }, [task, isResume, taskId, goToMapActivity]);

  const beginTrackingSession = useCallback(
    (companyId: number, arrived?: boolean) => {
      startTracking(taskId, companyId, {
        onArrived: () => {
          useTrackingStore.getState().markArrived(taskId, new Date().toISOString());
        },
      });
      useTrackingStore.getState().setActiveTrackingTaskId(taskId);
      if (arrived) {
        useTrackingStore.getState().markArrived(taskId, new Date().toISOString());
      }
      goToMapActivity(taskId);
    },
    [taskId, startTracking, goToMapActivity],
  );

  const resumeExistingSession = useCallback(
    async (companyId: number, pos: { coords: { latitude: number; longitude: number } }) => {
      try {
        const route = await trackingApi.getTaskRoute(taskId, companyId);
        hydrateLiveTaskFromRoute(taskId, route);
        useTrackingStore.getState().upsertTask(taskId, {
          status: route.arrival ? 'arrived' : 'tracking',
          lastPosition: [pos.coords.longitude, pos.coords.latitude],
        });
        beginTrackingSession(companyId, route.arrival != null);
      } catch {
        useTrackingStore.getState().upsertTask(taskId, {
          status: 'tracking',
          lastPosition: [pos.coords.longitude, pos.coords.latitude],
        });
        beginTrackingSession(companyId, false);
      }
    },
    [taskId, beginTrackingSession],
  );

  const proceedWithTracking = useCallback(async () => {
    const companyId = resolveCompanyId(task?.companyId);

    if (!companyId) {
      toast.error('Session error', 'Company context is missing. Please reload and try again.');
      return;
    }

    const pos = await resolveCurrentPosition();

    try {
      const data = await startTaskAsync({
        taskId,
        payload: {
          companyId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? 0,
          recordedAt: new Date(pos.timestamp).toISOString(),
        },
      });
      useTrackingStore.getState().upsertTask(taskId, {
        trackingSessionId: data.tracking.id,
        status: data.arrived ? 'arrived' : 'tracking',
        lastPosition: [pos.coords.longitude, pos.coords.latitude],
        polyline: [],
      });
      beginTrackingSession(companyId, data.arrived);
    } catch (error: unknown) {
      if (isTrackingAlreadyActiveError(error)) {
        await resumeExistingSession(companyId, pos);
        return;
      }
      toast.error('Could not start task', flattenApiError(error) || 'Please try again.');
    }
  }, [
    taskId,
    task?.companyId,
    task?.status,
    resolveCurrentPosition,
    resumeExistingSession,
    beginTrackingSession,
    startTaskAsync,
  ]);

  const runTrackingFlow = useCallback(async (userRetry = false) => {
    if (flowInFlightRef.current) return;
    flowInFlightRef.current = true;
    setIsRequesting(true);
    try {
      const status = userRetry
        ? await retryLocationPermission()
        : await ensureLocationPermission();

      if (status === 'denied') {
        setGateMode('denied');
        return;
      }

      await proceedWithTracking();
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr?.code === geoErr?.PERMISSION_DENIED) {
        setGateMode('denied');
        return;
      }
      toast.error('Location error', 'Could not get your current position. Please try again.');
    } finally {
      flowInFlightRef.current = false;
      setIsRequesting(false);
    }
  }, [ensureLocationPermission, retryLocationPermission, proceedWithTracking]);

  const handleRequest = useCallback(() => {
    autoStartAttemptedRef.current = true;
    void runTrackingFlow(true);
  }, [runTrackingFlow]);

  useEffect(() => {
    if (isResume || autoStartAttemptedRef.current || flowInFlightRef.current || isStarting || isRequesting) return;
    if (isTaskLoading || !task) return;
    if (!resolveCompanyId(task.companyId)) return;

    void (async () => {
      const status = await checkPermission();
      if (status !== 'granted') return;
      autoStartAttemptedRef.current = true;
      await runTrackingFlow();
    })();
  }, [isResume, isTaskLoading, task, isStarting, isRequesting, checkPermission, runTrackingFlow]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void checkPermission().then((status) => {
        if (status === 'granted' && gateMode === 'denied') {
          void runTrackingFlow(true);
        }
      });
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [gateMode, checkPermission, runTrackingFlow]);

  if (isResume || (isTaskLoading && !task)) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] gap-4 text-center font-sans">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        <p className="text-white text-sm">{isResume ? 'Opening map…' : 'Loading task…'}</p>
      </div>
    );
  }

  if (isStarting || isRequesting) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] gap-4 text-center font-sans">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        <p className="text-white text-sm">Starting task…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0A1D25]">
      <LocationPermissionGate
        mode={gateMode}
        isBusy={isRequesting}
        isResume={false}
        onRequest={handleRequest}
        onDismiss={() => goToTrackingComplete(taskId)}
        fullScreen
      />
    </div>
  );
}
