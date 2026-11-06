'use client';

import { useRouter } from 'next/navigation';

export const useTrackingNavigation = () => {
  const router = useRouter();

  return {
    goToTracking: (taskId: number) =>
      router.push(`/task/${taskId}/tracking`),

    goToMapActivity: (taskId: number) =>
      router.replace(`/map?taskId=${taskId}`),

    goToTrackingComplete: (taskId: number) =>
      router.replace(`/task/${taskId}/complete`),
  };
};
