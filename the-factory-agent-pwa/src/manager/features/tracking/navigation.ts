'use client';

import { useRouter } from 'next/navigation';

export const useTrackingNavigation = () => {
  const router = useRouter();

  return {
    goToTracking: (taskId: number) =>
      router.push(`/manager/task/${taskId}/tracking`),

    goToMapActivity: (taskId: number) =>
      router.replace(`/manager/map?taskId=${taskId}`),

    goToTrackingComplete: (taskId: number) =>
      router.replace(`/manager/task/${taskId}/complete`),
  };
};
