'use client';

import { useRouter } from 'next/navigation';

export function useMeetingNavigation() {
  const router = useRouter();

  return {
    goToMeetingsList: () => router.push('/manager/meetings'),
    goToCreateMeeting: () => router.push('/manager/meetings/new'),
    goToMeetingDetail: (id: number | string) =>
      router.push(`/manager/meetings/${id}`),
    goToEditMeeting: (id: number | string) =>
      router.push(`/manager/meetings/${id}/edit`),
    goBack: () => router.back(),
  };
}
