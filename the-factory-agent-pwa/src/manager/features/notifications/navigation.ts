'use client';

/**
 * Manager and agent shells share one notification router: the target is resolved
 * for the signed-in mode (manager routes live under `/manager`).
 */
export {
  useNotificationNavigation,
  resolveInAppNotificationTarget,
} from '@/features/notifications/navigation';
