'use client';

import { useRouter } from 'next/navigation';

export function useCrmNavigation() {
  const router = useRouter();

  return {
    goToCrm: () => router.push('/manager/crm'),
    goToAllLeads: () => router.push('/manager/crm/leads'),
    goToLeadDetail: (id: number | string) =>
      router.push(`/manager/crm/leads/${id}`),
    goBack: () => router.back(),
  };
}
