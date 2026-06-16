'use client';

import { useRouter } from 'next/navigation';

export function useMeetingNavigation() {
  const router = useRouter();

  return {
    goToMeetingsList: () => router.push('/meetings'),
    goToCreateMeeting: () => router.push('/meetings/new'),
    goToMeetingDetail: (id: number | string) =>
      router.push(`/meetings/${id}`),
    goToEditMeeting: (id: number | string) =>
      router.push(`/meetings/${id}/edit`),
    goBack: () => router.back(),
  };
}
