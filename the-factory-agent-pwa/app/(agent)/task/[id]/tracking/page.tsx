'use client';

import React, { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';

import {
  useGeolocation,
  useStartTask,
  useTrackingNavigation,
  useActiveTracking,
  trackingApi,
  hydrateLiveTaskFromRoute,
  LocationPermissionGate,
} from '@/features/tracking';
import { useTask } from '@/features/tasks';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';

export default function TrackingPage() {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';
  const taskId = Number(id);

  const { mutate: startTask, isPending: isStarting } = useStartTask();
  const { getCurrentPosition, requestPermission } = useGeolocation();
  const { goToMapActivity, goToTrackingComplete } = useTrackingNavigation();
  const { startTracking } = useActiveTracking();
  const [gateMode, setGateMode] = useState<'request' | 'denied'>('request');
  const [isRequesting, setIsRequesting] = useState(false);

  const { data: task } = useTask(String(taskId));
  const resolvedCompanyId = task?.companyId ?? getActiveCompanyId() ?? 0;

  const beginTrackingSession = useCallback(
    (arrived?: boolean) => {
      startTracking(taskId, resolvedCompanyId, {
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
    [taskId, resolvedCompanyId, startTracking, goToMapActivity],
  );

  const handlePermissionGranted = useCallback(async () => {
    try {
      const pos = await getCurrentPosition();
      const isResume = task?.status === 'in_progress';

      if (isResume) {
        try {
          const route = await trackingApi.getTaskRoute(taskId, resolvedCompanyId);
          hydrateLiveTaskFromRoute(taskId, route);
          useTrackingStore.getState().upsertTask(taskId, {
            status: route.arrival ? 'arrived' : 'tracking',
            lastPosition: [pos.coords.longitude, pos.coords.latitude],
          });
          beginTrackingSession(route.arrival != null);
          return;
        } catch {
          // Fall through to /start if route fetch fails
        }
      }

      startTask(
        {
          taskId,
          payload: {
            companyId: resolvedCompanyId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy ?? 0,
            recordedAt: new Date(pos.timestamp).toISOString(),
          },
        },
        {
          onSuccess: (data) => {
            useTrackingStore.getState().upsertTask(taskId, {
              trackingSessionId: data.tracking.id,
              status: data.arrived ? 'arrived' : 'tracking',
              lastPosition: [pos.coords.longitude, pos.coords.latitude],
              polyline: [],
            });
            beginTrackingSession(data.arrived);
          },
          onError: (error: unknown) => {
            toast.error(
              'Could not start task',
              error instanceof Error ? error.message : 'Please try again.',
            );
          },
        },
      );
    } catch {
      toast.error('Location error', 'Could not get your current position. Please try again.');
    }
  }, [taskId, resolvedCompanyId, startTask, getCurrentPosition, task, beginTrackingSession]);

  const handleRequest = useCallback(async () => {
    setIsRequesting(true);
    try {
      const status = await requestPermission();
      if (status === 'granted') {
        await handlePermissionGranted();
      } else if (status === 'denied') {
        setGateMode('denied');
      } else {
        // 'prompt'/'unknown' — couldn't obtain a fix but not a hard denial.
        toast.error('Location unavailable', 'We could not read your location. Please try again.');
      }
    } finally {
      setIsRequesting(false);
    }
  }, [requestPermission, handlePermissionGranted]);

  if (isStarting) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] gap-4 text-center font-sans">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        <p className="text-white text-sm">Starting task…</p>
      </div>
    );
  }

  const isResume = task?.status === 'in_progress';

  return (
    <div className="relative min-h-screen bg-[#0A1D25]">
      <LocationPermissionGate
        mode={gateMode}
        isBusy={isRequesting}
        isResume={isResume}
        onRequest={handleRequest}
        onDismiss={() => goToTrackingComplete(taskId)}
        fullScreen
      />
    </div>
  );
}
