/**
 * Uber-style recent places for the Agent PWA: local instant + Laravel sync.
 */

import { client } from '@/lib/api/client';
import { appStore } from '@/lib/storage/stores';

export const RECENT_DESTINATIONS_KEY = 'map_recent_destinations';
const MAX_RECENT = 15;

export interface RecentDestination {
  id?: number;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  provider?: string | null;
  provider_place_id?: string | null;
  taskId?: number;
  taskStatus?: string;
  last_used_at?: string | null;
}

function isValid(item: unknown): item is RecentDestination {
  if (!item || typeof item !== 'object') return false;
  const row = item as RecentDestination;
  return (
    typeof row.name === 'string' &&
    row.name.trim() !== '' &&
    typeof row.latitude === 'number' &&
    typeof row.longitude === 'number' &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude)
  );
}

export function getRecentDestinations(): RecentDestination[] {
  try {
    const raw = appStore.getString(RECENT_DESTINATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentDestination[]) : [];
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

export function saveRecentDestination(dest: RecentDestination): void {
  const existing = getRecentDestinations().filter((r) => {
    if (dest.provider_place_id && r.provider_place_id) {
      return !(r.provider === dest.provider && r.provider_place_id === dest.provider_place_id);
    }
    return !(
      Math.abs(r.latitude - dest.latitude) < 1e-4 &&
      Math.abs(r.longitude - dest.longitude) < 1e-4
    );
  });
  appStore.set(
    RECENT_DESTINATIONS_KEY,
    JSON.stringify([dest, ...existing].slice(0, MAX_RECENT)),
  );
}

export async function fetchRecentDestinations(): Promise<RecentDestination[]> {
  try {
    const { data } = await client.get<{ data?: RecentDestination[] }>('/places/recents', {
      params: { limit: 15, source: 'pwa' },
      suppressErrorToast: true,
    });
    const remote = Array.isArray(data?.data) ? data.data.filter(isValid) : [];
    if (remote.length > 0) {
      appStore.set(RECENT_DESTINATIONS_KEY, JSON.stringify(remote.slice(0, MAX_RECENT)));
      return remote;
    }
  } catch {
    // fall through to local
  }
  return getRecentDestinations();
}

export async function rememberRecentDestination(dest: RecentDestination): Promise<void> {
  saveRecentDestination(dest);
  try {
    await client.post(
      '/places/recents',
      {
        name: dest.name,
        address: dest.address ?? null,
        latitude: dest.latitude,
        longitude: dest.longitude,
        provider: dest.provider ?? null,
        provider_place_id: dest.provider_place_id ?? null,
        source: 'pwa',
      },
      { suppressErrorToast: true },
    );
  } catch {
    // local already saved
  }
}
