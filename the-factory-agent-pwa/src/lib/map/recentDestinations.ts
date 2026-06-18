import { appStore } from '@/lib/storage/stores';

export const RECENT_DESTINATIONS_KEY = 'map_recent_destinations';
const MAX_RECENT = 10;

export interface RecentDestination {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  taskId?: number;
}

export function getRecentDestinations(): RecentDestination[] {
  try {
    const raw = appStore.getString(RECENT_DESTINATIONS_KEY);
    return raw ? (JSON.parse(raw) as RecentDestination[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentDestination(dest: RecentDestination): void {
  const existing = getRecentDestinations().filter((r) => r.name !== dest.name);
  appStore.set(RECENT_DESTINATIONS_KEY, JSON.stringify([dest, ...existing].slice(0, MAX_RECENT)));
}
