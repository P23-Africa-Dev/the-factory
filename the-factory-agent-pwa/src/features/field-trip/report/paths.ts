import { readSession } from '@/session/sessionStore';

/** Manager mode lives under /manager; agents at the root. */
function prefix(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/manager')) return '/manager';
  return readSession()?.app_mode === 'manager' ? '/manager' : '';
}

export function tripReviewPath(tripId: number): string {
  return `${prefix()}/field-trips/${tripId}/review`;
}

export function journeyPath(tripId: number): string {
  return `${prefix()}/field-activity/journeys/${tripId}`;
}
