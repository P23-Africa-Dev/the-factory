'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Compass, MapPin, AlertCircle, ShieldAlert } from 'lucide-react';

import { useGeolocation, useStartTask, useTrackingNavigation } from '@/features/tracking';
import { useTask } from '@/features/tasks';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';

function LocationPermissionGate({
  onGranted,
  onDenied,
  isResume = false,
}: {
  onGranted: () => void;
  onDenied: () => void;
  isResume?: boolean;
}) {
  const { permissionStatus, requestPermission } = useGeolocation();
  const [errorVisible, setErrorVisible] = useState(false);

  const handleRequest = async () => {
    const status = await requestPermission();
    if (status === 'granted') {
      onGranted();
    } else {
      setErrorVisible(true);
      onDenied();
    }
  };

  if (errorVisible || permissionStatus === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A1D25] px-8 text-center font-sans">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FD6046]/15">
          <ShieldAlert className="text-[#FD6046]" size={28} />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Location access blocked</h3>
        <p className="text-xs text-[#8F9098] leading-relaxed max-w-xs mb-6">
          To start or resume tasks, enable location access in your browser&apos;s site settings or system privacy settings.
        </p>
        <button
          onClick={handleRequest}
          className="w-full max-w-xs h-11 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold text-xs active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A1D25] px-8 text-center font-sans">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#75ADAF]/10 text-[#75ADAF]">
        <Compass className="animate-pulse" size={32} />
      </div>
      <h3 className="text-xl font-bold text-white mb-3">
        {isResume ? 'Resume tracking' : 'Location access needed'}
      </h3>
      <p className="text-xs text-[#8F9098] leading-relaxed max-w-xs mb-8">
        {isResume
          ? 'This task is already in progress. Allow location access to resume tracking from where you left off.'
          : 'To start this task, we need to track your location so supervisors can monitor your route and confirm you reached the destination. Your location is only shared while this task is active.'}
      </p>
      <button
        onClick={handleRequest}
        className="w-full max-w-xs h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold text-xs active:scale-95 mb-3 shadow-md"
      >
        {isResume ? 'Resume Tracking' : 'Allow Location Access'}
      </button>
      <button
        onClick={onDenied}
        className="text-[#8F9098] hover:text-white font-semibold text-xs py-2.5 transition-colors"
      >
        Not Now
      </button>
    </div>
  );
}

export default function TrackingPage() {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';
  const taskId = Number(id);

  const { mutate: startTask, isPending: isStarting } = useStartTask();
  const { getCurrentPosition } = useGeolocation();
  const { goToMapActivity, goToTrackingComplete } = useTrackingNavigation();

  const { data: task } = useTask(String(taskId));
  const resolvedCompanyId = task?.companyId ?? getActiveCompanyId() ?? 0;

  const handlePermissionGranted = useCallback(async () => {
    try {
      const pos = await getCurrentPosition();
      const isResume = task?.status === 'in_progress';

      if (isResume) {
        useTrackingStore.getState().upsertTask(taskId, {
          status: 'tracking',
          lastPosition: [pos.coords.longitude, pos.coords.latitude],
          polyline: [],
        });
        useTrackingStore.getState().setActiveTrackingTaskId(taskId);
        goToMapActivity(taskId);
        return;
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
              status: 'tracking',
              lastPosition: [pos.coords.longitude, pos.coords.latitude],
              polyline: [],
            });
            useTrackingStore.getState().setActiveTrackingTaskId(taskId);
            goToMapActivity(taskId);
            if (data.arrived) {
              useTrackingStore.getState().markArrived(taskId, new Date().toISOString());
            }
          },
          onError: (error: unknown) => {
            alert(`Could not start task: ${error instanceof Error ? error.message : 'Please try again.'}`);
          },
        }
      );
    } catch (err) {
      alert('Location error: Could not get your current position. Please try again.');
    }
  }, [taskId, resolvedCompanyId, startTask, getCurrentPosition, task, goToMapActivity]);

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
    <LocationPermissionGate
      onGranted={handlePermissionGranted}
      onDenied={() => goToTrackingComplete(taskId)}
      isResume={isResume}
    />
  );
}
