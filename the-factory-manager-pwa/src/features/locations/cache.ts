import { getDb } from '@/lib/db/client';
import type { SavedLocationCacheEntry } from '@/lib/db/schema';
import type { SavedLocation } from './types';

/** IndexedDB bucket for server-synced global map pins (not org-scoped). */
export const GLOBAL_SYNCED_CACHE_COMPANY_ID = 0;

function toCacheEntry(
  location: SavedLocation,
  companyId: number,
  pending: 0 | 1,
): SavedLocationCacheEntry {
  return {
    id: location.id,
    companyId,
    name: location.name,
    type: location.type,
    description: location.description,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    contactNumber: location.contactNumber,
    email: location.email,
    isActive: location.isActive,
    createdByName: location.createdByName,
    createdAt: location.createdAt,
    pending,
    cachedAt: new Date().toISOString(),
  };
}

function fromCacheEntry(entry: SavedLocationCacheEntry): SavedLocation {
  return {
    id: entry.id,
    companyId: entry.companyId === GLOBAL_SYNCED_CACHE_COMPANY_ID ? null : entry.companyId,
    name: entry.name,
    type: entry.type,
    description: entry.description,
    address: entry.address,
    latitude: entry.latitude,
    longitude: entry.longitude,
    contactNumber: entry.contactNumber,
    email: entry.email,
    isActive: entry.isActive,
    createdByName: entry.createdByName,
    createdAt: entry.createdAt,
  };
}

/** Replace the server-synced global cache with fresh rows from the API. */
export async function replaceCachedLocations(locations: SavedLocation[]): Promise<void> {
  const db = await getDb();
  const existing = await db.getAll('savedLocationsCache');
  const tx = db.transaction('savedLocationsCache', 'readwrite');
  for (const row of existing) {
    if (row.pending !== 1 && row.id != null) {
      await tx.store.delete(row.id);
    }
  }
  for (const location of locations) {
    await tx.store.put(
      toCacheEntry(location, GLOBAL_SYNCED_CACHE_COMPANY_ID, 0),
    );
  }
  await tx.done;
}

export async function getCachedLocations(companyId: number): Promise<SavedLocation[]> {
  const db = await getDb();
  const rows = await db.getAll('savedLocationsCache');
  return rows
    .filter(
      (row) =>
        row.pending !== 1 ||
        row.companyId === companyId,
    )
    .map(fromCacheEntry);
}

export async function putCachedLocation(
  companyId: number,
  location: SavedLocation,
  pending: 0 | 1,
): Promise<void> {
  const db = await getDb();
  await db.put('savedLocationsCache', toCacheEntry(location, companyId, pending));
}

export async function removeCachedLocation(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('savedLocationsCache', id);
}

/** Allocate a negative temp id for an offline-created location. */
export async function nextTempLocationId(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('savedLocationsCache');
  const minId = all.reduce((min, row) => Math.min(min, row.id ?? 0), 0);
  return Math.min(minId, 0) - 1;
}
