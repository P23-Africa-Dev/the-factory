'use client';

import { useRouter } from 'next/navigation';

type MapDestinationParams = {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
};

export function isResumeTrackingStatus(status?: string): boolean {
  return status === 'in_progress' || status === 'paused' || status === 'resumed';
}

export function useTaskNavigation() {
  const router = useRouter();

  return {
    goToTaskList: () => router.replace('/manager'),
    goToTasksList: () => router.push('/manager/tasks'),
    goToMapScreen: (dest?: MapDestinationParams) => {
      if (dest) {
        const queryParams = new URLSearchParams({
          destName: dest.name,
          destAddress: dest.address ?? '',
          destLat: String(dest.latitude),
          destLng: String(dest.longitude),
        });
        router.push(`/manager/map?${queryParams.toString()}`);
      } else {
        router.push('/manager/map');
      }
    },
    goToTaskDetail: (id: string) =>
      router.push(`/manager/task/${id}`),
    /** Fresh task start — permission gate + POST /start */
    goToTracking: (id: string) =>
      router.push(`/manager/task/${id}/tracking`),
    /** Active task resume — open map directly (skip tracking gate page) */
    goToContinueTracking: (id: string) =>
      router.push(`/manager/map?taskId=${id}`),
    goToTaskComplete: (id: string) =>
      router.replace(`/manager/task/${id}/complete`),
  };
}
