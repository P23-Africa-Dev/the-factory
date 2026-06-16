'use client';

import { useRouter } from 'next/navigation';

type MapDestinationParams = {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
};

export function useTaskNavigation() {
  const router = useRouter();

  return {
    goToTaskList: () => router.replace('/'),
    goToTasksList: () => router.push('/tasks'),
    goToMapScreen: (dest?: MapDestinationParams) => {
      if (dest) {
        const queryParams = new URLSearchParams({
          destName: dest.name,
          destAddress: dest.address ?? '',
          destLat: String(dest.latitude),
          destLng: String(dest.longitude),
        });
        router.push(`/map?${queryParams.toString()}`);
      } else {
        router.push('/map');
      }
    },
    goToTaskDetail: (id: string) =>
      router.push(`/task/${id}`),
    goToTracking: (id: string) =>
      router.push(`/task/${id}/tracking`),
    goToTaskComplete: (id: string) =>
      router.replace(`/task/${id}/complete`),
  };
}
