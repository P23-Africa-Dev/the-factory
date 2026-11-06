'use client';

import { useRouter } from 'next/navigation';

export function useCrmNavigation() {
  const router = useRouter();

  return {
    goToCrm: () => router.push('/crm'),
    goToAllLeads: () => router.push('/crm/leads'),
    goToLeadDetail: (id: number | string) =>
      router.push(`/crm/leads/${id}`),
    goBack: () => router.back(),
  };
}
