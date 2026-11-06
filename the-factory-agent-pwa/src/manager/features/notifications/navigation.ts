'use client';

import { useRouter } from 'next/navigation';
import type { AppNotification } from './types';
import { resolveAgentDeepLink } from '@/lib/notifications/resolveAgentDeepLink';

export function useNotificationNavigation() {
  const router = useRouter();

  const navigateToNotification = (notification: AppNotification): void => {
    // Lead events carry a canonical lead ID; older action URLs may point elsewhere.
    if (notification.type.startsWith('crm.lead_')) {
      const metadataId = notification.metadata?.lead_id;
      const leadId = metadataId ?? (
        notification.referenceType?.includes('Lead') ? notification.referenceId : null
      );
      if (leadId != null && /^[1-9]\d*$/.test(String(leadId))) {
        router.push(`/crm/leads/${leadId}`);
        return;
      }
    }

    if (notification.actionUrl) {
      router.push(resolveAgentDeepLink(notification.actionUrl));
      return;
    }

    if (notification.referenceType && notification.referenceId) {
      const resolved = resolveReferenceType(
        notification.referenceType,
        notification.referenceId,
      );
      if (resolved) {
        router.push(resolved);
        return;
      }
    }

    router.push('/');
  };

  return { navigateToNotification };
}

function resolveReferenceType(type: string, id: number): string | null {
  if (type.includes('Task')) {
    return `/task/${id}`;
  }
  if (type.includes('Meeting')) {
    return `/meetings/${id}`;
  }
  if (type.includes('Lead') || type.includes('Crm')) {
    return `/crm/leads/${id}`;
  }
  if (type.includes('Attendance')) {
    return '/';
  }
  if (type.includes('FieldActivity') || type.includes('FieldStop')) {
    return '/field-activity';
  }
  return null;
}
