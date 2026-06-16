'use client';

import { useRouter } from 'next/navigation';
import type { AppNotification } from './types';

export function useNotificationNavigation() {
  const router = useRouter();

  const navigateToNotification = (notification: AppNotification): void => {
    // Priority 1: action_url — parse known path patterns
    if (notification.actionUrl) {
      const resolved = resolveActionUrl(notification.actionUrl);
      if (resolved) {
        router.push(resolved);
        return;
      }
    }

    // Priority 2: reference_type + reference_id
    if (notification.referenceType && notification.referenceId) {
      const resolved = resolveReferenceType(notification.referenceType, notification.referenceId);
      if (resolved) {
        router.push(resolved);
        return;
      }
    }

    // Fallback: stay on current screen
  };

  return { navigateToNotification };
}

function resolveActionUrl(url: string): string | null {
  // /tasks/{id}
  const taskMatch = url.match(/^\/tasks\/(\d+)/);
  if (taskMatch) {
    return `/task/${taskMatch[1]}`;
  }

  // /meetings/{id}
  const meetingMatch = url.match(/^\/meetings\/(\d+)/);
  if (meetingMatch) {
    return `/meetings/${meetingMatch[1]}`;
  }

  return null;
}

function resolveReferenceType(type: string, id: number): string | null {
  if (type.includes('Task')) {
    return `/task/${id}`;
  }
  if (type.includes('Meeting')) {
    return `/meetings/${id}`;
  }
  return null;
}
